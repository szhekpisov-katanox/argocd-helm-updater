/**
 * Property-based tests for ChangelogCache - Negative Result Caching
 * 
 * **Property 20: Negative result caching**
 * **Validates: Requirements 7.6**
 * 
 * For any changelog lookup that fails (changelog not found),
 * the ChangelogFinder should cache the negative result to avoid
 * repeated failed lookups within the TTL period.
 */

import * as fc from 'fast-check';
import { ChangelogCache } from '../../src/changelog/changelog-cache';

/**
 * Custom arbitraries for generating test data
 */

// Generate valid repository URLs
const arbRepoURL = fc.oneof(
  fc.stringMatching(/^https:\/\/github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/).map(url => url.replace(/\.$/, '')),
  fc.stringMatching(/^https:\/\/gitlab\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/).map(url => url.replace(/\.$/, '')),
  fc.stringMatching(/^https:\/\/bitbucket\.org\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/).map(url => url.replace(/\.$/, ''))
);

// Generate semantic version strings
const arbVersion = fc.tuple(
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 }),
  fc.nat({ max: 100 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// Generate error messages for negative results
const arbErrorMessage = fc.oneof(
  fc.constant('Changelog not found'),
  fc.constant('Repository not accessible'),
  fc.constant('404 Not Found'),
  fc.constant('403 Forbidden'),
  fc.constant('Network error'),
  fc.constant('API rate limit exceeded'),
  fc.constant('Authentication failed'),
  fc.constant('File does not exist')
);

// Generate TTL values (in seconds)
const arbTTL = fc.integer({ min: 60, max: 3600 });

// Generate negative ChangelogResult
const arbNegativeChangelogResult = fc.record({
  repoUrl: arbRepoURL,
  error: arbErrorMessage,
}).map(({ repoUrl, error }) => ({
  sourceUrl: repoUrl,
  found: false,
  error,
}));

describe('Property 20: Negative result caching', () => {
  /**
   * Property 20.1: Negative results are cached
   * 
   * For any failed changelog lookup, the negative result should be stored
   * in the cache and retrievable.
   */
  it('should cache negative results', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbNegativeChangelogResult,
        arbTTL,
        (repoUrl, version, result, ttl) => {
          const cache = new ChangelogCache();

          // Store negative result
          cache.set(repoUrl, version, result, ttl);

          // Retrieve the result
          const retrieved = cache.get(repoUrl, version);

          // CRITICAL: Should return the cached negative result
          expect(retrieved).not.toBeNull();
          expect(retrieved?.found).toBe(false);
          expect(retrieved?.error).toBe(result.error);
          expect(retrieved?.sourceUrl).toBe(result.sourceUrl);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.2: Negative results prevent repeated lookups
   * 
   * For any cached negative result, multiple retrievals should return
   * the same negative result without requiring new lookups.
   */
  it('should return cached negative result on repeated lookups', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbNegativeChangelogResult,
        arbTTL,
        fc.integer({ min: 2, max: 10 }),
        (repoUrl, version, result, ttl, numLookups) => {
          const cache = new ChangelogCache();

          // Store negative result
          cache.set(repoUrl, version, result, ttl);

          // Perform multiple lookups
          for (let i = 0; i < numLookups; i++) {
            const retrieved = cache.get(repoUrl, version);

            // CRITICAL: Each lookup should return the same negative result
            expect(retrieved).not.toBeNull();
            expect(retrieved?.found).toBe(false);
            expect(retrieved?.error).toBe(result.error);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.3: Negative results have no changelog content
   * 
   * For any cached negative result, it should not contain changelog text
   * or release notes (only error information).
   */
  it('should not include changelog content in negative results', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbNegativeChangelogResult,
        arbTTL,
        (repoUrl, version, result, ttl) => {
          const cache = new ChangelogCache();

          // Store negative result
          cache.set(repoUrl, version, result, ttl);

          // Retrieve the result
          const retrieved = cache.get(repoUrl, version);

          // CRITICAL: Should not have changelog content
          expect(retrieved).not.toBeNull();
          expect(retrieved?.changelogText).toBeUndefined();
          expect(retrieved?.changelogUrl).toBeUndefined();
          expect(retrieved?.releaseNotes).toBeUndefined();
          expect(retrieved?.releaseNotesUrl).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.4: Different error types are cached independently
   * 
   * For any set of negative results with different error messages,
   * each should be cached and retrieved correctly.
   */
  it('should cache different error types independently', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        fc.array(
          fc.record({
            version: arbVersion,
            error: arbErrorMessage,
          }),
          { minLength: 2, maxLength: 5 }
        ),
        arbTTL,
        (repoUrl, entries, ttl) => {
          const cache = new ChangelogCache();

          // Store all negative results
          entries.forEach(({ version, error }) => {
            const result = {
              sourceUrl: repoUrl,
              found: false,
              error,
            };
            cache.set(repoUrl, version, result, ttl);
          });

          // Retrieve and verify each result
          entries.forEach(({ version, error }) => {
            const retrieved = cache.get(repoUrl, version);

            // CRITICAL: Should retrieve correct error for each version
            expect(retrieved).not.toBeNull();
            expect(retrieved?.found).toBe(false);
            expect(retrieved?.error).toBe(error);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.5: Negative results respect TTL
   * 
   * For any cached negative result, it should respect the TTL and
   * be available for retrieval within the TTL period.
   */
  it('should respect TTL for negative results', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbNegativeChangelogResult,
        arbTTL,
        (repoUrl, version, result, ttl) => {
          const cache = new ChangelogCache();

          // Store negative result
          cache.set(repoUrl, version, result, ttl);

          // Retrieve immediately (within TTL)
          const retrieved = cache.get(repoUrl, version);

          // CRITICAL: Should be available within TTL
          expect(retrieved).not.toBeNull();
          expect(retrieved?.found).toBe(false);
          expect(retrieved).toEqual(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.6: Negative results can be overwritten with positive results
   * 
   * For any cached negative result, setting a positive result with the same
   * key should overwrite it.
   */
  it('should allow overwriting negative results with positive results', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbNegativeChangelogResult,
        fc.string({ minLength: 10, maxLength: 500 }),
        arbTTL,
        (repoUrl, version, negativeResult, changelogText, ttl) => {
          const cache = new ChangelogCache();

          // Store negative result first
          cache.set(repoUrl, version, negativeResult, ttl);

          // Verify negative result is cached
          const negativeRetrieval = cache.get(repoUrl, version);
          expect(negativeRetrieval?.found).toBe(false);

          // Overwrite with positive result
          const positiveResult = {
            changelogText,
            changelogUrl: `${repoUrl}/blob/main/CHANGELOG.md`,
            sourceUrl: repoUrl,
            found: true,
          };
          cache.set(repoUrl, version, positiveResult, ttl);

          // Retrieve again
          const positiveRetrieval = cache.get(repoUrl, version);

          // CRITICAL: Should now return positive result
          expect(positiveRetrieval).not.toBeNull();
          expect(positiveRetrieval?.found).toBe(true);
          expect(positiveRetrieval?.changelogText).toBe(changelogText);
          expect(positiveRetrieval?.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.7: Negative results are isolated by repository
   * 
   * For any two different repositories with negative results,
   * they should be cached independently.
   */
  it('should isolate negative results by repository', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbRepoURL,
        arbVersion,
        arbErrorMessage,
        arbErrorMessage,
        arbTTL,
        (repoUrl1, repoUrl2, version, error1, error2, ttl) => {
          // Skip if URLs are the same
          if (repoUrl1 === repoUrl2) {
            return;
          }

          const cache = new ChangelogCache();

          // Store negative results for both repositories
          const result1 = { sourceUrl: repoUrl1, found: false, error: error1 };
          const result2 = { sourceUrl: repoUrl2, found: false, error: error2 };

          cache.set(repoUrl1, version, result1, ttl);
          cache.set(repoUrl2, version, result2, ttl);

          // Retrieve results
          const retrieved1 = cache.get(repoUrl1, version);
          const retrieved2 = cache.get(repoUrl2, version);

          // CRITICAL: Each repository should have its own negative result
          expect(retrieved1).not.toBeNull();
          expect(retrieved2).not.toBeNull();
          expect(retrieved1?.sourceUrl).toBe(repoUrl1);
          expect(retrieved2?.sourceUrl).toBe(repoUrl2);
          expect(retrieved1?.error).toBe(error1);
          expect(retrieved2?.error).toBe(error2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.8: Negative results are isolated by version
   * 
   * For any repository with negative results for different versions,
   * they should be cached independently.
   */
  it('should isolate negative results by version', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbVersion,
        arbErrorMessage,
        arbErrorMessage,
        arbTTL,
        (repoUrl, version1, version2, error1, error2, ttl) => {
          // Skip if versions are the same
          if (version1 === version2) {
            return;
          }

          const cache = new ChangelogCache();

          // Store negative results for both versions
          const result1 = { sourceUrl: repoUrl, found: false, error: error1 };
          const result2 = { sourceUrl: repoUrl, found: false, error: error2 };

          cache.set(repoUrl, version1, result1, ttl);
          cache.set(repoUrl, version2, result2, ttl);

          // Retrieve results
          const retrieved1 = cache.get(repoUrl, version1);
          const retrieved2 = cache.get(repoUrl, version2);

          // CRITICAL: Each version should have its own negative result
          expect(retrieved1).not.toBeNull();
          expect(retrieved2).not.toBeNull();
          expect(retrieved1?.error).toBe(error1);
          expect(retrieved2?.error).toBe(error2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
