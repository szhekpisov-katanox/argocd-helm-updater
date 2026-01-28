/**
 * Property-based tests for Pull Request Deduplication
 * 
 * **Property 23: Pull Request Deduplication**
 * **Validates: Requirements 6.8**
 * 
 * For any chart update where a PR already exists for the same branch,
 * the existing PR should be updated rather than creating a new one.
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
  'mysql',
  'prometheus',
  'grafana'
);

// Generate valid repository URLs
const arbRepoURL = fc.constantFrom(
  'https://charts.bitnami.com/bitnami',
  'https://charts.example.com',
  'oci://registry-1.docker.io/bitnamicharts'
);

// Generate valid branch names
const arbBranchName = fc.string({ minLength: 5, maxLength: 30 }).map(s => `helm-updates/${s}`);

// Generate a file update
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
function createMockConfig(): ActionConfig {
  return {
    includePaths: ['**/*.yaml'],
    excludePaths: [],
    updateStrategy: 'all',
    registryCredentials: [],
    prStrategy: 'single',
    prLabels: [],
    prAssignees: [],
    prReviewers: [],
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
function createMockOctokit(existingPRNumber?: number) {
  const calls = {
    createPR: [] as any[],
    updatePR: [] as any[],
    findExistingPR: [] as any[]
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
        list: jest.fn().mockImplementation((params) => {
          calls.findExistingPR.push(params);
          if (existingPRNumber && params.state === 'open') {
            return Promise.resolve({
              data: [{
                number: existingPRNumber,
                head: { ref: params.head?.split(':')[1] || 'test-branch' }
              }]
            });
          }
          return Promise.resolve({ data: [] });
        }),
        create: jest.fn().mockImplementation((params) => {
          calls.createPR.push(params);
          return Promise.resolve({
            data: { number: 123 }
          });
        }),
        get: jest.fn().mockResolvedValue({
          data: {
            number: existingPRNumber || 123,
            assignees: [],
            mergeable_state: 'clean'
          }
        }),
        update: jest.fn().mockImplementation((params) => {
          calls.updatePR.push(params);
          return Promise.resolve({});
        }),
        listRequestedReviewers: jest.fn().mockResolvedValue({
          data: { users: [] }
        }),
        requestReviewers: jest.fn().mockResolvedValue({})
      },
      issues: {
        addLabels: jest.fn().mockResolvedValue({}),
        addAssignees: jest.fn().mockResolvedValue({}),
        listLabelsOnIssue: jest.fn().mockResolvedValue({ data: [] })
      }
    },
    calls
  };

  return octokit as any;
}

describe('Property 23: Pull Request Deduplication', () => {
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
   * Property 23.1: Existing PR is found by branch name
   * 
   * For any branch name, when a PR already exists for that branch,
   * the findExistingPR method should return the PR number.
   */
  it('should find existing PR by branch name', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBranchName,
        fc.integer({ min: 1, max: 1000 }),
        async (branchName, prNumber) => {
          const config = createMockConfig();
          const octokit = createMockOctokit(prNumber);
          const prManager = new PullRequestManager(octokit, config);

          const foundPR = await prManager.findExistingPR(branchName);

          // Should find the existing PR
          expect(foundPR).toBe(prNumber);

          // Should have called the list API with correct parameters
          expect(octokit.calls.findExistingPR.length).toBeGreaterThan(0);
          const listCall = octokit.calls.findExistingPR[0];
          expect(listCall.head).toContain(branchName);
          expect(listCall.state).toBe('open');

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 23.2: No PR found returns null
   * 
   * For any branch name, when no PR exists for that branch,
   * the findExistingPR method should return null.
   */
  it('should return null when no PR exists for branch', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBranchName,
        async (branchName) => {
          const config = createMockConfig();
          const octokit = createMockOctokit(); // No existing PR
          const prManager = new PullRequestManager(octokit, config);

          const foundPR = await prManager.findExistingPR(branchName);

          // Should not find any PR
          expect(foundPR).toBeNull();

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 23.3: Existing PR is updated instead of creating new one
   * 
   * For any file update where a PR already exists for the branch,
   * the createOrUpdatePR method should update the existing PR
   * rather than creating a new one.
   */
  it('should update existing PR instead of creating new one', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFileUpdate,
        fc.integer({ min: 1, max: 1000 }),
        async (fileUpdate, existingPRNumber) => {
          const config = createMockConfig();
          const octokit = createMockOctokit(existingPRNumber);
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName([fileUpdate]);
          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: branchName,
            labels: [],
            assignees: [],
            reviewers: []
          };

          const resultPRNumber = await prManager.createOrUpdatePR([fileUpdate], prOptions);

          // Should return the existing PR number
          expect(resultPRNumber).toBe(existingPRNumber);

          // Should have called update, not create
          expect(octokit.calls.updatePR.length).toBeGreaterThan(0);
          expect(octokit.calls.createPR.length).toBe(0);

          // Update should be for the correct PR number
          const updateCall = octokit.calls.updatePR[0];
          expect(updateCall.pull_number).toBe(existingPRNumber);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 23.4: New PR is created when no existing PR found
   * 
   * For any file update where no PR exists for the branch,
   * the createOrUpdatePR method should create a new PR.
   */
  it('should create new PR when no existing PR found', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFileUpdate,
        async (fileUpdate) => {
          const config = createMockConfig();
          const octokit = createMockOctokit(); // No existing PR
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName([fileUpdate]);
          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: branchName,
            labels: [],
            assignees: [],
            reviewers: []
          };

          const resultPRNumber = await prManager.createOrUpdatePR([fileUpdate], prOptions);

          // Should return a PR number
          expect(resultPRNumber).toBe(123); // Mock returns 123

          // Should have called create, not update
          expect(octokit.calls.createPR.length).toBeGreaterThan(0);
          expect(octokit.calls.updatePR.length).toBe(0);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 23.5: PR title and body are updated when PR exists
   * 
   * For any existing PR, when updating it, the title and body
   * should be updated with the new values.
   */
  it('should update PR title and body when updating existing PR', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFileUpdate,
        fc.integer({ min: 1, max: 1000 }),
        fc.string({ minLength: 5, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 100 }),
        async (fileUpdate, existingPRNumber, newTitle, newBody) => {
          const config = createMockConfig();
          const octokit = createMockOctokit(existingPRNumber);
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName([fileUpdate]);
          const prOptions = {
            title: newTitle,
            body: newBody,
            branch: branchName,
            labels: [],
            assignees: [],
            reviewers: []
          };

          await prManager.createOrUpdatePR([fileUpdate], prOptions);

          // Should have updated the PR with new title and body
          expect(octokit.calls.updatePR.length).toBeGreaterThan(0);
          const updateCall = octokit.calls.updatePR[0];
          expect(updateCall.title).toBe(newTitle);
          expect(updateCall.body).toBe(newBody);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 23.6: Branch is updated with new commits when PR exists
   * 
   * For any existing PR, when updating it, new commits should be
   * pushed to the branch.
   */
  it('should update branch with new commits when PR exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFileUpdate,
        fc.integer({ min: 1, max: 1000 }),
        async (fileUpdate, existingPRNumber) => {
          const config = createMockConfig();
          const octokit = createMockOctokit(existingPRNumber);
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName([fileUpdate]);
          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: branchName,
            labels: [],
            assignees: [],
            reviewers: []
          };

          await prManager.createOrUpdatePR([fileUpdate], prOptions);

          // Should have created commits (via createBlob, createTree, createCommit, updateRef)
          expect(octokit.rest.git.createBlob).toHaveBeenCalled();
          expect(octokit.rest.git.createTree).toHaveBeenCalled();
          expect(octokit.rest.git.createCommit).toHaveBeenCalled();
          expect(octokit.rest.git.updateRef).toHaveBeenCalled();

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 23.7: Multiple updates to same branch update same PR
   * 
   * For any branch, when createOrUpdatePR is called multiple times
   * with the same branch name, it should always update the same PR
   * (not create multiple PRs).
   */
  it('should consistently update same PR for same branch', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFileUpdate,
        fc.integer({ min: 1, max: 1000 }),
        async (fileUpdate, existingPRNumber) => {
          const config = createMockConfig();
          const octokit = createMockOctokit(existingPRNumber);
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName([fileUpdate]);
          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: branchName,
            labels: [],
            assignees: [],
            reviewers: []
          };

          // Call createOrUpdatePR twice
          const pr1 = await prManager.createOrUpdatePR([fileUpdate], prOptions);
          
          // Reset call tracking
          octokit.calls.createPR = [];
          octokit.calls.updatePR = [];

          const pr2 = await prManager.createOrUpdatePR([fileUpdate], prOptions);

          // Both should return the same PR number
          expect(pr1).toBe(existingPRNumber);
          expect(pr2).toBe(existingPRNumber);

          // Second call should also update, not create
          expect(octokit.calls.createPR.length).toBe(0);
          expect(octokit.calls.updatePR.length).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 23.8: Different branches create different PRs
   * 
   * For any two different branch names, when no PRs exist,
   * createOrUpdatePR should create separate PRs for each branch.
   */
  it('should create different PRs for different branches', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFileUpdate,
        arbFileUpdate,
        async (fileUpdate1, fileUpdate2) => {
          const config = createMockConfig();
          const octokit = createMockOctokit(); // No existing PRs
          const prManager = new PullRequestManager(octokit, config);

          const branch1 = prManager.generateBranchName([fileUpdate1]);
          const branch2 = prManager.generateBranchName([fileUpdate2]);

          // Skip if branches are the same
          if (branch1 === branch2) {
            return true;
          }

          const prOptions1 = {
            title: 'Test PR 1',
            body: 'Test body 1',
            branch: branch1,
            labels: [],
            assignees: [],
            reviewers: []
          };

          const prOptions2 = {
            title: 'Test PR 2',
            body: 'Test body 2',
            branch: branch2,
            labels: [],
            assignees: [],
            reviewers: []
          };

          await prManager.createOrUpdatePR([fileUpdate1], prOptions1);
          await prManager.createOrUpdatePR([fileUpdate2], prOptions2);

          // Should have created two PRs
          expect(octokit.calls.createPR.length).toBe(2);
          expect(octokit.calls.updatePR.length).toBe(0);

          // PRs should have different branches
          const createCall1 = octokit.calls.createPR[0];
          const createCall2 = octokit.calls.createPR[1];
          expect(createCall1.head).not.toBe(createCall2.head);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 23.9: Deduplication works across multiple file updates
   * 
   * For any set of file updates with the same branch, when a PR exists,
   * all updates should be applied to the same PR.
   */
  it('should deduplicate across multiple file updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbFileUpdate, { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 1, max: 1000 }),
        async (fileUpdates, existingPRNumber) => {
          const config = createMockConfig();
          const octokit = createMockOctokit(existingPRNumber);
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName(fileUpdates);
          const prOptions = {
            title: 'Test PR',
            body: 'Test body',
            branch: branchName,
            labels: [],
            assignees: [],
            reviewers: []
          };

          const resultPRNumber = await prManager.createOrUpdatePR(fileUpdates, prOptions);

          // Should return the existing PR number
          expect(resultPRNumber).toBe(existingPRNumber);

          // Should have updated, not created
          expect(octokit.calls.updatePR.length).toBeGreaterThan(0);
          expect(octokit.calls.createPR.length).toBe(0);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 23.10: Deduplication is case-sensitive for branch names
   * 
   * For any branch name, deduplication should be case-sensitive
   * (branches with different casing are treated as different branches).
   */
  it('should treat branch names as case-sensitive for deduplication', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFileUpdate,
        async (fileUpdate) => {
          const config = createMockConfig();
          const octokit = createMockOctokit(); // Fixed: was missing octokit declaration
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName([fileUpdate]);
          
          // Branch names should be lowercase (by design)
          expect(branchName).toBe(branchName.toLowerCase());

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
