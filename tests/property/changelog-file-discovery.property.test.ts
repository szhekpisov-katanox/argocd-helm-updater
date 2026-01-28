/**
 * Property-based tests for ChangelogFinder - Changelog File Discovery
 * 
 * **Property 1: Changelog file discovery attempts standard names**
 * **Validates: Requirements 1.1, 1.2, 1.3**
 * 
 * For any chart update with a source repository, the ChangelogFinder should
 * attempt to locate changelog files using all standard naming conventions
 * (CHANGELOG, HISTORY, RELEASES, NEWS) in both case-sensitive and
 * case-insensitive variations.
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
    return `# Changelog for ${path}`;
  }

  async getReleaseNotes(): Promise<{body: string, url: string} | null> {
    return null;
  }
}

/**
 * Custom arbitraries for generating test data
 */

// Generate changelog file names (standard naming conventions)
const arbChangelogFilename = fc.oneof(
  // CHANGELOG variations
  fc.constantFrom('CHANGELOG.md', 'CHANGELOG.rst', 'CHANGELOG.txt', 'CHANGELOG'),
  fc.constantFrom('changelog.md', 'changelog.rst', 'changelog.txt', 'changelog'),
  // HISTORY variations
  fc.constantFrom('HISTORY.md', 'HISTORY.rst', 'HISTORY.txt', 'HISTORY'),
  fc.constantFrom('history.md', 'history.rst', 'history.txt', 'history'),
  // RELEASES variations
  fc.constantFrom('RELEASES.md', 'RELEASES.rst', 'RELEASES.txt', 'RELEASES'),
  fc.constantFrom('releases.md', 'releases.rst', 'releases.txt', 'releases'),
  // NEWS variations
  fc.constantFrom('NEWS.md', 'NEWS.rst', 'NEWS.txt', 'NEWS'),
  fc.constantFrom('news.md', 'news.rst', 'news.txt', 'news')
);

// Generate repository file
const createRepositoryFile = (name: string): RepositoryFile => ({
  name,
  path: name,
  type: 'file',
  size: 1024,
  htmlUrl: `https://github.com/test/repo/blob/main/${name}`,
  downloadUrl: `https://github.com/test/repo/raw/main/${name}`,
});

describe('Property 1: Changelog file discovery attempts standard names', () => {
  /**
   * Property 1.1: All standard changelog names are checked
   * 
   * For any repository with a changelog file using standard naming,
   * the finder should successfully locate it.
   */
  it('should find changelog files with standard naming conventions', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbChangelogFilename,
        async (filename) => {
          // Create mock client with the changelog file
          const file = createRepositoryFile(filename);
          const mockClient = new MockRepositoryClient([file]);

          // Test that findChangelogFile locates the file
          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findChangelogFile(
            mockClient,
            'https://github.com/test/repo'
          );

          // CRITICAL: Should find the changelog file
          expect(result).not.toBeNull();
          expect(result?.text).toContain('Changelog');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.2: Case-insensitive variations are checked
   * 
   * For any changelog file name, both uppercase and lowercase variations
   * should be recognized.
   */
  it('should recognize both uppercase and lowercase changelog names', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'CHANGELOG.md', 'changelog.md',
          'HISTORY.md', 'history.md',
          'RELEASES.md', 'releases.md',
          'NEWS.md', 'news.md'
        ),
        async (filename) => {
          const file = createRepositoryFile(filename);
          const mockClient = new MockRepositoryClient([file]);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findChangelogFile(
            mockClient,
            'https://github.com/test/repo'
          );

          // CRITICAL: Should find regardless of case
          expect(result).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.3: Multiple file extensions are supported
   * 
   * For any changelog base name (CHANGELOG, HISTORY, etc.),
   * all common extensions (.md, .rst, .txt, no extension) should be checked.
   */
  it('should check multiple file extensions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('.md', '.rst', '.txt', ''),
        fc.constantFrom('CHANGELOG', 'HISTORY', 'RELEASES', 'NEWS'),
        async (extension, basename) => {
          const filename = `${basename}${extension}`;
          const file = createRepositoryFile(filename);
          const mockClient = new MockRepositoryClient([file]);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findChangelogFile(
            mockClient,
            'https://github.com/test/repo'
          );

          // CRITICAL: Should find with any extension
          expect(result).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.4: Returns null when no changelog file exists
   * 
   * For any repository without changelog files, the finder should
   * return null gracefully.
   */
  it('should return null when no changelog file exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string().filter(s => !s.toLowerCase().includes('changelog') && 
                                          !s.toLowerCase().includes('history') &&
                                          !s.toLowerCase().includes('releases') &&
                                          !s.toLowerCase().includes('news')), { maxLength: 5 }),
        async (otherFiles) => {
          const files = otherFiles.map(name => createRepositoryFile(name));
          const mockClient = new MockRepositoryClient(files);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findChangelogFile(
            mockClient,
            'https://github.com/test/repo'
          );

          // CRITICAL: Should return null when no changelog exists
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.5: Handles repositories with many files
   * 
   * For any repository with many files including a changelog,
   * the finder should still locate the changelog efficiently.
   */
  it('should find changelog among many other files', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbChangelogFilename,
        fc.array(fc.string().filter(s => s.length > 0 && s.length < 50), { minLength: 10, maxLength: 50 }),
        async (changelogName, otherFileNames) => {
          // Create changelog file
          const changelogFile = createRepositoryFile(changelogName);
          
          // Create other files
          const otherFiles = otherFileNames.map(name => createRepositoryFile(name));

          const allFiles = [changelogFile, ...otherFiles];
          const mockClient = new MockRepositoryClient(allFiles);

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const result = await finder.findChangelogFile(
            mockClient,
            'https://github.com/test/repo'
          );

          // CRITICAL: Should find changelog even with many files
          expect(result).not.toBeNull();
          expect(result?.text).toContain(changelogName);
        }
      ),
      { numRuns: 100 }
    );
  });
});
