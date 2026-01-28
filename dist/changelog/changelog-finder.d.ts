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
import { ChangelogResult, RepositoryClient } from '../types/changelog';
import { VersionUpdate } from '../types/version';
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
 * ChangelogFinder discovers and retrieves changelog files and release notes
 * from chart source repositories
 */
export declare class ChangelogFinder {
    private options;
    private cache;
    private githubClient?;
    /**
     * Creates a new ChangelogFinder instance
     * @param options - Configuration options
     */
    constructor(options?: ChangelogFinderOptions);
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
    findChangelog(update: VersionUpdate): Promise<ChangelogResult>;
    /**
     * Discovers source repository URLs from chart metadata
     *
     * Validates Requirement 1.5: Use source URL from Chart.yaml
     * Validates Requirement 1.6: Return multiple URLs to try
     *
     * @param update - Version update information
     * @returns Array of source URLs to try (in priority order)
     */
    discoverSourceRepository(update: VersionUpdate): Promise<string[]>;
    /**
     * Finds changelog and release notes from a specific repository URL
     *
     * @param sourceUrl - Repository URL
     * @param version - Version to find changelog for
     * @param chartName - Chart name (for tag matching)
     * @returns ChangelogResult
     */
    private findChangelogFromUrl;
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
    findChangelogFile(client: RepositoryClient, sourceUrl: string): Promise<{
        text: string;
        url: string;
    } | null>;
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
    findReleaseNotes(client: RepositoryClient, version: string, _chartName: string, _sourceUrl: string): Promise<{
        text: string;
        url: string;
    } | null>;
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
    private createClient;
    /**
     * Clears the cache
     *
     * Validates Requirement 7.7: Provide mechanism to clear cache
     */
    clearCache(): void;
}
//# sourceMappingURL=changelog-finder.d.ts.map