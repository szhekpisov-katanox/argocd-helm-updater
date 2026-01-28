/**
 * Property-based tests for Configuration Defaults
 * 
 * **Property 25: Configuration Defaults**
 * **Validates: Requirements 7.7**
 * 
 * For any configuration option not explicitly provided, the action should 
 * use the documented default value.
 */

// Mock fs before any imports
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
  };
});

import * as fc from 'fast-check';
import * as core from '@actions/core';
import { ConfigurationManager } from '../../src/config/configuration-manager';

// Mock @actions/core
jest.mock('@actions/core');
const mockCore = core as jest.Mocked<typeof core>;

describe('Property: Configuration Defaults', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup minimal mock implementation - only github-token is required
    mockCore.getInput.mockImplementation((name: string) => {
      if (name === 'github-token') {
        return 'test-token';
      }
      return '';
    });
    
    mockCore.info.mockImplementation(() => {});
    mockCore.warning.mockImplementation(() => {});
  });

  /**
   * Property 25: Configuration Defaults
   * 
   * For any configuration option not explicitly provided, the action should 
   * use the documented default value.
   * 
   * This test verifies that when no inputs are provided (except the required
   * github-token), all configuration fields are set to their documented defaults.
   */
  it('should use documented defaults when no configuration is provided', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }), // Random github token
        (githubToken) => {
          // Setup mock to return only the github token
          mockCore.getInput.mockImplementation((name: string) => {
            if (name === 'github-token') {
              return githubToken;
            }
            return '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify all defaults are applied
          expect(config.includePaths).toEqual(['**/*.yaml', '**/*.yml']);
          expect(config.excludePaths).toEqual(['node_modules/**', 'dist/**', '.git/**']);
          expect(config.updateStrategy).toBe('all');
          expect(config.registryCredentials).toEqual([]);
          expect(config.prStrategy).toBe('single');
          expect(config.prLabels).toEqual(['dependencies', 'argocd', 'helm']);
          expect(config.prAssignees).toEqual([]);
          expect(config.prReviewers).toEqual([]);
          expect(config.branchPrefix).toBe('argocd-helm-update');
          expect(config.commitMessage.prefix).toBe('chore');
          expect(config.commitMessage.includeScope).toBe(true);
          expect(config.groups).toEqual({});
          expect(config.ignore).toEqual([]);
          expect(config.autoMerge.enabled).toBe(false);
          expect(config.autoMerge.updateTypes).toEqual(['patch']);
          expect(config.autoMerge.requireCIPass).toBe(true);
          expect(config.autoMerge.requireApprovals).toBe(0);
          expect(config.openPullRequestsLimit).toBe(10);
          expect(config.rebaseStrategy).toBe('auto');
          expect(config.dryRun).toBe(false);
          expect(config.logLevel).toBe('info');
          expect(config.githubToken).toBe(githubToken);

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Partial configuration with defaults
   * 
   * For any subset of configuration options provided, the remaining options
   * should use their documented defaults.
   */
  it('should use defaults for unprovided configuration options', () => {
    fc.assert(
      fc.property(
        fc.record({
          updateStrategy: fc.option(fc.constantFrom('major', 'minor', 'patch', 'all'), { nil: undefined }),
          prStrategy: fc.option(fc.constantFrom('single', 'per-chart', 'per-manifest'), { nil: undefined }),
          logLevel: fc.option(fc.constantFrom('debug', 'info', 'warn', 'error'), { nil: undefined }),
          dryRun: fc.option(fc.boolean(), { nil: undefined }),
        }),
        (providedConfig) => {
          // Setup mock to return only provided values
          mockCore.getInput.mockImplementation((name: string) => {
            if (name === 'github-token') {
              return 'test-token';
            }
            if (name === 'update-strategy' && providedConfig.updateStrategy) {
              return providedConfig.updateStrategy;
            }
            if (name === 'pr-strategy' && providedConfig.prStrategy) {
              return providedConfig.prStrategy;
            }
            if (name === 'log-level' && providedConfig.logLevel) {
              return providedConfig.logLevel;
            }
            if (name === 'dry-run' && providedConfig.dryRun !== undefined) {
              return providedConfig.dryRun.toString();
            }
            return '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify provided values are used
          if (providedConfig.updateStrategy) {
            expect(config.updateStrategy).toBe(providedConfig.updateStrategy);
          } else {
            expect(config.updateStrategy).toBe('all'); // Default
          }

          if (providedConfig.prStrategy) {
            expect(config.prStrategy).toBe(providedConfig.prStrategy);
          } else {
            expect(config.prStrategy).toBe('single'); // Default
          }

          if (providedConfig.logLevel) {
            expect(config.logLevel).toBe(providedConfig.logLevel);
          } else {
            expect(config.logLevel).toBe('info'); // Default
          }

          if (providedConfig.dryRun !== undefined) {
            expect(config.dryRun).toBe(providedConfig.dryRun);
          } else {
            expect(config.dryRun).toBe(false); // Default
          }

          // Verify unprovided values use defaults
          expect(config.includePaths).toEqual(['**/*.yaml', '**/*.yml']);
          expect(config.excludePaths).toEqual(['node_modules/**', 'dist/**', '.git/**']);
          expect(config.registryCredentials).toEqual([]);
          expect(config.prLabels).toEqual(['dependencies', 'argocd', 'helm']);
          expect(config.prAssignees).toEqual([]);
          expect(config.prReviewers).toEqual([]);
          expect(config.branchPrefix).toBe('argocd-helm-update');
          expect(config.commitMessage.prefix).toBe('chore');
          expect(config.commitMessage.includeScope).toBe(true);
          expect(config.groups).toEqual({});
          expect(config.ignore).toEqual([]);
          expect(config.autoMerge.enabled).toBe(false);
          expect(config.autoMerge.updateTypes).toEqual(['patch']);
          expect(config.autoMerge.requireCIPass).toBe(true);
          expect(config.autoMerge.requireApprovals).toBe(0);
          expect(config.openPullRequestsLimit).toBe(10);
          expect(config.rebaseStrategy).toBe('auto');

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Empty string inputs should use defaults
   * 
   * For any configuration option provided as an empty string, the default
   * value should be used (except for required fields like github-token).
   */
  it('should use defaults when configuration inputs are empty strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }), // Random github token
        (githubToken) => {
          // Setup mock to return empty strings for all inputs except github-token
          mockCore.getInput.mockImplementation((name: string) => {
            if (name === 'github-token') {
              return githubToken;
            }
            // Return empty string for all other inputs
            return '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify all defaults are applied (empty strings should be treated as "not provided")
          expect(config.includePaths).toEqual(['**/*.yaml', '**/*.yml']);
          expect(config.excludePaths).toEqual(['node_modules/**', 'dist/**', '.git/**']);
          expect(config.updateStrategy).toBe('all');
          expect(config.prStrategy).toBe('single');
          expect(config.logLevel).toBe('info');
          expect(config.branchPrefix).toBe('argocd-helm-update');
          expect(config.commitMessage.prefix).toBe('chore');
          expect(config.commitMessage.includeScope).toBe(true);
          expect(config.openPullRequestsLimit).toBe(10);
          expect(config.rebaseStrategy).toBe('auto');
          expect(config.dryRun).toBe(false);

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Auto-merge defaults
   * 
   * When auto-merge configuration is not provided, all auto-merge options
   * should use their documented defaults.
   */
  it('should use auto-merge defaults when not configured', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }), // Random github token
        (githubToken) => {
          // Setup mock to return only the github token
          mockCore.getInput.mockImplementation((name: string) => {
            if (name === 'github-token') {
              return githubToken;
            }
            return '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify auto-merge defaults
          expect(config.autoMerge.enabled).toBe(false);
          expect(config.autoMerge.updateTypes).toEqual(['patch']);
          expect(config.autoMerge.requireCIPass).toBe(true);
          expect(config.autoMerge.requireApprovals).toBe(0);

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Commit message defaults
   * 
   * When commit message configuration is not provided, all commit message
   * options should use their documented defaults.
   */
  it('should use commit message defaults when not configured', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }), // Random github token
        (githubToken) => {
          // Setup mock to return only the github token
          mockCore.getInput.mockImplementation((name: string) => {
            if (name === 'github-token') {
              return githubToken;
            }
            return '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify commit message defaults
          expect(config.commitMessage.prefix).toBe('chore');
          expect(config.commitMessage.includeScope).toBe(true);
          expect(config.commitMessage.prefixDevelopment).toBeUndefined();

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Array defaults
   * 
   * When array configuration options are not provided, they should default
   * to their documented default arrays (which may be empty or populated).
   */
  it('should use array defaults when not configured', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }), // Random github token
        (githubToken) => {
          // Setup mock to return only the github token
          mockCore.getInput.mockImplementation((name: string) => {
            if (name === 'github-token') {
              return githubToken;
            }
            return '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify array defaults
          expect(config.includePaths).toEqual(['**/*.yaml', '**/*.yml']);
          expect(config.excludePaths).toEqual(['node_modules/**', 'dist/**', '.git/**']);
          expect(config.prLabels).toEqual(['dependencies', 'argocd', 'helm']);
          expect(config.prAssignees).toEqual([]);
          expect(config.prReviewers).toEqual([]);
          expect(config.registryCredentials).toEqual([]);
          expect(config.ignore).toEqual([]);
          expect(config.autoMerge.updateTypes).toEqual(['patch']);

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Object defaults
   * 
   * When object configuration options (groups) are not provided, they should
   * default to empty objects.
   */
  it('should use object defaults when not configured', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }), // Random github token
        (githubToken) => {
          // Setup mock to return only the github token
          mockCore.getInput.mockImplementation((name: string) => {
            if (name === 'github-token') {
              return githubToken;
            }
            return '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify object defaults
          expect(config.groups).toEqual({});
          expect(Object.keys(config.groups)).toHaveLength(0);

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Numeric defaults
   * 
   * When numeric configuration options are not provided, they should use
   * their documented default numeric values.
   */
  it('should use numeric defaults when not configured', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }), // Random github token
        (githubToken) => {
          // Setup mock to return only the github token
          mockCore.getInput.mockImplementation((name: string) => {
            if (name === 'github-token') {
              return githubToken;
            }
            return '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify numeric defaults
          expect(config.openPullRequestsLimit).toBe(10);
          expect(config.autoMerge.requireApprovals).toBe(0);

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Boolean defaults
   * 
   * When boolean configuration options are not provided, they should use
   * their documented default boolean values.
   */
  it('should use boolean defaults when not configured', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }), // Random github token
        (githubToken) => {
          // Setup mock to return only the github token
          mockCore.getInput.mockImplementation((name: string) => {
            if (name === 'github-token') {
              return githubToken;
            }
            return '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify boolean defaults
          expect(config.dryRun).toBe(false);
          expect(config.autoMerge.enabled).toBe(false);
          expect(config.autoMerge.requireCIPass).toBe(true);
          expect(config.commitMessage.includeScope).toBe(true);

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Defaults are consistent across multiple loads
   * 
   * For any number of configuration loads with no inputs, the defaults
   * should be consistent and identical.
   */
  it('should provide consistent defaults across multiple loads', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }), // Random github token
        fc.integer({ min: 2, max: 10 }), // Number of loads to perform
        (githubToken, numLoads) => {
          // Setup mock to return only the github token
          mockCore.getInput.mockImplementation((name: string) => {
            if (name === 'github-token') {
              return githubToken;
            }
            return '';
          });

          // Load configuration multiple times
          const configs = [];
          for (let i = 0; i < numLoads; i++) {
            configs.push(ConfigurationManager.load());
          }

          // Verify all configs are identical
          for (let i = 1; i < configs.length; i++) {
            expect(configs[i]).toEqual(configs[0]);
          }

          // Verify all configurations are valid
          for (const config of configs) {
            const validation = ConfigurationManager.validate(config);
            expect(validation.valid).toBe(true);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});
