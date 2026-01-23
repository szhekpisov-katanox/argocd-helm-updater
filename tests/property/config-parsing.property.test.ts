/**
 * Property-based tests for ConfigurationManager
 * 
 * **Property 24: Configuration Parsing Completeness**
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**
 * 
 * For any valid configuration input (file patterns, update strategy, credentials, 
 * PR options, grouping strategy, branch naming), all configuration values should 
 * be correctly loaded and accessible.
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

describe('Property: Configuration Parsing Completeness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
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
   * Custom arbitraries for generating valid configuration values
   */
  
  const arbUpdateStrategy = fc.constantFrom('major', 'minor', 'patch', 'all');
  
  const arbPRStrategy = fc.constantFrom('single', 'per-chart', 'per-manifest');
  
  const arbLogLevel = fc.constantFrom('debug', 'info', 'warn', 'error');
  
  const arbRebaseStrategy = fc.constantFrom('auto', 'disabled');
  
  const arbGlobPattern = fc.oneof(
    fc.constant('**/*.yaml'),
    fc.constant('**/*.yml'),
    fc.constant('apps/**/*.yaml'),
    fc.constant('manifests/**/*.yml'),
    fc.constant('*.yaml')
  );
  
  const arbGlobPatterns = fc.array(arbGlobPattern, { minLength: 1, maxLength: 5 });
  
  const arbLabel = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,48}[a-zA-Z0-9]$/);
  
  const arbLabels = fc.array(arbLabel, { minLength: 0, maxLength: 5 });
  
  const arbUsername = fc.stringMatching(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/);
  
  const arbUsernames = fc.array(arbUsername, { minLength: 0, maxLength: 3 });
  
  const arbBranchPrefix = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,18}[a-zA-Z0-9]$/);
  
  const arbCommitPrefix = fc.constantFrom(
    'feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'
  );
  
  const arbUpdateType = fc.constantFrom('major', 'minor', 'patch');
  
  const arbUpdateTypes = fc.array(arbUpdateType, { minLength: 1, maxLength: 3 }).map(arr => [...new Set(arr)]);
  
  const arbRegistryCredential = fc.record({
    registry: fc.oneof(
      fc.webUrl(),
      fc.domain()
    ),
    username: fc.string({ minLength: 1, maxLength: 20 }),
    password: fc.string({ minLength: 1, maxLength: 20 }),
  });
  
  const arbRegistryCredentials = fc.array(arbRegistryCredential, { minLength: 0, maxLength: 3 });
  
  const arbDependencyGroup = fc.record({
    patterns: fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 3 }),
    updateTypes: fc.option(arbUpdateTypes, { nil: undefined }),
  });
  
  const arbGroups = fc.dictionary(
    fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
    arbDependencyGroup,
    { minKeys: 0, maxKeys: 3 }
  );
  
  const arbIgnoreRule = fc.record({
    dependencyName: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    versions: fc.option(
      fc.array(fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 3 }), 
      { nil: undefined }
    ),
    updateTypes: fc.option(arbUpdateTypes, { nil: undefined }),
  });
  
  const arbIgnoreRules = fc.array(arbIgnoreRule, { minLength: 0, maxLength: 3 });

  /**
   * Property 24: Configuration Parsing Completeness
   * 
   * For any valid configuration input, all configuration values should be 
   * correctly loaded and accessible in the returned ActionConfig object.
   */
  it('should correctly parse all configuration fields from action inputs', () => {
    fc.assert(
      fc.property(
        arbGlobPatterns,
        arbGlobPatterns,
        arbUpdateStrategy,
        arbPRStrategy,
        arbLabels,
        arbUsernames,
        arbUsernames,
        arbBranchPrefix,
        arbCommitPrefix,
        fc.boolean(),
        arbLogLevel,
        fc.boolean(),
        (
          includePaths,
          excludePaths,
          updateStrategy,
          prStrategy,
          prLabels,
          prAssignees,
          prReviewers,
          branchPrefix,
          commitPrefix,
          includeScope,
          logLevel,
          dryRun
        ) => {
          // Setup mock inputs
          mockCore.getInput.mockImplementation((name: string) => {
            const inputs: Record<string, string> = {
              'github-token': 'test-token-123',
              'include-paths': includePaths.join(','),
              'exclude-paths': excludePaths.join(','),
              'update-strategy': updateStrategy,
              'pr-strategy': prStrategy,
              'pr-labels': prLabels.join(','),
              'pr-assignees': prAssignees.join(','),
              'pr-reviewers': prReviewers.join(','),
              'branch-prefix': branchPrefix,
              'commit-message-prefix': commitPrefix,
              'commit-message-include-scope': includeScope.toString(),
              'log-level': logLevel,
              'dry-run': dryRun.toString(),
            };
            return inputs[name] || '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify all fields are correctly parsed
          expect(config.includePaths).toEqual(includePaths);
          expect(config.excludePaths).toEqual(excludePaths);
          expect(config.updateStrategy).toBe(updateStrategy);
          expect(config.prStrategy).toBe(prStrategy);
          // If prLabels is empty, defaults are used
          if (prLabels.length > 0) {
            expect(config.prLabels).toEqual(prLabels);
          } else {
            expect(config.prLabels).toEqual(['dependencies', 'argocd', 'helm']);
          }
          expect(config.prAssignees).toEqual(prAssignees);
          expect(config.prReviewers).toEqual(prReviewers);
          expect(config.branchPrefix).toBe(branchPrefix);
          expect(config.commitMessage.prefix).toBe(commitPrefix);
          expect(config.commitMessage.includeScope).toBe(includeScope);
          expect(config.logLevel).toBe(logLevel);
          expect(config.dryRun).toBe(dryRun);
          expect(config.githubToken).toBe('test-token-123');

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Registry credentials parsing
   * 
   * For any valid registry credentials, they should be correctly parsed 
   * from JSON input and accessible in the configuration.
   */
  it('should correctly parse registry credentials from JSON input', () => {
    fc.assert(
      fc.property(
        arbRegistryCredentials,
        (credentials) => {
          // Setup mock inputs
          mockCore.getInput.mockImplementation((name: string) => {
            const inputs: Record<string, string> = {
              'github-token': 'test-token',
              'registry-credentials': JSON.stringify(credentials),
            };
            return inputs[name] || '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify credentials are correctly parsed
          expect(config.registryCredentials).toEqual(credentials);

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Dependency groups parsing
   * 
   * For any valid dependency groups, they should be correctly parsed 
   * from JSON input and accessible in the configuration.
   */
  it('should correctly parse dependency groups from JSON input', () => {
    fc.assert(
      fc.property(
        arbGroups,
        (groups) => {
          // Setup mock inputs
          mockCore.getInput.mockImplementation((name: string) => {
            const inputs: Record<string, string> = {
              'github-token': 'test-token',
              groups: JSON.stringify(groups),
            };
            return inputs[name] || '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify groups are correctly parsed
          expect(config.groups).toEqual(groups);

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Ignore rules parsing
   * 
   * For any valid ignore rules, they should be correctly parsed 
   * from JSON input and accessible in the configuration.
   */
  it('should correctly parse ignore rules from JSON input', () => {
    fc.assert(
      fc.property(
        arbIgnoreRules,
        (ignoreRules) => {
          // Setup mock inputs
          mockCore.getInput.mockImplementation((name: string) => {
            const inputs: Record<string, string> = {
              'github-token': 'test-token',
              ignore: JSON.stringify(ignoreRules),
            };
            return inputs[name] || '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify ignore rules are correctly parsed
          expect(config.ignore).toEqual(ignoreRules);

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Auto-merge configuration parsing
   * 
   * For any valid auto-merge configuration, it should be correctly parsed 
   * and accessible in the configuration.
   */
  it('should correctly parse auto-merge configuration from inputs', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        arbUpdateTypes,
        fc.boolean(),
        fc.integer({ min: 0, max: 5 }),
        (enabled, updateTypes, requireCIPass, requireApprovals) => {
          // Setup mock inputs
          mockCore.getInput.mockImplementation((name: string) => {
            const inputs: Record<string, string> = {
              'github-token': 'test-token',
              'auto-merge-enabled': enabled.toString(),
              'auto-merge-update-types': updateTypes.join(','),
              'auto-merge-require-ci-pass': requireCIPass.toString(),
              'auto-merge-require-approvals': requireApprovals.toString(),
            };
            return inputs[name] || '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify auto-merge config is correctly parsed
          expect(config.autoMerge.enabled).toBe(enabled);
          expect(config.autoMerge.updateTypes).toEqual(updateTypes);
          expect(config.autoMerge.requireCIPass).toBe(requireCIPass);
          expect(config.autoMerge.requireApprovals).toBe(requireApprovals);

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Numeric configuration parsing
   * 
   * For any valid numeric configuration values, they should be correctly 
   * parsed from string inputs to numbers.
   */
  it('should correctly parse numeric configuration values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        arbRebaseStrategy,
        (openPRLimit, rebaseStrategy) => {
          // Setup mock inputs
          mockCore.getInput.mockImplementation((name: string) => {
            const inputs: Record<string, string> = {
              'github-token': 'test-token',
              'open-pull-requests-limit': openPRLimit.toString(),
              'rebase-strategy': rebaseStrategy,
            };
            return inputs[name] || '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify numeric values are correctly parsed
          expect(config.openPullRequestsLimit).toBe(openPRLimit);
          expect(config.rebaseStrategy).toBe(rebaseStrategy);

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty comma-separated values handling
   * 
   * For any comma-separated input with empty values, the parser should 
   * filter out empty strings. If the input results in an empty array after
   * filtering, it should be set to empty array (not defaults).
   */
  it('should filter out empty values from comma-separated inputs', () => {
    fc.assert(
      fc.property(
        fc.array(fc.option(arbLabel, { nil: '' }), { minLength: 1, maxLength: 10 })
          .filter(labels => labels.join(',').trim().length > 0), // Ensure input is not empty string
        (labels) => {
          // Setup mock inputs with potentially empty values
          mockCore.getInput.mockImplementation((name: string) => {
            const inputs: Record<string, string> = {
              'github-token': 'test-token',
              'pr-labels': labels.join(','),
            };
            return inputs[name] || '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify empty values are filtered out
          const expectedLabels = labels.filter(l => l && l.trim().length > 0);
          expect(config.prLabels).toEqual(expectedLabels);

          // If there are valid labels, configuration should be valid
          if (expectedLabels.length > 0) {
            const validation = ConfigurationManager.validate(config);
            // May be invalid if labels don't meet other criteria, but should not crash
            expect(validation).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Whitespace trimming
   * 
   * For any comma-separated input with whitespace, the parser should 
   * trim whitespace from each value.
   */
  it('should trim whitespace from comma-separated values', () => {
    fc.assert(
      fc.property(
        fc.array(arbLabel, { minLength: 1, maxLength: 5 }),
        (labels) => {
          // Add random whitespace around labels
          const labelsWithWhitespace = labels.map(l => {
            const spaces = ' '.repeat(Math.floor(Math.random() * 3));
            return `${spaces}${l}${spaces}`;
          });

          // Setup mock inputs
          mockCore.getInput.mockImplementation((name: string) => {
            const inputs: Record<string, string> = {
              'github-token': 'test-token',
              'pr-labels': labelsWithWhitespace.join(','),
            };
            return inputs[name] || '';
          });

          // Load configuration
          const config = ConfigurationManager.load();

          // Verify whitespace is trimmed
          expect(config.prLabels).toEqual(labels);

          // Verify configuration is valid
          const validation = ConfigurationManager.validate(config);
          expect(validation.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
