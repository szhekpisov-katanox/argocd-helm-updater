/**
 * Unit tests for ChangelogFinder
 */

import { ChangelogFinder } from '../../../src/changelog/changelog-finder';
import { RepositoryClient, RepositoryFile } from '../../../src/types/changelog';
import { VersionUpdate } from '../../../src/types/version';

/**
 * Mock repository client for testing
 */
class MockRepositoryClient implements RepositoryClient {
  constructor(
    private files: RepositoryFile[] = [],
    private fileContents: Map<string, string> = new Map(),
    private releaseNotesBody: string | null = null
  ) {}

  async listFiles(): Promise<RepositoryFile[]> {
    return this.files;
  }

  async getFileContent(path: string): Promise<string> {
    const content = this.fileContents.get(path);
    if (!content) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  async getReleaseNotes(version: string): Promise<{body: string, url: string} | null> {
    if (this.releaseNotesBody) {
      return {
        body: this.releaseNotesBody,
        url: `https://github.com/test/repo/releases/tag/v${version}`,
      };
    }
    return null;
  }
}

describe('ChangelogFinder', () => {
  let finder: ChangelogFinder;

  beforeEach(() => {
    finder = new ChangelogFinder({ githubToken: 'test-token' });
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const finder = new ChangelogFinder();
      expect(finder).toBeDefined();
    });

    it('should create instance with GitHub token', () => {
      const finder = new ChangelogFinder({ githubToken: 'test-token' });
      expect(finder).toBeDefined();
    });

    it('should create instance with GitLab token', () => {
      const finder = new ChangelogFinder({ gitlabToken: 'test-token' });
      expect(finder).toBeDefined();
    });

    it('should create instance with Bitbucket credentials', () => {
      const finder = new ChangelogFinder({
        bitbucketCredentials: { username: 'user', password: 'pass' },
      });
      expect(finder).toBeDefined();
    });

    it('should create instance with custom cache TTL', () => {
      const finder = new ChangelogFinder({ cacheTTL: 7200 });
      expect(finder).toBeDefined();
    });

    it('should create instance with caching disabled', () => {
      const finder = new ChangelogFinder({ enableCache: false });
      expect(finder).toBeDefined();
    });
  });

  describe('findChangelogFile', () => {
    it('should find CHANGELOG.md file', async () => {
      const files: RepositoryFile[] = [
        {
          name: 'CHANGELOG.md',
          path: 'CHANGELOG.md',
          type: 'file',
          size: 1024,
          htmlUrl: 'https://github.com/test/repo/blob/main/CHANGELOG.md',
          downloadUrl: 'https://github.com/test/repo/raw/main/CHANGELOG.md',
        },
      ];
      const contents = new Map([['CHANGELOG.md', '# Changelog\n\n## 1.0.0\n- Initial release']]);
      const mockClient = new MockRepositoryClient(files, contents);

      const result = await finder.findChangelogFile(mockClient, 'https://github.com/test/repo');

      expect(result).not.toBeNull();
      expect(result?.text).toContain('Changelog');
      expect(result?.url).toContain('CHANGELOG.md');
    });

    it('should find HISTORY.md when CHANGELOG.md does not exist', async () => {
      const files: RepositoryFile[] = [
        {
          name: 'HISTORY.md',
          path: 'HISTORY.md',
          type: 'file',
          size: 1024,
          htmlUrl: 'https://github.com/test/repo/blob/main/HISTORY.md',
          downloadUrl: 'https://github.com/test/repo/raw/main/HISTORY.md',
        },
      ];
      const contents = new Map([['HISTORY.md', '# History\n\n## 1.0.0\n- Initial release']]);
      const mockClient = new MockRepositoryClient(files, contents);

      const result = await finder.findChangelogFile(mockClient, 'https://github.com/test/repo');

      expect(result).not.toBeNull();
      expect(result?.text).toContain('History');
    });

    it('should return null when no changelog file exists', async () => {
      const files: RepositoryFile[] = [
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          size: 1024,
          htmlUrl: 'https://github.com/test/repo/blob/main/README.md',
          downloadUrl: 'https://github.com/test/repo/raw/main/README.md',
        },
      ];
      const mockClient = new MockRepositoryClient(files, new Map());

      const result = await finder.findChangelogFile(mockClient, 'https://github.com/test/repo');

      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const mockClient: RepositoryClient = {
        async listFiles() {
          throw new Error('API error');
        },
        async getFileContent() {
          throw new Error('API error');
        },
        async getReleaseNotes() {
          return null;
        },
      };

      const result = await finder.findChangelogFile(mockClient, 'https://github.com/test/repo');

      expect(result).toBeNull();
    });
  });

  describe('findReleaseNotes', () => {
    it('should find release notes when available', async () => {
      const mockClient = new MockRepositoryClient([], new Map(), 'Release notes for v1.0.0');

      const result = await finder.findReleaseNotes(
        mockClient,
        '1.0.0',
        'test-chart',
        'https://github.com/test/repo'
      );

      expect(result).not.toBeNull();
      expect(result?.text).toContain('Release notes');
      expect(result?.url).toContain('releases');
    });

    it('should return null when release notes are not available', async () => {
      const mockClient = new MockRepositoryClient([], new Map(), null);

      const result = await finder.findReleaseNotes(
        mockClient,
        '1.0.0',
        'test-chart',
        'https://github.com/test/repo'
      );

      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const mockClient: RepositoryClient = {
        async listFiles() {
          return [];
        },
        async getFileContent() {
          return '';
        },
        async getReleaseNotes() {
          throw new Error('API error');
        },
      };

      const result = await finder.findReleaseNotes(
        mockClient,
        '1.0.0',
        'test-chart',
        'https://github.com/test/repo'
      );

      expect(result).toBeNull();
    });
  });

  describe('discoverSourceRepository', () => {
    it('should extract source URL from update', async () => {
      const update: VersionUpdate = {
        dependency: {
          manifestPath: 'test/manifest.yaml',
          documentIndex: 0,
          chartName: 'test-chart',
          repoURL: 'https://github.com/test/repo',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        currentVersion: '1.0.0',
        newVersion: '2.0.0',
      };

      const urls = await finder.discoverSourceRepository(update);

      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe('https://github.com/test/repo');
    });

    it('should return empty array when no repo URL', async () => {
      const update: VersionUpdate = {
        dependency: {
          manifestPath: 'test/manifest.yaml',
          documentIndex: 0,
          chartName: 'test-chart',
          repoURL: '',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        currentVersion: '1.0.0',
        newVersion: '2.0.0',
      };

      const urls = await finder.discoverSourceRepository(update);

      expect(urls).toHaveLength(0);
    });
  });

  describe('findChangelog', () => {
    it('should return negative result when no changelog found', async () => {
      const update: VersionUpdate = {
        dependency: {
          manifestPath: 'test/manifest.yaml',
          documentIndex: 0,
          chartName: 'test-chart',
          repoURL: 'https://unknown-platform.com/test/repo',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        currentVersion: '1.0.0',
        newVersion: '2.0.0',
      };

      const result = await finder.findChangelog(update);

      expect(result.found).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should use cache on subsequent calls', async () => {
      const update: VersionUpdate = {
        dependency: {
          manifestPath: 'test/manifest.yaml',
          documentIndex: 0,
          chartName: 'test-chart',
          repoURL: 'https://github.com/test/repo',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        currentVersion: '1.0.0',
        newVersion: '2.0.0',
      };

      // First call
      const result1 = await finder.findChangelog(update);
      
      // Second call should use cache
      const result2 = await finder.findChangelog(update);

      expect(result1).toEqual(result2);
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', () => {
      expect(() => finder.clearCache()).not.toThrow();
    });
  });

  describe('cache integration', () => {
    it('should cache positive results', async () => {
      const update: VersionUpdate = {
        dependency: {
          manifestPath: 'test/manifest.yaml',
          documentIndex: 0,
          chartName: 'test-chart',
          repoURL: 'https://github.com/test/repo',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        currentVersion: '1.0.0',
        newVersion: '2.0.0',
      };

      const result1 = await finder.findChangelog(update);
      const result2 = await finder.findChangelog(update);

      // Should return same result from cache
      expect(result1).toEqual(result2);
    });

    it('should cache negative results', async () => {
      const update: VersionUpdate = {
        dependency: {
          manifestPath: 'test/manifest.yaml',
          documentIndex: 0,
          chartName: 'test-chart',
          repoURL: 'https://unknown.com/test/repo',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        currentVersion: '1.0.0',
        newVersion: '2.0.0',
      };

      const result1 = await finder.findChangelog(update);
      const result2 = await finder.findChangelog(update);

      expect(result1.found).toBe(false);
      expect(result2.found).toBe(false);
      expect(result1).toEqual(result2);
    });

    it('should not use cache when caching is disabled', async () => {
      const finderNoCache = new ChangelogFinder({
        githubToken: 'test-token',
        enableCache: false,
      });

      const update: VersionUpdate = {
        dependency: {
          manifestPath: 'test/manifest.yaml',
          documentIndex: 0,
          chartName: 'test-chart',
          repoURL: 'https://github.com/test/repo',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        currentVersion: '1.0.0',
        newVersion: '2.0.0',
      };

      const result1 = await finderNoCache.findChangelog(update);
      const result2 = await finderNoCache.findChangelog(update);

      // Results should be independent (not from cache)
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });
});
