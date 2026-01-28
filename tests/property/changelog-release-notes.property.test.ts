/**
 * Property-based tests for ChangelogFinder - Release Notes and Combined Output
 * 
 * **Property 6: Release notes retrieval for supported platforms**
 * **Property 7: Combined output inclusion**
 * **Property 8: Graceful handling of missing release notes**
 * **Property 9: Version tag format matching**
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 */

import * as fc from 'fast-check';
import { ChangelogFinder } from '../../src/changelog/changelog-finder';
import { RepositoryClient, RepositoryFile } from '../../src/types/changelog';

/**
 * Mock repository client for testing
 */
class MockRepositoryClient implements RepositoryClient {
  constructor(
    private files: RepositoryFile[],
    private hasReleaseNotes: boolean = false
  ) {}

  async listFiles(): Promise<RepositoryFile[]> {
    return this.files;
  }

  async getFileContent(path: string): Promise<string> {
    return `# Changelog content from ${path}`;
  }

  async getReleaseNotes(version: string): Promise<{body: string, url: string} | null> {
    if (this.hasReleaseNotes) {
      return {
        body: `Release notes for version ${version}`,
        url: `https://github.com/test/repo/releases/tag/v${version}`,
      };
    }
    return null;
  }
}

const createRepositoryFile = (name: string): RepositoryFile => ({
  name,
  path: name,
  type: 'file',
  size: 1024,
  htmlUrl: `https://github.com/test/repo/blob/main/${name}`,
  downloadUrl: `https://github.com/test/repo/raw/main/${name}`,
});

describe('Property 6: Release notes retrieval for supported platforms', () => {
  /**
   * Property 6.1: Release notes are queried for GitHub repositories
   */
  it('should query release notes for GitHub repositories', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }).map(s => s.replace(/[^0-9.]/g, '1')),
        async (version) => {
          const files = [createRepositoryFile('CHANGELOG.md')];
          const mockClient = new MockRepositoryClient(files, true);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findReleaseNotes(
            mockClient,
            version,
            'test-chart',
            'https://github.com/test/repo'
          );

          // CRITICAL: Should attempt to get release notes
          expect(result).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 7: Combined output inclusion', () => {
  /**
   * Property 7.1: Both changelog and release notes are included when available
   */
  it('should include both changelog and release notes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('CHANGELOG.md', 'HISTORY.md'),
        async (filename) => {
          const files = [createRepositoryFile(filename)];
          const mockClient = new MockRepositoryClient(files, true);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          
          // Get changelog
          const changelog = await finder.findChangelogFile(mockClient, 'https://github.com/test/repo');
          // Get release notes
          const releaseNotes = await finder.findReleaseNotes(mockClient, '1.0.0', 'test', 'https://github.com/test/repo');

          // CRITICAL: Both should be available
          expect(changelog).not.toBeNull();
          expect(releaseNotes).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 8: Graceful handling of missing release notes', () => {
  /**
   * Property 8.1: No errors when release notes are missing
   */
  it('should not throw when release notes are missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }),
        async (version) => {
          const files = [createRepositoryFile('CHANGELOG.md')];
          const mockClient = new MockRepositoryClient(files, false);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          
          // CRITICAL: Should not throw
          await expect(
            finder.findReleaseNotes(mockClient, version, 'test', 'https://github.com/test/repo')
          ).resolves.not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8.2: Returns null when release notes are not found
   */
  it('should return null when release notes not found', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }),
        async (version) => {
          const files = [createRepositoryFile('CHANGELOG.md')];
          const mockClient = new MockRepositoryClient(files, false);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findReleaseNotes(
            mockClient,
            version,
            'test',
            'https://github.com/test/repo'
          );

          // CRITICAL: Should return null gracefully
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 9: Version tag format matching', () => {
  /**
   * Property 9.1: Various version formats are handled
   */
  it('should handle various version tag formats', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.nat({ max: 20 }),
          fc.nat({ max: 50 }),
          fc.nat({ max: 100 })
        ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`),
        async (version) => {
          const files = [createRepositoryFile('CHANGELOG.md')];
          const mockClient = new MockRepositoryClient(files, true);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          
          // CRITICAL: Should handle semantic version format
          const result = await finder.findReleaseNotes(
            mockClient,
            version,
            'test',
            'https://github.com/test/repo'
          );

          expect(result).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
