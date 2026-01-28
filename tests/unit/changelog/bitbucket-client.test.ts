/**
 * Unit tests for Bitbucket client
 */

import axios from 'axios';
import { BitbucketClient } from '../../../src/changelog/clients/bitbucket-client';
import { RepositoryFile } from '../../../src/types/changelog';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BitbucketClient', () => {
  let mockAxiosInstance: any;
  let client: BitbucketClient;

  beforeEach(() => {
    // Create a mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    // Mock isAxiosError as a simple function
    (mockedAxios as any).isAxiosError = (error: any) => error?.isAxiosError === true;

    client = new BitbucketClient(
      { username: 'test-user', password: 'test-password' },
      'test-workspace',
      'test-repo'
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with authentication', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.bitbucket.org/2.0',
        timeout: 10000,
        auth: {
          username: 'test-user',
          password: 'test-password',
        },
      });
    });

    it('should create axios instance without authentication when credentials not provided', () => {
      jest.clearAllMocks();
      
      new BitbucketClient(undefined, 'test-workspace', 'test-repo');

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.bitbucket.org/2.0',
        timeout: 10000,
      });
    });

    it('should use custom base URL when provided', () => {
      jest.clearAllMocks();

      new BitbucketClient(
        { username: 'user', password: 'pass' },
        'workspace',
        'repo',
        'https://custom.bitbucket.com/api/2.0'
      );

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://custom.bitbucket.com/api/2.0',
        timeout: 10000,
        auth: {
          username: 'user',
          password: 'pass',
        },
      });
    });
  });

  describe('listFiles', () => {
    it('should list files in repository root', async () => {
      const mockResponse = {
        data: {
          values: [
            {
              path: 'README.md',
              type: 'commit_file',
              size: 1234,
              links: {
                self: {
                  href: 'https://api.bitbucket.org/2.0/repositories/test-workspace/test-repo/src/main/README.md',
                },
              },
            },
            {
              path: 'CHANGELOG.md',
              type: 'commit_file',
              size: 5678,
              links: {
                self: {
                  href: 'https://api.bitbucket.org/2.0/repositories/test-workspace/test-repo/src/main/CHANGELOG.md',
                },
              },
            },
            {
              path: 'src',
              type: 'commit_directory',
              links: {
                self: {
                  href: 'https://api.bitbucket.org/2.0/repositories/test-workspace/test-repo/src/main/src',
                },
              },
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.listFiles();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/repositories/test-workspace/test-repo/src/main/'
      );

      expect(result).toEqual<RepositoryFile[]>([
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          size: 1234,
          htmlUrl: 'https://bitbucket.org/test-workspace/test-repo/src/main/README.md',
          downloadUrl: 'https://api.bitbucket.org/2.0/repositories/test-workspace/test-repo/src/main/README.md',
        },
        {
          name: 'CHANGELOG.md',
          path: 'CHANGELOG.md',
          type: 'file',
          size: 5678,
          htmlUrl: 'https://bitbucket.org/test-workspace/test-repo/src/main/CHANGELOG.md',
          downloadUrl: 'https://api.bitbucket.org/2.0/repositories/test-workspace/test-repo/src/main/CHANGELOG.md',
        },
        {
          name: 'src',
          path: 'src',
          type: 'dir',
          size: 0,
          htmlUrl: 'https://bitbucket.org/test-workspace/test-repo/src/main/src',
          downloadUrl: 'https://api.bitbucket.org/2.0/repositories/test-workspace/test-repo/src/main/src',
        },
      ]);
    });

    it('should list files with specific ref', async () => {
      const mockResponse = {
        data: {
          values: [
            {
              path: 'README.md',
              type: 'commit_file',
              size: 1234,
              links: {
                self: {
                  href: 'https://api.bitbucket.org/2.0/repositories/test-workspace/test-repo/src/v1.0.0/README.md',
                },
              },
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      await client.listFiles('v1.0.0');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/repositories/test-workspace/test-repo/src/v1.0.0/'
      );
    });

    it('should fallback to master branch when main fails', async () => {
      const mockMainResponse = {
        response: { status: 404 },
        message: 'Not found',
        isAxiosError: true,
      };

      const mockMasterResponse = {
        data: {
          values: [
            {
              path: 'README.md',
              type: 'commit_file',
              size: 1234,
              links: {
                self: {
                  href: 'https://api.bitbucket.org/2.0/repositories/test-workspace/test-repo/src/master/README.md',
                },
              },
            },
          ],
        },
      };

      mockAxiosInstance.get
        .mockRejectedValueOnce(mockMainResponse)
        .mockResolvedValueOnce(mockMasterResponse);

      const result = await client.listFiles();

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(1, '/repositories/test-workspace/test-repo/src/main/');
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(2, '/repositories/test-workspace/test-repo/src/master/');

      expect(result).toEqual<RepositoryFile[]>([
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          size: 1234,
          htmlUrl: 'https://bitbucket.org/test-workspace/test-repo/src/master/README.md',
          downloadUrl: 'https://api.bitbucket.org/2.0/repositories/test-workspace/test-repo/src/master/README.md',
        },
      ]);
    });

    it('should throw error when both main and master fail', async () => {
      const mockError = {
        response: { status: 404 },
        message: 'Repository not found',
        isAxiosError: true,
      };

      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.listFiles()).rejects.toThrow(
        'Failed to list files in test-workspace/test-repo: Repository not found'
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it('should not fallback to master when specific ref is provided', async () => {
      const mockError = {
        response: { status: 404 },
        message: 'Branch not found',
        isAxiosError: true,
      };

      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.listFiles('feature-branch')).rejects.toThrow(
        'Failed to list files in test-workspace/test-repo: Branch not found'
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/repositories/test-workspace/test-repo/src/feature-branch/'
      );
    });

    it('should handle missing size field', async () => {
      const mockResponse = {
        data: {
          values: [
            {
              path: 'file.txt',
              type: 'commit_file',
              // Missing size
              links: {
                self: {
                  href: 'https://api.bitbucket.org/2.0/repositories/test-workspace/test-repo/src/main/file.txt',
                },
              },
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.listFiles();

      expect(result).toEqual<RepositoryFile[]>([
        {
          name: 'file.txt',
          path: 'file.txt',
          type: 'file',
          size: 0,
          htmlUrl: 'https://bitbucket.org/test-workspace/test-repo/src/main/file.txt',
          downloadUrl: 'https://api.bitbucket.org/2.0/repositories/test-workspace/test-repo/src/main/file.txt',
        },
      ]);
    });

    it('should handle nested file paths', async () => {
      const mockResponse = {
        data: {
          values: [
            {
              path: 'docs/CHANGELOG.md',
              type: 'commit_file',
              size: 1234,
              links: {
                self: {
                  href: 'https://api.bitbucket.org/2.0/repositories/test-workspace/test-repo/src/main/docs/CHANGELOG.md',
                },
              },
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.listFiles();

      expect(result[0].name).toBe('CHANGELOG.md');
      expect(result[0].path).toBe('docs/CHANGELOG.md');
    });
  });

  describe('getFileContent', () => {
    it('should get file content', async () => {
      const fileContent = 'This is the file content';

      mockAxiosInstance.get.mockResolvedValue({ data: fileContent });

      const result = await client.getFileContent('CHANGELOG.md');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/repositories/test-workspace/test-repo/src/main/CHANGELOG.md',
        { responseType: 'text' }
      );

      expect(result).toBe(fileContent);
    });

    it('should get file content with specific ref', async () => {
      const fileContent = 'Version 1.0.0 content';

      mockAxiosInstance.get.mockResolvedValue({ data: fileContent });

      const result = await client.getFileContent('CHANGELOG.md', 'v1.0.0');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/repositories/test-workspace/test-repo/src/v1.0.0/CHANGELOG.md',
        { responseType: 'text' }
      );

      expect(result).toBe(fileContent);
    });

    it('should handle UTF-8 content with special characters', async () => {
      const fileContent = 'Content with émojis 🎉 and spëcial çharacters';

      mockAxiosInstance.get.mockResolvedValue({ data: fileContent });

      const result = await client.getFileContent('README.md');

      expect(result).toBe(fileContent);
    });

    it('should fallback to master branch when main fails', async () => {
      const mockError = {
        response: { status: 404 },
        message: 'Not found',
        isAxiosError: true,
      };

      const fileContent = 'File content from master';

      mockAxiosInstance.get
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce({ data: fileContent });

      const result = await client.getFileContent('CHANGELOG.md');

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(
        1,
        '/repositories/test-workspace/test-repo/src/main/CHANGELOG.md',
        { responseType: 'text' }
      );
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(
        2,
        '/repositories/test-workspace/test-repo/src/master/CHANGELOG.md',
        { responseType: 'text' }
      );

      expect(result).toBe(fileContent);
    });

    it('should throw error when both main and master fail', async () => {
      const mockError = {
        response: { status: 404 },
        message: 'File not found',
        isAxiosError: true,
      };

      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getFileContent('missing.txt')).rejects.toThrow(
        'Failed to get content for missing.txt in test-workspace/test-repo: File not found'
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it('should not fallback to master when specific ref is provided', async () => {
      const mockError = {
        response: { status: 404 },
        message: 'File not found',
        isAxiosError: true,
      };

      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getFileContent('file.txt', 'feature-branch')).rejects.toThrow(
        'Failed to get content for file.txt in test-workspace/test-repo: File not found'
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/repositories/test-workspace/test-repo/src/feature-branch/file.txt',
        { responseType: 'text' }
      );
    });

    it('should handle non-axios errors', async () => {
      const mockError = new Error('Network error');

      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getFileContent('file.txt')).rejects.toThrow(
        'Failed to get content for file.txt in test-workspace/test-repo: Network error'
      );
    });

    it('should handle nested file paths', async () => {
      const fileContent = 'Nested file content';

      mockAxiosInstance.get.mockResolvedValue({ data: fileContent });

      const result = await client.getFileContent('docs/api/README.md');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/repositories/test-workspace/test-repo/src/main/docs/api/README.md',
        { responseType: 'text' }
      );

      expect(result).toBe(fileContent);
    });
  });

  describe('getReleaseNotes', () => {
    it('should always return null as Bitbucket does not have releases API', async () => {
      const result = await client.getReleaseNotes('1.2.3');

      expect(result).toBeNull();
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });

    it('should return null for any version string', async () => {
      expect(await client.getReleaseNotes('1.0.0')).toBeNull();
      expect(await client.getReleaseNotes('v2.3.4')).toBeNull();
      expect(await client.getReleaseNotes('release-1.2.3')).toBeNull();
      expect(await client.getReleaseNotes('latest')).toBeNull();

      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });
  });
});
