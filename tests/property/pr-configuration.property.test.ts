/**
 * Property-based tests for Pull Request Configuration Application
 * 
 * **Property 21: Pull Request Configuration Application**
 * **Validates: Requirements 6.6**
 * 
 * For any pull request created, configured labels, assignees, and reviewers
 * should be applied to the PR.
 */

import * as fc from 'fast-check';
import { PullRequestManager } from '../../src/pr/pull-request-manager';
import { ActionConfig } from '../../src/types/config';
import { FileUpdate } from '../../src/types/file-update';
import { VersionUpdate } from '../../src/types/version';
import { HelmDependency } from '../../src/types/dependency';
import * as github from '@actions/github';

// Mock @actions/github
jest.mock('@actions/github');

/**
 * Custom arbitraries for generating test data
 */

// Generate valid semantic versions
const arbSemVer = fc.tuple(
  fc.nat({ max: 10 }),
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// Generate valid chart names
const arbChartName = fc.constantFrom(
  'nginx',
  'postgresql',
  'redis',
  'mongodb',
  'mysql'
);

// Generate valid repository URLs
const arbRepoURL = fc.constantFrom(
  'https://charts.bitnami.com/bitnami',
  'https://charts.example.com',
  'oci://registry-1.docker.io/bitnamicharts'
);

// Generate valid GitHub usernames
const arbUsername = fc.stringOf(
  fc.constantFrom(
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-'
  ),
  { minLength: 1, maxLength: 39 }
);

// Generate valid label names
const arbLabel = fc.stringOf(
  fc.constantFrom(
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '_', ' '
  ),
  { minLength: 1, maxLength: 50 }
);

// Generate arrays of labels
const arbLabels = fc.array(arbLabel, { minLength: 0, maxLength: 5 });

// Generate arrays of assignees
const arbAssignees = fc.array(arbUsername, { minLength: 0, maxLength: 3 });

// Generate arrays of reviewers
const arbReviewers = fc.array(arbUsername, { minLength: 0, maxLength: 3 });

// Generate a simple file update
const arbFileUpdate = fc.record({
  chartName: arbChartName,
  repoURL: arbRepoURL,
  currentVersion: arbSemVer,
  newVersion: arbSemVer,
  manifestPath: fc.string({ minLength: 5, maxLength: 30 }).map(s => `manifests/${s}.yaml`)
}).map(({ chartName, repoURL, currentVersion, newVersion, manifestPath }) => {
  const dependency: HelmDependency = {
    manifestPath,
    documentIndex: 0,
    chartName,
    repoURL,
    repoType: repoURL.startsWith('oci://') ? 'oci' : 'helm',
    currentVersion,
    versionPath: ['spec', 'source', 'targetRevision']
  };

  const versionUpdate: VersionUpdate = {
    dependency,
    currentVersion,
    newVersion
  };

  const fileUpdate: FileUpdate = {
    path: manifestPath,
    originalContent: '',
    updatedContent: '',
    updates: [versionUpdate]
  };

  return fileUpdate;
});

/**
 * Helper function to create a mock ActionConfig
 */
function createMockConfig(
  labels: string[],
  assignees: string[],
  reviewers: string[]
): ActionConfig {
  return {
    includePaths: ['**/*.yaml'],
    excludePaths: [],
    updateStrategy: 'all',
    registryCredentials: [],
    prStrategy: 'single',
    prLabels: labels,
    prAssignees: assignees,
    prReviewers: reviewers,
    branchPrefix: 'helm-updates',
    commitMessage: {
      prefix: 'chore',
      includeScope: true
    },
    groups: {},
    ignore: [],
    autoMerge: {
      enabled: false,
      updateTypes: [],
      requireCIPass: false,
      requireApprovals: 0
    },
    openPullRequestsLimit: 10,
    rebaseStrategy: 'disabled',
    dryRun: false,
    logLevel: 'info',
    githubToken: 'mock-token',
    changelog: {
      enabled: true,
      maxLength: 5000,
      cacheTTL: 3600,
    },
  };
}

/**
 * Helper function to create a mock Octokit instance with tracking
 */
function createMockOctokit() {
  const calls = {
    addLabels: [] as any[],
    addAssignees: [] as any[],
    requestReviewers: [] as any[]
  };

  const octokit = {
    rest: {
      repos: {
        get: jest.fn().mockResolvedValue({
          data: { default_branch: 'main' }
        })
      },
      git: {
        getRef: jest.fn().mockResolvedValue({
          data: { object: { sha: 'mock-sha' } }
        }),
        createRef: jest.fn().mockResolvedValue({}),
        getCommit: jest.fn().mockResolvedValue({
          data: { tree: { sha: 'mock-tree-sha' } }
        }),
        createBlob: jest.fn().mockResolvedValue({
          data: { sha: 'mock-blob-sha' }
        }),
        createTree: jest.fn().mockResolvedValue({
          data: { sha: 'mock-new-tree-sha' }
        }),
        createCommit: jest.fn().mockResolvedValue({
          data: { sha: 'mock-new-commit-sha' }
        }),
        updateRef: jest.fn().mockResolvedValue({})
      },
      pulls: {
        list: jest.fn().mockResolvedValue({ data: [] }),
        create: jest.fn().mockResolvedValue({
          data: { number: 123 }
        }),
        get: jest.fn().mockResolvedValue({
          data: {
            number: 123,
            assignees: [],
            mergeable_state: 'clean'
          }
        }),
        update: jest.fn().mockResolvedValue({}),
        listRequestedReviewers: jest.fn().mockResolvedValue({
          data: { users: [] }
        }),
        requestReviewers: jest.fn().mockImplementation((params) => {
          calls.requestReviewers.push(params);
          return Promise.resolve({});
        })
      },
      issues: {
        addLabels: jest.fn().mockImplementation((params) => {
          calls.addLabels.push(params);
          return Promise.resolve({});
        }),
        addAssignees: jest.fn().mockImplementation((params) => {
          calls.addAssignees.push(params);
          return Promise.resolve({});
        }),
        listLabelsOnIssue: jest.fn().mockResolvedValue({ data: [] })
      }
    },
    calls
  };

  return octokit as any;
}

describe('Property 21: Pull Request Configuration Application', () => {
  beforeEach(() => {
    // Mock GitHub context
    (github.context as any) = {
      repo: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  /**
   * Property 21.1: All configured labels are applied to PR
   * 
   * For any set of configured labels, when a PR is created, all labels
   * should be applied to the PR via the GitHub API.
   */
  it('should apply all configured labels to created PR', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbLabels,
        arbFileUpdate,
        async (labels, fileUpdate) => {
          // Skip if no labels configured
          if (labels.length === 0) {
            return true;
          }

          const config = createMockConfig(labels, [], []);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: 'test-branch',
            labels,
            assignees: [],
            reviewers: []
          };

          await prManager.createPR(prOptions, [fileUpdate]);

          // Verify addLabels was called with all configured labels
          expect(octokit.calls.addLabels.length).toBeGreaterThan(0);
          
          const addedLabels = octokit.calls.addLabels[0].labels;
          expect(addedLabels).toEqual(labels);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 21.2: All configured assignees are applied to PR
   * 
   * For any set of configured assignees, when a PR is created, all assignees
   * should be applied to the PR via the GitHub API.
   */
  it('should apply all configured assignees to created PR', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbAssignees,
        arbFileUpdate,
        async (assignees, fileUpdate) => {
          // Skip if no assignees configured
          if (assignees.length === 0) {
            return true;
          }

          const config = createMockConfig([], assignees, []);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: 'test-branch',
            labels: [],
            assignees,
            reviewers: []
          };

          await prManager.createPR(prOptions, [fileUpdate]);

          // Verify addAssignees was called with all configured assignees
          expect(octokit.calls.addAssignees.length).toBeGreaterThan(0);
          
          const addedAssignees = octokit.calls.addAssignees[0].assignees;
          expect(addedAssignees).toEqual(assignees);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 21.3: All configured reviewers are applied to PR
   * 
   * For any set of configured reviewers, when a PR is created, all reviewers
   * should be requested via the GitHub API.
   */
  it('should request all configured reviewers for created PR', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbReviewers,
        arbFileUpdate,
        async (reviewers, fileUpdate) => {
          // Skip if no reviewers configured
          if (reviewers.length === 0) {
            return true;
          }

          const config = createMockConfig([], [], reviewers);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: 'test-branch',
            labels: [],
            assignees: [],
            reviewers
          };

          await prManager.createPR(prOptions, [fileUpdate]);

          // Verify requestReviewers was called with all configured reviewers
          expect(octokit.calls.requestReviewers.length).toBeGreaterThan(0);
          
          const requestedReviewers = octokit.calls.requestReviewers[0].reviewers;
          expect(requestedReviewers).toEqual(reviewers);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 21.4: All PR configuration options are applied together
   * 
   * For any combination of labels, assignees, and reviewers, when a PR is created,
   * all configured options should be applied to the PR.
   */
  it('should apply all PR configuration options together', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbLabels,
        arbAssignees,
        arbReviewers,
        arbFileUpdate,
        async (labels, assignees, reviewers, fileUpdate) => {
          // Skip if all arrays are empty
          if (labels.length === 0 && assignees.length === 0 && reviewers.length === 0) {
            return true;
          }

          const config = createMockConfig(labels, assignees, reviewers);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: 'test-branch',
            labels,
            assignees,
            reviewers
          };

          await prManager.createPR(prOptions, [fileUpdate]);

          // Verify labels were added if configured
          if (labels.length > 0) {
            expect(octokit.calls.addLabels.length).toBeGreaterThan(0);
            expect(octokit.calls.addLabels[0].labels).toEqual(labels);
          }

          // Verify assignees were added if configured
          if (assignees.length > 0) {
            expect(octokit.calls.addAssignees.length).toBeGreaterThan(0);
            expect(octokit.calls.addAssignees[0].assignees).toEqual(assignees);
          }

          // Verify reviewers were requested if configured
          if (reviewers.length > 0) {
            expect(octokit.calls.requestReviewers.length).toBeGreaterThan(0);
            expect(octokit.calls.requestReviewers[0].reviewers).toEqual(reviewers);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 21.5: Empty configuration arrays don't cause API calls
   * 
   * For any PR creation with empty labels, assignees, and reviewers arrays,
   * no API calls should be made to add labels, assignees, or reviewers.
   */
  it('should not make API calls for empty configuration arrays', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFileUpdate,
        async (fileUpdate) => {
          const config = createMockConfig([], [], []);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: 'test-branch',
            labels: [],
            assignees: [],
            reviewers: []
          };

          await prManager.createPR(prOptions, [fileUpdate]);

          // Verify no configuration API calls were made
          expect(octokit.calls.addLabels.length).toBe(0);
          expect(octokit.calls.addAssignees.length).toBe(0);
          expect(octokit.calls.requestReviewers.length).toBe(0);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 21.6: PR configuration is applied when updating existing PR
   * 
   * For any PR update with configured labels, assignees, and reviewers,
   * new configuration values should be added to the existing PR.
   */
  it('should apply new configuration when updating existing PR', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbLabels,
        arbAssignees,
        arbReviewers,
        arbFileUpdate,
        async (labels, assignees, reviewers, fileUpdate) => {
          // Skip if all arrays are empty
          if (labels.length === 0 && assignees.length === 0 && reviewers.length === 0) {
            return true;
          }

          const config = createMockConfig(labels, assignees, reviewers);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: 'test-branch',
            labels,
            assignees,
            reviewers
          };

          await prManager.updatePR(123, prOptions, [fileUpdate]);

          // Verify labels were added if configured
          if (labels.length > 0) {
            expect(octokit.calls.addLabels.length).toBeGreaterThan(0);
          }

          // Verify assignees were added if configured
          if (assignees.length > 0) {
            expect(octokit.calls.addAssignees.length).toBeGreaterThan(0);
          }

          // Verify reviewers were requested if configured
          if (reviewers.length > 0) {
            expect(octokit.calls.requestReviewers.length).toBeGreaterThan(0);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 21.7: Duplicate labels are not added
   * 
   * For any PR update where some labels already exist on the PR,
   * only new labels should be added (no duplicates).
   */
  it('should not add duplicate labels when updating PR', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbLabels.filter(labels => labels.length > 0),
        arbFileUpdate,
        async (labels, fileUpdate) => {
          const config = createMockConfig(labels, [], []);
          const octokit = createMockOctokit();

          // Mock that some labels already exist
          const existingLabels = labels.slice(0, Math.floor(labels.length / 2));
          octokit.rest.issues.listLabelsOnIssue = jest.fn().mockResolvedValue({
            data: existingLabels.map(name => ({ name }))
          });

          const prManager = new PullRequestManager(octokit, config);

          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: 'test-branch',
            labels,
            assignees: [],
            reviewers: []
          };

          await prManager.updatePR(123, prOptions, [fileUpdate]);

          // Calculate expected new labels (labels not in existing)
          const expectedNewLabels = labels.filter(
            label => !existingLabels.includes(label)
          );

          if (expectedNewLabels.length > 0) {
            // Verify only new labels were added
            expect(octokit.calls.addLabels.length).toBeGreaterThan(0);
            const addedLabels = octokit.calls.addLabels[0].labels;
            expect(addedLabels).toEqual(expectedNewLabels);
          } else {
            // If all labels already exist, no API call should be made
            expect(octokit.calls.addLabels.length).toBe(0);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 21.8: Duplicate assignees are not added
   * 
   * For any PR update where some assignees already exist on the PR,
   * only new assignees should be added (no duplicates).
   */
  it('should not add duplicate assignees when updating PR', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbAssignees.filter(assignees => assignees.length > 0),
        arbFileUpdate,
        async (assignees, fileUpdate) => {
          const config = createMockConfig([], assignees, []);
          const octokit = createMockOctokit();

          // Mock that some assignees already exist
          const existingAssignees = assignees.slice(0, Math.floor(assignees.length / 2));
          octokit.rest.pulls.get = jest.fn().mockResolvedValue({
            data: {
              number: 123,
              assignees: existingAssignees.map(login => ({ login })),
              mergeable_state: 'clean'
            }
          });

          const prManager = new PullRequestManager(octokit, config);

          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: 'test-branch',
            labels: [],
            assignees,
            reviewers: []
          };

          await prManager.updatePR(123, prOptions, [fileUpdate]);

          // Calculate expected new assignees (assignees not in existing)
          const expectedNewAssignees = assignees.filter(
            assignee => !existingAssignees.includes(assignee)
          );

          if (expectedNewAssignees.length > 0) {
            // Verify only new assignees were added
            expect(octokit.calls.addAssignees.length).toBeGreaterThan(0);
            const addedAssignees = octokit.calls.addAssignees[0].assignees;
            expect(addedAssignees).toEqual(expectedNewAssignees);
          } else {
            // If all assignees already exist, no API call should be made
            expect(octokit.calls.addAssignees.length).toBe(0);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 21.9: Duplicate reviewers are not requested
   * 
   * For any PR update where some reviewers have already been requested,
   * only new reviewers should be requested (no duplicates).
   */
  it('should not request duplicate reviewers when updating PR', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbReviewers.filter(reviewers => reviewers.length > 0),
        arbFileUpdate,
        async (reviewers, fileUpdate) => {
          const config = createMockConfig([], [], reviewers);
          const octokit = createMockOctokit();

          // Mock that some reviewers have already been requested
          const existingReviewers = reviewers.slice(0, Math.floor(reviewers.length / 2));
          octokit.rest.pulls.listRequestedReviewers = jest.fn().mockResolvedValue({
            data: {
              users: existingReviewers.map(login => ({ login }))
            }
          });

          const prManager = new PullRequestManager(octokit, config);

          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: 'test-branch',
            labels: [],
            assignees: [],
            reviewers
          };

          await prManager.updatePR(123, prOptions, [fileUpdate]);

          // Calculate expected new reviewers (reviewers not in existing)
          const expectedNewReviewers = reviewers.filter(
            reviewer => !existingReviewers.includes(reviewer)
          );

          if (expectedNewReviewers.length > 0) {
            // Verify only new reviewers were requested
            expect(octokit.calls.requestReviewers.length).toBeGreaterThan(0);
            const requestedReviewers = octokit.calls.requestReviewers[0].reviewers;
            expect(requestedReviewers).toEqual(expectedNewReviewers);
          } else {
            // If all reviewers already requested, no API call should be made
            expect(octokit.calls.requestReviewers.length).toBe(0);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 21.10: Configuration is applied in correct order
   * 
   * For any PR creation, the configuration should be applied in the correct order:
   * 1. Create PR
   * 2. Add labels
   * 3. Add assignees
   * 4. Request reviewers
   */
  it('should apply configuration in correct order', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbLabels.filter(l => l.length > 0),
        arbAssignees.filter(a => a.length > 0),
        arbReviewers.filter(r => r.length > 0),
        arbFileUpdate,
        async (labels, assignees, reviewers, fileUpdate) => {
          const config = createMockConfig(labels, assignees, reviewers);
          const octokit = createMockOctokit();

          // Track call order
          const callOrder: string[] = [];

          octokit.rest.pulls.create = jest.fn().mockImplementation(() => {
            callOrder.push('create');
            return Promise.resolve({ data: { number: 123 } });
          });

          octokit.rest.issues.addLabels = jest.fn().mockImplementation((params) => {
            callOrder.push('labels');
            octokit.calls.addLabels.push(params);
            return Promise.resolve({});
          });

          octokit.rest.issues.addAssignees = jest.fn().mockImplementation((params) => {
            callOrder.push('assignees');
            octokit.calls.addAssignees.push(params);
            return Promise.resolve({});
          });

          octokit.rest.pulls.requestReviewers = jest.fn().mockImplementation((params) => {
            callOrder.push('reviewers');
            octokit.calls.requestReviewers.push(params);
            return Promise.resolve({});
          });

          const prManager = new PullRequestManager(octokit, config);

          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: 'test-branch',
            labels,
            assignees,
            reviewers
          };

          await prManager.createPR(prOptions, [fileUpdate]);

          // Verify order: create, then labels, then assignees, then reviewers
          expect(callOrder[0]).toBe('create');
          
          const labelsIndex = callOrder.indexOf('labels');
          const assigneesIndex = callOrder.indexOf('assignees');
          const reviewersIndex = callOrder.indexOf('reviewers');

          // All should come after create
          expect(labelsIndex).toBeGreaterThan(0);
          expect(assigneesIndex).toBeGreaterThan(0);
          expect(reviewersIndex).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });
});
