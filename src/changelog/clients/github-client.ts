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
export class GitHubClient implements RepositoryClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  /**
   * Creates a new GitHub client
   * @param octokit - Octokit instance for GitHub API access
   * @param owner - Repository owner/organization
   * @param repo - Repository name
   */
  constructor(octokit: Octokit, owner: string, repo: string) {
    this.octokit = octokit;
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Lists files in the repository root
   * @param ref - Git reference (branch, tag, or commit SHA). Defaults to default branch
   * @returns Array of repository files
   */
  async listFiles(ref?: string): Promise<RepositoryFile[]> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: '',
        ref,
      });

      // Handle single file response (shouldn't happen for root, but type-safe)
      if (!Array.isArray(response.data)) {
        return [];
      }

      // Map GitHub API response to RepositoryFile interface
      return response.data.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type === 'file' ? 'file' : 'dir',
        size: item.size || 0,
        htmlUrl: item.html_url || '',
        downloadUrl: item.download_url || '',
      }));
    } catch (error) {
      // Handle 404 or other errors gracefully
      if (error instanceof Error) {
        throw new Error(`Failed to list files in ${this.owner}/${this.repo}: ${error.message}`);
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
      const response = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref,
      });

      // Handle directory response (should be a file)
      if (Array.isArray(response.data)) {
        throw new Error(`Path ${path} is a directory, not a file`);
      }

      // Handle submodule or symlink
      if (response.data.type !== 'file') {
        throw new Error(`Path ${path} is not a file (type: ${response.data.type})`);
      }

      // Decode base64 content
      if (!response.data.content) {
        throw new Error(`No content found for file ${path}`);
      }

      return Buffer.from(response.data.content, 'base64').toString('utf-8');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get content for ${path} in ${this.owner}/${this.repo}: ${error.message}`);
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
        `${this.repo}-${version}`, // repo-name-1.2.3
      ];

      // Try each tag format
      for (const tag of tagFormats) {
        try {
          const response = await this.octokit.rest.repos.getReleaseByTag({
            owner: this.owner,
            repo: this.repo,
            tag,
          });

          if (response.data && response.data.body) {
            return {
              body: response.data.body,
              url: response.data.html_url,
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
