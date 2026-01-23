/**
 * Property-based tests for No Updates (Latest Version)
 * 
 * **Property 14: No Update for Latest Versions**
 * **Validates: Requirements 4.5**
 * 
 * For any chart dependency already at the latest available version,
 * no update should be proposed.
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

// Generate a Helm dependency
const arbHelmDependency = fc.record({
  manifestPath: fc.constantFrom('app.yaml', 'apps/prod.yaml', 'manifests/app.yaml'),
  documentIndex: fc.nat({ max: 5 }),
  chartName: fc.constantFrom('nginx', 'postgresql', 'redis', 'mongodb', 'mysql'),
  repoURL: fc.constantFrom(
    'https://charts.bitnami.com/bitnami',
    'https://charts.example.com',
    'oci://registry-1.docker.io/bitnamicharts'
  ),
  repoType: fc.constantFrom('helm' as const, 'oci' as const),
  currentVersion: arbSemVer,
  versionPath: fc.constant(['spec', 'source', 'targetRevision'])
});

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

describe('Property 14: No Update for Latest Versions', () => {
  /**
   * Property 14.1: No update when current version is latest
   * 
   * For any dependency where the current version is the latest available version,
   * no update should be detected.
   */
  it('should not propose updates when current version is latest', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        fc.array(arbSemVer, { minLength: 1, maxLength: 10 }),
        async (latestVersion, olderVersions) => {
          // Filter to only include versions older than latest
          const filteredOlderVersions = olderVersions.filter(v => 
            semver.valid(v) && semver.lt(v, latestVersion)
          );
          
          const availableVersions = [latestVersion, ...filteredOlderVersions];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: latestVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig();
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
   * Property 14.2: No update when current version is latest (all strategies)
   * 
   * For any update strategy, when the current version is the latest available,
   * no update should be detected.
   */
  it('should not propose updates for any strategy when at latest version', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        fc.constantFrom('major', 'minor', 'patch', 'all') as fc.Arbitrary<'major' | 'minor' | 'patch' | 'all'>,
        fc.array(arbSemVer, { minLength: 1, maxLength: 10 }),
        async (latestVersion, strategy, olderVersions) => {
          const filteredOlderVersions = olderVersions.filter(v => 
            semver.valid(v) && semver.lt(v, latestVersion)
          );
          
          const availableVersions = [latestVersion, ...filteredOlderVersions];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: latestVersion,
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
          
          // Should not detect any updates regardless of strategy
          expect(updates.length).toBe(0);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.3: No update when only current version is available
   * 
   * For any dependency where only the current version exists in the repository,
   * no update should be detected.
   */
  it('should not propose updates when only current version exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbHelmDependency,
        async (dependency) => {
          const config = createTestConfig();
          const resolver = new VersionResolver(config);
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(
              `${dependency.repoURL}/${dependency.chartName}`,
              [{ version: dependency.currentVersion }]
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
   * Property 14.4: No update when current version equals highest available
   * 
   * For any set of available versions, when the current version equals
   * the semantically highest version, no update should be detected.
   */
  it('should not propose updates when current equals highest available', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbSemVer, { minLength: 2, maxLength: 15 }),
        async (versions) => {
          // Find the highest version
          const sortedVersions = versions
            .filter(v => semver.valid(v))
            .sort((a, b) => semver.compare(a, b));
          
          if (sortedVersions.length === 0) {
            return true; // Skip if no valid versions
          }
          
          const latestVersion = sortedVersions[sortedVersions.length - 1];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: latestVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig();
          const resolver = new VersionResolver(config);
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(
              `${dependency.repoURL}/${dependency.chartName}`,
              versions.map(v => ({ version: v }))
            );
            return versionMap;
          };
          
          const updates = await resolver.checkForUpdates([dependency]);
          
          // Should not detect any updates
          expect(updates.length).toBe(0);
          
          resolver.resolveVersions = originalResolveVersions;
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.5: No update with pre-release versions when at latest stable
   * 
   * For any dependency at the latest stable version, when only pre-release
   * versions of the next version exist, no update should be detected
   * (assuming we prefer stable versions).
   */
  it('should not propose pre-release updates when at latest stable', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (latestStable) => {
          const [major, minor, patch] = latestStable.split('.').map(Number);
          
          // Create pre-release versions of the next version
          const preReleaseVersions = [
            `${major}.${minor}.${patch + 1}-alpha.1`,
            `${major}.${minor}.${patch + 1}-beta.1`,
            `${major}.${minor}.${patch + 1}-rc.1`
          ];
          
          // Include some older stable versions
          const olderStableVersions = [
            `${major}.${minor}.${Math.max(0, patch - 1)}`,
            `${major}.${Math.max(0, minor - 1)}.${patch}`
          ].filter(v => semver.valid(v) && semver.lt(v, latestStable));
          
          const availableVersions = [
            latestStable,
            ...olderStableVersions,
            ...preReleaseVersions
          ];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: latestStable,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig();
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
          
          // Should not detect any updates (pre-release versions are not considered)
          // Note: This behavior depends on implementation - if pre-releases are
          // considered, this test may need adjustment
          expect(updates.length).toBe(0);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.6: No update for multiple dependencies at latest
   * 
   * For any list of dependencies where all are at their latest versions,
   * no updates should be detected for any of them.
   */
  it('should not propose updates for multiple dependencies at latest', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbHelmDependency, { minLength: 2, maxLength: 5 }),
        async (dependencies) => {
          const config = createTestConfig();
          const resolver = new VersionResolver(config);
          
          // Deduplicate dependencies by chart/repo combination
          const uniqueDeps = new Map<string, HelmDependency>();
          for (const dep of dependencies) {
            const key = `${dep.repoURL}/${dep.chartName}`;
            if (!uniqueDeps.has(key)) {
              uniqueDeps.set(key, dep);
            }
          }
          
          if (uniqueDeps.size < 2) {
            return true; // Skip if we don't have at least 2 unique dependencies
          }
          
          const uniqueDependencies = Array.from(uniqueDeps.values());
          
          // For each dependency, set current version as the only available version
          const versionMap = new Map<string, ChartVersionInfo[]>();
          
          for (const dep of uniqueDependencies) {
            versionMap.set(
              `${dep.repoURL}/${dep.chartName}`,
              [{ version: dep.currentVersion }]
            );
          }
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => versionMap;
          
          const updates = await resolver.checkForUpdates(uniqueDependencies);
          
          // Should not detect any updates
          expect(updates.length).toBe(0);
          
          resolver.resolveVersions = originalResolveVersions;
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 14.7: No update consistency across multiple checks
   * 
   * For any dependency at the latest version, running update detection
   * multiple times should consistently return no updates.
   */
  it('should consistently return no updates across multiple checks', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbHelmDependency,
        fc.array(arbSemVer, { minLength: 1, maxLength: 10 }),
        async (dependency, olderVersions) => {
          // Filter to only include versions older than current
          const filteredOlderVersions = olderVersions.filter(v => 
            semver.valid(v) && semver.lt(v, dependency.currentVersion)
          );
          
          const availableVersions = [dependency.currentVersion, ...filteredOlderVersions];
          
          const config = createTestConfig();
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
          
          // All should return no updates
          expect(updates1.length).toBe(0);
          expect(updates2.length).toBe(0);
          expect(updates3.length).toBe(0);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 14.8: No update when at latest patch for patch strategy
   * 
   * For any dependency at the latest patch version within its major.minor,
   * when strategy is 'patch', no update should be detected even if newer
   * minor/major versions exist.
   */
  it('should not propose updates when at latest patch with patch strategy', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (currentVersion) => {
          const [major, minor] = currentVersion.split('.').map(Number);
          
          // Create newer minor and major versions, but no newer patch
          const availableVersions = [
            currentVersion,
            `${major}.${minor + 1}.0`,
            `${major}.${minor + 2}.0`,
            `${major + 1}.0.0`
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
          
          // Should not detect any updates (no newer patch versions)
          expect(updates.length).toBe(0);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.9: No update when at latest minor for minor strategy
   * 
   * For any dependency at the latest minor version within its major,
   * when strategy is 'minor', no update should be detected even if newer
   * major versions exist.
   */
  it('should not propose updates when at latest minor with minor strategy', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (currentVersion) => {
          const [major] = currentVersion.split('.').map(Number);
          
          // Create newer major versions, but no newer minor within same major
          const availableVersions = [
            currentVersion,
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
          
          // Should not detect any updates (no newer minor versions within same major)
          expect(updates.length).toBe(0);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14.10: No update when version list contains duplicates
   * 
   * For any dependency at the latest version, even when the available
   * versions list contains duplicates, no update should be detected.
   */
  it('should not propose updates when version list has duplicates', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        fc.array(arbSemVer, { minLength: 1, maxLength: 5 }),
        async (latestVersion, olderVersions) => {
          const filteredOlderVersions = olderVersions.filter(v => 
            semver.valid(v) && semver.lt(v, latestVersion)
          );
          
          // Create duplicates of the latest version
          const availableVersions = [
            latestVersion,
            latestVersion,
            latestVersion,
            ...filteredOlderVersions
          ];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: latestVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          const config = createTestConfig();
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
});
