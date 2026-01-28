/**
 * Bitbucket repository client implementation
 */

import axios, { AxiosInstance } from 'axios';
import { RepositoryClient, RepositoryFile } from '../../types/changelog';

/**
 * Bitbucket API response for repository source
 */
interface BitbucketSourceItem {
  path: string;
  type: 'commit_file' | 'commit_directory';
  size?: number;
  links: {
    self: {
      href: string;
    };
    meta?: {
      href: string;
    };
  };
}

/**
 * Bitbucket API response for repository source listing
 */
interface BitbucketSourceResponse {
  values: BitbucketSourceItem[];
  next?: string;
}

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
export class BitbucketClient implements RepositoryClient {
  private axios: AxiosInstance;
  private workspace: string;
  private repoSlug: string;

  /**
   * Creates a new Bitbucket client
   * @param credentials - Bitbucket credentials (username and app password) for authentication
   * @param workspace - Workspace name (formerly team name)
   * @param repoSlug - Repository slug (name)
   * @param baseUrl - Bitbucket API base URL (defaults to bitbucket.org)
   */
  constructor(
    credentials: BitbucketCredentials | undefined,
    workspace: string,
    repoSlug: string,
    baseUrl: string = 'https://api.bitbucket.org/2.0'
  ) {
    this.workspace = workspace;
    this.repoSlug = repoSlug;

    // Create axios instance with Bitbucket API configuration
    const axiosConfig: any = {
      baseURL: baseUrl,
      timeout: 10000,
    };

    // Add basic auth if credentials provided
    if (credentials) {
      axiosConfig.auth = {
        username: credentials.username,
        password: credentials.password,
      };
    }

    this.axios = axios.create(axiosConfig);
  }

  /**
   * Lists files in the repository root
   * @param ref - Git reference (branch, tag, or commit SHA). Defaults to default branch
   * @returns Array of repository files
   */
  async listFiles(ref?: string): Promise<RepositoryFile[]> {
    try {
      // Use 'main' or 'master' as default if no ref provided
      const revision = ref || 'main';

      const response = await this.axios.get<BitbucketSourceResponse>(
        `/repositories/${this.workspace}/${this.repoSlug}/src/${revision}/`
      );

      // Map Bitbucket API response to RepositoryFile interface
      return response.data.values.map((item) => {
        const fileName = item.path.split('/').pop() || item.path;
        return {
          name: fileName,
          path: item.path,
          type: item.type === 'commit_file' ? 'file' : 'dir',
          size: item.size || 0,
          htmlUrl: `https://bitbucket.org/${this.workspace}/${this.repoSlug}/src/${revision}/${item.path}`,
          downloadUrl: item.links.self.href,
        };
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // If 'main' fails, try 'master'
        if (ref === undefined || ref === 'main') {
          try {
            const response = await this.axios.get<BitbucketSourceResponse>(
              `/repositories/${this.workspace}/${this.repoSlug}/src/master/`
            );

            return response.data.values.map((item) => {
              const fileName = item.path.split('/').pop() || item.path;
              return {
                name: fileName,
                path: item.path,
                type: item.type === 'commit_file' ? 'file' : 'dir',
                size: item.size || 0,
                htmlUrl: `https://bitbucket.org/${this.workspace}/${this.repoSlug}/src/master/${item.path}`,
                downloadUrl: item.links.self.href,
              };
            });
          } catch (masterError) {
            // Both failed, throw original error
            throw new Error(
              `Failed to list files in ${this.workspace}/${this.repoSlug}: ${error.message}`
            );
          }
        }

        throw new Error(
          `Failed to list files in ${this.workspace}/${this.repoSlug}: ${error.message}`
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
      // Use 'main' or 'master' as default if no ref provided
      const revision = ref || 'main';

      // Bitbucket raw file API returns the file content directly
      const response = await this.axios.get<string>(
        `/repositories/${this.workspace}/${this.repoSlug}/src/${revision}/${path}`,
        {
          // Ensure we get text response
          responseType: 'text',
        }
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // If 'main' fails, try 'master'
        if (ref === undefined || ref === 'main') {
          try {
            const response = await this.axios.get<string>(
              `/repositories/${this.workspace}/${this.repoSlug}/src/master/${path}`,
              {
                responseType: 'text',
              }
            );

            return response.data;
          } catch (masterError) {
            // Both failed, throw original error
            throw new Error(
              `Failed to get content for ${path} in ${this.workspace}/${this.repoSlug}: ${error.message}`
            );
          }
        }

        throw new Error(
          `Failed to get content for ${path} in ${this.workspace}/${this.repoSlug}: ${error.message}`
        );
      }
      // Re-wrap non-axios errors
      if (error instanceof Error) {
        throw new Error(
          `Failed to get content for ${path} in ${this.workspace}/${this.repoSlug}: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Gets release notes for a specific version
   * Note: Bitbucket does not have a releases API like GitHub/GitLab
   * @param _version - Version string (not used)
   * @returns Always returns null as Bitbucket doesn't support releases
   */
  async getReleaseNotes(_version: string): Promise<{body: string, url: string} | null> {
    // Bitbucket does not have a releases API
    return null;
  }
}
