/**
 * Property-based tests for Configuration Validation
 * 
 * **Property 26: Configuration Validation**
 * **Validates: Requirements 7.8**
 * 
 * For any invalid configuration input, the action should fail with a clear 
 * error message describing the validation failure.
 */

import * as fc from 'fast-check';
import { ConfigurationManager } from '../../src/config/configuration-manager';
import { ActionConfig } from '../../src/types/config';

describe('Property: Configuration Validation', () => {
  /**
   * Helper to create a valid base configuration
   */
  const createValidConfig = (): ActionConfig => ({
    includePaths: ['**/*.yaml'],
    excludePaths: ['node_modules/**'],
    updateStrategy: 'all',
    registryCredentials: [],
    prStrategy: 'single',
    prLabels: ['dependencies'],
    prAssignees: [],
    prReviewers: [],
    branchPrefix: 'helm-update',
    commitMessage: {
      prefix: 'chore',
      includeScope: true,
    },
    groups: {},
    ignore: [],
    autoMerge: {
      enabled: false,
      updateTypes: ['patch'],
      requireCIPass: true,
      requireApprovals: 0,
    },
    openPullRequestsLimit: 10,
    rebaseStrategy: 'auto',
    dryRun: false,
    logLevel: 'info',
    githubToken: 'test-token',
  });

  /**
   * Custom arbitraries for generating invalid configuration values
   */
  
  const arbInvalidUpdateStrategy = fc.string().filter(
    s => !['major', 'minor', 'patch', 'all'].includes(s)
  );
  
  const arbInvalidPRStrategy = fc.string().filter(
    s => !['single', 'per-chart', 'per-manifest'].includes(s)
  );
  
  const arbInvalidLogLevel = fc.string().filter(
    s => !['debug', 'info', 'warn', 'error'].includes(s)
  );
  
  const arbInvalidRebaseStrategy = fc.string().filter(
    s => !['auto', 'disabled'].includes(s)
  );

  const arbInvalidUpdateType = fc.string().filter(
    s => !['major', 'minor', 'patch'].includes(s)
  );

  const arbInvalidGlobPattern = fc.oneof(
    fc.constant(''), // Empty string
    fc.constant('  '), // Whitespace only
    fc.constant('\\path\\to\\file.yaml'), // Backslashes
    fc.constant('/absolute/path/*.yaml'), // Absolute path
  );

  const arbInvalidRegistryURL = fc.string().filter(
    s => {
      // Must not be empty (that's caught by incomplete credentials check)
      if (!s || s.trim() === '') return false;
      
      // Invalid if it's not a valid URL and not a valid hostname
      try {
        new URL(s);
        return false; // Valid URL
      } catch {
        // Check if it's a valid hostname pattern
        return !/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(s);
      }
    }
  );

  const arbInvalidUsername = fc.oneof(
    fc.constant(''), // Empty
    fc.constant('  '), // Whitespace
    fc.constant('-invalid'), // Starts with hyphen
    fc.constant('invalid-'), // Ends with hyphen
    fc.constant('invalid user'), // Contains space
    fc.constant('invalid@user'), // Contains special char
  );

  const arbInvalidBranchPrefix = fc.oneof(
    fc.constant('branch prefix'), // Contains space
    fc.constant('branch:prefix'), // Contains colon
    fc.constant('branch?prefix'), // Contains question mark
    fc.constant('branch*prefix'), // Contains asterisk
    fc.constant('branch[prefix'), // Contains bracket
    fc.constant('branch~prefix'), // Contains tilde
    fc.constant('branch^prefix'), // Contains caret
    fc.constant('branch\\prefix'), // Contains backslash
    fc.constant('branch.'), // Ends with dot
    fc.constant('branch.lock'), // Ends with .lock
  );

  const arbInvalidCommitPrefix = fc.string().filter(
    s => {
      // Empty string is allowed (optional field), so filter it out
      if (!s || s.trim() === '') return false;
      // Invalid if not in the valid list
      return !['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'].includes(s);
    }
  );

  const arbInvalidLabel = fc.oneof(
    fc.constant(''), // Empty
    fc.constant('  '), // Whitespace
    fc.constant('a'.repeat(51)), // Too long
  );

  const arbInvalidGroupName = fc.oneof(
    fc.constant('invalid group'), // Contains space
    fc.constant('invalid@group'), // Contains special char
    fc.constant('invalid.group'), // Contains dot
  );

  /**
   * Property 26: Invalid update strategy should be rejected
   */
  it('should reject invalid update strategy with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidUpdateStrategy,
        (invalidStrategy) => {
          const config = createValidConfig();
          config.updateStrategy = invalidStrategy as any;

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('Invalid update-strategy'))).toBe(true);
          expect(result.errors.some(e => e.includes(invalidStrategy))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Invalid PR strategy should be rejected
   */
  it('should reject invalid PR strategy with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidPRStrategy,
        (invalidStrategy) => {
          const config = createValidConfig();
          config.prStrategy = invalidStrategy as any;

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('Invalid pr-strategy'))).toBe(true);
          expect(result.errors.some(e => e.includes(invalidStrategy))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Invalid log level should be rejected
   */
  it('should reject invalid log level with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidLogLevel,
        (invalidLevel) => {
          const config = createValidConfig();
          config.logLevel = invalidLevel as any;

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('Invalid log-level'))).toBe(true);
          expect(result.errors.some(e => e.includes(invalidLevel))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Invalid rebase strategy should be rejected
   */
  it('should reject invalid rebase strategy with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidRebaseStrategy,
        (invalidStrategy) => {
          const config = createValidConfig();
          config.rebaseStrategy = invalidStrategy as any;

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('Invalid rebase-strategy'))).toBe(true);
          expect(result.errors.some(e => e.includes(invalidStrategy))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty include paths should be rejected
   */
  it('should reject empty include paths with clear error message', () => {
    const config = createValidConfig();
    config.includePaths = [];

    const result = ConfigurationManager.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('include-paths must not be empty');
  });

  /**
   * Property: Invalid glob patterns should be rejected
   */
  it('should reject invalid glob patterns with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidGlobPattern,
        (invalidPattern) => {
          const config = createValidConfig();
          config.includePaths = ['**/*.yaml', invalidPattern];

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          // Should have an error related to the invalid pattern
          const hasRelevantError = result.errors.some(e => 
            e.includes('empty') || 
            e.includes('backslash') || 
            e.includes('forward slash') ||
            e.includes('absolute')
          );
          expect(hasRelevantError).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Incomplete registry credentials should be rejected
   */
  it('should reject incomplete registry credentials with clear error message', () => {
    fc.assert(
      fc.property(
        fc.record({
          registry: fc.option(fc.string(), { nil: '' }),
          username: fc.option(fc.string(), { nil: '' }),
          password: fc.option(fc.string(), { nil: '' }),
        }).filter(cred => !cred.registry || !cred.username || !cred.password),
        (incompleteCred) => {
          const config = createValidConfig();
          config.registryCredentials = [incompleteCred as any];

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('Registry credentials must include'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Invalid registry URLs should be rejected
   */
  it('should reject invalid registry URLs with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidRegistryURL,
        (invalidURL) => {
          const config = createValidConfig();
          config.registryCredentials = [{
            registry: invalidURL,
            username: 'user',
            password: 'pass',
          }];

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('Invalid registry URL or hostname'))).toBe(true);
          expect(result.errors.some(e => e.includes(invalidURL))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Invalid auto-merge update types should be rejected
   */
  it('should reject invalid auto-merge update types with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidUpdateType,
        (invalidType) => {
          const config = createValidConfig();
          config.autoMerge.updateTypes = [invalidType as any];

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('Invalid auto-merge update type'))).toBe(true);
          expect(result.errors.some(e => e.includes(invalidType))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Negative open pull requests limit should be rejected
   */
  it('should reject negative open pull requests limit with clear error message', () => {
    fc.assert(
      fc.property(
        fc.integer({ max: -1 }),
        (negativeLimit) => {
          const config = createValidConfig();
          config.openPullRequestsLimit = negativeLimit;

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('open-pull-requests-limit must be a non-negative number'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Negative auto-merge require approvals should be rejected
   */
  it('should reject negative auto-merge require approvals with clear error message', () => {
    fc.assert(
      fc.property(
        fc.integer({ max: -1 }),
        (negativeApprovals) => {
          const config = createValidConfig();
          config.autoMerge.requireApprovals = negativeApprovals;

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('auto-merge-require-approvals must be a non-negative number'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Missing GitHub token should be rejected
   */
  it('should reject missing GitHub token with clear error message', () => {
    const config = createValidConfig();
    config.githubToken = '';

    const result = ConfigurationManager.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('github-token is required');
  });

  /**
   * Property: Invalid PR labels should be rejected
   */
  it('should reject invalid PR labels with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidLabel,
        (invalidLabel) => {
          const config = createValidConfig();
          config.prLabels = ['valid-label', invalidLabel];

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          const hasRelevantError = result.errors.some(e => 
            e.includes('PR labels must not be empty') || 
            e.includes('exceeds maximum length')
          );
          expect(hasRelevantError).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Invalid PR assignees should be rejected
   */
  it('should reject invalid PR assignees with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidUsername,
        (invalidUsername) => {
          const config = createValidConfig();
          config.prAssignees = [invalidUsername];

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          const hasRelevantError = result.errors.some(e => 
            e.includes('Invalid PR assignee') || 
            e.includes('PR assignees must not be empty')
          );
          expect(hasRelevantError).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Invalid PR reviewers should be rejected
   */
  it('should reject invalid PR reviewers with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidUsername,
        (invalidUsername) => {
          const config = createValidConfig();
          config.prReviewers = [invalidUsername];

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          const hasRelevantError = result.errors.some(e => 
            e.includes('Invalid PR reviewer') || 
            e.includes('PR reviewers must not be empty')
          );
          expect(hasRelevantError).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Invalid branch prefix should be rejected
   */
  it('should reject invalid branch prefix with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidBranchPrefix,
        (invalidPrefix) => {
          const config = createValidConfig();
          config.branchPrefix = invalidPrefix;

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('Invalid branch-prefix'))).toBe(true);
          expect(result.errors.some(e => e.includes(invalidPrefix))).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Invalid commit message prefix should be rejected
   */
  it('should reject invalid commit message prefix with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidCommitPrefix,
        (invalidPrefix) => {
          const config = createValidConfig();
          config.commitMessage.prefix = invalidPrefix;

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('Invalid commit-message-prefix'))).toBe(true);
          expect(result.errors.some(e => e.includes(invalidPrefix))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Ignore rules without dependency name should be rejected
   */
  it('should reject ignore rules without dependency name with clear error message', () => {
    const config = createValidConfig();
    config.ignore = [{
      dependencyName: '',
      versions: ['1.x'],
    }];

    const result = ConfigurationManager.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Ignore rule must include dependencyName');
  });

  /**
   * Property: Invalid ignore rule update types should be rejected
   */
  it('should reject invalid ignore rule update types with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidUpdateType,
        (invalidType) => {
          const config = createValidConfig();
          config.ignore = [{
            dependencyName: 'nginx',
            updateTypes: [invalidType as any],
          }];

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('Invalid ignore rule update type'))).toBe(true);
          expect(result.errors.some(e => e.includes(invalidType))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty version patterns in ignore rules should be rejected
   */
  it('should reject empty version patterns in ignore rules with clear error message', () => {
    const config = createValidConfig();
    config.ignore = [{
      dependencyName: 'nginx',
      versions: ['1.x', '', '  '],
    }];

    const result = ConfigurationManager.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('version patterns must not be empty'))).toBe(true);
  });

  /**
   * Property: Dependency groups without patterns should be rejected
   */
  it('should reject dependency groups without patterns with clear error message', () => {
    const config = createValidConfig();
    config.groups = {
      'test-group': {
        patterns: [],
      },
    };

    const result = ConfigurationManager.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('must have at least one pattern'))).toBe(true);
  });

  /**
   * Property: Empty patterns in dependency groups should be rejected
   */
  it('should reject empty patterns in dependency groups with clear error message', () => {
    const config = createValidConfig();
    config.groups = {
      'test-group': {
        patterns: ['nginx', '', '  '],
      },
    };

    const result = ConfigurationManager.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('contains empty pattern'))).toBe(true);
  });

  /**
   * Property: Invalid group names should be rejected
   */
  it('should reject invalid group names with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidGroupName,
        (invalidName) => {
          const config = createValidConfig();
          config.groups = {
            [invalidName]: {
              patterns: ['nginx'],
            },
          };

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('Invalid group name'))).toBe(true);
          expect(result.errors.some(e => e.includes(invalidName))).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Invalid group update types should be rejected
   */
  it('should reject invalid group update types with clear error message', () => {
    fc.assert(
      fc.property(
        arbInvalidUpdateType,
        (invalidType) => {
          const config = createValidConfig();
          config.groups = {
            'test-group': {
              patterns: ['nginx'],
              updateTypes: [invalidType as any],
            },
          };

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('Invalid group update type'))).toBe(true);
          expect(result.errors.some(e => e.includes(invalidType))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Multiple validation errors should be accumulated
   */
  it('should accumulate multiple validation errors', () => {
    fc.assert(
      fc.property(
        arbInvalidUpdateStrategy,
        arbInvalidPRStrategy,
        arbInvalidLogLevel,
        (invalidUpdate, invalidPR, invalidLog) => {
          const config = createValidConfig();
          config.updateStrategy = invalidUpdate as any;
          config.prStrategy = invalidPR as any;
          config.logLevel = invalidLog as any;

          const result = ConfigurationManager.validate(config);

          expect(result.valid).toBe(false);
          // Should have at least 3 errors (one for each invalid field)
          expect(result.errors.length).toBeGreaterThanOrEqual(3);
          expect(result.errors.some(e => e.includes('Invalid update-strategy'))).toBe(true);
          expect(result.errors.some(e => e.includes('Invalid pr-strategy'))).toBe(true);
          expect(result.errors.some(e => e.includes('Invalid log-level'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Valid configuration should pass validation
   * 
   * This is a sanity check to ensure the validation doesn't reject valid configs.
   */
  it('should accept valid configuration', () => {
    const config = createValidConfig();
    const result = ConfigurationManager.validate(config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
