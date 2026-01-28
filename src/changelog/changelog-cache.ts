/**
 * Changelog cache implementation with TTL support
 * 
 * Validates Requirements:
 * - 7.1: Cache changelog file contents keyed by repository URL and version
 * - 7.2: Cache release notes keyed by repository URL and version
 * - 7.3: Respect cache expiration times to ensure freshness
 * - 7.4: Return cached result when entry exists and is not expired
 */

import { ChangelogResult } from '../types/changelog';

/**
 * Cache entry with value, timestamp, and TTL
 */
interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** Timestamp when the entry was created (milliseconds since epoch) */
  timestamp: number;
  /** Time-to-live in seconds */
  ttl: number;
}

/**
 * In-memory cache for changelog results with TTL support
 */
export class ChangelogCache {
  private cache: Map<string, CacheEntry<ChangelogResult>>;

  constructor() {
    this.cache = new Map();
  }

  /**
   * Generates a cache key from repository URL and version
   * 
   * @param repoUrl - Repository URL
   * @param version - Version string
   * @returns Cache key in format: `${repoUrl}:${version}`
   */
  private generateKey(repoUrl: string, version: string): string {
    return `${repoUrl}:${version}`;
  }

  /**
   * Checks if a cache entry is expired
   * 
   * @param entry - Cache entry to check
   * @returns true if the entry is expired, false otherwise
   */
  private isExpired(entry: CacheEntry<ChangelogResult>): boolean {
    const now = Date.now();
    const ageInSeconds = (now - entry.timestamp) / 1000;
    return ageInSeconds > entry.ttl;
  }

  /**
   * Gets a cached changelog result if it exists and is not expired
   * 
   * Validates Requirements 7.1, 7.2, 7.4:
   * - Returns cached result when entry exists and is not expired
   * - Returns null if entry doesn't exist or is expired
   * 
   * @param repoUrl - Repository URL
   * @param version - Version string
   * @returns Cached ChangelogResult or null if not found or expired
   */
  get(repoUrl: string, version: string): ChangelogResult | null {
    const key = this.generateKey(repoUrl, version);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry is expired (Requirement 7.3)
    if (this.isExpired(entry)) {
      // Remove expired entry
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Sets a changelog result in the cache with TTL
   * 
   * Validates Requirements 7.1, 7.2:
   * - Caches changelog results keyed by repository URL and version
   * - Records timestamp for TTL checking
   * 
   * @param repoUrl - Repository URL
   * @param version - Version string
   * @param value - ChangelogResult to cache
   * @param ttl - Time-to-live in seconds
   */
  set(repoUrl: string, version: string, value: ChangelogResult, ttl: number): void {
    const key = this.generateKey(repoUrl, version);
    const entry: CacheEntry<ChangelogResult> = {
      value,
      timestamp: Date.now(),
      ttl,
    };
    this.cache.set(key, entry);
  }

  /**
   * Clears all entries from the cache
   * 
   * Validates Requirement 7.7:
   * - Provides mechanism to clear the cache when needed
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Gets the number of entries in the cache (for testing/debugging)
   * 
   * @returns Number of cache entries
   */
  size(): number {
    return this.cache.size;
  }
}
