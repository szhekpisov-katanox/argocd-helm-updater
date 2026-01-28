/**
 * Unit tests for GitLab client
 */

import axios from 'axios';
import { GitLabClient } from '../../../src/changelog/clients/gitlab-client';
import { RepositoryFile } from '../../../src/types/changelog';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GitLabClient', () => {
  let mockAxiosInstance: any;
  let client: GitLabClient;

  beforeEach(() => {
    // Create a mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    // Mock isAxiosError as a simple function
    (mockedAxios as any).isAxiosError = (error: any) => error?.isAxiosError === true;

    client = new GitLabClient('test-token', 'test-owner/test-repo');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with token', () => {
      new GitLabClient('my-token', 'owner/repo');

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://gitlab.com/api/v4',
        headers: {
          'PRIVATE-TOKEN': 'my-token',
        },
        timeout: 10000,
      });
    });

    it('should create axios instance without token for public repos', () => {
      new GitLabClient(undefined, 'owner/repo');

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://gitlab.com/api/v4',
        headers: {},
        timeout: 10000,
      });
    });

    it('should support custom GitLab instance URL', () => {
      new GitLabClient('token', 'owner/repo', 'https://gitlab.example.com');

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://gitlab.example.com/api/v4',
        headers: {
          'PRIVATE-TOKEN': 'token',
        },
        timeout: 10000,
      });
    });

    it('should URL-encode project path', () => {
      new GitLabClient('token', 'owner/repo-name');
      
      // The project path should be encoded in API calls
      expect(mockedAxios.create).toHaveBeenCalled();
    });
  });

  describe('listFiles', () => {
    it('should list files in repository root', async () => {
      const mockResponse = {
        data: [
          {
            id: '1',
            name: 'README.md',
            path: 'README.md',
            type: 'blob',
            mode: '100644',
          },
          {
            id: '2',
            name: 'CHANGELOG.md',
            path: 'CHANGELOG.md',
            type: 'blob',
            mode: '100644',
          },
          {
            id: '3',
            name: 'src',
            path: 'src',
            type: 'tree',
            mode: '040000',
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.listFiles();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/projects/test-owner%2Ftest-repo/repository/tree',
        {
          params: {
            path: '',
            recursive: 'false',
          },
        }
      );

      expect(result).toEqual<RepositoryFile[]>([
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          size: 0,
          htmlUrl: 'https://gitlab.com/test-owner/test-repo/-/blob/main/README.md',
          downloadUrl: 'https://gitlab.com/test-owner/test-repo/-/raw/main/README.md',
        },
        {
          name: 'CHANGELOG.md',
          path: 'CHANGELOG.md',
          type: 'file',
          size: 0,
          htmlUrl: 'https://gitlab.com/test-owner/test-repo/-/blob/main/CHANGELOG.md',
          downloadUrl: 'https://gitlab.com/test-owner/test-repo/-/raw/main/CHANGELOG.md',
        },
        {
          name: 'src',
          path: 'src',
          type: 'dir',
          size: 0,
          htmlUrl: 'https://gitlab.com/test-owner/test-repo/-/blob/main/src',
          downloadUrl: 'https://gitlab.com/test-owner/test-repo/-/raw/main/src',
        },
      ]);
    });

    it('should list files with specific ref', async () => {
      const mockResponse = {
        data: [
          {
            id: '1',
            name: 'README.md',
            path: 'README.md',
            type: 'blob',
            mode: '100644',
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.listFiles('v1.0.0');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/projects/test-owner%2Ftest-repo/repository/tree',
        {
          params: {
            path: '',
            recursive: 'false',
            ref: 'v1.0.0',
          },
        }
      );

      expect(result[0].htmlUrl).toContain('v1.0.0');
      expect(result[0].downloadUrl).toContain('v1.0.0');
    });

    it('should throw error on API failure', async () => {
      const error = new Error('API Error');
      (error as any).isAxiosError = true;
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.listFiles()).rejects.toThrow(
        'Failed to list files in test-owner/test-repo: API Error'
      );
    });

    it('should handle empty repository', async () => {
      const mockResponse = {
        data: [],
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.listFiles();

      expect(result).toEqual([]);
    });
  });

  describe('getFileContent', () => {
    it('should get file content', async () => {
      const fileContent = 'This is the file content';
      const base64Content = Buffer.from(fileContent).toString('base64');

      const mockResponse = {
        data: {
          file_name: 'CHANGELOG.md',
          file_path: 'CHANGELOG.md',
          size: 1234,
          encoding: 'base64',
          content: base64Content,
          content_sha256: 'abc123',
          ref: 'main',
          blob_id: 'blob1',
          commit_id: 'commit1',
          last_commit_id: 'commit1',
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getFileContent('CHANGELOG.md');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/projects/test-owner%2Ftest-repo/repository/files/CHANGELOG.md',
        {
          params: {},
        }
      );

      expect(result).toBe(fileContent);
    });

    it('should get file content with specific ref', async () => {
      const fileContent = 'Version 1.0.0 content';
      const base64Content = Buffer.from(fileContent).toString('base64');

      const mockResponse = {
        data: {
          file_name: 'CHANGELOG.md',
          file_path: 'CHANGELOG.md',
          size: 1234,
          encoding: 'base64',
          content: base64Content,
          content_sha256: 'abc123',
          ref: 'v1.0.0',
          blob_id: 'blob1',
          commit_id: 'commit1',
          last_commit_id: 'commit1',
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getFileContent('CHANGELOG.md', 'v1.0.0');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/projects/test-owner%2Ftest-repo/repository/files/CHANGELOG.md',
        {
          params: {
            ref: 'v1.0.0',
          },
        }
      );

      expect(result).toBe(fileContent);
    });

    it('should handle UTF-8 content with special characters', async () => {
      const fileContent = 'Content with émojis 🎉 and spëcial çharacters';
      const base64Content = Buffer.from(fileContent, 'utf-8').toString('base64');

      const mockResponse = {
        data: {
          file_name: 'README.md',
          file_path: 'README.md',
          size: 100,
          encoding: 'base64',
          content: base64Content,
          content_sha256: 'abc123',
          ref: 'main',
          blob_id: 'blob1',
          commit_id: 'commit1',
          last_commit_id: 'commit1',
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getFileContent('README.md');

      expect(result).toBe(fileContent);
    });

    it('should handle non-base64 encoded content', async () => {
      const fileContent = 'Plain text content';

      const mockResponse = {
        data: {
          file_name: 'file.txt',
          file_path: 'file.txt',
          size: 100,
          encoding: 'text',
          content: fileContent,
          content_sha256: 'abc123',
          ref: 'main',
          blob_id: 'blob1',
          commit_id: 'commit1',
          last_commit_id: 'commit1',
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getFileContent('file.txt');

      expect(result).toBe(fileContent);
    });

    it('should URL-encode file path', async () => {
      const mockResponse = {
        data: {
          file_name: 'my file.txt',
          file_path: 'path/to/my file.txt',
          size: 100,
          encoding: 'base64',
          content: Buffer.from('content').toString('base64'),
          content_sha256: 'abc123',
          ref: 'main',
          blob_id: 'blob1',
          commit_id: 'commit1',
          last_commit_id: 'commit1',
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      await client.getFileContent('path/to/my file.txt');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/projects/test-owner%2Ftest-repo/repository/files/path%2Fto%2Fmy%20file.txt',
        {
          params: {},
        }
      );
    });

    it('should throw error when content is missing', async () => {
      const mockResponse = {
        data: {
          file_name: 'empty.txt',
          file_path: 'empty.txt',
          size: 0,
          encoding: 'base64',
          // Missing content field
          content_sha256: 'abc123',
          ref: 'main',
          blob_id: 'blob1',
          commit_id: 'commit1',
          last_commit_id: 'commit1',
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      await expect(client.getFileContent('empty.txt')).rejects.toThrow(
        'Failed to get content for empty.txt in test-owner/test-repo: No content found for file empty.txt'
      );
    });

    it('should throw error on API failure', async () => {
      const error = new Error('404 Not Found');
      (error as any).isAxiosError = true;
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.getFileContent('missing.txt')).rejects.toThrow(
        'Failed to get content for missing.txt in test-owner/test-repo: 404 Not Found'
      );
    });
  });

  describe('getReleaseNotes', () => {
    it('should get release notes for exact version tag', async () => {
      const mockResponse = {
        data: {
          tag_name: '1.2.3',
          name: 'Release 1.2.3',
          description: '## What\'s Changed\n\n- Feature A\n- Bug fix B',
          created_at: '2024-01-01T00:00:00Z',
          released_at: '2024-01-01T00:00:00Z',
          _links: {
            self: 'https://gitlab.com/api/v4/projects/123/releases/1.2.3',
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toEqual({
        body: '## What\'s Changed\n\n- Feature A\n- Bug fix B',
        url: 'https://gitlab.com/api/v4/projects/123/releases/1.2.3',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/projects/test-owner%2Ftest-repo/releases/1.2.3'
      );
    });

    it('should try v-prefixed tag format', async () => {
      mockAxiosInstance.get
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({
          data: {
            tag_name: 'v1.2.3',
            name: 'Release v1.2.3',
            description: 'Release notes for v1.2.3',
            created_at: '2024-01-01T00:00:00Z',
            released_at: '2024-01-01T00:00:00Z',
            _links: {
              self: 'https://gitlab.com/api/v4/projects/123/releases/v1.2.3',
            },
          },
        });

      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toEqual({
        body: 'Release notes for v1.2.3',
        url: 'https://gitlab.com/api/v4/projects/123/releases/v1.2.3',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(
        1,
        '/projects/test-owner%2Ftest-repo/releases/1.2.3'
      );
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(
        2,
        '/projects/test-owner%2Ftest-repo/releases/v1.2.3'
      );
    });

    it('should try release-prefixed tag format', async () => {
      mockAxiosInstance.get
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({
          data: {
            tag_name: 'release-1.2.3',
            name: 'Release 1.2.3',
            description: 'Release notes',
            created_at: '2024-01-01T00:00:00Z',
            released_at: '2024-01-01T00:00:00Z',
            _links: {
              self: 'https://gitlab.com/api/v4/projects/123/releases/release-1.2.3',
            },
          },
        });

      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toEqual({
        body: 'Release notes',
        url: 'https://gitlab.com/api/v4/projects/123/releases/release-1.2.3',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3);
    });

    it('should return null when no release found for any tag format', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Not found'));

      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toBeNull();
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3);
    });

    it('should return null when release has no description', async () => {
      const mockResponse = {
        data: {
          tag_name: '1.2.3',
          name: 'Release 1.2.3',
          description: null,
          created_at: '2024-01-01T00:00:00Z',
          released_at: '2024-01-01T00:00:00Z',
          _links: {
            self: 'https://gitlab.com/api/v4/projects/123/releases/1.2.3',
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toBeNull();
    });

    it('should return null when release description is empty string', async () => {
      const mockResponse = {
        data: {
          tag_name: '1.2.3',
          name: 'Release 1.2.3',
          description: '',
          created_at: '2024-01-01T00:00:00Z',
          released_at: '2024-01-01T00:00:00Z',
          _links: {
            self: 'https://gitlab.com/api/v4/projects/123/releases/1.2.3',
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toBeNull();
    });

    it('should handle version already with v prefix', async () => {
      const mockResponse = {
        data: {
          tag_name: 'v1.2.3',
          name: 'Release v1.2.3',
          description: 'Release notes',
          created_at: '2024-01-01T00:00:00Z',
          released_at: '2024-01-01T00:00:00Z',
          _links: {
            self: 'https://gitlab.com/api/v4/projects/123/releases/v1.2.3',
          },
        },
      };

      mockAxiosInstance.get
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce(mockResponse);

      const result = await client.getReleaseNotes('v1.2.3');

      expect(result).toEqual({
        body: 'Release notes',
        url: 'https://gitlab.com/api/v4/projects/123/releases/v1.2.3',
      });

      // Should try 'v1.2.3' first, then 'vv1.2.3' (which will fail)
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(
        1,
        '/projects/test-owner%2Ftest-repo/releases/v1.2.3'
      );
    });

    it('should URL-encode tag names with special characters', async () => {
      const mockResponse = {
        data: {
          tag_name: 'release/1.2.3',
          name: 'Release 1.2.3',
          description: 'Release notes',
          created_at: '2024-01-01T00:00:00Z',
          released_at: '2024-01-01T00:00:00Z',
          _links: {
            self: 'https://gitlab.com/api/v4/projects/123/releases/release%2F1.2.3',
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      await client.getReleaseNotes('release/1.2.3');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/projects/test-owner%2Ftest-repo/releases/release%2F1.2.3'
      );
    });
  });
});
