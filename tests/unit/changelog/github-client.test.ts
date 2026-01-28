/**
 * Unit tests for GitHub client
 */

import { GitHubClient } from '../../../src/changelog/clients/github-client';
import { RepositoryFile } from '../../../src/types/changelog';

// Mock @actions/github
jest.mock('@actions/github');

describe('GitHubClient', () => {
  let mockOctokit: any;
  let client: GitHubClient;

  beforeEach(() => {
    // Create a mock Octokit instance
    mockOctokit = {
      rest: {
        repos: {
          getContent: jest.fn(),
          getReleaseByTag: jest.fn(),
        },
      },
    };

    client = new GitHubClient(mockOctokit, 'test-owner', 'test-repo');
  });

  describe('listFiles', () => {
    it('should list files in repository root', async () => {
      const mockResponse = {
        data: [
          {
            name: 'README.md',
            path: 'README.md',
            type: 'file',
            size: 1234,
            html_url: 'https://github.com/test-owner/test-repo/blob/main/README.md',
            download_url: 'https://raw.githubusercontent.com/test-owner/test-repo/main/README.md',
          },
          {
            name: 'CHANGELOG.md',
            path: 'CHANGELOG.md',
            type: 'file',
            size: 5678,
            html_url: 'https://github.com/test-owner/test-repo/blob/main/CHANGELOG.md',
            download_url: 'https://raw.githubusercontent.com/test-owner/test-repo/main/CHANGELOG.md',
          },
          {
            name: 'src',
            path: 'src',
            type: 'dir',
            size: 0,
            html_url: 'https://github.com/test-owner/test-repo/tree/main/src',
            download_url: null,
          },
        ],
      };

      mockOctokit.rest.repos.getContent.mockResolvedValue(mockResponse as any);

      const result = await client.listFiles();

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        path: '',
        ref: undefined,
      });

      expect(result).toEqual<RepositoryFile[]>([
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          size: 1234,
          htmlUrl: 'https://github.com/test-owner/test-repo/blob/main/README.md',
          downloadUrl: 'https://raw.githubusercontent.com/test-owner/test-repo/main/README.md',
        },
        {
          name: 'CHANGELOG.md',
          path: 'CHANGELOG.md',
          type: 'file',
          size: 5678,
          htmlUrl: 'https://github.com/test-owner/test-repo/blob/main/CHANGELOG.md',
          downloadUrl: 'https://raw.githubusercontent.com/test-owner/test-repo/main/CHANGELOG.md',
        },
        {
          name: 'src',
          path: 'src',
          type: 'dir',
          size: 0,
          htmlUrl: 'https://github.com/test-owner/test-repo/tree/main/src',
          downloadUrl: '',
        },
      ]);
    });

    it('should list files with specific ref', async () => {
      const mockResponse = {
        data: [
          {
            name: 'README.md',
            path: 'README.md',
            type: 'file',
            size: 1234,
            html_url: 'https://github.com/test-owner/test-repo/blob/v1.0.0/README.md',
            download_url: 'https://raw.githubusercontent.com/test-owner/test-repo/v1.0.0/README.md',
          },
        ],
      };

      mockOctokit.rest.repos.getContent.mockResolvedValue(mockResponse as any);

      await client.listFiles('v1.0.0');

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        path: '',
        ref: 'v1.0.0',
      });
    });

    it('should return empty array for single file response', async () => {
      const mockResponse = {
        data: {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          size: 1234,
        },
      };

      mockOctokit.rest.repos.getContent.mockResolvedValue(mockResponse as any);

      const result = await client.listFiles();

      expect(result).toEqual([]);
    });

    it('should throw error on API failure', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(new Error('API Error'));

      await expect(client.listFiles()).rejects.toThrow(
        'Failed to list files in test-owner/test-repo: API Error'
      );
    });

    it('should handle missing optional fields', async () => {
      const mockResponse = {
        data: [
          {
            name: 'file.txt',
            path: 'file.txt',
            type: 'file',
            // Missing size, html_url, download_url
          },
        ],
      };

      mockOctokit.rest.repos.getContent.mockResolvedValue(mockResponse as any);

      const result = await client.listFiles();

      expect(result).toEqual<RepositoryFile[]>([
        {
          name: 'file.txt',
          path: 'file.txt',
          type: 'file',
          size: 0,
          htmlUrl: '',
          downloadUrl: '',
        },
      ]);
    });
  });

  describe('getFileContent', () => {
    it('should get file content', async () => {
      const fileContent = 'This is the file content';
      const base64Content = Buffer.from(fileContent).toString('base64');

      const mockResponse = {
        data: {
          type: 'file',
          content: base64Content,
          name: 'CHANGELOG.md',
          path: 'CHANGELOG.md',
        },
      };

      mockOctokit.rest.repos.getContent.mockResolvedValue(mockResponse as any);

      const result = await client.getFileContent('CHANGELOG.md');

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'CHANGELOG.md',
        ref: undefined,
      });

      expect(result).toBe(fileContent);
    });

    it('should get file content with specific ref', async () => {
      const fileContent = 'Version 1.0.0 content';
      const base64Content = Buffer.from(fileContent).toString('base64');

      const mockResponse = {
        data: {
          type: 'file',
          content: base64Content,
        },
      };

      mockOctokit.rest.repos.getContent.mockResolvedValue(mockResponse as any);

      const result = await client.getFileContent('CHANGELOG.md', 'v1.0.0');

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'CHANGELOG.md',
        ref: 'v1.0.0',
      });

      expect(result).toBe(fileContent);
    });

    it('should handle UTF-8 content with special characters', async () => {
      const fileContent = 'Content with émojis 🎉 and spëcial çharacters';
      const base64Content = Buffer.from(fileContent, 'utf-8').toString('base64');

      const mockResponse = {
        data: {
          type: 'file',
          content: base64Content,
        },
      };

      mockOctokit.rest.repos.getContent.mockResolvedValue(mockResponse as any);

      const result = await client.getFileContent('README.md');

      expect(result).toBe(fileContent);
    });

    it('should throw error for directory response', async () => {
      const mockResponse = {
        data: [
          { name: 'file1.txt', type: 'file' },
          { name: 'file2.txt', type: 'file' },
        ],
      };

      mockOctokit.rest.repos.getContent.mockResolvedValue(mockResponse as any);

      await expect(client.getFileContent('src')).rejects.toThrow(
        'Failed to get content for src in test-owner/test-repo: Path src is a directory, not a file'
      );
    });

    it('should throw error for non-file type', async () => {
      const mockResponse = {
        data: {
          type: 'symlink',
          name: 'link.txt',
        },
      };

      mockOctokit.rest.repos.getContent.mockResolvedValue(mockResponse as any);

      await expect(client.getFileContent('link.txt')).rejects.toThrow(
        'Failed to get content for link.txt in test-owner/test-repo: Path link.txt is not a file (type: symlink)'
      );
    });

    it('should throw error when content is missing', async () => {
      const mockResponse = {
        data: {
          type: 'file',
          name: 'empty.txt',
          // Missing content field
        },
      };

      mockOctokit.rest.repos.getContent.mockResolvedValue(mockResponse as any);

      await expect(client.getFileContent('empty.txt')).rejects.toThrow(
        'Failed to get content for empty.txt in test-owner/test-repo: No content found for file empty.txt'
      );
    });

    it('should throw error on API failure', async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue(new Error('404 Not Found'));

      await expect(client.getFileContent('missing.txt')).rejects.toThrow(
        'Failed to get content for missing.txt in test-owner/test-repo: 404 Not Found'
      );
    });
  });

  describe('getReleaseNotes', () => {
    it('should get release notes for exact version tag', async () => {
      const mockResponse = {
        data: {
          body: '## What\'s Changed\n\n- Feature A\n- Bug fix B',
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/1.2.3',
          tag_name: '1.2.3',
        },
      };

      mockOctokit.rest.repos.getReleaseByTag.mockResolvedValue(mockResponse as any);

      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toEqual({
        body: '## What\'s Changed\n\n- Feature A\n- Bug fix B',
        url: 'https://github.com/test-owner/test-repo/releases/tag/1.2.3',
      });

      expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        tag: '1.2.3',
      });
    });

    it('should try v-prefixed tag format', async () => {
      mockOctokit.rest.repos.getReleaseByTag
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({
          data: {
            body: 'Release notes for v1.2.3',
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.2.3',
          },
        } as any);

      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toEqual({
        body: 'Release notes for v1.2.3',
        url: 'https://github.com/test-owner/test-repo/releases/tag/v1.2.3',
      });

      expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenCalledTimes(2);
      expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenNthCalledWith(1, {
        owner: 'test-owner',
        repo: 'test-repo',
        tag: '1.2.3',
      });
      expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenNthCalledWith(2, {
        owner: 'test-owner',
        repo: 'test-repo',
        tag: 'v1.2.3',
      });
    });

    it('should try release-prefixed tag format', async () => {
      mockOctokit.rest.repos.getReleaseByTag
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({
          data: {
            body: 'Release notes',
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/release-1.2.3',
          },
        } as any);

      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toEqual({
        body: 'Release notes',
        url: 'https://github.com/test-owner/test-repo/releases/tag/release-1.2.3',
      });

      expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenCalledTimes(3);
    });

    it('should try repo-name-prefixed tag format', async () => {
      mockOctokit.rest.repos.getReleaseByTag
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({
          data: {
            body: 'Release notes',
            html_url: 'https://github.com/test-owner/test-repo/releases/tag/test-repo-1.2.3',
          },
        } as any);

      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toEqual({
        body: 'Release notes',
        url: 'https://github.com/test-owner/test-repo/releases/tag/test-repo-1.2.3',
      });

      expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenCalledTimes(4);
      expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenNthCalledWith(4, {
        owner: 'test-owner',
        repo: 'test-repo',
        tag: 'test-repo-1.2.3',
      });
    });

    it('should return null when no release found for any tag format', async () => {
      mockOctokit.rest.repos.getReleaseByTag.mockRejectedValue(new Error('Not found'));

      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toBeNull();
      expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenCalledTimes(4);
    });

    it('should return null when release has no body', async () => {
      const mockResponse = {
        data: {
          body: null,
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/1.2.3',
        },
      };

      mockOctokit.rest.repos.getReleaseByTag.mockResolvedValue(mockResponse as any);

      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toBeNull();
    });

    it('should return null when release body is empty string', async () => {
      const mockResponse = {
        data: {
          body: '',
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/1.2.3',
        },
      };

      mockOctokit.rest.repos.getReleaseByTag.mockResolvedValue(mockResponse as any);

      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toBeNull();
    });

    it('should handle version already with v prefix', async () => {
      const mockResponse = {
        data: {
          body: 'Release notes',
          html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.2.3',
        },
      };

      mockOctokit.rest.repos.getReleaseByTag
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce(mockResponse as any);

      const result = await client.getReleaseNotes('v1.2.3');

      expect(result).toEqual({
        body: 'Release notes',
        url: 'https://github.com/test-owner/test-repo/releases/tag/v1.2.3',
      });

      // Should try 'v1.2.3' first, then 'vv1.2.3' (which will fail)
      expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenNthCalledWith(1, {
        owner: 'test-owner',
        repo: 'test-repo',
        tag: 'v1.2.3',
      });
    });
  });
});
