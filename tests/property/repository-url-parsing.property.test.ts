/**
 * Property-based tests for Repository URL Parsing
 * 
 * **Feature: changelog-release-notes-generator, Property 4: Platform-specific API usage**
 * **Validates: Requirements 2.5, 2.6, 2.7**
 * 
 * For any repository URL, the ChangelogFinder should use the appropriate
 * platform-specific API client (GitHub/GitLab/Bitbucket) based on the
 * repository's hosting platform.
 */

import * as fc from 'fast-check';
import { parseRepositoryUrl } from '../../src/changelog/repository-parser';

/**
 * Custom arbitraries for generating test data
 */

// Generate valid repository owner/organization names
const arbOwnerName = fc.stringMatching(/^[a-zA-Z0-9]([a-zA-Z0-9_-]{0,38}[a-zA-Z0-9])?$/);

// Generate valid repository names
const arbRepoName = fc.stringMatching(/^[a-zA-Z0-9]([a-zA-Z0-9._-]{0,98}[a-zA-Z0-9])?$/);

// Generate GitHub repository URLs (HTTPS)
const arbGitHubHTTPSURL = fc.record({
  owner: arbOwnerName,
  repo: arbRepoName,
  gitSuffix: fc.boolean(),
  trailingSlash: fc.boolean(),
}).map(({ owner, repo, gitSuffix, trailingSlash }) => {
  let url = `https://github.com/${owner}/${repo}`;
  if (gitSuffix) url += '.git';
  if (trailingSlash && !gitSuffix) url += '/';
  return { url, owner, repo, platform: 'github' as const };
});

// Generate GitHub repository URLs (SSH)
const arbGitHubSSHURL = fc.record({
  owner: arbOwnerName,
  repo: arbRepoName,
  gitSuffix: fc.boolean(),
}).map(({ owner, repo, gitSuffix }) => {
  let url = `git@github.com:${owner}/${repo}`;
  if (gitSuffix) url += '.git';
  return { url, owner, repo, platform: 'github' as const };
});

// Generate GitLab repository URLs (HTTPS)
const arbGitLabHTTPSURL = fc.record({
  owner: arbOwnerName,
  repo: arbRepoName,
  gitSuffix: fc.boolean(),
  trailingSlash: fc.boolean(),
}).map(({ owner, repo, gitSuffix, trailingSlash }) => {
  let url = `https://gitlab.com/${owner}/${repo}`;
  if (gitSuffix) url += '.git';
  if (trailingSlash && !gitSuffix) url += '/';
  return { url, owner, repo, platform: 'gitlab' as const };
});

// Generate GitLab repository URLs (SSH)
const arbGitLabSSHURL = fc.record({
  owner: arbOwnerName,
  repo: arbRepoName,
  gitSuffix: fc.boolean(),
}).map(({ owner, repo, gitSuffix }) => {
  let url = `git@gitlab.com:${owner}/${repo}`;
  if (gitSuffix) url += '.git';
  return { url, owner, repo, platform: 'gitlab' as const };
});

// Generate Bitbucket repository URLs (HTTPS)
const arbBitbucketHTTPSURL = fc.record({
  owner: arbOwnerName,
  repo: arbRepoName,
  gitSuffix: fc.boolean(),
  trailingSlash: fc.boolean(),
}).map(({ owner, repo, gitSuffix, trailingSlash }) => {
  let url = `https://bitbucket.org/${owner}/${repo}`;
  if (gitSuffix) url += '.git';
  if (trailingSlash && !gitSuffix) url += '/';
  return { url, owner, repo, platform: 'bitbucket' as const };
});

// Generate Bitbucket repository URLs (SSH)
const arbBitbucketSSHURL = fc.record({
  owner: arbOwnerName,
  repo: arbRepoName,
  gitSuffix: fc.boolean(),
}).map(({ owner, repo, gitSuffix }) => {
  let url = `git@bitbucket.org:${owner}/${repo}`;
  if (gitSuffix) url += '.git';
  return { url, owner, repo, platform: 'bitbucket' as const };
});

// Generate any valid repository URL from all platforms
const arbAnyRepoURL = fc.oneof(
  arbGitHubHTTPSURL,
  arbGitHubSSHURL,
  arbGitLabHTTPSURL,
  arbGitLabSSHURL,
  arbBitbucketHTTPSURL,
  arbBitbucketSSHURL
);

describe('Property 4: Platform-specific API usage', () => {
  /**
   * Property 4.1: GitHub URL platform detection
   * 
   * For any GitHub repository URL (HTTPS or SSH), the parser should
   * correctly detect the platform as 'github'.
   */
  it('should detect GitHub platform for all GitHub URLs', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbGitHubHTTPSURL, arbGitHubSSHURL),
        ({ url, owner, repo }) => {
          const result = parseRepositoryUrl(url);

          // Should detect GitHub platform
          expect(result.platform).toBe('github');
          
          // Should extract owner correctly
          expect(result.owner).toBe(owner);
          
          // Should extract repo name correctly (without .git suffix)
          expect(result.repo).toBe(repo);
          
          // Should preserve original URL
          expect(result.url).toBe(url);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.2: GitLab URL platform detection
   * 
   * For any GitLab repository URL (HTTPS or SSH), the parser should
   * correctly detect the platform as 'gitlab'.
   */
  it('should detect GitLab platform for all GitLab URLs', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbGitLabHTTPSURL, arbGitLabSSHURL),
        ({ url, owner, repo }) => {
          const result = parseRepositoryUrl(url);

          // Should detect GitLab platform
          expect(result.platform).toBe('gitlab');
          
          // Should extract owner correctly
          expect(result.owner).toBe(owner);
          
          // Should extract repo name correctly (without .git suffix)
          expect(result.repo).toBe(repo);
          
          // Should preserve original URL
          expect(result.url).toBe(url);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.3: Bitbucket URL platform detection
   * 
   * For any Bitbucket repository URL (HTTPS or SSH), the parser should
   * correctly detect the platform as 'bitbucket'.
   */
  it('should detect Bitbucket platform for all Bitbucket URLs', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbBitbucketHTTPSURL, arbBitbucketSSHURL),
        ({ url, owner, repo }) => {
          const result = parseRepositoryUrl(url);

          // Should detect Bitbucket platform
          expect(result.platform).toBe('bitbucket');
          
          // Should extract owner correctly
          expect(result.owner).toBe(owner);
          
          // Should extract repo name correctly (without .git suffix)
          expect(result.repo).toBe(repo);
          
          // Should preserve original URL
          expect(result.url).toBe(url);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.4: Platform detection consistency
   * 
   * For any repository URL, parsing it multiple times should produce
   * identical platform detection results (idempotent operation).
   */
  it('should produce consistent platform detection across multiple parses', () => {
    fc.assert(
      fc.property(
        arbAnyRepoURL,
        ({ url }) => {
          const result1 = parseRepositoryUrl(url);
          const result2 = parseRepositoryUrl(url);

          // Results should be identical
          expect(result1).toEqual(result2);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.5: Platform detection for HTTPS vs SSH
   * 
   * For any repository, the platform detection should be the same
   * regardless of whether HTTPS or SSH URL format is used.
   */
  it('should detect same platform for HTTPS and SSH URLs of same repository', () => {
    fc.assert(
      fc.property(
        arbOwnerName,
        arbRepoName,
        fc.constantFrom('github.com', 'gitlab.com', 'bitbucket.org'),
        (owner, repo, domain) => {
          const httpsUrl = `https://${domain}/${owner}/${repo}`;
          const sshUrl = `git@${domain}:${owner}/${repo}.git`;

          const httpsResult = parseRepositoryUrl(httpsUrl);
          const sshResult = parseRepositoryUrl(sshUrl);

          // Platform should be the same
          expect(httpsResult.platform).toBe(sshResult.platform);
          
          // Owner should be the same
          expect(httpsResult.owner).toBe(sshResult.owner);
          
          // Repo should be the same
          expect(httpsResult.repo).toBe(sshResult.repo);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.6: Case-insensitive domain detection
   * 
   * For any repository URL with different domain casing, the platform
   * should still be correctly detected.
   */
  it('should detect platform case-insensitively', () => {
    fc.assert(
      fc.property(
        arbOwnerName,
        arbRepoName,
        fc.constantFrom(
          { domain: 'GitHub.com', expected: 'github' as const },
          { domain: 'GITHUB.COM', expected: 'github' as const },
          { domain: 'GitLab.com', expected: 'gitlab' as const },
          { domain: 'GITLAB.COM', expected: 'gitlab' as const },
          { domain: 'BitBucket.org', expected: 'bitbucket' as const },
          { domain: 'BITBUCKET.ORG', expected: 'bitbucket' as const }
        ),
        (owner, repo, { domain, expected }) => {
          const url = `https://${domain}/${owner}/${repo}`;
          const result = parseRepositoryUrl(url);

          // Should detect platform regardless of case
          expect(result.platform).toBe(expected);
          
          // Should extract owner and repo correctly
          expect(result.owner).toBe(owner);
          expect(result.repo).toBe(repo);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.7: .git suffix handling
   * 
   * For any repository URL, the .git suffix should be removed from
   * the repo name but the platform detection should remain correct.
   */
  it('should handle .git suffix correctly across all platforms', () => {
    fc.assert(
      fc.property(
        arbAnyRepoURL,
        ({ url, owner, repo, platform }) => {
          const result = parseRepositoryUrl(url);

          // Platform should be detected correctly
          expect(result.platform).toBe(platform);
          
          // Repo name should not include .git suffix
          expect(result.repo).not.toMatch(/\.git$/);
          expect(result.repo).toBe(repo);
          
          // Owner should be correct
          expect(result.owner).toBe(owner);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.8: Trailing slash handling
   * 
   * For any HTTPS repository URL with or without trailing slash,
   * the platform detection and parsing should be correct.
   */
  it('should handle trailing slashes correctly', () => {
    fc.assert(
      fc.property(
        arbOwnerName,
        arbRepoName,
        fc.constantFrom('github.com', 'gitlab.com', 'bitbucket.org'),
        fc.boolean(),
        (owner, repo, domain, withSlash) => {
          const url = `https://${domain}/${owner}/${repo}${withSlash ? '/' : ''}`;
          const result = parseRepositoryUrl(url);

          // Should detect platform correctly
          expect(result.platform).not.toBe('unknown');
          
          // Should extract owner and repo correctly
          expect(result.owner).toBe(owner);
          expect(result.repo).toBe(repo);
          
          // Repo should not have trailing slash
          expect(result.repo).not.toMatch(/\/$/);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.9: HTTP vs HTTPS protocol handling
   * 
   * For any repository URL, both HTTP and HTTPS protocols should
   * result in correct platform detection.
   */
  it('should handle both HTTP and HTTPS protocols', () => {
    fc.assert(
      fc.property(
        arbOwnerName,
        arbRepoName,
        fc.constantFrom('github.com', 'gitlab.com', 'bitbucket.org'),
        fc.constantFrom('http', 'https'),
        (owner, repo, domain, protocol) => {
          const url = `${protocol}://${domain}/${owner}/${repo}`;
          const result = parseRepositoryUrl(url);

          // Should detect platform correctly regardless of protocol
          expect(result.platform).not.toBe('unknown');
          
          // Should extract owner and repo correctly
          expect(result.owner).toBe(owner);
          expect(result.repo).toBe(repo);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.10: Unknown platform handling
   * 
   * For any URL from an unknown/unsupported platform, the parser
   * should return 'unknown' platform with empty owner and repo.
   */
  it('should return unknown platform for unsupported domains', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'https://example.com/owner/repo',
          'https://git.example.org/owner/repo',
          'https://code.company.com/owner/repo',
          'git@example.com:owner/repo.git',
          'not-a-valid-url',
          'ftp://github.com/owner/repo'
        ),
        (url) => {
          const result = parseRepositoryUrl(url);

          // Should return unknown platform
          expect(result.platform).toBe('unknown');
          
          // Should have empty owner and repo for unknown platforms
          expect(result.owner).toBe('');
          expect(result.repo).toBe('');
          
          // Should preserve original URL
          expect(result.url).toBe(url);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.11: Whitespace handling
   * 
   * For any repository URL with leading/trailing whitespace, the parser
   * should trim it and still detect the platform correctly.
   */
  it('should handle URLs with whitespace', () => {
    fc.assert(
      fc.property(
        arbAnyRepoURL,
        fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { maxLength: 5 }),
        fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { maxLength: 5 }),
        ({ url, owner, repo, platform }, leadingWS, trailingWS) => {
          const urlWithWS = `${leadingWS}${url}${trailingWS}`;
          const result = parseRepositoryUrl(urlWithWS);

          // Should detect platform correctly after trimming
          expect(result.platform).toBe(platform);
          
          // Should extract owner and repo correctly
          expect(result.owner).toBe(owner);
          expect(result.repo).toBe(repo);
          
          // Should preserve trimmed URL
          expect(result.url).toBe(url);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.12: Repository name with special characters
   * 
   * For any repository URL with valid special characters in owner/repo names
   * (hyphens, underscores, dots), the parser should handle them correctly.
   */
  it('should handle repository names with special characters', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('github.com', 'gitlab.com', 'bitbucket.org'),
        fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,38}[a-zA-Z0-9]$/),
        fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,98}[a-zA-Z0-9]$/),
        (domain, owner, repo) => {
          const url = `https://${domain}/${owner}/${repo}`;
          const result = parseRepositoryUrl(url);

          // Should detect platform correctly
          expect(result.platform).not.toBe('unknown');
          
          // Should preserve special characters in owner and repo
          expect(result.owner).toBe(owner);
          expect(result.repo).toBe(repo);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.13: Platform-specific API client selection
   * 
   * For any repository URL, the detected platform should uniquely determine
   * which API client should be used (GitHub API, GitLab API, or Bitbucket API).
   */
  it('should provide sufficient information for API client selection', () => {
    fc.assert(
      fc.property(
        arbAnyRepoURL,
        ({ url, platform }) => {
          const result = parseRepositoryUrl(url);

          // Should have all information needed for API client selection
          expect(result.platform).toBe(platform);
          expect(result.owner).toBeTruthy();
          expect(result.repo).toBeTruthy();
          
          // Platform should be one of the supported platforms
          expect(['github', 'gitlab', 'bitbucket']).toContain(result.platform);
          
          // Owner and repo should be non-empty for supported platforms
          if (result.platform !== 'unknown') {
            expect(result.owner.length).toBeGreaterThan(0);
            expect(result.repo.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.14: URL normalization consistency
   * 
   * For any repository URL with various formatting variations (case, whitespace,
   * .git suffix, trailing slash), the extracted owner and repo should be
   * normalized consistently.
   */
  it('should normalize owner and repo consistently across URL variations', () => {
    fc.assert(
      fc.property(
        arbOwnerName,
        arbRepoName,
        fc.constantFrom('github.com', 'gitlab.com', 'bitbucket.org'),
        (owner, repo, domain) => {
          // Generate various URL formats for the same repository
          const urls = [
            `https://${domain}/${owner}/${repo}`,
            `https://${domain}/${owner}/${repo}.git`,
            `https://${domain}/${owner}/${repo}/`,
            `git@${domain}:${owner}/${repo}`,
            `git@${domain}:${owner}/${repo}.git`,
            `  https://${domain}/${owner}/${repo}  `,
          ];

          const results = urls.map(url => parseRepositoryUrl(url));

          // All results should have the same normalized owner and repo
          const firstResult = results[0];
          results.forEach(result => {
            expect(result.owner).toBe(firstResult.owner);
            expect(result.repo).toBe(firstResult.repo);
            expect(result.platform).toBe(firstResult.platform);
          });
        }
      ),
      { numRuns: 10 }
    );
  });
});
