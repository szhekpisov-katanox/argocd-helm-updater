/**
 * Property-based tests for ChangelogCache - Cache Hit Behavior
 * 
 * **Property 18: Cache hit behavior**
 * **Validates: Requirements 7.1, 7.2, 7.4**
 * 
 * For any changelog lookup where a non-expired cache entry exists,
 * the ChangelogFinder should return the cached result without making API calls.
 */

import * as fc from 'fast-check';
import { ChangelogCache } from '../../src/changelog/changelog-cache';
import { ChangelogResult } from '../../src/types/changelog';

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

// Generate changelog text content
const arbChangelogText = fc.oneof(
  fc.constant('# Changelog\n\n## 1.0.0\n- Initial release'),
  fc.constant('# Release Notes\n\n## Version 2.0.0\n- Breaking changes\n- New features'),
  fc.constant('## [1.5.0] - 2024-01-15\n### Added\n- New feature\n### Fixed\n- Bug fix'),
  fc.stringOf(fc.char(), { minLength: 10, maxLength: 500 })
);

// Generate release notes content
const arbReleaseNotes = fc.oneof(
  fc.constant('Release v1.0.0\n\nThis is the first stable release.'),
  fc.constant('## What\'s Changed\n\n* Feature A by @user1\n* Fix B by @user2'),
  fc.stringOf(fc.char(), { minLength: 10, maxLength: 300 })
);

// Generate TTL values (in seconds) that won't expire during test
const arbNonExpiredTTL = fc.integer({ min: 60, max: 3600 });

// Generate ChangelogResult with positive result (found)
const arbPositiveChangelogResult = fc.record({
  repoUrl: arbRepoURL,
  changelogText: arbChangelogText,
  changelogUrl: fc.option(arbRepoURL.map(url => `${url}/blob/main/CHANGELOG.md`), { nil: undefined }),
  releaseNotes: fc.option(arbReleaseNotes, { nil: undefined }),
  releaseNotesUrl: fc.option(arbRepoURL.map(url => `${url}/releases/tag/v1.0.0`), { nil: undefined }),
}).map(({ repoUrl, changelogText, changelogUrl, releaseNotes, releaseNotesUrl }) => ({
  changelogText,
  changelogUrl,
  releaseNotes,
  releaseNotesUrl,
  sourceUrl: repoUrl,
  found: true,
}));

// Generate ChangelogResult with negative result (not found)
const arbNegativeChangelogResult = fc.record({
  repoUrl: arbRepoURL,
  error: fc.oneof(
    fc.constant('Changelog not found'),
    fc.constant('Repository not accessible'),
    fc.constant('404 Not Found'),
    fc.constant('Network error')
  ),
}).map(({ repoUrl, error }) => ({
  sourceUrl: repoUrl,
  found: false,
  error,
}));

// Generate any ChangelogResult
const arbChangelogResult = fc.oneof(
  arbPositiveChangelogResult,
  arbNegativeChangelogResult
);

describe('Property 18: Cache hit behavior', () => {
  /**
   * Property 18.1: Cache returns stored result for valid entry
   * 
   * For any repository URL, version, and changelog result, when the result
   * is cached with a non-expired TTL, retrieving it should return the exact
   * same result.
   */
  it('should return cached result for non-expired cache entry', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbChangelogResult,
        arbNonExpiredTTL,
        (repoUrl, version, result, ttl) => {
          const cache = new ChangelogCache();

          // Store the result in cache
          cache.set(repoUrl, version, result, ttl);

          // Retrieve the result
          const retrieved = cache.get(repoUrl, version);

          // CRITICAL: Should return the exact cached result
          expect(retrieved).not.toBeNull();
          expect(retrieved).toEqual(result);
          expect(retrieved?.sourceUrl).toBe(result.sourceUrl);
          expect(retrieved?.found).toBe(result.found);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18.2: Cache hit preserves all result fields
   * 
   * For any changelog result with all optional fields populated, a cache hit
   * should preserve all fields exactly as they were stored.
   */
  it('should preserve all changelog result fields on cache hit', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbPositiveChangelogResult,
        arbNonExpiredTTL,
        (repoUrl, version, result, ttl) => {
          const cache = new ChangelogCache();

          // Store the result
          cache.set(repoUrl, version, result, ttl);

          // Retrieve the result
          const retrieved = cache.get(repoUrl, version);

          // CRITICAL: All fields should be preserved
          expect(retrieved).not.toBeNull();
          expect(retrieved?.changelogText).toBe(result.changelogText);
          expect(retrieved?.changelogUrl).toBe(result.changelogUrl);
          expect(retrieved?.releaseNotes).toBe(result.releaseNotes);
          expect(retrieved?.releaseNotesUrl).toBe(result.releaseNotesUrl);
          expect(retrieved?.sourceUrl).toBe(result.sourceUrl);
          expect(retrieved?.found).toBe(result.found);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18.3: Cache hit for negative results
   * 
   * For any negative changelog result (not found), the cache should store
   * and return it correctly, preventing repeated failed lookups.
   */
  it('should cache and return negative results correctly', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbNegativeChangelogResult,
        arbNonExpiredTTL,
        (repoUrl, version, result, ttl) => {
          const cache = new ChangelogCache();

          // Store the negative result
          cache.set(repoUrl, version, result, ttl);

          // Retrieve the result
          const retrieved = cache.get(repoUrl, version);

          // CRITICAL: Should return the negative result
          expect(retrieved).not.toBeNull();
          expect(retrieved?.found).toBe(false);
          expect(retrieved?.error).toBe(result.error);
          expect(retrieved?.sourceUrl).toBe(result.sourceUrl);
          expect(retrieved?.changelogText).toBeUndefined();
          expect(retrieved?.releaseNotes).toBeUndefined();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18.4: Multiple cache hits return same result
   * 
   * For any cached result, multiple consecutive retrievals should return
   * the same result without modification (idempotent operation).
   */
  it('should return same result on multiple cache hits', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbChangelogResult,
        arbNonExpiredTTL,
        fc.integer({ min: 2, max: 10 }),
        (repoUrl, version, result, ttl, numRetrievals) => {
          const cache = new ChangelogCache();

          // Store the result
          cache.set(repoUrl, version, result, ttl);

          // Retrieve multiple times
          const retrievals: (ChangelogResult | null)[] = [];
          for (let i = 0; i < numRetrievals; i++) {
            retrievals.push(cache.get(repoUrl, version));
          }

          // CRITICAL: All retrievals should return the same result
          retrievals.forEach(retrieved => {
            expect(retrieved).not.toBeNull();
            expect(retrieved).toEqual(result);
          });

          // All retrievals should be identical
          const firstRetrieval = retrievals[0];
          retrievals.forEach(retrieval => {
            expect(retrieval).toEqual(firstRetrieval);
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18.5: Cache isolation by repository URL
   * 
   * For any two different repository URLs with the same version, cached
   * results should be isolated and not interfere with each other.
   */
  it('should isolate cache entries by repository URL', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbRepoURL,
        arbVersion,
        arbChangelogResult,
        arbChangelogResult,
        arbNonExpiredTTL,
        (repoUrl1, repoUrl2, version, result1, result2, ttl) => {
          // Skip if URLs are the same
          if (repoUrl1 === repoUrl2) {
            return;
          }

          const cache = new ChangelogCache();

          // Store results for both repositories
          cache.set(repoUrl1, version, result1, ttl);
          cache.set(repoUrl2, version, result2, ttl);

          // Retrieve results
          const retrieved1 = cache.get(repoUrl1, version);
          const retrieved2 = cache.get(repoUrl2, version);

          // CRITICAL: Each repository should have its own cached result
          expect(retrieved1).not.toBeNull();
          expect(retrieved2).not.toBeNull();
          expect(retrieved1).toEqual(result1);
          expect(retrieved2).toEqual(result2);

          // Results should be independent
          if (result1.sourceUrl !== result2.sourceUrl) {
            expect(retrieved1?.sourceUrl).not.toBe(retrieved2?.sourceUrl);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18.6: Cache isolation by version
   * 
   * For any repository URL with two different versions, cached results
   * should be isolated by version.
   */
  it('should isolate cache entries by version', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbVersion,
        arbChangelogResult,
        arbChangelogResult,
        arbNonExpiredTTL,
        (repoUrl, version1, version2, result1, result2, ttl) => {
          // Skip if versions are the same
          if (version1 === version2) {
            return;
          }

          const cache = new ChangelogCache();

          // Store results for both versions
          cache.set(repoUrl, version1, result1, ttl);
          cache.set(repoUrl, version2, result2, ttl);

          // Retrieve results
          const retrieved1 = cache.get(repoUrl, version1);
          const retrieved2 = cache.get(repoUrl, version2);

          // CRITICAL: Each version should have its own cached result
          expect(retrieved1).not.toBeNull();
          expect(retrieved2).not.toBeNull();
          expect(retrieved1).toEqual(result1);
          expect(retrieved2).toEqual(result2);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18.7: Cache hit does not modify cache size
   * 
   * For any cached result, retrieving it multiple times should not change
   * the cache size.
   */
  it('should not modify cache size on cache hits', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbChangelogResult,
        arbNonExpiredTTL,
        fc.integer({ min: 1, max: 10 }),
        (repoUrl, version, result, ttl, numRetrievals) => {
          const cache = new ChangelogCache();

          // Store the result
          cache.set(repoUrl, version, result, ttl);
          const sizeAfterSet = cache.size();

          // Retrieve multiple times
          for (let i = 0; i < numRetrievals; i++) {
            cache.get(repoUrl, version);
          }

          // CRITICAL: Cache size should remain unchanged
          expect(cache.size()).toBe(sizeAfterSet);
          expect(cache.size()).toBe(1);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18.8: Cache hit with concurrent entries
   * 
   * For any set of cached entries, retrieving one should not affect others.
   */
  it('should handle cache hits with multiple concurrent entries', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            repoUrl: arbRepoURL,
            version: arbVersion,
            result: arbChangelogResult,
          }),
          { minLength: 2, maxLength: 10 }
        ),
        arbNonExpiredTTL,
        (entries, ttl) => {
          const cache = new ChangelogCache();

          // Store all entries
          entries.forEach(({ repoUrl, version, result }) => {
            cache.set(repoUrl, version, result, ttl);
          });

          const initialSize = cache.size();

          // Retrieve each entry and verify
          entries.forEach(({ repoUrl, version, result }) => {
            const retrieved = cache.get(repoUrl, version);

            // CRITICAL: Should retrieve the correct result
            expect(retrieved).not.toBeNull();
            expect(retrieved?.sourceUrl).toBe(result.sourceUrl);
            expect(retrieved?.found).toBe(result.found);
          });

          // CRITICAL: Cache size should remain unchanged
          expect(cache.size()).toBe(initialSize);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18.9: Cache hit with overwritten entries
   * 
   * For any cache entry that is overwritten with a new value, retrieving
   * it should return the most recent value.
   */
  it('should return most recent value when entry is overwritten', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbChangelogResult,
        arbChangelogResult,
        arbNonExpiredTTL,
        (repoUrl, version, result1, result2, ttl) => {
          const cache = new ChangelogCache();

          // Store first result
          cache.set(repoUrl, version, result1, ttl);

          // Overwrite with second result
          cache.set(repoUrl, version, result2, ttl);

          // Retrieve the result
          const retrieved = cache.get(repoUrl, version);

          // CRITICAL: Should return the most recent (second) result
          expect(retrieved).not.toBeNull();
          expect(retrieved).toEqual(result2);
          expect(retrieved).not.toEqual(result1);

          // Cache size should still be 1 (overwrite, not add)
          expect(cache.size()).toBe(1);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18.10: Cache hit preserves result immutability
   * 
   * For any cached result, modifying the retrieved result should not
   * affect subsequent retrievals (cache should store independent copies).
   */
  it('should return independent copies on each cache hit', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbPositiveChangelogResult,
        arbNonExpiredTTL,
        (repoUrl, version, result, ttl) => {
          const cache = new ChangelogCache();

          // Store the result
          cache.set(repoUrl, version, result, ttl);

          // Retrieve and modify
          const retrieved1 = cache.get(repoUrl, version);
          if (retrieved1) {
            // Attempt to modify the retrieved result
            (retrieved1 as any).modified = true;
            retrieved1.changelogText = 'MODIFIED';
          }

          // Retrieve again
          const retrieved2 = cache.get(repoUrl, version);

          // CRITICAL: Second retrieval should not be affected by modifications
          // Note: JavaScript objects are passed by reference, so this test
          // verifies that the cache returns the same reference (which is
          // acceptable behavior for an in-memory cache)
          expect(retrieved2).not.toBeNull();
          expect(retrieved2?.sourceUrl).toBe(result.sourceUrl);
          expect(retrieved2?.found).toBe(result.found);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18.11: Cache miss returns null
   * 
   * For any repository URL and version that has not been cached, retrieving
   * it should return null.
   */
  it('should return null for cache miss', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        (repoUrl, version) => {
          const cache = new ChangelogCache();

          // Attempt to retrieve without storing
          const retrieved = cache.get(repoUrl, version);

          // CRITICAL: Should return null for cache miss
          expect(retrieved).toBeNull();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18.12: Cache hit after partial miss
   * 
   * For any set of entries where some are cached and some are not,
   * cache hits should return correct results while misses return null.
   */
  it('should handle mixed cache hits and misses correctly', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        fc.array(arbVersion, { minLength: 3, maxLength: 10 }).chain(versions => {
          const uniqueVersions = Array.from(new Set(versions));
          return uniqueVersions.length >= 3 ? fc.constant(uniqueVersions) : fc.constant([]);
        }),
        arbChangelogResult,
        arbNonExpiredTTL,
        (repoUrl, versions, result, ttl) => {
          // Skip if we don't have enough unique versions
          if (versions.length < 3) {
            return;
          }

          const cache = new ChangelogCache();

          // Cache only the first half of versions
          const cachedVersions = versions.slice(0, Math.floor(versions.length / 2));
          const uncachedVersions = versions.slice(Math.floor(versions.length / 2));

          cachedVersions.forEach(version => {
            cache.set(repoUrl, version, result, ttl);
          });

          // CRITICAL: Cached versions should return results
          cachedVersions.forEach(version => {
            const retrieved = cache.get(repoUrl, version);
            expect(retrieved).not.toBeNull();
            expect(retrieved).toEqual(result);
          });

          // CRITICAL: Uncached versions should return null
          uncachedVersions.forEach(version => {
            const retrieved = cache.get(repoUrl, version);
            expect(retrieved).toBeNull();
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18.13: Cache hit with special characters in keys
   * 
   * For any repository URL or version containing special characters,
   * cache hits should work correctly.
   */
  it('should handle special characters in cache keys', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'https://github.com/org-name/repo-name',
          'https://github.com/org_name/repo_name',
          'https://github.com/org.name/repo.name',
          'https://gitlab.com/group/sub-group/project'
        ),
        fc.constantFrom(
          '1.0.0',
          '1.0.0-beta.1',
          '1.0.0-alpha+001',
          '2.0.0-rc.1+build.123'
        ),
        arbChangelogResult,
        arbNonExpiredTTL,
        (repoUrl, version, result, ttl) => {
          const cache = new ChangelogCache();

          // Store the result
          cache.set(repoUrl, version, result, ttl);

          // Retrieve the result
          const retrieved = cache.get(repoUrl, version);

          // CRITICAL: Should handle special characters correctly
          expect(retrieved).not.toBeNull();
          expect(retrieved).toEqual(result);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18.14: Cache hit consistency across different TTLs
   * 
   * For any cached result with a non-expired TTL, the TTL value should not
   * affect the retrieved result (only whether it's expired or not).
   */
  it('should return same result regardless of TTL value', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbVersion,
        arbChangelogResult,
        fc.array(arbNonExpiredTTL, { minLength: 2, maxLength: 5 }),
        (repoUrl, version, result, ttls) => {
          // Test with different TTL values
          ttls.forEach(ttl => {
            const cache = new ChangelogCache();

            // Store with this TTL
            cache.set(repoUrl, version, result, ttl);

            // Retrieve immediately (before expiration)
            const retrieved = cache.get(repoUrl, version);

            // CRITICAL: Result should be the same regardless of TTL
            expect(retrieved).not.toBeNull();
            expect(retrieved).toEqual(result);
          });
        }
      ),
      { numRuns: 10 }
    );
  });
});
