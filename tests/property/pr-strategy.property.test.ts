/**
 * Property-based tests for Pull Request Strategy Adherence
 * 
 * **Property 22: Pull Request Strategy Adherence**
 * **Validates: Requirements 6.7**
 * 
 * For any set of updates and a configured PR strategy (single, per-chart, per-manifest),
 * the number and grouping of created PRs should match the strategy.
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
  'oci://registry-1.docker.io/bitnamicharts'
);

// Generate valid manifest paths
const arbManifestPath = fc.string({ minLength: 5, maxLength: 30 }).map(s => `manifests/${s}.yaml`);

// Generate PR strategy
const arbPRStrategy = fc.constantFrom<'single' | 'per-chart' | 'per-manifest'>(
  'single',
  'per-chart',
  'per-manifest'
);

// Generate a version update
const arbVersionUpdate = fc.record({
  chartName: arbChartName,
  repoURL: arbRepoURL,
  currentVersion: arbSemVer,
  newVersion: arbSemVer,
  manifestPath: arbManifestPath
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

  return versionUpdate;
});

// Generate a file update with multiple chart updates
const arbFileUpdate = fc.record({
  manifestPath: arbManifestPath,
  updates: fc.array(arbVersionUpdate, { minLength: 1, maxLength: 3 })
}).map(({ manifestPath, updates }) => {
  // Update all dependencies to use the same manifest path
  const updatedVersions = updates.map(update => ({
    ...update,
    dependency: {
      ...update.dependency,
      manifestPath
    }
  }));

  const fileUpdate: FileUpdate = {
    path: manifestPath,
    originalContent: '',
    updatedContent: '',
    updates: updatedVersions
  };

  return fileUpdate;
});

// Generate multiple file updates
const arbMultipleFileUpdates = fc.array(arbFileUpdate, { minLength: 1, maxLength: 5 });

/**
 * Helper function to create a mock ActionConfig
 */
function createMockConfig(prStrategy: 'single' | 'per-chart' | 'per-manifest'): ActionConfig {
  return {
    includePaths: ['**/*.yaml'],
    excludePaths: [],
    updateStrategy: 'all',
    registryCredentials: [],
    prStrategy,
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
    githubToken: 'mock-token'
  };
}

/**
 * Helper function to create a mock Octokit instance
 */
function createMockOctokit(): ReturnType<typeof github.getOctokit> {
  return {} as ReturnType<typeof github.getOctokit>;
}

describe('Property 22: Pull Request Strategy Adherence', () => {
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
   * Property 22.1: Single strategy creates one group
   * 
   * For any set of file updates with 'single' strategy,
   * all updates should be grouped into a single PR group.
   */
  it('should create one group for single strategy', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig('single');
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups = prManager.groupUpdatesByStrategy(fileUpdates);

          // Should have exactly one group
          expect(groups.length).toBe(1);

          // The group should contain all file updates
          expect(groups[0]).toEqual(fileUpdates);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.2: Per-manifest strategy creates one group per file
   * 
   * For any set of file updates with 'per-manifest' strategy,
   * each manifest file should get its own PR group.
   */
  it('should create one group per manifest file for per-manifest strategy', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig('per-manifest');
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups = prManager.groupUpdatesByStrategy(fileUpdates);

          // Should have one group per file update
          expect(groups.length).toBe(fileUpdates.length);

          // Each group should contain exactly one file update
          for (const group of groups) {
            expect(group.length).toBe(1);
          }

          // All original file updates should be represented
          const allGroupedFiles = groups.flat();
          expect(allGroupedFiles.length).toBe(fileUpdates.length);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.3: Per-chart strategy groups by chart name
   * 
   * For any set of file updates with 'per-chart' strategy,
   * updates for the same chart should be grouped together
   * regardless of which manifest file they're in.
   */
  it('should group by chart name for per-chart strategy', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig('per-chart');
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups = prManager.groupUpdatesByStrategy(fileUpdates);

          // Collect all unique chart names from original updates
          const allUpdates = fileUpdates.flatMap(file => file.updates);
          const uniqueCharts = new Set(allUpdates.map(u => u.dependency.chartName));

          // Should have one group per unique chart
          expect(groups.length).toBe(uniqueCharts.size);

          // Each group should contain updates for only one chart
          for (const group of groups) {
            const groupUpdates = group.flatMap(file => file.updates);
            const chartNames = new Set(groupUpdates.map(u => u.dependency.chartName));
            
            // All updates in this group should be for the same chart
            expect(chartNames.size).toBe(1);
          }

          // All original updates should be represented
          const allGroupedUpdates = groups.flatMap(group => 
            group.flatMap(file => file.updates)
          );
          expect(allGroupedUpdates.length).toBe(allUpdates.length);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.4: Empty file updates produce empty groups
   * 
   * For any strategy, when given an empty array of file updates,
   * the result should be an empty array of groups.
   */
  it('should return empty array for empty file updates', () => {
    fc.assert(
      fc.property(
        arbPRStrategy,
        (strategy) => {
          const config = createMockConfig(strategy);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups = prManager.groupUpdatesByStrategy([]);

          // Should return empty array
          expect(groups.length).toBe(0);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 22.5: Single file with single chart - all strategies produce one group
   * 
   * For any strategy, when there's only one file with one chart update,
   * all strategies should produce exactly one group.
   */
  it('should produce one group for single file with single chart', () => {
    fc.assert(
      fc.property(
        arbPRStrategy,
        arbVersionUpdate,
        arbManifestPath,
        (strategy, update, manifestPath) => {
          // Create a single file update with one chart
          const fileUpdate: FileUpdate = {
            path: manifestPath,
            originalContent: '',
            updatedContent: '',
            updates: [{
              ...update,
              dependency: {
                ...update.dependency,
                manifestPath
              }
            }]
          };

          const config = createMockConfig(strategy);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups = prManager.groupUpdatesByStrategy([fileUpdate]);

          // All strategies should produce one group for this case
          expect(groups.length).toBe(1);
          expect(groups[0].length).toBe(1);
          expect(groups[0][0]).toEqual(fileUpdate);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.6: Per-chart strategy preserves all updates for each chart
   * 
   * For per-chart strategy, when a chart appears in multiple files,
   * all updates for that chart should be in the same group.
   */
  it('should preserve all updates for each chart in per-chart strategy', () => {
    fc.assert(
      fc.property(
        arbChartName,
        fc.array(arbManifestPath, { minLength: 2, maxLength: 4 }),
        arbSemVer,
        arbSemVer,
        arbRepoURL,
        (chartName, manifestPaths, currentVersion, newVersion, repoURL) => {
          // Create multiple file updates with the same chart
          const fileUpdates: FileUpdate[] = manifestPaths.map(manifestPath => {
            const dependency: HelmDependency = {
              manifestPath,
              documentIndex: 0,
              chartName,
              repoURL,
              repoType: 'helm',
              currentVersion,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            const versionUpdate: VersionUpdate = {
              dependency,
              currentVersion,
              newVersion
            };

            return {
              path: manifestPath,
              originalContent: '',
              updatedContent: '',
              updates: [versionUpdate]
            };
          });

          const config = createMockConfig('per-chart');
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups = prManager.groupUpdatesByStrategy(fileUpdates);

          // Should have exactly one group (all updates for same chart)
          expect(groups.length).toBe(1);

          // The group should contain all manifest files
          expect(groups[0].length).toBe(manifestPaths.length);

          // Each file in the group should have the same chart
          for (const file of groups[0]) {
            expect(file.updates[0].dependency.chartName).toBe(chartName);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.7: Per-chart strategy with multiple charts creates multiple groups
   * 
   * For per-chart strategy, when there are multiple different charts,
   * each chart should get its own group.
   */
  it('should create separate groups for different charts in per-chart strategy', () => {
    fc.assert(
      fc.property(
        fc.array(arbChartName, { minLength: 2, maxLength: 4 }),
        arbManifestPath,
        arbSemVer,
        arbSemVer,
        arbRepoURL,
        (chartNames, manifestPath, currentVersion, newVersion, repoURL) => {
          // Ensure we have unique chart names
          const uniqueCharts = Array.from(new Set(chartNames));
          
          if (uniqueCharts.length < 2) {
            return true; // Skip if not enough unique charts
          }

          // Create one file update with multiple different charts
          const updates: VersionUpdate[] = uniqueCharts.map(chartName => {
            const dependency: HelmDependency = {
              manifestPath,
              documentIndex: 0,
              chartName,
              repoURL,
              repoType: 'helm',
              currentVersion,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            return {
              dependency,
              currentVersion,
              newVersion
            };
          });

          const fileUpdate: FileUpdate = {
            path: manifestPath,
            originalContent: '',
            updatedContent: '',
            updates
          };

          const config = createMockConfig('per-chart');
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups = prManager.groupUpdatesByStrategy([fileUpdate]);

          // Should have one group per unique chart
          expect(groups.length).toBe(uniqueCharts.length);

          // Each group should have updates for only one chart
          for (const group of groups) {
            const groupUpdates = group.flatMap(file => file.updates);
            const chartNamesInGroup = new Set(groupUpdates.map(u => u.dependency.chartName));
            expect(chartNamesInGroup.size).toBe(1);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.8: No updates are lost during grouping
   * 
   * For any strategy and any set of file updates,
   * all original updates should be present in the grouped result.
   */
  it('should preserve all updates during grouping', () => {
    fc.assert(
      fc.property(
        arbPRStrategy,
        arbMultipleFileUpdates,
        (strategy, fileUpdates) => {
          const config = createMockConfig(strategy);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups = prManager.groupUpdatesByStrategy(fileUpdates);

          // Count original updates
          const originalUpdates = fileUpdates.flatMap(file => file.updates);
          const originalCount = originalUpdates.length;

          // Count grouped updates
          const groupedUpdates = groups.flatMap(group =>
            group.flatMap(file => file.updates)
          );
          const groupedCount = groupedUpdates.length;

          // Should have the same number of updates
          expect(groupedCount).toBe(originalCount);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.9: Groups are non-empty
   * 
   * For any strategy and any non-empty set of file updates,
   * all resulting groups should be non-empty.
   */
  it('should never create empty groups', () => {
    fc.assert(
      fc.property(
        arbPRStrategy,
        arbMultipleFileUpdates,
        (strategy, fileUpdates) => {
          const config = createMockConfig(strategy);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups = prManager.groupUpdatesByStrategy(fileUpdates);

          // All groups should be non-empty
          for (const group of groups) {
            expect(group.length).toBeGreaterThan(0);
            
            // Each file in the group should have at least one update
            for (const file of group) {
              expect(file.updates.length).toBeGreaterThan(0);
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.10: Per-manifest strategy preserves file identity
   * 
   * For per-manifest strategy, each group should contain exactly
   * the file updates from one original manifest file.
   */
  it('should preserve file identity in per-manifest strategy', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig('per-manifest');
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups = prManager.groupUpdatesByStrategy(fileUpdates);

          // Each group should match exactly one original file update
          for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const originalFile = fileUpdates[i];

            expect(group.length).toBe(1);
            expect(group[0].path).toBe(originalFile.path);
            expect(group[0].updates.length).toBe(originalFile.updates.length);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.11: Single strategy combines all files
   * 
   * For single strategy, the resulting group should contain
   * all original file updates in the same order.
   */
  it('should combine all files in single strategy', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig('single');
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups = prManager.groupUpdatesByStrategy(fileUpdates);

          expect(groups.length).toBe(1);
          
          // The single group should contain all files
          expect(groups[0].length).toBe(fileUpdates.length);

          // Files should be in the same order
          for (let i = 0; i < fileUpdates.length; i++) {
            expect(groups[0][i].path).toBe(fileUpdates[i].path);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.12: Per-chart strategy handles same chart in same file
   * 
   * For per-chart strategy, when the same chart appears multiple times
   * in the same file, all updates should be in the same group.
   */
  it('should handle same chart appearing multiple times in same file', () => {
    fc.assert(
      fc.property(
        arbChartName,
        arbManifestPath,
        fc.array(arbSemVer, { minLength: 2, maxLength: 3 }),
        arbSemVer,
        arbRepoURL,
        (chartName, manifestPath, currentVersions, newVersion, repoURL) => {
          // Create multiple updates for the same chart in the same file
          const updates: VersionUpdate[] = currentVersions.map(currentVersion => {
            const dependency: HelmDependency = {
              manifestPath,
              documentIndex: 0,
              chartName,
              repoURL,
              repoType: 'helm',
              currentVersion,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            return {
              dependency,
              currentVersion,
              newVersion
            };
          });

          const fileUpdate: FileUpdate = {
            path: manifestPath,
            originalContent: '',
            updatedContent: '',
            updates
          };

          const config = createMockConfig('per-chart');
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups = prManager.groupUpdatesByStrategy([fileUpdate]);

          // Should have exactly one group (all updates for same chart)
          expect(groups.length).toBe(1);

          // The group should contain all updates
          const groupUpdates = groups[0].flatMap(file => file.updates);
          expect(groupUpdates.length).toBe(updates.length);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.13: Grouping is deterministic
   * 
   * For any strategy and any set of file updates,
   * calling groupUpdatesByStrategy multiple times should
   * produce the same result.
   */
  it('should produce deterministic grouping', () => {
    fc.assert(
      fc.property(
        arbPRStrategy,
        arbMultipleFileUpdates,
        (strategy, fileUpdates) => {
          const config = createMockConfig(strategy);
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups1 = prManager.groupUpdatesByStrategy(fileUpdates);
          const groups2 = prManager.groupUpdatesByStrategy(fileUpdates);

          // Should produce the same number of groups
          expect(groups1.length).toBe(groups2.length);

          // Each group should have the same structure
          for (let i = 0; i < groups1.length; i++) {
            expect(groups1[i].length).toBe(groups2[i].length);
            
            for (let j = 0; j < groups1[i].length; j++) {
              expect(groups1[i][j].path).toBe(groups2[i][j].path);
              expect(groups1[i][j].updates.length).toBe(groups2[i][j].updates.length);
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.14: Per-chart strategy groups across multiple files correctly
   * 
   * For per-chart strategy, when the same chart appears in multiple files
   * along with other charts, the grouping should correctly separate them.
   */
  it('should correctly group same chart across multiple files with other charts', () => {
    fc.assert(
      fc.property(
        fc.tuple(arbChartName, arbChartName).filter(([c1, c2]) => c1 !== c2),
        fc.tuple(arbManifestPath, arbManifestPath).filter(([p1, p2]) => p1 !== p2),
        arbSemVer,
        arbSemVer,
        arbRepoURL,
        ([chart1, chart2], [path1, path2], currentVersion, newVersion, repoURL) => {
          // Create two files:
          // File 1: chart1 and chart2
          // File 2: chart1
          const createUpdate = (chartName: string, manifestPath: string): VersionUpdate => {
            const dependency: HelmDependency = {
              manifestPath,
              documentIndex: 0,
              chartName,
              repoURL,
              repoType: 'helm',
              currentVersion,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            return {
              dependency,
              currentVersion,
              newVersion
            };
          };

          const fileUpdate1: FileUpdate = {
            path: path1,
            originalContent: '',
            updatedContent: '',
            updates: [
              createUpdate(chart1, path1),
              createUpdate(chart2, path1)
            ]
          };

          const fileUpdate2: FileUpdate = {
            path: path2,
            originalContent: '',
            updatedContent: '',
            updates: [
              createUpdate(chart1, path2)
            ]
          };

          const config = createMockConfig('per-chart');
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const groups = prManager.groupUpdatesByStrategy([fileUpdate1, fileUpdate2]);

          // Should have 2 groups: one for chart1, one for chart2
          expect(groups.length).toBe(2);

          // Find the group for chart1
          const chart1Group = groups.find(group => {
            const updates = group.flatMap(file => file.updates);
            return updates[0].dependency.chartName === chart1;
          });

          // Find the group for chart2
          const chart2Group = groups.find(group => {
            const updates = group.flatMap(file => file.updates);
            return updates[0].dependency.chartName === chart2;
          });

          expect(chart1Group).toBeDefined();
          expect(chart2Group).toBeDefined();

          // chart1 group should have 2 updates (from both files)
          const chart1Updates = chart1Group!.flatMap(file => file.updates);
          expect(chart1Updates.length).toBe(2);
          expect(chart1Updates.every(u => u.dependency.chartName === chart1)).toBe(true);

          // chart2 group should have 1 update (from file1 only)
          const chart2Updates = chart2Group!.flatMap(file => file.updates);
          expect(chart2Updates.length).toBe(1);
          expect(chart2Updates[0].dependency.chartName).toBe(chart2);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 22.15: Strategy configuration is respected
   * 
   * For any set of file updates, the grouping behavior should
   * match the configured strategy.
   */
  it('should respect the configured strategy', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          // Test all three strategies
          const strategies: Array<'single' | 'per-chart' | 'per-manifest'> = [
            'single',
            'per-chart',
            'per-manifest'
          ];

          for (const strategy of strategies) {
            const config = createMockConfig(strategy);
            const octokit = createMockOctokit();
            const prManager = new PullRequestManager(octokit, config);

            const groups = prManager.groupUpdatesByStrategy(fileUpdates);

            if (strategy === 'single') {
              // Single strategy should produce 1 group
              expect(groups.length).toBe(1);
            } else if (strategy === 'per-manifest') {
              // Per-manifest should produce one group per file
              expect(groups.length).toBe(fileUpdates.length);
            } else if (strategy === 'per-chart') {
              // Per-chart should produce one group per unique chart
              const allUpdates = fileUpdates.flatMap(file => file.updates);
              const uniqueCharts = new Set(allUpdates.map(u => u.dependency.chartName));
              expect(groups.length).toBe(uniqueCharts.size);
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
