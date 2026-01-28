/**
 * Property-based tests for ChangelogCache - Cache Expiration Enforcement
 * 
 * **Property 19: Cache expiration enforcement**
 * **Validates: Requirements 7.3**
 * 
 * For any cached changelog entry that has exceeded its TTL,
 * the ChangelogFinder should refetch the changelog from the repository API.
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

// Generate changelog text content
const arbChangelogText = fc.oneof(
  fc.constant('# Changelog\n\n## 1.0.0\n- Initial release'),
  fc.constant('# Release Notes\n\n## Version 2.0.0\n- Breaking changes\n- New features'),
  fc.constant('## [1.5.0] - 2024-01-15\n### Added\n- New feature\n### Fixed\n- Bug fix'),
  fc.string({ minLength: 10, maxLength: 500 })
);

// Generate release notes content
const arbReleaseNotes = fc.oneof(
  fc.constant('Release v1.0.0\n\nThis is the first stable release.'),
  fc.constant('## What\'s Changed\n\n* Feature A by @user1\n* Fix B by @user2'),
  fc.string({ minLength: 10, maxLength: 300 })
);

// Generate very short TTL values that will expire quickly (in seconds)
const arbShortTTL = fc.double({ min: 0.1, max: 2, noNaN: true });

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

describe('Property 19: Cache expiration enforcement', () => {
  // Increase timeout for all tests in this suite due to async waiting
  jest.setTimeout(120000); // 2 minutes

  /**
   * Property 19.1: Expired entries return null
   * 
   * For any cache entry with a short TTL, after waiting for the TTL to expire,
   * retrieving the entry should return null.
   */
  it('should return null for expired cache entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRepoURL,
        arbVersion,
        arbChangelogResult,
        arbShortTTL,
        async (repoUrl, version, result, ttl) => {
          const cache = new ChangelogCache();

          // Store the result with short TTL
          cache.set(repoUrl, version, result, ttl);

          // Verify it's cached initially
          const initialRetrieval = cache.get(repoUrl, version);
          expect(initialRetrieval).not.toBeNull();
          expect(initialRetrieval).toEqual(result);

          // Wait for TTL to expire (add buffer to ensure expiration)
          const waitTime = (ttl * 1000) + 100;
          await new Promise(resolve => setTimeout(resolve, waitTime));

          // CRITICAL: Should return null after expiration
          const expiredRetrieval = cache.get(repoUrl, version);
          expect(expiredRetrieval).toBeNull();
        }
      ),
      { numRuns: 50 } // Reduced runs due to async nature
    );
  });

  /**
   * Property 19.2: Expired entries are removed from cache
   * 
   * For any expired cache entry, attempting to retrieve it should remove
   * it from the cache, reducing the cache size.
   */
  it('should remove expired entries from cache on get', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRepoURL,
        arbVersion,
        arbChangelogResult,
        arbShortTTL,
        async (repoUrl, version, result, ttl) => {
          const cache = new ChangelogCache();

          // Store the result
          cache.set(repoUrl, version, result, ttl);
          expect(cache.size()).toBe(1);

          // Wait for expiration
          const waitTime = (ttl * 1000) + 100;
          await new Promise(resolve => setTimeout(resolve, waitTime));

          // Get should remove expired entry
          cache.get(repoUrl, version);

          // CRITICAL: Cache size should be 0 after expired entry is removed
          expect(cache.size()).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 19.3: Multiple expired entries are all removed
   * 
   * For any set of cache entries with short TTLs, after expiration,
   * all entries should return null and be removed from cache.
   */
  it('should handle multiple expired entries correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            repoUrl: arbRepoURL,
            version: arbVersion,
            result: arbChangelogResult,
          }),
          { minLength: 2, maxLength: 5 }
        ),
        arbShortTTL,
        async (entries, ttl) => {
          const cache = new ChangelogCache();

          // Store all entries with same short TTL
          entries.forEach(({ repoUrl, version, result }) => {
            cache.set(repoUrl, version, result, ttl);
          });

          const initialSize = cache.size();
          expect(initialSize).toBeGreaterThan(0);

          // Wait for expiration
          const waitTime = (ttl * 1000) + 100;
          await new Promise(resolve => setTimeout(resolve, waitTime));

          // CRITICAL: All entries should return null after expiration
          entries.forEach(({ repoUrl, version }) => {
            const retrieved = cache.get(repoUrl, version);
            expect(retrieved).toBeNull();
          });

          // Cache should be empty after all expired entries are accessed
          expect(cache.size()).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 19.4: Partial expiration with mixed TTLs
   * 
   * For any set of cache entries with different TTLs, only the expired
   * entries should return null while non-expired entries remain accessible.
   */
  it('should handle partial expiration with mixed TTLs', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRepoURL,
        arbVersion,
        arbVersion,
        arbChangelogResult,
        arbChangelogResult,
        arbShortTTL,
        async (repoUrl, version1, version2, result1, result2, shortTTL) => {
          // Skip if versions are the same
          if (version1 === version2) {
            return;
          }

          const cache = new ChangelogCache();
          const longTTL = 3600; // 1 hour - won't expire during test

          // Store first entry with short TTL, second with long TTL
          cache.set(repoUrl, version1, result1, shortTTL);
          cache.set(repoUrl, version2, result2, longTTL);

          expect(cache.size()).toBe(2);

          // Wait for short TTL to expire
          const waitTime = (shortTTL * 1000) + 100;
          await new Promise(resolve => setTimeout(resolve, waitTime));

          // CRITICAL: First entry should be expired
          const expired = cache.get(repoUrl, version1);
          expect(expired).toBeNull();

          // CRITICAL: Second entry should still be valid
          const valid = cache.get(repoUrl, version2);
          expect(valid).not.toBeNull();
          expect(valid).toEqual(result2);

          // Cache should have 1 entry (the non-expired one)
          expect(cache.size()).toBe(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 19.5: Zero TTL expires immediately
   * 
   * For any cache entry with zero TTL, it should be considered expired
   * immediately (or very quickly).
   */
  it('should treat zero TTL as immediately expired', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRepoURL,
        arbVersion,
        arbChangelogResult,
        async (repoUrl, version, result) => {
          const cache = new ChangelogCache();

          // Store with zero TTL
          cache.set(repoUrl, version, result, 0);

          // Even a tiny delay should make it expired
          await new Promise(resolve => setTimeout(resolve, 10));

          // CRITICAL: Should return null
          const retrieved = cache.get(repoUrl, version);
          expect(retrieved).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 19.6: Negative results also expire
   * 
   * For any negative cache result (changelog not found) with a short TTL,
   * it should also expire and return null after the TTL.
   */
  it('should expire negative results correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRepoURL,
        arbVersion,
        arbNegativeChangelogResult,
        arbShortTTL,
        async (repoUrl, version, result, ttl) => {
          const cache = new ChangelogCache();

          // Store negative result
          cache.set(repoUrl, version, result, ttl);

          // Verify it's cached initially
          const initialRetrieval = cache.get(repoUrl, version);
          expect(initialRetrieval).not.toBeNull();
          expect(initialRetrieval?.found).toBe(false);

          // Wait for expiration
          const waitTime = (ttl * 1000) + 100;
          await new Promise(resolve => setTimeout(resolve, waitTime));

          // CRITICAL: Should return null after expiration
          const expiredRetrieval = cache.get(repoUrl, version);
          expect(expiredRetrieval).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 19.7: Expiration is time-based, not access-based
   * 
   * For any cache entry, accessing it multiple times before expiration
   * should not extend its TTL. It should still expire at the original time.
   */
  it('should not extend TTL on cache access', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRepoURL,
        arbVersion,
        arbChangelogResult,
        fc.double({ min: 0.5, max: 1.5, noNaN: true }),
        fc.integer({ min: 2, max: 5 }),
        async (repoUrl, version, result, ttl, numAccesses) => {
          const cache = new ChangelogCache();

          // Store the result
          cache.set(repoUrl, version, result, ttl);

          // Access multiple times before expiration
          const accessInterval = (ttl * 1000) / (numAccesses + 1);
          for (let i = 0; i < numAccesses; i++) {
            await new Promise(resolve => setTimeout(resolve, accessInterval));
            const retrieved = cache.get(repoUrl, version);
            // Should still be valid during TTL
            if ((i + 1) * accessInterval < ttl * 1000) {
              expect(retrieved).not.toBeNull();
            }
          }

          // Wait for full expiration
          const remainingTime = (ttl * 1000) - (numAccesses * accessInterval) + 100;
          if (remainingTime > 0) {
            await new Promise(resolve => setTimeout(resolve, remainingTime));
          }

          // CRITICAL: Should be expired regardless of previous accesses
          const finalRetrieval = cache.get(repoUrl, version);
          expect(finalRetrieval).toBeNull();
        }
      ),
      { numRuns: 30 } // Reduced due to complexity
    );
  });

  /**
   * Property 19.8: Re-setting an expired entry creates new TTL
   * 
   * For any expired cache entry, setting it again with a new TTL should
   * make it accessible again with the new expiration time.
   */
  it('should allow re-setting expired entries with new TTL', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRepoURL,
        arbVersion,
        arbChangelogResult,
        arbChangelogResult,
        arbShortTTL,
        async (repoUrl, version, result1, result2, shortTTL) => {
          const cache = new ChangelogCache();

          // Store first result with short TTL
          cache.set(repoUrl, version, result1, shortTTL);

          // Wait for expiration
          const waitTime = (shortTTL * 1000) + 100;
          await new Promise(resolve => setTimeout(resolve, waitTime));

          // Verify it's expired
          expect(cache.get(repoUrl, version)).toBeNull();

          // Re-set with new result and long TTL
          const longTTL = 3600;
          cache.set(repoUrl, version, result2, longTTL);

          // CRITICAL: Should be accessible again with new value
          const retrieved = cache.get(repoUrl, version);
          expect(retrieved).not.toBeNull();
          expect(retrieved).toEqual(result2);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 19.9: Expiration check is consistent
   * 
   * For any expired cache entry, multiple consecutive get calls should
   * all return null (consistent behavior).
   */
  it('should consistently return null for expired entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRepoURL,
        arbVersion,
        arbChangelogResult,
        arbShortTTL,
        fc.integer({ min: 2, max: 5 }),
        async (repoUrl, version, result, ttl, numChecks) => {
          const cache = new ChangelogCache();

          // Store the result
          cache.set(repoUrl, version, result, ttl);

          // Wait for expiration
          const waitTime = (ttl * 1000) + 100;
          await new Promise(resolve => setTimeout(resolve, waitTime));

          // CRITICAL: All consecutive checks should return null
          for (let i = 0; i < numChecks; i++) {
            const retrieved = cache.get(repoUrl, version);
            expect(retrieved).toBeNull();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 19.10: Expiration boundary testing
   * 
   * For any cache entry, checking just before expiration should return
   * the value, and checking just after should return null.
   */
  it('should respect expiration boundary precisely', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRepoURL,
        arbVersion,
        arbChangelogResult,
        fc.double({ min: 0.5, max: 1.0, noNaN: true }),
        async (repoUrl, version, result, ttl) => {
          const cache = new ChangelogCache();

          // Store the result
          cache.set(repoUrl, version, result, ttl);

          // Check just before expiration (90% of TTL)
          const beforeExpirationTime = ttl * 1000 * 0.9;
          await new Promise(resolve => setTimeout(resolve, beforeExpirationTime));

          const beforeExpiration = cache.get(repoUrl, version);
          // Should still be valid
          expect(beforeExpiration).not.toBeNull();
          expect(beforeExpiration).toEqual(result);

          // Wait for remaining time plus buffer
          const remainingTime = (ttl * 1000 * 0.1) + 100;
          await new Promise(resolve => setTimeout(resolve, remainingTime));

          // CRITICAL: Should be expired now
          const afterExpiration = cache.get(repoUrl, version);
          expect(afterExpiration).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });
});
