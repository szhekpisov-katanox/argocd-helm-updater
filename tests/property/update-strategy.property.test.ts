/**
 * Property-based tests for Update Strategy Application
 * 
 * **Property 13: Update Strategy Application**
 * **Validates: Requirements 4.3, 4.4**
 * 
 * For any set of available versions and a configured update strategy (major, minor, patch),
 * the version selector should choose the newest version that satisfies the strategy constraints.
 */

import * as fc from 'fast-check';
import { VersionResolver } from '../../src/resolver/version-resolver';
import { HelmDependency } from '../../src/types/dependency';
import { ActionConfig } from '../../src/types/config';
import { ChartVersionInfo } from '../../src/types/version';
import * as semver from 'semver';

/**
 * Custom arbitraries for generating test data
 */

// Generate valid semantic versions
const arbSemVer = fc.tuple(
  fc.nat({ max: 10 }),
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// Generate update strategy
const arbUpdateStrategy = fc.constantFrom('major', 'minor', 'patch', 'all') as fc.Arbitrary<'major' | 'minor' | 'patch' | 'all'>;

// Create a minimal ActionConfig for testing
const createTestConfig = (overrides: Partial<ActionConfig> = {}): ActionConfig => ({
  includePaths: ['**/*.yaml'],
  excludePaths: [],
  updateStrategy: 'all',
  registryCredentials: [],
  prStrategy: 'single',
  prLabels: [],
  prAssignees: [],
  prReviewers: [],
  branchPrefix: 'helm-update',
  commitMessage: {
    prefix: 'chore',
    includeScope: true
  },
  groups: {},
  ignore: [],
  autoMerge: {
    enabled: false,
    updateTypes: [],
    requireCIPass: true,
    requireApprovals: 0
  },
  openPullRequestsLimit: 10,
  rebaseStrategy: 'auto',
  dryRun: false,
  logLevel: 'info',
  githubToken: 'test-token',
  ...overrides
});

describe('Property 13: Update Strategy Application', () => {
  /**
   * Property 13.1: Patch strategy only allows patch updates
   * 
   * For any current version and a set of available versions, when the update
   * strategy is 'patch', only versions with the same major.minor should be selected.
   */
  it('should only select patch updates when strategy is patch', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (currentVersion) => {
          const [major, minor, patch] = currentVersion.split('.').map(Number);
          
          // Generate versions with different update types
          const patchUpdate = `${major}.${minor}.${patch + 1}`;
          const minorUpdate = `${major}.${minor + 1}.0`;
          const majorUpdate = `${major + 1}.0.0`;
          
          const availableVersions = [
            currentVersion,
            patchUpdate,
            minorUpdate,
            majorUpdate
          ];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig({ updateStrategy: 'patch' });
          const resolver = new VersionResolver(config);
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(
              `${dependency.repoURL}/${dependency.chartName}`,
              availableVersions.map(v => ({ version: v }))
            );
            return versionMap;
          };
          
          const updates = await resolver.checkForUpdates([dependency]);
          
          // Should detect exactly one update
          expect(updates.length).toBe(1);
          
          // The selected version should be the patch update
          expect(updates[0].newVersion).toBe(patchUpdate);
          
          // Verify it's the same major.minor
          const newParsed = semver.parse(updates[0].newVersion);
          expect(newParsed?.major).toBe(major);
          expect(newParsed?.minor).toBe(minor);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.2: Minor strategy allows minor and patch updates
   * 
   * For any current version and a set of available versions, when the update
   * strategy is 'minor', only versions with the same major should be selected.
   */
  it('should select minor and patch updates when strategy is minor', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (currentVersion) => {
          const [major, minor, patch] = currentVersion.split('.').map(Number);
          
          // Generate versions with different update types
          const patchUpdate = `${major}.${minor}.${patch + 1}`;
          const minorUpdate = `${major}.${minor + 1}.0`;
          const majorUpdate = `${major + 1}.0.0`;
          
          const availableVersions = [
            currentVersion,
            patchUpdate,
            minorUpdate,
            majorUpdate
          ];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig({ updateStrategy: 'minor' });
          const resolver = new VersionResolver(config);
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(
              `${dependency.repoURL}/${dependency.chartName}`,
              availableVersions.map(v => ({ version: v }))
            );
            return versionMap;
          };
          
          const updates = await resolver.checkForUpdates([dependency]);
          
          // Should detect exactly one update
          expect(updates.length).toBe(1);
          
          // The selected version should be the minor update (highest within same major)
          expect(updates[0].newVersion).toBe(minorUpdate);
          
          // Verify it's the same major
          const newParsed = semver.parse(updates[0].newVersion);
          expect(newParsed?.major).toBe(major);
          
          // Should not select major update
          expect(updates[0].newVersion).not.toBe(majorUpdate);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.3: Major strategy allows all updates
   * 
   * For any current version and a set of available versions, when the update
   * strategy is 'major' or 'all', the highest available version should be selected.
   */
  it('should select highest version when strategy is major or all', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        arbUpdateStrategy.filter(s => s === 'major' || s === 'all'),
        async (currentVersion, strategy) => {
          const [major, minor, patch] = currentVersion.split('.').map(Number);
          
          // Generate versions with different update types
          const patchUpdate = `${major}.${minor}.${patch + 1}`;
          const minorUpdate = `${major}.${minor + 1}.0`;
          const majorUpdate = `${major + 1}.0.0`;
          
          const availableVersions = [
            currentVersion,
            patchUpdate,
            minorUpdate,
            majorUpdate
          ];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig({ updateStrategy: strategy });
          const resolver = new VersionResolver(config);
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(
              `${dependency.repoURL}/${dependency.chartName}`,
              availableVersions.map(v => ({ version: v }))
            );
            return versionMap;
          };
          
          const updates = await resolver.checkForUpdates([dependency]);
          
          // Should detect exactly one update
          expect(updates.length).toBe(1);
          
          // The selected version should be the major update (highest available)
          expect(updates[0].newVersion).toBe(majorUpdate);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.4: Strategy selects newest within constraints
   * 
   * For any current version, strategy, and multiple versions satisfying the strategy,
   * the newest version within the strategy constraints should be selected.
   */
  it('should select newest version within strategy constraints', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        arbUpdateStrategy,
        async (currentVersion, strategy) => {
          const [major, minor, patch] = currentVersion.split('.').map(Number);
          
          // Generate multiple versions for each update type
          const availableVersions = [
            currentVersion,
            // Multiple patch updates
            `${major}.${minor}.${patch + 1}`,
            `${major}.${minor}.${patch + 2}`,
            `${major}.${minor}.${patch + 3}`,
            // Multiple minor updates
            `${major}.${minor + 1}.0`,
            `${major}.${minor + 2}.0`,
            `${major}.${minor + 3}.0`,
            // Multiple major updates
            `${major + 1}.0.0`,
            `${major + 2}.0.0`,
            `${major + 3}.0.0`
          ];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig({ updateStrategy: strategy });
          const resolver = new VersionResolver(config);
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(
              `${dependency.repoURL}/${dependency.chartName}`,
              availableVersions.map(v => ({ version: v }))
            );
            return versionMap;
          };
          
          const updates = await resolver.checkForUpdates([dependency]);
          
          // Should detect exactly one update
          expect(updates.length).toBe(1);
          
          const selectedVersion = updates[0].newVersion;
          const selectedParsed = semver.parse(selectedVersion);
          
          // Verify the selected version satisfies the strategy
          if (strategy === 'patch') {
            // Should be same major.minor, highest patch
            expect(selectedParsed?.major).toBe(major);
            expect(selectedParsed?.minor).toBe(minor);
            expect(selectedVersion).toBe(`${major}.${minor}.${patch + 3}`);
          } else if (strategy === 'minor') {
            // Should be same major, highest minor
            expect(selectedParsed?.major).toBe(major);
            expect(selectedVersion).toBe(`${major}.${minor + 3}.0`);
          } else {
            // major or all: should be highest overall
            expect(selectedVersion).toBe(`${major + 3}.0.0`);
          }
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.5: No update when no versions satisfy strategy
   * 
   * For any current version and strategy, if no newer versions satisfy the
   * strategy constraints, no update should be detected.
   */
  it('should not detect updates when no versions satisfy strategy', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (currentVersion) => {
          const [major, minor, patch] = currentVersion.split('.').map(Number);
          
          // Only provide older versions
          const olderVersions = [
            `${major}.${minor}.${Math.max(0, patch - 1)}`,
            `${major}.${Math.max(0, minor - 1)}.${patch}`,
            `${Math.max(0, major - 1)}.${minor}.${patch}`
          ].filter(v => semver.valid(v) && semver.lt(v, currentVersion));
          
          const availableVersions = [currentVersion, ...olderVersions];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig({ updateStrategy: 'patch' });
          const resolver = new VersionResolver(config);
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(
              `${dependency.repoURL}/${dependency.chartName}`,
              availableVersions.map(v => ({ version: v }))
            );
            return versionMap;
          };
          
          const updates = await resolver.checkForUpdates([dependency]);
          
          // Should not detect any updates
          expect(updates.length).toBe(0);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.6: Strategy consistency across multiple runs
   * 
   * For any current version, strategy, and set of available versions,
   * running update detection multiple times should produce the same result.
   */
  it('should produce consistent results across multiple runs', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        arbUpdateStrategy,
        fc.array(arbSemVer, { minLength: 5, maxLength: 15 }),
        async (currentVersion, strategy, availableVersions) => {
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig({ updateStrategy: strategy });
          const resolver = new VersionResolver(config);
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(
              `${dependency.repoURL}/${dependency.chartName}`,
              availableVersions.map(v => ({ version: v }))
            );
            return versionMap;
          };
          
          // Run update detection multiple times
          const updates1 = await resolver.checkForUpdates([dependency]);
          const updates2 = await resolver.checkForUpdates([dependency]);
          const updates3 = await resolver.checkForUpdates([dependency]);
          
          // Results should be identical
          expect(updates1.length).toBe(updates2.length);
          expect(updates2.length).toBe(updates3.length);
          
          if (updates1.length > 0) {
            expect(updates1[0].newVersion).toBe(updates2[0].newVersion);
            expect(updates2[0].newVersion).toBe(updates3[0].newVersion);
          }
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 13.7: Patch strategy with only minor/major updates available
   * 
   * For any current version, when strategy is 'patch' but only minor or major
   * updates are available, no update should be detected.
   */
  it('should not detect updates when patch strategy has only minor/major updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (currentVersion) => {
          const [major, minor] = currentVersion.split('.').map(Number);
          
          // Only provide minor and major updates (no patch updates)
          const availableVersions = [
            currentVersion,
            `${major}.${minor + 1}.0`,
            `${major}.${minor + 2}.0`,
            `${major + 1}.0.0`,
            `${major + 2}.0.0`
          ];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig({ updateStrategy: 'patch' });
          const resolver = new VersionResolver(config);
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(
              `${dependency.repoURL}/${dependency.chartName}`,
              availableVersions.map(v => ({ version: v }))
            );
            return versionMap;
          };
          
          const updates = await resolver.checkForUpdates([dependency]);
          
          // Should not detect any updates
          expect(updates.length).toBe(0);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.8: Minor strategy with only major updates available
   * 
   * For any current version, when strategy is 'minor' but only major
   * updates are available, no update should be detected.
   */
  it('should not detect updates when minor strategy has only major updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (currentVersion) => {
          const [major] = currentVersion.split('.').map(Number);
          
          // Only provide major updates (no minor or patch updates)
          const availableVersions = [
            currentVersion,
            `${major + 1}.0.0`,
            `${major + 2}.0.0`,
            `${major + 3}.0.0`
          ];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig({ updateStrategy: 'minor' });
          const resolver = new VersionResolver(config);
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(
              `${dependency.repoURL}/${dependency.chartName}`,
              availableVersions.map(v => ({ version: v }))
            );
            return versionMap;
          };
          
          const updates = await resolver.checkForUpdates([dependency]);
          
          // Should not detect any updates
          expect(updates.length).toBe(0);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.9: Strategy respects semantic versioning rules
   * 
   * For any selected update, the new version should be semantically greater
   * than the current version and satisfy the strategy constraints.
   */
  it('should respect semantic versioning rules for all strategies', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        arbUpdateStrategy,
        fc.array(arbSemVer, { minLength: 5, maxLength: 20 }),
        async (currentVersion, strategy, availableVersions) => {
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig({ updateStrategy: strategy });
          const resolver = new VersionResolver(config);
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(
              `${dependency.repoURL}/${dependency.chartName}`,
              availableVersions.map(v => ({ version: v }))
            );
            return versionMap;
          };
          
          const updates = await resolver.checkForUpdates([dependency]);
          
          if (updates.length > 0) {
            const newVersion = updates[0].newVersion;
            const currentParsed = semver.parse(currentVersion);
            const newParsed = semver.parse(newVersion);
            
            // New version must be greater than current
            expect(semver.gt(newVersion, currentVersion)).toBe(true);
            
            // Verify strategy constraints
            if (currentParsed && newParsed) {
              if (strategy === 'patch') {
                expect(newParsed.major).toBe(currentParsed.major);
                expect(newParsed.minor).toBe(currentParsed.minor);
              } else if (strategy === 'minor') {
                expect(newParsed.major).toBe(currentParsed.major);
              }
              // For 'major' and 'all', no additional constraints
            }
          }
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.10: Strategy with pre-release versions
   * 
   * For any current stable version and strategy, pre-release versions
   * should be considered as update candidates if they are newer.
   */
  it('should consider pre-release versions as update candidates', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        arbUpdateStrategy,
        async (currentVersion, strategy) => {
          const [major, minor, patch] = currentVersion.split('.').map(Number);
          
          // Generate both stable and pre-release versions
          const availableVersions = [
            currentVersion,
            `${major}.${minor}.${patch + 1}`,
            `${major}.${minor}.${patch + 1}-alpha.1`,
            `${major}.${minor + 1}.0`,
            `${major}.${minor + 1}.0-beta.1`,
            `${major + 1}.0.0`,
            `${major + 1}.0.0-rc.1`
          ];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig({ updateStrategy: strategy });
          const resolver = new VersionResolver(config);
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(
              `${dependency.repoURL}/${dependency.chartName}`,
              availableVersions.map(v => ({ version: v }))
            );
            return versionMap;
          };
          
          const updates = await resolver.checkForUpdates([dependency]);
          
          // Should detect at least one update
          expect(updates.length).toBeGreaterThan(0);
          
          // The selected version should be newer than current
          expect(semver.gt(updates[0].newVersion, currentVersion)).toBe(true);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });
});
