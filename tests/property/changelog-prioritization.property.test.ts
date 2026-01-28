/**
 * Property-based tests for ChangelogFinder - Changelog Prioritization
 * 
 * **Property 2: Changelog prioritization follows defined order**
 * **Validates: Requirements 1.4**
 * 
 * For any repository containing multiple changelog files, the ChangelogFinder
 * should select the file with the highest priority according to the order:
 * CHANGELOG > HISTORY > RELEASES > NEWS.
 */

import * as fc from 'fast-check';
import { ChangelogFinder } from '../../src/changelog/changelog-finder';
import { RepositoryClient, RepositoryFile } from '../../src/types/changelog';

/**
 * Mock repository client for testing
 */
class MockRepositoryClient implements RepositoryClient {
  constructor(private files: RepositoryFile[]) {}

  async listFiles(): Promise<RepositoryFile[]> {
    return this.files;
  }

  async getFileContent(path: string): Promise<string> {
    const file = this.files.find(f => f.path === path || f.name === path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    return `# Content from ${path}`;
  }

  async getReleaseNotes(): Promise<{body: string, url: string} | null> {
    return null;
  }
}

/**
 * Priority groups for changelog files
 */
const CHANGELOG_FILES = ['CHANGELOG.md', 'CHANGELOG.rst', 'CHANGELOG.txt', 'CHANGELOG'];
const HISTORY_FILES = ['HISTORY.md', 'HISTORY.rst', 'HISTORY.txt', 'HISTORY'];
const RELEASES_FILES = ['RELEASES.md', 'RELEASES.rst', 'RELEASES.txt', 'RELEASES'];
const NEWS_FILES = ['NEWS.md', 'NEWS.rst', 'NEWS.txt', 'NEWS'];

const createRepositoryFile = (name: string): RepositoryFile => ({
  name,
  path: name,
  type: 'file',
  size: 1024,
  htmlUrl: `https://github.com/test/repo/blob/main/${name}`,
  downloadUrl: `https://github.com/test/repo/raw/main/${name}`,
});

describe('Property 2: Changelog prioritization follows defined order', () => {
  /**
   * Property 2.1: CHANGELOG has highest priority
   * 
   * When both CHANGELOG and HISTORY files exist, CHANGELOG should be selected.
   */
  it('should prioritize CHANGELOG over HISTORY', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CHANGELOG_FILES),
        fc.constantFrom(...HISTORY_FILES),
        async (changelogFile, historyFile) => {
          const files = [
            createRepositoryFile(changelogFile),
            createRepositoryFile(historyFile),
          ];
          const mockClient = new MockRepositoryClient(files);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findChangelogFile(
            mockClient,
            'https://github.com/test/repo'
          );

          // CRITICAL: Should select CHANGELOG over HISTORY
          expect(result).not.toBeNull();
          expect(result?.text).toContain(changelogFile);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.2: CHANGELOG has priority over RELEASES
   * 
   * When both CHANGELOG and RELEASES files exist, CHANGELOG should be selected.
   */
  it('should prioritize CHANGELOG over RELEASES', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CHANGELOG_FILES),
        fc.constantFrom(...RELEASES_FILES),
        async (changelogFile, releasesFile) => {
          const files = [
            createRepositoryFile(changelogFile),
            createRepositoryFile(releasesFile),
          ];
          const mockClient = new MockRepositoryClient(files);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findChangelogFile(
            mockClient,
            'https://github.com/test/repo'
          );

          // CRITICAL: Should select CHANGELOG over RELEASES
          expect(result).not.toBeNull();
          expect(result?.text).toContain(changelogFile);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.3: CHANGELOG has priority over NEWS
   * 
   * When both CHANGELOG and NEWS files exist, CHANGELOG should be selected.
   */
  it('should prioritize CHANGELOG over NEWS', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CHANGELOG_FILES),
        fc.constantFrom(...NEWS_FILES),
        async (changelogFile, newsFile) => {
          const files = [
            createRepositoryFile(changelogFile),
            createRepositoryFile(newsFile),
          ];
          const mockClient = new MockRepositoryClient(files);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findChangelogFile(
            mockClient,
            'https://github.com/test/repo'
          );

          // CRITICAL: Should select CHANGELOG over NEWS
          expect(result).not.toBeNull();
          expect(result?.text).toContain(changelogFile);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.4: HISTORY has priority over RELEASES
   * 
   * When both HISTORY and RELEASES files exist (no CHANGELOG),
   * HISTORY should be selected.
   */
  it('should prioritize HISTORY over RELEASES', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...HISTORY_FILES),
        fc.constantFrom(...RELEASES_FILES),
        async (historyFile, releasesFile) => {
          const files = [
            createRepositoryFile(historyFile),
            createRepositoryFile(releasesFile),
          ];
          const mockClient = new MockRepositoryClient(files);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findChangelogFile(
            mockClient,
            'https://github.com/test/repo'
          );

          // CRITICAL: Should select HISTORY over RELEASES
          expect(result).not.toBeNull();
          expect(result?.text).toContain(historyFile);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.5: HISTORY has priority over NEWS
   * 
   * When both HISTORY and NEWS files exist (no CHANGELOG),
   * HISTORY should be selected.
   */
  it('should prioritize HISTORY over NEWS', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...HISTORY_FILES),
        fc.constantFrom(...NEWS_FILES),
        async (historyFile, newsFile) => {
          const files = [
            createRepositoryFile(historyFile),
            createRepositoryFile(newsFile),
          ];
          const mockClient = new MockRepositoryClient(files);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findChangelogFile(
            mockClient,
            'https://github.com/test/repo'
          );

          // CRITICAL: Should select HISTORY over NEWS
          expect(result).not.toBeNull();
          expect(result?.text).toContain(historyFile);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.6: RELEASES has priority over NEWS
   * 
   * When both RELEASES and NEWS files exist (no CHANGELOG or HISTORY),
   * RELEASES should be selected.
   */
  it('should prioritize RELEASES over NEWS', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...RELEASES_FILES),
        fc.constantFrom(...NEWS_FILES),
        async (releasesFile, newsFile) => {
          const files = [
            createRepositoryFile(releasesFile),
            createRepositoryFile(newsFile),
          ];
          const mockClient = new MockRepositoryClient(files);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findChangelogFile(
            mockClient,
            'https://github.com/test/repo'
          );

          // CRITICAL: Should select RELEASES over NEWS
          expect(result).not.toBeNull();
          expect(result?.text).toContain(releasesFile);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.7: Full priority chain
   * 
   * When all four types exist, CHANGELOG should be selected.
   */
  it('should select CHANGELOG when all types exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CHANGELOG_FILES),
        fc.constantFrom(...HISTORY_FILES),
        fc.constantFrom(...RELEASES_FILES),
        fc.constantFrom(...NEWS_FILES),
        async (changelogFile, historyFile, releasesFile, newsFile) => {
          const files = [
            createRepositoryFile(changelogFile),
            createRepositoryFile(historyFile),
            createRepositoryFile(releasesFile),
            createRepositoryFile(newsFile),
          ];
          const mockClient = new MockRepositoryClient(files);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findChangelogFile(
            mockClient,
            'https://github.com/test/repo'
          );

          // CRITICAL: Should select CHANGELOG when all exist
          expect(result).not.toBeNull();
          expect(result?.text).toContain(changelogFile);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.8: Priority is independent of file order
   * 
   * The priority should be maintained regardless of the order
   * files are listed by the repository API.
   */
  it('should maintain priority regardless of file order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CHANGELOG_FILES),
        fc.constantFrom(...NEWS_FILES),
        async (changelogFile, newsFile) => {
          // Create files in reverse priority order
          const files = [
            createRepositoryFile(newsFile),
            createRepositoryFile(changelogFile),
          ];
          const mockClient = new MockRepositoryClient(files);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findChangelogFile(
            mockClient,
            'https://github.com/test/repo'
          );

          // CRITICAL: Should still select CHANGELOG despite order
          expect(result).not.toBeNull();
          expect(result?.text).toContain(changelogFile);
        }
      ),
      { numRuns: 100 }
    );
  });
});
