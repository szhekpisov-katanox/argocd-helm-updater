/**
 * Unit tests for ChangelogCache
 */

import { ChangelogCache } from '../../../src/changelog/changelog-cache';
import { ChangelogResult } from '../../../src/types/changelog';

describe('ChangelogCache', () => {
  let cache: ChangelogCache;

  beforeEach(() => {
    cache = new ChangelogCache();
  });

  describe('set and get', () => {
    it('should store and retrieve a changelog result', () => {
      const repoUrl = 'https://github.com/test/repo';
      const version = '1.0.0';
      const result: ChangelogResult = {
        changelogText: '# Changelog\n\n## 1.0.0\n- Initial release',
        changelogUrl: 'https://github.com/test/repo/blob/main/CHANGELOG.md',
        sourceUrl: repoUrl,
        found: true,
      };

      cache.set(repoUrl, version, result, 3600);
      const retrieved = cache.get(repoUrl, version);

      expect(retrieved).toEqual(result);
    });

    it('should return null for non-existent cache entry', () => {
      const result = cache.get('https://github.com/test/repo', '1.0.0');
      expect(result).toBeNull();
    });

    it('should cache negative results (changelog not found)', () => {
      const repoUrl = 'https://github.com/test/repo';
      const version = '1.0.0';
      const result: ChangelogResult = {
        sourceUrl: repoUrl,
        found: false,
        error: 'Changelog not found',
      };

      cache.set(repoUrl, version, result, 3600);
      const retrieved = cache.get(repoUrl, version);

      expect(retrieved).toEqual(result);
      expect(retrieved?.found).toBe(false);
    });

    it('should handle multiple cache entries with different keys', () => {
      const result1: ChangelogResult = {
        changelogText: 'Changelog 1',
        sourceUrl: 'https://github.com/test/repo1',
        found: true,
      };
      const result2: ChangelogResult = {
        changelogText: 'Changelog 2',
        sourceUrl: 'https://github.com/test/repo2',
        found: true,
      };

      cache.set('https://github.com/test/repo1', '1.0.0', result1, 3600);
      cache.set('https://github.com/test/repo2', '2.0.0', result2, 3600);

      expect(cache.get('https://github.com/test/repo1', '1.0.0')).toEqual(result1);
      expect(cache.get('https://github.com/test/repo2', '2.0.0')).toEqual(result2);
    });

    it('should differentiate between same repo with different versions', () => {
      const repoUrl = 'https://github.com/test/repo';
      const result1: ChangelogResult = {
        changelogText: 'Version 1.0.0',
        sourceUrl: repoUrl,
        found: true,
      };
      const result2: ChangelogResult = {
        changelogText: 'Version 2.0.0',
        sourceUrl: repoUrl,
        found: true,
      };

      cache.set(repoUrl, '1.0.0', result1, 3600);
      cache.set(repoUrl, '2.0.0', result2, 3600);

      expect(cache.get(repoUrl, '1.0.0')).toEqual(result1);
      expect(cache.get(repoUrl, '2.0.0')).toEqual(result2);
    });
  });

  describe('TTL expiration', () => {
    it('should return null for expired cache entry', async () => {
      const repoUrl = 'https://github.com/test/repo';
      const version = '1.0.0';
      const result: ChangelogResult = {
        changelogText: 'Changelog',
        sourceUrl: repoUrl,
        found: true,
      };

      // Set with 1 second TTL
      cache.set(repoUrl, version, result, 1);

      // Verify it's cached initially
      expect(cache.get(repoUrl, version)).toEqual(result);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should return null after expiration
      expect(cache.get(repoUrl, version)).toBeNull();
    });

    it('should not return expired entries even if they exist in cache', async () => {
      const repoUrl = 'https://github.com/test/repo';
      const version = '1.0.0';
      const result: ChangelogResult = {
        changelogText: 'Changelog',
        sourceUrl: repoUrl,
        found: true,
      };

      // Set with very short TTL (0.5 seconds)
      cache.set(repoUrl, version, result, 0.5);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 600));

      // Should return null
      const retrieved = cache.get(repoUrl, version);
      expect(retrieved).toBeNull();
    });

    it('should remove expired entry from cache on get', async () => {
      const repoUrl = 'https://github.com/test/repo';
      const version = '1.0.0';
      const result: ChangelogResult = {
        changelogText: 'Changelog',
        sourceUrl: repoUrl,
        found: true,
      };

      cache.set(repoUrl, version, result, 0.5);
      expect(cache.size()).toBe(1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 600));

      // Get should remove expired entry
      cache.get(repoUrl, version);
      expect(cache.size()).toBe(0);
    });

    it('should respect different TTLs for different entries', async () => {
      const repoUrl = 'https://github.com/test/repo';
      const result1: ChangelogResult = {
        changelogText: 'Short TTL',
        sourceUrl: repoUrl,
        found: true,
      };
      const result2: ChangelogResult = {
        changelogText: 'Long TTL',
        sourceUrl: repoUrl,
        found: true,
      };

      // Set with different TTLs
      cache.set(repoUrl, '1.0.0', result1, 0.5); // 0.5 seconds
      cache.set(repoUrl, '2.0.0', result2, 10);  // 10 seconds

      // Wait for first to expire
      await new Promise(resolve => setTimeout(resolve, 600));

      // First should be expired, second should still be valid
      expect(cache.get(repoUrl, '1.0.0')).toBeNull();
      expect(cache.get(repoUrl, '2.0.0')).toEqual(result2);
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', () => {
      const result1: ChangelogResult = {
        changelogText: 'Changelog 1',
        sourceUrl: 'https://github.com/test/repo1',
        found: true,
      };
      const result2: ChangelogResult = {
        changelogText: 'Changelog 2',
        sourceUrl: 'https://github.com/test/repo2',
        found: true,
      };

      cache.set('https://github.com/test/repo1', '1.0.0', result1, 3600);
      cache.set('https://github.com/test/repo2', '2.0.0', result2, 3600);

      expect(cache.size()).toBe(2);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get('https://github.com/test/repo1', '1.0.0')).toBeNull();
      expect(cache.get('https://github.com/test/repo2', '2.0.0')).toBeNull();
    });

    it('should allow adding entries after clear', () => {
      const result: ChangelogResult = {
        changelogText: 'Changelog',
        sourceUrl: 'https://github.com/test/repo',
        found: true,
      };

      cache.set('https://github.com/test/repo', '1.0.0', result, 3600);
      cache.clear();

      // Add new entry after clear
      cache.set('https://github.com/test/repo', '2.0.0', result, 3600);
      expect(cache.get('https://github.com/test/repo', '2.0.0')).toEqual(result);
    });
  });

  describe('cache key generation', () => {
    it('should generate unique keys for different repo URLs', () => {
      const result: ChangelogResult = {
        changelogText: 'Changelog',
        sourceUrl: 'https://github.com/test/repo1',
        found: true,
      };

      cache.set('https://github.com/test/repo1', '1.0.0', result, 3600);
      cache.set('https://github.com/test/repo2', '1.0.0', result, 3600);

      expect(cache.size()).toBe(2);
    });

    it('should handle special characters in URLs', () => {
      const repoUrl = 'https://github.com/test-org/repo-name';
      const result: ChangelogResult = {
        changelogText: 'Changelog',
        sourceUrl: repoUrl,
        found: true,
      };

      cache.set(repoUrl, '1.0.0-beta.1', result, 3600);
      expect(cache.get(repoUrl, '1.0.0-beta.1')).toEqual(result);
    });

    it('should handle URLs with trailing slashes', () => {
      const result: ChangelogResult = {
        changelogText: 'Changelog',
        sourceUrl: 'https://github.com/test/repo',
        found: true,
      };

      // URLs with and without trailing slashes should be treated as different
      cache.set('https://github.com/test/repo', '1.0.0', result, 3600);
      cache.set('https://github.com/test/repo/', '1.0.0', result, 3600);

      expect(cache.size()).toBe(2);
    });
  });

  describe('size', () => {
    it('should return 0 for empty cache', () => {
      expect(cache.size()).toBe(0);
    });

    it('should return correct size after adding entries', () => {
      const result: ChangelogResult = {
        changelogText: 'Changelog',
        sourceUrl: 'https://github.com/test/repo',
        found: true,
      };

      cache.set('https://github.com/test/repo', '1.0.0', result, 3600);
      expect(cache.size()).toBe(1);

      cache.set('https://github.com/test/repo', '2.0.0', result, 3600);
      expect(cache.size()).toBe(2);
    });

    it('should not increase size when overwriting existing entry', () => {
      const result1: ChangelogResult = {
        changelogText: 'Changelog 1',
        sourceUrl: 'https://github.com/test/repo',
        found: true,
      };
      const result2: ChangelogResult = {
        changelogText: 'Changelog 2',
        sourceUrl: 'https://github.com/test/repo',
        found: true,
      };

      cache.set('https://github.com/test/repo', '1.0.0', result1, 3600);
      expect(cache.size()).toBe(1);

      // Overwrite with same key
      cache.set('https://github.com/test/repo', '1.0.0', result2, 3600);
      expect(cache.size()).toBe(1);

      // Verify the value was updated
      expect(cache.get('https://github.com/test/repo', '1.0.0')).toEqual(result2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings for repo URL and version', () => {
      const result: ChangelogResult = {
        changelogText: 'Changelog',
        sourceUrl: '',
        found: true,
      };

      cache.set('', '', result, 3600);
      expect(cache.get('', '')).toEqual(result);
    });

    it('should handle very long TTL values', () => {
      const result: ChangelogResult = {
        changelogText: 'Changelog',
        sourceUrl: 'https://github.com/test/repo',
        found: true,
      };

      // Set with very long TTL (1 year in seconds)
      cache.set('https://github.com/test/repo', '1.0.0', result, 31536000);
      expect(cache.get('https://github.com/test/repo', '1.0.0')).toEqual(result);
    });

    it('should handle zero TTL (immediately expired)', async () => {
      const result: ChangelogResult = {
        changelogText: 'Changelog',
        sourceUrl: 'https://github.com/test/repo',
        found: true,
      };

      cache.set('https://github.com/test/repo', '1.0.0', result, 0);

      // Even a tiny delay should make it expired
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(cache.get('https://github.com/test/repo', '1.0.0')).toBeNull();
    });

    it('should handle changelog results with all optional fields', () => {
      const result: ChangelogResult = {
        changelogText: 'Changelog content',
        changelogUrl: 'https://github.com/test/repo/blob/main/CHANGELOG.md',
        releaseNotes: 'Release notes content',
        releaseNotesUrl: 'https://github.com/test/repo/releases/tag/v1.0.0',
        sourceUrl: 'https://github.com/test/repo',
        found: true,
      };

      cache.set('https://github.com/test/repo', '1.0.0', result, 3600);
      const retrieved = cache.get('https://github.com/test/repo', '1.0.0');

      expect(retrieved).toEqual(result);
      expect(retrieved?.changelogText).toBe('Changelog content');
      expect(retrieved?.releaseNotes).toBe('Release notes content');
    });

    it('should handle changelog results with minimal fields', () => {
      const result: ChangelogResult = {
        sourceUrl: 'https://github.com/test/repo',
        found: false,
      };

      cache.set('https://github.com/test/repo', '1.0.0', result, 3600);
      const retrieved = cache.get('https://github.com/test/repo', '1.0.0');

      expect(retrieved).toEqual(result);
      expect(retrieved?.changelogText).toBeUndefined();
      expect(retrieved?.releaseNotes).toBeUndefined();
    });
  });
});
