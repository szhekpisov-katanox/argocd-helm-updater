/**
 * Bitbucket repository client implementation
 */
import { RepositoryClient, RepositoryFile } from '../../types/changelog';
/**
 * Bitbucket credentials for authentication
 */
export interface BitbucketCredentials {
    username: string;
    password: string;
}
/**
 * Bitbucket client for accessing repository files
 * Note: Bitbucket does not have a releases API like GitHub/GitLab
 */
export declare class BitbucketClient implements RepositoryClient {
    private axios;
    private workspace;
    private repoSlug;
    /**
     * Creates a new Bitbucket client
     * @param credentials - Bitbucket credentials (username and app password) for authentication
     * @param workspace - Workspace name (formerly team name)
     * @param repoSlug - Repository slug (name)
     * @param baseUrl - Bitbucket API base URL (defaults to bitbucket.org)
     */
    constructor(credentials: BitbucketCredentials | undefined, workspace: string, repoSlug: string, baseUrl?: string);
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
     * Note: Bitbucket does not have a releases API like GitHub/GitLab
     * @param _version - Version string (not used)
     * @returns Always returns null as Bitbucket doesn't support releases
     */
    getReleaseNotes(_version: string): Promise<{
        body: string;
        url: string;
    } | null>;
}
//# sourceMappingURL=bitbucket-client.d.ts.map