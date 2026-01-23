/**
 * VersionResolver - Queries Helm repositories and OCI registries for available chart versions
 *
 * This class is responsible for:
 * - Fetching Helm repository indexes (index.yaml)
 * - Querying OCI registries for available tags
 * - Caching repository data to minimize network requests
 * - Supporting authentication for private registries
 */
import { ActionConfig } from '../types/config';
import { HelmDependency } from '../types/dependency';
import { ChartVersionInfo, VersionUpdate } from '../types/version';
/**
 * VersionResolver class for querying chart versions from repositories
 */
export declare class VersionResolver {
    private readonly config;
    private readonly httpClient;
    private readonly helmIndexCache;
    private readonly ociTagsCache;
    private readonly cacheTTL;
    /**
     * Creates a new VersionResolver instance
     * @param config - Action configuration including registry credentials
     */
    constructor(config: ActionConfig);
    /**
     * Resolves available versions for a list of dependencies
     * @param dependencies - List of Helm dependencies to resolve versions for
     * @returns Map of repository URLs to available chart versions
     */
    resolveVersions(dependencies: HelmDependency[]): Promise<Map<string, ChartVersionInfo[]>>;
    /**
     * Checks for available updates for a list of dependencies
     * @param dependencies - List of Helm dependencies to check
     * @returns List of available version updates
     */
    checkForUpdates(dependencies: HelmDependency[]): Promise<VersionUpdate[]>;
    /**
     * Fetches Helm repository index (index.yaml)
     * @param repoURL - Helm repository URL
     * @returns Parsed Helm index
     */
    private fetchHelmRepoIndex;
    /**
     * Fetches OCI registry tags for a chart
     * @param repoURL - OCI registry URL
     * @param chartName - Chart name
     * @returns List of available tags
     */
    private fetchOCITags;
    /**
     * Selects the best version to update to based on strategy
     * @param available - Available chart versions
     * @param current - Current version
     * @param strategy - Update strategy (major, minor, patch, all)
     * @param dependencyName - Name of the dependency (for ignore rule filtering)
     * @returns Selected version or null if no update available
     */
    private selectBestVersion;
    /**
     * Checks if a dependency should be ignored by name
     * @param dependencyName - Name of the dependency to check
     * @returns True if the dependency should be ignored
     */
    private isDependencyIgnored;
    /**
     * Checks if a specific update should be ignored
     * @param dependencyName - Name of the dependency
     * @param currentVersion - Current version
     * @param newVersion - New version to update to
     * @returns True if the update should be ignored
     */
    private isUpdateIgnored;
    /**
     * Checks if a version matches a version pattern
     * @param version - Version to check
     * @param pattern - Version pattern (can be exact version, range, or wildcard)
     * @returns True if the version matches the pattern
     */
    private matchesVersionPattern;
    /**
     * Determines the update type (major, minor, or patch) between two versions
     * @param currentVersion - Current version
     * @param newVersion - New version
     * @returns Update type or null if versions are invalid
     */
    private getUpdateType;
    /**
     * Groups dependencies by repository URL
     * @param dependencies - List of dependencies
     * @returns Map of repository URLs to dependencies
     */
    private groupByRepository;
    /**
     * Normalizes Helm repository URL to index.yaml URL
     * @param repoURL - Base repository URL
     * @returns Full URL to index.yaml
     */
    private normalizeHelmRepoURL;
    /**
     * Constructs OCI registry tags list URL
     * @param repoURL - OCI registry URL (may include oci:// prefix)
     * @param chartName - Chart name
     * @returns Full URL to tags list endpoint
     */
    private constructOCITagsURL;
    /**
     * Adds authentication to HTTP request if credentials are configured
     * @param config - Axios request configuration
     * @returns Modified request configuration
     */
    private addAuthentication;
    /**
     * Finds registry credential matching the given URL
     * @param url - URL to match against
     * @returns Matching credential or undefined
     */
    private findCredentialForURL;
    /**
     * Groups version updates based on configured grouping patterns
     * @param updates - List of version updates to group
     * @returns Map of group names to their updates, plus an 'ungrouped' entry for updates that don't match any group
     */
    groupUpdates(updates: VersionUpdate[]): Map<string, VersionUpdate[]>;
    /**
     * Checks if an update matches a group configuration
     * @param update - Version update to check
     * @param groupConfig - Group configuration with patterns and update types
     * @returns True if the update matches the group
     */
    private matchesGroup;
    /**
     * Checks if a string matches a glob pattern
     * Supports wildcards: * (matches any characters), ? (matches single character)
     * @param str - String to test
     * @param pattern - Glob pattern
     * @returns True if the string matches the pattern
     */
    private matchesGlobPattern;
    /**
     * Clears all cached data
     * Useful for testing or forcing fresh fetches
     */
    clearCache(): void;
    /**
     * Gets cache statistics for monitoring
     * @returns Cache statistics
     */
    getCacheStats(): {
        helmIndexCacheSize: number;
        ociTagsCacheSize: number;
    };
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
    private generateReleaseNotesURL;
}
//# sourceMappingURL=version-resolver.d.ts.map