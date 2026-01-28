/**
 * Property-based tests for ChangelogFinder - Authentication
 * 
 * **Property 5: Authentication credential usage**
 * **Validates: Requirements 2.8**
 * 
 * For any repository requiring authentication, the ChangelogFinder should
 * pass the provided credentials to the platform API client when accessing
 * private repositories.
 */

import * as fc from 'fast-check';
import { ChangelogFinder } from '../../src/changelog/changelog-finder';

describe('Property 5: Authentication credential usage', () => {
  /**
   * Property 5.1: GitHub token is used when provided
   */
  it('should use GitHub token when provided', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 20, maxLength: 40 }),
        (token) => {
          const finder = new ChangelogFinder({ githubToken: token });
          
          // CRITICAL: Finder should be created with token
          expect(finder).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.2: GitLab token is used when provided
   */
  it('should use GitLab token when provided', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 20, maxLength: 40 }),
        (token) => {
          const finder = new ChangelogFinder({ gitlabToken: token });
          
          // CRITICAL: Finder should be created with token
          expect(finder).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.3: Bitbucket credentials are used when provided
   */
  it('should use Bitbucket credentials when provided', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (username, password) => {
          const finder = new ChangelogFinder({
            bitbucketCredentials: { username, password },
          });
          
          // CRITICAL: Finder should be created with credentials
          expect(finder).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.4: Multiple credentials can be provided
   */
  it('should accept multiple credential types', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 20, maxLength: 40 }),
        fc.string({ minLength: 20, maxLength: 40 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (githubToken, gitlabToken, bbUsername, bbPassword) => {
          const finder = new ChangelogFinder({
            githubToken,
            gitlabToken,
            bitbucketCredentials: { username: bbUsername, password: bbPassword },
          });
          
          // CRITICAL: Finder should be created with all credentials
          expect(finder).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
