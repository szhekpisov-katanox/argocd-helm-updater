/**
 * Property-based tests for Branch Naming Convention
 * 
 * **Property 19: Branch Naming Convention**
 * **Validates: Requirements 6.2**
 * 
 * For any set of updates, the created branch name should follow the configured
 * naming convention and include relevant chart information.
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
  'grafana',
  'elasticsearch'
);

// Generate valid repository URLs
const arbRepoURL = fc.constantFrom(
  'https://charts.bitnami.com/bitnami',
  'https://charts.example.com',
  'https://kubernetes-charts.storage.googleapis.com',
  'oci://registry-1.docker.io/bitnamicharts',
  'oci://ghcr.io/myorg/charts'
);

// Generate valid branch prefixes
const arbBranchPrefix = fc.constantFrom(
  'helm-updates',
  'argocd-updates',
  'deps',
  'update',
  'charts'
);

// Generate a file update with a single chart update
const arbSingleChartFileUpdate = fc.record({
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

// Generate multiple file updates with different charts
const arbMultipleChartFileUpdates = fc.array(
  arbSingleChartFileUpdate,
  { minLength: 2, maxLength: 5 }
);

/**
 * Helper function to create a mock ActionConfig
 */
function createMockConfig(branchPrefix: string): ActionConfig {
  return {
    includePaths: ['**/*.yaml'],
    excludePaths: [],
    updateStrategy: 'all',
    registryCredentials: [],
    prStrategy: 'single',
    prLabels: [],
    prAssignees: [],
    prReviewers: [],
    branchPrefix,
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
 * Helper function to create a mock Octokit instance
 */
function createMockOctokit(): ReturnType<typeof github.getOctokit> {
  return {} as ReturnType<typeof github.getOctokit>;
}

describe('Property 19: Branch Naming Convention', () => {
  beforeEach(() => {
    // Mock GitHub context
    (github.context as any) = {
      repo: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
    };
  });

  /**
   * Property 19.1: Branch prefix is always included
   * 
   * For any set of updates and any configured branch prefix, the generated
   * branch name should always start with the configured prefix.
   */
  it('should always include the configured branch prefix', () => {
    fc.assert(
      fc.property(
        arbBranchPrefix,
        fc.oneof(arbSingleChartFileUpdate.map(fu => [fu]), arbMultipleChartFileUpdates),
        (branchPrefix, fileUpdates) => {
          const config = createMockConfig(branchPrefix);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName(fileUpdates);

          // Branch name should start with the prefix
          expect(branchName.startsWith(branchPrefix + '/')).toBe(true);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 19.2: Single chart update includes chart name and version
   * 
   * For any single chart update, the branch name should include both the
   * chart name and the new version.
   */
  it('should include chart name and version for single chart updates', () => {
    fc.assert(
      fc.property(
        arbBranchPrefix,
        arbSingleChartFileUpdate,
        (branchPrefix, fileUpdate) => {
          // Skip if current and new versions are the same
          const update = fileUpdate.updates[0];
          if (update.currentVersion === update.newVersion) {
            return true;
          }

          const config = createMockConfig(branchPrefix);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName([fileUpdate]);

          // Branch name should include chart name
          expect(branchName).toContain(update.dependency.chartName);

          // Branch name should include new version
          expect(branchName).toContain(update.newVersion);

          // Branch name format should be: prefix/chartName-version
          const expectedFormat = `${branchPrefix}/${update.dependency.chartName}-${update.newVersion}`;
          expect(branchName).toBe(expectedFormat);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 19.3: Multiple chart updates use timestamp
   * 
   * For any set of multiple chart updates, the branch name should use a
   * timestamp instead of specific chart information.
   */
  it('should use timestamp for multiple chart updates', () => {
    fc.assert(
      fc.property(
        arbBranchPrefix,
        arbMultipleChartFileUpdates,
        (branchPrefix, fileUpdates) => {
          const config = createMockConfig(branchPrefix);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName(fileUpdates);

          // Branch name should start with prefix
          expect(branchName.startsWith(branchPrefix + '/')).toBe(true);

          // Branch name should contain 'helm-updates'
          expect(branchName).toContain('helm-updates');

          // Branch name should contain a timestamp (numeric value)
          const parts = branchName.split('-');
          const lastPart = parts[parts.length - 1];
          expect(/^\d+$/.test(lastPart)).toBe(true);

          // Branch name format should be: prefix/helm-updates-timestamp
          const expectedPattern = new RegExp(`^${branchPrefix}/helm-updates-\\d+$`);
          expect(branchName).toMatch(expectedPattern);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 19.4: Empty updates use timestamp fallback
   * 
   * For any empty set of updates, the branch name should use a timestamp
   * as a fallback.
   */
  it('should use timestamp fallback for empty updates', () => {
    fc.assert(
      fc.property(
        arbBranchPrefix,
        (branchPrefix) => {
          const config = createMockConfig(branchPrefix);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName([]);

          // Branch name should start with prefix
          expect(branchName.startsWith(branchPrefix + '/')).toBe(true);

          // Branch name should contain 'helm-updates'
          expect(branchName).toContain('helm-updates');

          // Branch name should contain a timestamp
          const parts = branchName.split('-');
          const lastPart = parts[parts.length - 1];
          expect(/^\d+$/.test(lastPart)).toBe(true);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 19.5: Branch names are valid Git references
   * 
   * For any set of updates, the generated branch name should be a valid
   * Git reference name (no spaces, special characters, etc.).
   */
  it('should generate valid Git reference names', () => {
    fc.assert(
      fc.property(
        arbBranchPrefix,
        fc.oneof(arbSingleChartFileUpdate.map(fu => [fu]), arbMultipleChartFileUpdates),
        (branchPrefix, fileUpdates) => {
          const config = createMockConfig(branchPrefix);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName(fileUpdates);

          // Branch name should not contain spaces
          expect(branchName).not.toContain(' ');

          // Branch name should not contain special characters that are invalid in Git refs
          expect(branchName).not.toMatch(/[~^:?*\[\]\\]/);

          // Branch name should not start or end with a slash
          expect(branchName.startsWith('/')).toBe(false);
          expect(branchName.endsWith('/')).toBe(false);

          // Branch name should not contain consecutive slashes
          expect(branchName).not.toContain('//');

          // Branch name should not end with .lock
          expect(branchName.endsWith('.lock')).toBe(false);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 19.6: Branch names are deterministic for single chart
   * 
   * For any single chart update, generating the branch name multiple times
   * with the same inputs should produce the same result.
   */
  it('should generate deterministic branch names for single chart updates', () => {
    fc.assert(
      fc.property(
        arbBranchPrefix,
        arbSingleChartFileUpdate,
        (branchPrefix, fileUpdate) => {
          const config = createMockConfig(branchPrefix);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const branchName1 = prManager.generateBranchName([fileUpdate]);
          const branchName2 = prManager.generateBranchName([fileUpdate]);

          // Should produce the same branch name
          expect(branchName1).toBe(branchName2);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 19.7: Branch names are unique for different charts
   * 
   * For any two different single chart updates, the generated branch names
   * should be different.
   */
  it('should generate unique branch names for different charts', () => {
    fc.assert(
      fc.property(
        arbBranchPrefix,
        arbSingleChartFileUpdate,
        arbSingleChartFileUpdate,
        (branchPrefix, fileUpdate1, fileUpdate2) => {
          const update1 = fileUpdate1.updates[0];
          const update2 = fileUpdate2.updates[0];

          // Skip if both updates are for the same chart and version
          if (
            update1.dependency.chartName === update2.dependency.chartName &&
            update1.newVersion === update2.newVersion
          ) {
            return true;
          }

          const config = createMockConfig(branchPrefix);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const branchName1 = prManager.generateBranchName([fileUpdate1]);
          const branchName2 = prManager.generateBranchName([fileUpdate2]);

          // Should produce different branch names
          expect(branchName1).not.toBe(branchName2);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 19.8: Branch names respect different prefixes
   * 
   * For any set of updates, using different branch prefixes should produce
   * different branch names.
   */
  it('should respect different branch prefixes', () => {
    fc.assert(
      fc.property(
        arbBranchPrefix,
        arbBranchPrefix,
        arbSingleChartFileUpdate,
        (prefix1, prefix2, fileUpdate) => {
          // Skip if prefixes are the same
          if (prefix1 === prefix2) {
            return true;
          }

          const config1 = createMockConfig(prefix1);
          const config2 = createMockConfig(prefix2);
          const octokit = createMockOctokit();
          const prManager1 = new PullRequestManager(octokit, config1);
          const prManager2 = new PullRequestManager(octokit, config2);

          const branchName1 = prManager1.generateBranchName([fileUpdate]);
          const branchName2 = prManager2.generateBranchName([fileUpdate]);

          // Should produce different branch names
          expect(branchName1).not.toBe(branchName2);

          // Both should start with their respective prefixes
          expect(branchName1.startsWith(prefix1 + '/')).toBe(true);
          expect(branchName2.startsWith(prefix2 + '/')).toBe(true);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 19.9: Branch names handle special characters in chart names
   * 
   * For any chart name (which may contain hyphens), the branch name should
   * be properly formatted and valid.
   */
  it('should handle chart names with hyphens correctly', () => {
    fc.assert(
      fc.property(
        arbBranchPrefix,
        arbSemVer,
        arbSemVer,
        (branchPrefix, currentVersion, newVersion) => {
          // Skip if versions are the same
          if (currentVersion === newVersion) {
            return true;
          }

          // Create a chart name with hyphens
          const chartName = 'my-complex-chart-name';

          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName,
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };

          const versionUpdate: VersionUpdate = {
            dependency,
            currentVersion,
            newVersion
          };

          const fileUpdate: FileUpdate = {
            path: 'test.yaml',
            originalContent: '',
            updatedContent: '',
            updates: [versionUpdate]
          };

          const config = createMockConfig(branchPrefix);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName([fileUpdate]);

          // Branch name should include the chart name
          expect(branchName).toContain(chartName);

          // Branch name should be valid
          expect(branchName).not.toContain(' ');
          expect(branchName).toMatch(/^[a-z0-9\-\/\.]+$/);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 19.10: Branch names are reasonably short
   * 
   * For any set of updates, the generated branch name should be reasonably
   * short (under 255 characters, which is a common Git limit).
   */
  it('should generate branch names under 255 characters', () => {
    fc.assert(
      fc.property(
        arbBranchPrefix,
        fc.oneof(arbSingleChartFileUpdate.map(fu => [fu]), arbMultipleChartFileUpdates),
        (branchPrefix, fileUpdates) => {
          const config = createMockConfig(branchPrefix);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const branchName = prManager.generateBranchName(fileUpdates);

          // Branch name should be under 255 characters
          expect(branchName.length).toBeLessThan(255);

          // Branch name should also be reasonably short (under 100 for typical cases)
          expect(branchName.length).toBeLessThan(100);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 19.11: Branch names for same chart different versions are unique
   * 
   * For any chart with different version updates, the branch names should
   * be unique.
   */
  it('should generate unique branch names for same chart with different versions', () => {
    fc.assert(
      fc.property(
        arbBranchPrefix,
        arbChartName,
        arbSemVer,
        arbSemVer,
        arbSemVer,
        (branchPrefix, chartName, currentVersion, newVersion1, newVersion2) => {
          // Skip if versions are the same or either matches current
          if (
            newVersion1 === newVersion2 ||
            newVersion1 === currentVersion ||
            newVersion2 === currentVersion
          ) {
            return true;
          }

          const dependency1: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName,
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };

          const dependency2: HelmDependency = {
            ...dependency1
          };

          const versionUpdate1: VersionUpdate = {
            dependency: dependency1,
            currentVersion,
            newVersion: newVersion1
          };

          const versionUpdate2: VersionUpdate = {
            dependency: dependency2,
            currentVersion,
            newVersion: newVersion2
          };

          const fileUpdate1: FileUpdate = {
            path: 'test.yaml',
            originalContent: '',
            updatedContent: '',
            updates: [versionUpdate1]
          };

          const fileUpdate2: FileUpdate = {
            path: 'test.yaml',
            originalContent: '',
            updatedContent: '',
            updates: [versionUpdate2]
          };

          const config = createMockConfig(branchPrefix);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const branchName1 = prManager.generateBranchName([fileUpdate1]);
          const branchName2 = prManager.generateBranchName([fileUpdate2]);

          // Should produce different branch names
          expect(branchName1).not.toBe(branchName2);

          // Both should include the chart name
          expect(branchName1).toContain(chartName);
          expect(branchName2).toContain(chartName);

          // Each should include its respective version
          expect(branchName1).toContain(newVersion1);
          expect(branchName2).toContain(newVersion2);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });
});
