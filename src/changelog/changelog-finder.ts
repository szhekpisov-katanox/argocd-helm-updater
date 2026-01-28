/**
 * ChangelogFinder - Discovers and retrieves changelog files and release notes
 * 
 * Validates Requirements:
 * - 1.1: Attempt to locate changelog files in chart's source repository
 * - 1.5: Use source URL from Chart.yaml to locate repository
 * - 1.6: Attempt each source URL until changelog is found
 * - 3.1, 3.2, 3.3: Query releases API for GitHub/GitLab
 * - 3.4: Include both changelog and release notes when available
 */

import * as github from '@actions/github';
import { ChangelogResult, RepositoryClient } from '../types/changelog';
import { VersionUpdate } from '../types/version';
import { ChangelogCache } from './changelog-cache';
import { parseRepositoryUrl } from './repository-parser';
import { GitHubClient } from './clients/github-client';
import { GitLabClient } from './clients/gitlab-client';
import { BitbucketClient } from './clients/bitbucket-client';

/**
 * Options for ChangelogFinder
 */
export interface ChangelogFinderOptions {
  /** GitHub token for API access */
  githubToken?: string;
  /** GitLab token for API access */
  gitlabToken?: string;
  /** Bitbucket credentials */
  bitbucketCredentials?: {
    username: string;
    password: string;
  };
  /** Cache TTL in seconds (default: 3600) */
  cacheTTL?: number;
  /** Enable caching (default: true) */
  enableCache?: boolean;
}

/**
 * Standard changelog file names to search for (in priority order)
 * Requirement 1.2: Check for changelog files using standard naming conventions
 * Requirement 1.4: Prioritize CHANGELOG > HISTORY > RELEASES > NEWS
 */
const CHANGELOG_FILENAMES = [
  // CHANGELOG (highest priority)
  'CHANGELOG.md',
  'CHANGELOG.rst',
  'CHANGELOG.txt',
  'CHANGELOG',
  'changelog.md',
  'changelog.rst',
  'changelog.txt',
  'changelog',
  // HISTORY
  'HISTORY.md',
  'HISTORY.rst',
  'HISTORY.txt',
  'HISTORY',
  'history.md',
  'history.rst',
  'history.txt',
  'history',
  // RELEASES
  'RELEASES.md',
  'RELEASES.rst',
  'RELEASES.txt',
  'RELEASES',
  'releases.md',
  'releases.rst',
  'releases.txt',
  'releases',
  // NEWS (lowest priority)
  'NEWS.md',
  'NEWS.rst',
  'NEWS.txt',
  'NEWS',
  'news.md',
  'news.rst',
  'news.txt',
  'news',
];

/**
 * ChangelogFinder discovers and retrieves changelog files and release notes
 * from chart source repositories
 */
export class ChangelogFinder {
  private options: ChangelogFinderOptions;
  private cache: ChangelogCache;
  private githubClient?: ReturnType<typeof github.getOctokit>;

  /**
   * Creates a new ChangelogFinder instance
   * @param options - Configuration options
   */
  constructor(options: ChangelogFinderOptions = {}) {
    this.options = {
      cacheTTL: 3600,
      enableCache: true,
      ...options,
    };
    this.cache = new ChangelogCache();

    // Initialize GitHub client if token provided
    if (this.options.githubToken) {
      this.githubClient = github.getOctokit(this.options.githubToken);
    }
  }

  /**
   * Finds changelog and release notes for a version update
   * 
   * Validates Requirements:
   * - 1.1: Attempt to locate changelog files
   * - 1.6: Attempt each source URL until changelog is found
   * - 3.4: Include both changelog and release notes
   * 
   * @param update - Version update information
   * @returns ChangelogResult with discovered content
   */
  async findChangelog(update: VersionUpdate): Promise<ChangelogResult> {
    const { dependency, newVersion } = update;
    const { repoURL, chartName } = dependency;

    // Check cache first (Requirement 7.4)
    if (this.options.enableCache) {
      const cached = this.cache.get(repoURL, newVersion);
      if (cached) {
        return cached;
      }
    }

    // Discover source repository URLs
    const sourceUrls = await this.discoverSourceRepository(update);

    // Try each source URL until we find a changelog
    for (const sourceUrl of sourceUrls) {
      try {
        const result = await this.findChangelogFromUrl(sourceUrl, newVersion, chartName);
        
        if (result.found) {
          // Cache the result (Requirement 7.1, 7.2)
          if (this.options.enableCache) {
            this.cache.set(repoURL, newVersion, result, this.options.cacheTTL!);
          }
          return result;
        }
      } catch (error) {
        // Continue to next URL on error
        continue;
      }
    }

    // No changelog found - cache negative result (Requirement 7.6)
    const negativeResult: ChangelogResult = {
      sourceUrl: sourceUrls[0] || repoURL,
      found: false,
      error: 'Changelog not found',
    };

    if (this.options.enableCache) {
      this.cache.set(repoURL, newVersion, negativeResult, this.options.cacheTTL!);
    }

    return negativeResult;
  }

  /**
   * Discovers source repository URLs from chart metadata
   * 
   * Validates Requirement 1.5: Use source URL from Chart.yaml
   * Validates Requirement 1.6: Return multiple URLs to try
   * 
   * @param update - Version update information
   * @returns Array of source URLs to try (in priority order)
   */
  async discoverSourceRepository(update: VersionUpdate): Promise<string[]> {
    const urls: string[] = [];
    const { repoURL, chartName, repoType } = update.dependency;

    try {
      if (repoType === 'helm') {
        // Handle GitHub Pages URLs (*.github.io)
        // These are commonly used for hosting Helm charts from GitHub repos
        const githubPagesMatch = repoURL.match(/https?:\/\/([^.]+)\.github\.io\/([^\/]+)/);
        if (githubPagesMatch) {
          const org = githubPagesMatch[1];
          const repo = githubPagesMatch[2];
          // Try the repository that hosts the charts
          urls.push(`https://github.com/${org}/${repo}`);
          // Also try common variations
          urls.push(`https://github.com/${org}/charts`);
          urls.push(`https://github.com/${org}/helm-charts`);
        }
        
        // Handle Bitnami charts specifically
        if (repoURL.includes('bitnami')) {
          urls.push(`https://github.com/bitnami/charts`);
          urls.push(`https://github.com/bitnami/${chartName}`);
        }
        
        // Handle direct GitHub URLs
        const githubMatch = repoURL.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (githubMatch) {
          urls.push(`https://github.com/${githubMatch[1]}/${githubMatch[2]}`);
        }
        
        // Handle raw.githubusercontent.com URLs
        const rawGithubMatch = repoURL.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)/);
        if (rawGithubMatch) {
          urls.push(`https://github.com/${rawGithubMatch[1]}/${rawGithubMatch[2]}`);
        }
      } else if (repoType === 'oci') {
        // For OCI registries, try to infer source from registry URL
        if (repoURL.includes('ghcr.io')) {
          // GitHub Container Registry - try to find corresponding GitHub repo
          const match = repoURL.match(/ghcr\.io\/([^\/]+)\/([^\/]+)/);
          if (match) {
            urls.push(`https://github.com/${match[1]}/${match[2]}`);
            urls.push(`https://github.com/${match[1]}/charts`);
          }
        } else if (repoURL.includes('registry-1.docker.io/bitnamicharts')) {
          // Bitnami OCI registry
          urls.push(`https://github.com/bitnami/charts`);
          urls.push(`https://github.com/bitnami/${chartName}`);
        }
      }
      
      // Fallback: if no URLs were discovered, use the repoURL itself
      // This allows the system to at least try the provided URL
      if (urls.length === 0 && repoURL) {
        urls.push(repoURL);
      }
    } catch (error) {
      // Log error but continue with fallback
      console.warn(`Failed to discover source repository for ${chartName}: ${error}`);
      // Ensure we always return at least the repoURL
      if (urls.length === 0 && repoURL) {
        urls.push(repoURL);
      }
    }

    return urls;
  }

  /**
   * Finds changelog and release notes from a specific repository URL
   * 
   * @param sourceUrl - Repository URL
   * @param version - Version to find changelog for
   * @param chartName - Chart name (for tag matching)
   * @returns ChangelogResult
   */
  private async findChangelogFromUrl(
    sourceUrl: string,
    version: string,
    chartName: string
  ): Promise<ChangelogResult> {
    // Parse repository URL to determine platform
    const repoInfo = parseRepositoryUrl(sourceUrl);

    if (repoInfo.platform === 'unknown') {
      return {
        sourceUrl,
        found: false,
        error: 'Unknown repository platform',
      };
    }

    // Create platform-specific client
    const client = this.createClient(repoInfo.platform, repoInfo.owner, repoInfo.repo);

    if (!client) {
      return {
        sourceUrl,
        found: false,
        error: `No client available for ${repoInfo.platform}`,
      };
    }

    // Find changelog file and release notes in parallel
    const [changelogFile, releaseNotes] = await Promise.all([
      this.findChangelogFile(client, sourceUrl),
      this.findReleaseNotes(client, version, chartName, sourceUrl),
    ]);

    // Combine results
    const result: ChangelogResult = {
      sourceUrl,
      found: !!(changelogFile || releaseNotes),
    };

    if (changelogFile) {
      result.changelogText = changelogFile.text;
      result.changelogUrl = changelogFile.url;
    }

    if (releaseNotes) {
      result.releaseNotes = releaseNotes.text;
      result.releaseNotesUrl = releaseNotes.url;
    }

    return result;
  }

  /**
   * Finds a changelog file in the repository
   * 
   * Validates Requirements:
   * - 1.2: Check for changelog files using standard naming conventions
   * - 1.3: Check both case-sensitive and case-insensitive variations
   * - 1.4: Prioritize CHANGELOG > HISTORY > RELEASES > NEWS
   * 
   * @param client - Repository client
   * @param sourceUrl - Repository URL (for constructing file URLs)
   * @returns Changelog text and URL, or null if not found
   */
  async findChangelogFile(
    client: RepositoryClient,
    sourceUrl: string
  ): Promise<{text: string, url: string} | null> {
    try {
      // List files in repository root
      const files = await client.listFiles();
      const fileNames = files.map(f => f.name);

      // Try each changelog filename in priority order
      for (const filename of CHANGELOG_FILENAMES) {
        if (fileNames.includes(filename)) {
          try {
            const content = await client.getFileContent(filename);
            const url = `${sourceUrl}/blob/main/${filename}`;
            
            return {
              text: content,
              url,
            };
          } catch (error) {
            // Continue to next filename if this one fails
            continue;
          }
        }
      }

      return null;
    } catch (error) {
      // Return null on any error (Requirement 6.1: log warning and continue)
      return null;
    }
  }

  /**
   * Finds release notes for a specific version
   * 
   * Validates Requirements:
   * - 3.1: Query GitHub Releases API
   * - 3.2: Query GitLab Releases API
   * - 3.5: Continue processing if release notes not available
   * - 3.6: Match release tags using common formats
   * 
   * @param client - Repository client
   * @param version - Version string
   * @param chartName - Chart name (for tag matching)
   * @param sourceUrl - Repository URL (for constructing release URLs)
   * @returns Release notes text and URL, or null if not found
   */
  async findReleaseNotes(
    client: RepositoryClient,
    version: string,
    _chartName: string,
    _sourceUrl: string
  ): Promise<{text: string, url: string} | null> {
    try {
      const result = await client.getReleaseNotes(version);
      
      if (result) {
        return {
          text: result.body,
          url: result.url,
        };
      }

      return null;
    } catch (error) {
      // Return null on any error (Requirement 3.5: graceful handling)
      return null;
    }
  }

  /**
   * Creates a platform-specific repository client
   * 
   * Validates Requirement 2.5, 2.6, 2.7: Use appropriate API for each platform
   * 
   * @param platform - Repository platform
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns Repository client or null if not available
   */
  private createClient(
    platform: 'github' | 'gitlab' | 'bitbucket',
    owner: string,
    repo: string
  ): RepositoryClient | null {
    switch (platform) {
      case 'github':
        if (this.githubClient) {
          return new GitHubClient(this.githubClient, owner, repo);
        }
        return null;

      case 'gitlab':
        if (this.options.gitlabToken) {
          const projectId = `${owner}/${repo}`;
          return new GitLabClient(this.options.gitlabToken, projectId);
        }
        return null;

      case 'bitbucket':
        if (this.options.bitbucketCredentials) {
          return new BitbucketClient(
            this.options.bitbucketCredentials,
            owner,
            repo
          );
        }
        return null;

      default:
        return null;
    }
  }

  /**
   * Clears the cache
   * 
   * Validates Requirement 7.7: Provide mechanism to clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
