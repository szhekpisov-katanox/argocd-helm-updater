/**
 * VersionResolver - Queries Helm repositories and OCI registries for available chart versions
 *
 * This class is responsible for:
 * - Fetching Helm repository indexes (index.yaml)
 * - Querying OCI registries for available tags
 * - Caching repository data to minimize network requests
 * - Supporting authentication for private registries
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as yaml from 'js-yaml';
import * as semver from 'semver';
import { ActionConfig, RegistryCredential } from '../types/config';
import { HelmDependency } from '../types/dependency';
import {
  ChartVersionInfo,
  HelmIndex,
  OCITagsResponse,
  VersionUpdate,
} from '../types/version';

/**
 * Cache entry for repository data
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * VersionResolver class for querying chart versions from repositories
 */
export class VersionResolver {
  private readonly config: ActionConfig;
  private readonly httpClient: AxiosInstance;
  private readonly helmIndexCache: Map<string, CacheEntry<HelmIndex>>;
  private readonly ociTagsCache: Map<string, CacheEntry<string[]>>;
  private readonly cacheTTL: number = 300000; // 5 minutes in milliseconds

  /**
   * Creates a new VersionResolver instance
   * @param config - Action configuration including registry credentials
   */
  constructor(config: ActionConfig) {
    this.config = config;
    this.helmIndexCache = new Map();
    this.ociTagsCache = new Map();

    // Set up HTTP client with default configuration
    this.httpClient = axios.create({
      timeout: 30000, // 30 second timeout
      headers: {
        'User-Agent': 'argocd-helm-updater/1.0.0',
      },
      // Follow redirects
      maxRedirects: 5,
      // Validate status codes
      validateStatus: (status) => status >= 200 && status < 300,
    });

    // Add request interceptor for authentication
    this.httpClient.interceptors.request.use((config) => {
      return this.addAuthentication(config);
    });
  }

  /**
   * Resolves available versions for a list of dependencies
   * @param dependencies - List of Helm dependencies to resolve versions for
   * @returns Map of repository URLs to available chart versions
   */
  async resolveVersions(
    dependencies: HelmDependency[]
  ): Promise<Map<string, ChartVersionInfo[]>> {
    const versionMap = new Map<string, ChartVersionInfo[]>();

    // Group dependencies by repository URL to minimize requests
    const repoGroups = this.groupByRepository(dependencies);

    for (const [repoURL, deps] of repoGroups) {
      try {
        // Determine repository type from first dependency
        const repoType = deps[0].repoType;

        if (repoType === 'helm') {
          // Fetch Helm repository index
          const index = await this.fetchHelmRepoIndex(repoURL);

          // Extract versions for each chart in this repository
          for (const dep of deps) {
            const chartVersions = index.entries[dep.chartName] || [];
            const key = `${repoURL}/${dep.chartName}`;
            versionMap.set(key, chartVersions);
          }
        } else if (repoType === 'oci') {
          // Fetch OCI tags for each chart
          for (const dep of deps) {
            const tags = await this.fetchOCITags(repoURL, dep.chartName);
            const chartVersions = tags.map((tag) => ({ version: tag }));
            const key = `${repoURL}/${dep.chartName}`;
            versionMap.set(key, chartVersions);
          }
        }
      } catch (error) {
        // Log error but continue processing other repositories
        console.error(
          `Failed to fetch versions from ${repoURL}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return versionMap;
  }

  /**
   * Checks for available updates for a list of dependencies
   * @param dependencies - List of Helm dependencies to check
   * @returns List of available version updates
   */
  async checkForUpdates(
    dependencies: HelmDependency[]
  ): Promise<VersionUpdate[]> {
    const updates: VersionUpdate[] = [];

    // First, filter out ignored dependencies by name
    const filteredDependencies = dependencies.filter((dep) => {
      if (this.isDependencyIgnored(dep.chartName)) {
        console.info(
          `Ignoring dependency ${dep.chartName} (matched ignore rule)`
        );
        return false;
      }
      return true;
    });

    // Resolve all available versions
    const versionMap = await this.resolveVersions(filteredDependencies);

    // Check each dependency for updates
    for (const dep of filteredDependencies) {
      const key = `${dep.repoURL}/${dep.chartName}`;
      const availableVersions = versionMap.get(key);

      if (!availableVersions || availableVersions.length === 0) {
        console.warn(
          `No versions found for ${dep.chartName} in ${dep.repoURL}`
        );
        continue;
      }

      // Select best version based on update strategy (with ignore rule filtering)
      const newVersion = this.selectBestVersion(
        availableVersions,
        dep.currentVersion,
        this.config.updateStrategy,
        dep.chartName
      );

      if (newVersion && newVersion !== dep.currentVersion) {
        updates.push({
          dependency: dep,
          currentVersion: dep.currentVersion,
          newVersion,
          releaseNotes: this.generateReleaseNotesURL(dep, newVersion),
        });
      }
    }

    return updates;
  }

  /**
   * Fetches Helm repository index (index.yaml)
   * @param repoURL - Helm repository URL
   * @returns Parsed Helm index
   */
  private async fetchHelmRepoIndex(repoURL: string): Promise<HelmIndex> {
    // Check cache first
    const cached = this.helmIndexCache.get(repoURL);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    // Construct index URL
    const indexURL = this.normalizeHelmRepoURL(repoURL);

    try {
      const response = await this.httpClient.get<string>(indexURL);

      // Parse YAML index
      const index = yaml.load(response.data) as HelmIndex;

      // Validate index structure
      if (!index.entries || typeof index.entries !== 'object') {
        throw new Error('Invalid Helm index structure: missing entries');
      }

      // Cache the result
      this.helmIndexCache.set(repoURL, {
        data: index,
        timestamp: Date.now(),
      });

      return index;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to fetch Helm index from ${indexURL}: ${
            error.response?.status || error.code
          } ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Fetches OCI registry tags for a chart
   * @param repoURL - OCI registry URL
   * @param chartName - Chart name
   * @returns List of available tags
   */
  private async fetchOCITags(
    repoURL: string,
    chartName: string
  ): Promise<string[]> {
    const cacheKey = `${repoURL}/${chartName}`;

    // Check cache first
    const cached = this.ociTagsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    // Construct OCI tags URL
    const tagsURL = this.constructOCITagsURL(repoURL, chartName);

    try {
      const response = await this.httpClient.get<OCITagsResponse>(tagsURL);

      const tags = response.data.tags || [];

      // Cache the result
      this.ociTagsCache.set(cacheKey, {
        data: tags,
        timestamp: Date.now(),
      });

      return tags;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to fetch OCI tags from ${tagsURL}: ${
            error.response?.status || error.code
          } ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Selects the best version to update to based on strategy
   * @param available - Available chart versions
   * @param current - Current version
   * @param strategy - Update strategy (major, minor, patch, all)
   * @param dependencyName - Name of the dependency (for ignore rule filtering)
   * @returns Selected version or null if no update available
   */
  private selectBestVersion(
    available: ChartVersionInfo[],
    current: string,
    strategy: string,
    dependencyName?: string
  ): string | null {
    // Extract version strings from ChartVersionInfo
    const versions = available.map((v) => v.version);

    // Filter out invalid versions
    const validVersions = versions.filter((v) => {
      try {
        return semver.valid(v) !== null;
      } catch {
        return false;
      }
    });

    if (validVersions.length === 0) {
      return null;
    }

    // Validate current version
    if (!semver.valid(current)) {
      console.warn(`Current version ${current} is not a valid semver`);
      return null;
    }

    // Parse current version components
    const currentParsed = semver.parse(current);
    if (!currentParsed) {
      return null;
    }

    // Find versions that are newer than current
    const newerVersions = validVersions.filter((v) => {
      try {
        return semver.gt(v, current);
      } catch {
        return false;
      }
    });

    if (newerVersions.length === 0) {
      // No newer versions available
      return null;
    }

    // Apply strategy-based filtering
    let filteredVersions: string[];

    switch (strategy) {
      case 'patch':
        // Only allow patch updates (same major.minor)
        filteredVersions = newerVersions.filter((v) => {
          const parsed = semver.parse(v);
          if (!parsed) return false;
          return (
            parsed.major === currentParsed.major &&
            parsed.minor === currentParsed.minor
          );
        });
        break;

      case 'minor':
        // Allow minor and patch updates (same major)
        filteredVersions = newerVersions.filter((v) => {
          const parsed = semver.parse(v);
          if (!parsed) return false;
          return parsed.major === currentParsed.major;
        });
        break;

      case 'major':
      case 'all':
        // Allow all updates (major, minor, patch)
        filteredVersions = newerVersions;
        break;

      default:
        // Unknown strategy, default to 'all'
        console.warn(
          `Unknown update strategy '${strategy}', defaulting to 'all'`
        );
        filteredVersions = newerVersions;
        break;
    }

    if (filteredVersions.length === 0) {
      // No versions satisfy the strategy
      return null;
    }

    // Filter out ignored versions if dependency name is provided
    if (dependencyName) {
      filteredVersions = filteredVersions.filter((v) => {
        return !this.isUpdateIgnored(dependencyName, current, v);
      });

      if (filteredVersions.length === 0) {
        // All versions are ignored
        return null;
      }
    }

    // Return the latest version that satisfies the strategy
    try {
      return semver.maxSatisfying(filteredVersions, '*');
    } catch {
      return null;
    }
  }

  /**
   * Checks if a dependency should be ignored by name
   * @param dependencyName - Name of the dependency to check
   * @returns True if the dependency should be ignored
   */
  private isDependencyIgnored(dependencyName: string): boolean {
    // Check if there's an ignore rule for this dependency
    const ignoreRule = this.config.ignore.find(
      (rule) => rule.dependencyName === dependencyName
    );

    if (!ignoreRule) {
      return false;
    }

    // If the rule has no versions or updateTypes specified, ignore all updates
    if (
      (!ignoreRule.versions || ignoreRule.versions.length === 0) &&
      (!ignoreRule.updateTypes || ignoreRule.updateTypes.length === 0)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Checks if a specific update should be ignored
   * @param dependencyName - Name of the dependency
   * @param currentVersion - Current version
   * @param newVersion - New version to update to
   * @returns True if the update should be ignored
   */
  private isUpdateIgnored(
    dependencyName: string,
    currentVersion: string,
    newVersion: string
  ): boolean {
    // Find ignore rule for this dependency
    const ignoreRule = this.config.ignore.find(
      (rule) => rule.dependencyName === dependencyName
    );

    if (!ignoreRule) {
      return false;
    }

    // Check if the new version matches any ignored version patterns
    if (ignoreRule.versions && ignoreRule.versions.length > 0) {
      for (const versionPattern of ignoreRule.versions) {
        if (this.matchesVersionPattern(newVersion, versionPattern)) {
          return true;
        }
      }
    }

    // Check if the update type should be ignored
    if (ignoreRule.updateTypes && ignoreRule.updateTypes.length > 0) {
      const updateType = this.getUpdateType(currentVersion, newVersion);
      if (updateType && ignoreRule.updateTypes.includes(updateType)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if a version matches a version pattern
   * @param version - Version to check
   * @param pattern - Version pattern (can be exact version, range, or wildcard)
   * @returns True if the version matches the pattern
   */
  private matchesVersionPattern(version: string, pattern: string): boolean {
    try {
      // Validate version
      if (!semver.valid(version)) {
        return false;
      }

      // Check for exact match
      if (version === pattern) {
        return true;
      }

      // Check if pattern is a valid semver range
      if (semver.validRange(pattern)) {
        return semver.satisfies(version, pattern);
      }

      // Handle wildcard patterns like "16.x" or "16.*"
      // Convert to semver range format
      const wildcardPattern = pattern
        .replace(/\.x$/i, '.x')
        .replace(/\.\*$/, '.x');

      if (wildcardPattern.endsWith('.x')) {
        const rangePattern = wildcardPattern.replace(/\.x$/, '');
        // Match major.minor.x pattern
        if (semver.validRange(`${rangePattern}.x`)) {
          return semver.satisfies(version, `${rangePattern}.x`);
        }
        // Match major.x pattern
        if (semver.validRange(`${rangePattern}`)) {
          return semver.satisfies(version, `^${rangePattern}.0`);
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Determines the update type (major, minor, or patch) between two versions
   * @param currentVersion - Current version
   * @param newVersion - New version
   * @returns Update type or null if versions are invalid
   */
  private getUpdateType(
    currentVersion: string,
    newVersion: string
  ): 'major' | 'minor' | 'patch' | null {
    try {
      const current = semver.parse(currentVersion);
      const newVer = semver.parse(newVersion);

      if (!current || !newVer) {
        return null;
      }

      if (newVer.major > current.major) {
        return 'major';
      } else if (newVer.minor > current.minor) {
        return 'minor';
      } else if (newVer.patch > current.patch) {
        return 'patch';
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Groups dependencies by repository URL
   * @param dependencies - List of dependencies
   * @returns Map of repository URLs to dependencies
   */
  private groupByRepository(
    dependencies: HelmDependency[]
  ): Map<string, HelmDependency[]> {
    const groups = new Map<string, HelmDependency[]>();

    for (const dep of dependencies) {
      const existing = groups.get(dep.repoURL) || [];
      existing.push(dep);
      groups.set(dep.repoURL, existing);
    }

    return groups;
  }

  /**
   * Normalizes Helm repository URL to index.yaml URL
   * @param repoURL - Base repository URL
   * @returns Full URL to index.yaml
   */
  private normalizeHelmRepoURL(repoURL: string): string {
    // Remove trailing slash
    const baseURL = repoURL.replace(/\/$/, '');

    // Add /index.yaml if not already present
    if (baseURL.endsWith('/index.yaml')) {
      return baseURL;
    }

    return `${baseURL}/index.yaml`;
  }

  /**
   * Constructs OCI registry tags list URL
   * @param repoURL - OCI registry URL (may include oci:// prefix)
   * @param chartName - Chart name
   * @returns Full URL to tags list endpoint
   */
  private constructOCITagsURL(repoURL: string, chartName: string): string {
    // Remove oci:// prefix if present
    let registryURL = repoURL.replace(/^oci:\/\//, '');

    // Remove trailing slash
    registryURL = registryURL.replace(/\/$/, '');

    // Construct OCI Distribution API URL
    // Format: https://registry/v2/<name>/tags/list
    return `https://${registryURL}/v2/${chartName}/tags/list`;
  }

  /**
   * Adds authentication to HTTP request if credentials are configured
   * @param config - Axios request configuration
   * @returns Modified request configuration
   */
  private addAuthentication(
    config: InternalAxiosRequestConfig
  ): InternalAxiosRequestConfig {
    if (!config.url) {
      return config;
    }

    // Find matching credential for this URL
    const credential = this.findCredentialForURL(config.url);

    if (credential) {
      const authType = credential.authType || 'basic';

      if (authType === 'bearer') {
        // Add Bearer token authentication
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${credential.password}`;
      } else {
        // Add HTTP Basic Auth (default)
        if (!credential.username) {
          throw new Error(
            `Username is required for basic authentication to ${credential.registry}`
          );
        }
        config.auth = {
          username: credential.username,
          password: credential.password,
        };
      }
    }

    return config;
  }

  /**
   * Finds registry credential matching the given URL
   * @param url - URL to match against
   * @returns Matching credential or undefined
   */
  private findCredentialForURL(url: string): RegistryCredential | undefined {
    for (const credential of this.config.registryCredentials) {
      // Simple substring match for now
      // Could be enhanced with regex patterns
      if (url.includes(credential.registry)) {
        return credential;
      }
    }

    return undefined;
  }

  /**
   * Groups version updates based on configured grouping patterns
   * @param updates - List of version updates to group
   * @returns Map of group names to their updates, plus an 'ungrouped' entry for updates that don't match any group
   */
  groupUpdates(updates: VersionUpdate[]): Map<string, VersionUpdate[]> {
    const groups = new Map<string, VersionUpdate[]>();
    const ungrouped: VersionUpdate[] = [];

    // Initialize all configured groups
    for (const groupName of Object.keys(this.config.groups)) {
      groups.set(groupName, []);
    }

    // Process each update
    for (const update of updates) {
      let matched = false;

      // Try to match against each configured group
      for (const [groupName, groupConfig] of Object.entries(
        this.config.groups
      )) {
        if (this.matchesGroup(update, groupConfig)) {
          const groupUpdates = groups.get(groupName) || [];
          groupUpdates.push(update);
          groups.set(groupName, groupUpdates);
          matched = true;
          break; // Only add to first matching group
        }
      }

      // If no group matched, add to ungrouped
      if (!matched) {
        ungrouped.push(update);
      }
    }

    // Add ungrouped updates if any exist
    if (ungrouped.length > 0) {
      groups.set('ungrouped', ungrouped);
    }

    // Remove empty groups
    for (const [groupName, groupUpdates] of groups.entries()) {
      if (groupUpdates.length === 0) {
        groups.delete(groupName);
      }
    }

    return groups;
  }

  /**
   * Checks if an update matches a group configuration
   * @param update - Version update to check
   * @param groupConfig - Group configuration with patterns and update types
   * @returns True if the update matches the group
   */
  private matchesGroup(
    update: VersionUpdate,
    groupConfig: { patterns: string[]; updateTypes?: ('major' | 'minor' | 'patch')[] }
  ): boolean {
    const chartName = update.dependency.chartName;

    // Check if chart name matches any pattern
    const matchesPattern = groupConfig.patterns.some((pattern) =>
      this.matchesGlobPattern(chartName, pattern)
    );

    if (!matchesPattern) {
      return false;
    }

    // If update types are specified, check if the update type matches
    if (groupConfig.updateTypes && groupConfig.updateTypes.length > 0) {
      const updateType = this.getUpdateType(
        update.currentVersion,
        update.newVersion
      );

      if (!updateType || !groupConfig.updateTypes.includes(updateType)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks if a string matches a glob pattern
   * Supports wildcards: * (matches any characters), ? (matches single character)
   * @param str - String to test
   * @param pattern - Glob pattern
   * @returns True if the string matches the pattern
   */
  private matchesGlobPattern(str: string, pattern: string): boolean {
    // Escape special regex characters except * and ?
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i'); // Case-insensitive
    return regex.test(str);
  }

  /**
   * Clears all cached data
   * Useful for testing or forcing fresh fetches
   */
  clearCache(): void {
    this.helmIndexCache.clear();
    this.ociTagsCache.clear();
  }

  /**
   * Gets cache statistics for monitoring
   * @returns Cache statistics
   */
  getCacheStats(): {
    helmIndexCacheSize: number;
    ociTagsCacheSize: number;
  } {
    return {
      helmIndexCacheSize: this.helmIndexCache.size,
      ociTagsCacheSize: this.ociTagsCache.size,
    };
  }

  /**
   * Generates a release notes URL for a chart version
   * 
   * Attempts to construct release notes URLs based on common patterns:
   * - Bitnami charts: GitHub releases
   * - GitHub-hosted charts: GitHub releases
   * - Other repositories: Falls back to repository URL
   * 
   * Requirements: 6.5
   * 
   * @param dependency - The Helm dependency
   * @param newVersion - The new version
   * @returns Release notes URL or undefined if not available
   * @private
   */
  private generateReleaseNotesURL(
    dependency: HelmDependency,
    newVersion: string
  ): string | undefined {
    const repoURL = dependency.repoURL;
    const chartName = dependency.chartName;

    try {
      // Bitnami charts (https://charts.bitnami.com/bitnami)
      if (repoURL.includes('charts.bitnami.com')) {
        return `https://github.com/bitnami/charts/releases/tag/${chartName}-${newVersion}`;
      }

      // GitHub-hosted Helm charts (e.g., https://username.github.io/charts)
      if (repoURL.includes('github.io')) {
        // Extract username from URL like https://username.github.io/charts
        const match = repoURL.match(/https?:\/\/([^.]+)\.github\.io/);
        if (match) {
          const username = match[1];
          // Try to construct GitHub releases URL
          // This is a best-effort guess - may not always be correct
          return `https://github.com/${username}/charts/releases/tag/${chartName}-${newVersion}`;
        }
      }

      // GitHub raw content URLs (e.g., https://raw.githubusercontent.com/org/repo/main/charts)
      if (repoURL.includes('raw.githubusercontent.com')) {
        const match = repoURL.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)/);
        if (match) {
          const [, org, repo] = match;
          return `https://github.com/${org}/${repo}/releases/tag/${chartName}-${newVersion}`;
        }
      }

      // Artifact Hub - construct link to chart page
      if (repoURL.includes('artifacthub.io')) {
        // Artifact Hub URLs vary, but we can link to the chart page
        return `https://artifacthub.io/packages/helm/${chartName}/${newVersion}`;
      }

      // OCI registries - try to construct registry-specific URLs
      if (dependency.repoType === 'oci') {
        // Docker Hub
        if (repoURL.includes('docker.io') || repoURL.includes('registry-1.docker.io')) {
          const match = repoURL.match(/(?:oci:\/\/)?(?:registry-1\.)?docker\.io\/([^/]+)\/([^/]+)/);
          if (match) {
            const [, namespace, image] = match;
            return `https://hub.docker.com/r/${namespace}/${image}/tags`;
          }
        }

        // GitHub Container Registry
        if (repoURL.includes('ghcr.io')) {
          const match = repoURL.match(/(?:oci:\/\/)?ghcr\.io\/([^/]+)\/([^/]+)/);
          if (match) {
            const [, org, image] = match;
            return `https://github.com/${org}/${image}/pkgs/container/${image}`;
          }
        }

        // For other OCI registries, return the repository URL
        return repoURL;
      }

      // For other repositories, return undefined (no release notes available)
      return undefined;
    } catch (error) {
      // If URL construction fails, return undefined silently
      return undefined;
    }
  }
}
