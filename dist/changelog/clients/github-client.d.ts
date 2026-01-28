/**
 * GitHub repository client implementation
 */
import * as github from '@actions/github';
import { RepositoryClient, RepositoryFile } from '../../types/changelog';
/**
 * Type for Octokit instance from @actions/github
 */
type Octokit = ReturnType<typeof github.getOctokit>;
/**
 * GitHub client for accessing repository files and release notes
 */
export declare class GitHubClient implements RepositoryClient {
    private octokit;
    private owner;
    private repo;
    /**
     * Creates a new GitHub client
     * @param octokit - Octokit instance for GitHub API access
     * @param owner - Repository owner/organization
     * @param repo - Repository name
     */
    constructor(octokit: Octokit, owner: string, repo: string);
    /**
     * Lists files in the repository root
     * @param ref - Git reference (branch, tag, or commit SHA). Defaults to default branch
     * @returns Array of repository files
     */
    listFiles(ref?: string): Promise<RepositoryFile[]>;
    /**
     * Gets the content of a file from the repository
     * @param path - File path in the repository
     * @param ref - Git reference (branch, tag, or commit SHA). Defaults to default branch
     * @returns File content as string
     */
    getFileContent(path: string, ref?: string): Promise<string>;
    /**
     * Gets release notes for a specific version
     * @param version - Version string (e.g., "1.2.3", "v1.2.3")
     * @returns Release notes body and URL, or null if not found
     */
    getReleaseNotes(version: string): Promise<{
        body: string;
        url: string;
    } | null>;
}
export {};
//# sourceMappingURL=github-client.d.ts.map