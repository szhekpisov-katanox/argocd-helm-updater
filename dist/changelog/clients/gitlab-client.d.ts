/**
 * GitLab repository client implementation
 */
import { RepositoryClient, RepositoryFile } from '../../types/changelog';
/**
 * GitLab client for accessing repository files and release notes
 */
export declare class GitLabClient implements RepositoryClient {
    private axios;
    private projectPath;
    private baseUrl;
    /**
     * Creates a new GitLab client
     * @param token - GitLab personal access token (optional for public repos)
     * @param projectPath - Project path in format "owner/repo" or URL-encoded project ID
     * @param baseUrl - GitLab instance base URL (defaults to gitlab.com)
     */
    constructor(token: string | undefined, projectPath: string, baseUrl?: string);
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
//# sourceMappingURL=gitlab-client.d.ts.map