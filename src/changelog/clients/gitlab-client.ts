/**
 * GitLab repository client implementation
 */

import axios, { AxiosInstance } from 'axios';
import { RepositoryClient, RepositoryFile } from '../../types/changelog';

/**
 * GitLab API response for repository tree
 */
interface GitLabTreeItem {
  id: string;
  name: string;
  type: 'tree' | 'blob';
  path: string;
  mode: string;
}

/**
 * GitLab API response for file content
 */
interface GitLabFileResponse {
  file_name: string;
  file_path: string;
  size: number;
  encoding: string;
  content: string;
  content_sha256: string;
  ref: string;
  blob_id: string;
  commit_id: string;
  last_commit_id: string;
}

/**
 * GitLab API response for releases
 */
interface GitLabRelease {
  tag_name: string;
  name: string;
  description: string;
  created_at: string;
  released_at: string;
  _links: {
    self: string;
  };
}

/**
 * GitLab client for accessing repository files and release notes
 */
export class GitLabClient implements RepositoryClient {
  private axios: AxiosInstance;
  private projectPath: string;
  private baseUrl: string;

  /**
   * Creates a new GitLab client
   * @param token - GitLab personal access token (optional for public repos)
   * @param projectPath - Project path in format "owner/repo" or URL-encoded project ID
   * @param baseUrl - GitLab instance base URL (defaults to gitlab.com)
   */
  constructor(token: string | undefined, projectPath: string, baseUrl: string = 'https://gitlab.com') {
    this.projectPath = encodeURIComponent(projectPath);
    this.baseUrl = baseUrl;

    // Create axios instance with GitLab API configuration
    this.axios = axios.create({
      baseURL: `${baseUrl}/api/v4`,
      headers: token ? {
        'PRIVATE-TOKEN': token,
      } : {},
      timeout: 10000,
    });
  }

  /**
   * Lists files in the repository root
   * @param ref - Git reference (branch, tag, or commit SHA). Defaults to default branch
   * @returns Array of repository files
   */
  async listFiles(ref?: string): Promise<RepositoryFile[]> {
    try {
      const params: Record<string, string> = {
        path: '',
        recursive: 'false',
      };

      if (ref) {
        params.ref = ref;
      }

      const response = await this.axios.get<GitLabTreeItem[]>(
        `/projects/${this.projectPath}/repository/tree`,
        { params }
      );

      // Map GitLab API response to RepositoryFile interface
      return response.data.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type === 'blob' ? 'file' : 'dir',
        size: 0, // GitLab tree API doesn't return size, would need separate call
        htmlUrl: `${this.baseUrl}/${decodeURIComponent(this.projectPath)}/-/blob/${ref || 'main'}/${item.path}`,
        downloadUrl: `${this.baseUrl}/${decodeURIComponent(this.projectPath)}/-/raw/${ref || 'main'}/${item.path}`,
      }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to list files in ${decodeURIComponent(this.projectPath)}: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Gets the content of a file from the repository
   * @param path - File path in the repository
   * @param ref - Git reference (branch, tag, or commit SHA). Defaults to default branch
   * @returns File content as string
   */
  async getFileContent(path: string, ref?: string): Promise<string> {
    try {
      const params: Record<string, string> = {};
      if (ref) {
        params.ref = ref;
      }

      const response = await this.axios.get<GitLabFileResponse>(
        `/projects/${this.projectPath}/repository/files/${encodeURIComponent(path)}`,
        { params }
      );

      // Decode base64 content
      if (!response.data.content) {
        throw new Error(`No content found for file ${path}`);
      }

      if (response.data.encoding === 'base64') {
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      }

      // If not base64, return as-is
      return response.data.content;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to get content for ${path} in ${decodeURIComponent(this.projectPath)}: ${error.message}`
        );
      }
      // Re-wrap non-axios errors
      if (error instanceof Error) {
        throw new Error(
          `Failed to get content for ${path} in ${decodeURIComponent(this.projectPath)}: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Gets release notes for a specific version
   * @param version - Version string (e.g., "1.2.3", "v1.2.3")
   * @returns Release notes body and URL, or null if not found
   */
  async getReleaseNotes(version: string): Promise<{body: string, url: string} | null> {
    try {
      // Try common tag formats
      const tagFormats = [
        version,                    // 1.2.3
        `v${version}`,             // v1.2.3
        `release-${version}`,      // release-1.2.3
      ];

      // Try each tag format
      for (const tag of tagFormats) {
        try {
          const response = await this.axios.get<GitLabRelease>(
            `/projects/${this.projectPath}/releases/${encodeURIComponent(tag)}`
          );

          if (response.data && response.data.description) {
            return {
              body: response.data.description,
              url: response.data._links.self,
            };
          }
        } catch (error) {
          // Continue to next tag format if this one fails
          continue;
        }
      }

      // No release found for any tag format
      return null;
    } catch (error) {
      // Return null for any errors (release not found is not an error)
      return null;
    }
  }
}
