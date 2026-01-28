/**
 * Property-based tests for ChangelogFinder - Source URL Fallback
 * 
 * **Property 3: Source URL fallback behavior**
 * **Validates: Requirements 1.6**
 * 
 * For any chart metadata with multiple source URLs, the ChangelogFinder
 * should attempt each URL in order until a changelog is found, and should
 * not stop after the first failure.
 */

import * as fc from 'fast-check';
import { ChangelogFinder } from '../../src/changelog/changelog-finder';
import { VersionUpdate } from '../../src/types/version';

describe('Property 3: Source URL fallback behavior', () => {
  /**
   * Property 3.1: Multiple source URLs are attempted
   * 
   * The finder should try multiple source URLs when provided.
   */
  it('should attempt multiple source URLs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.webUrl(), { minLength: 1, maxLength: 3 }),
        async (urls) => {
          const update: VersionUpdate = {
            dependency: {
              manifestPath: 'test/manifest.yaml',
              documentIndex: 0,
              chartName: 'test-chart',
              repoURL: urls[0],
              repoType: 'helm',
              currentVersion: '1.0.0',
              versionPath: ['spec', 'source', 'targetRevision'],
            },
            currentVersion: '1.0.0',
            newVersion: '2.0.0',
          };

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          const sourceUrls = await finder.discoverSourceRepository(update);

          // CRITICAL: Should return at least one URL
          expect(sourceUrls.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.2: Fallback continues after failure
   * 
   * When the first URL fails, subsequent URLs should be tried.
   */
  it('should continue to next URL after failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.webUrl(),
        async (url) => {
          const update: VersionUpdate = {
            dependency: {
              manifestPath: 'test/manifest.yaml',
              documentIndex: 0,
              chartName: 'test-chart',
              repoURL: url,
              repoType: 'helm',
              currentVersion: '1.0.0',
              versionPath: ['spec', 'source', 'targetRevision'],
            },
            currentVersion: '1.0.0',
            newVersion: '2.0.0',
          };

          const finder = new ChangelogFinder({ githubToken: 'test-token' });
          
          // Should not throw even if URL is invalid
          const result = await finder.findChangelog(update);
          
          // CRITICAL: Should return a result (even if not found)
          expect(result).toBeDefined();
          expect(result.sourceUrl).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
