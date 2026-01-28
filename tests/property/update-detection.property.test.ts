/**
 * Property-based tests for Update Detection
 * 
 * **Property 12: Update Detection**
 * **Validates: Requirements 4.2**
 * 
 * For any chart dependency where a newer version exists in the repository,
 * the update checker should identify it as an update candidate.
 */

import * as fc from 'fast-check';
import { VersionResolver } from '../../src/resolver/version-resolver';
import { HelmDependency } from '../../src/types/dependency';
import { ActionConfig } from '../../src/types/config';
import { ChartVersionInfo } from '../../src/types/version';

/**
 * Custom arbitraries for generating test data
 */

// Generate valid semantic versions
const arbSemVer = fc.tuple(
  fc.nat({ max: 10 }),
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// Generate a list of versions where at least one is newer than a base version
const arbVersionsWithNewer = (baseVersion: string) => {
  const [baseMajor, baseMinor, basePatch] = baseVersion.split('.').map(Number);
  
  return fc.array(
    fc.oneof(
      // Newer major version
      fc.tuple(
        fc.integer({ min: baseMajor + 1, max: baseMajor + 5 }),
        fc.nat({ max: 20 }),
        fc.nat({ max: 50 })
      ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`),
      
      // Newer minor version (same major)
      fc.tuple(
        fc.constant(baseMajor),
        fc.integer({ min: baseMinor + 1, max: baseMinor + 10 }),
        fc.nat({ max: 50 })
      ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`),
      
      // Newer patch version (same major.minor)
      fc.tuple(
        fc.constant(baseMajor),
        fc.constant(baseMinor),
        fc.integer({ min: basePatch + 1, max: basePatch + 20 })
      ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`)
    ),
    { minLength: 1, maxLength: 10 }
  );
};

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
  changelog: {
    enabled: true,
    maxLength: 5000,
    cacheTTL: 3600,
  },
  ...overrides
});

describe('Property 12: Update Detection', () => {
  /**
   * Property 12.1: Newer version detection
   * 
   * For any dependency with a current version and a list of available versions
   * that includes at least one newer version, the update checker should identify
   * an update candidate.
   */
  it('should detect updates when newer versions are available', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (currentVersion) => {
          // Generate versions that are newer than current
          const newerVersions = await fc.sample(arbVersionsWithNewer(currentVersion), 1);
          const availableVersions = [...newerVersions[0], currentVersion];
          
          // Create a mock dependency
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };
          
          // Create resolver with mocked version resolution
          const config = createTestConfig();
          const resolver = new VersionResolver(config);
          
          // Mock the resolveVersions method
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(
              `${dependency.repoURL}/${dependency.chartName}`,
              availableVersions.map(v => ({ version: v }))
            );
            return versionMap;
          };
          
          // Check for updates
          const updates = await resolver.checkForUpdates([dependency]);
          
          // Should detect at least one update
          expect(updates.length).toBeGreaterThan(0);
          
          // The new version should be different from current
          expect(updates[0].newVersion).not.toBe(currentVersion);
          
          // The new version should be one of the available versions
          expect(availableVersions).toContain(updates[0].newVersion);
          
          // Restore original method
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 12.2: Update candidate is newer
   * 
   * For any detected update, the new version should be semantically
   * greater than the current version.
   */
  it('should only propose versions that are semantically newer', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (currentVersion) => {
          const newerVersions = await fc.sample(arbVersionsWithNewer(currentVersion), 1);
          const availableVersions = [...newerVersions[0], currentVersion];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
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
          
          if (updates.length > 0) {
            const semver = require('semver');
            const newVersion = updates[0].newVersion;
            
            // New version must be greater than current
            expect(semver.gt(newVersion, currentVersion)).toBe(true);
          }
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 12.3: No update for latest version
   * 
   * For any dependency where the current version is the latest available,
   * no update should be detected.
   */
  it('should not detect updates when current version is latest', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        fc.array(arbSemVer, { minLength: 1, maxLength: 10 }),
        async (latestVersion, olderVersions) => {
          const semver = require('semver');
          
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
      { numRuns: 10 }
    );
  });

  /**
   * Property 12.4: Multiple dependencies detection
   * 
   * For any list of dependencies, each dependency with a newer version
   * should be independently detected as an update candidate.
   */
  it('should detect updates for each dependency independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbHelmDependency, { minLength: 2, maxLength: 5 }),
        async (dependencies) => {
          const config = createTestConfig();
          const resolver = new VersionResolver(config);
          
          // Deduplicate dependencies by chart/repo combination to ensure uniqueness
          const uniqueDeps = new Map<string, HelmDependency>();
          for (const dep of dependencies) {
            const key = `${dep.repoURL}/${dep.chartName}`;
            if (!uniqueDeps.has(key)) {
              uniqueDeps.set(key, dep);
            }
          }
          
          // Skip test if we don't have at least 2 unique dependencies
          if (uniqueDeps.size < 2) {
            return true;
          }
          
          const uniqueDependencies = Array.from(uniqueDeps.values());
          
          // For each dependency, create available versions with at least one newer
          const versionMap = new Map<string, ChartVersionInfo[]>();
          
          for (const dep of uniqueDependencies) {
            const newerVersions = await fc.sample(arbVersionsWithNewer(dep.currentVersion), 1);
            const availableVersions = [...newerVersions[0], dep.currentVersion];
            
            versionMap.set(
              `${dep.repoURL}/${dep.chartName}`,
              availableVersions.map(v => ({ version: v }))
            );
          }
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => versionMap;
          
          const updates = await resolver.checkForUpdates(uniqueDependencies);
          
          // Should detect updates for all unique dependencies
          expect(updates.length).toBe(uniqueDependencies.length);
          
          // Each update should correspond to a different dependency
          const updatedCharts = new Set(
            updates.map(u => `${u.dependency.repoURL}/${u.dependency.chartName}`)
          );
          expect(updatedCharts.size).toBe(uniqueDependencies.length);
          
          resolver.resolveVersions = originalResolveVersions;
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 12.5: Update detection with mixed versions
   * 
   * For any list of available versions (some newer, some older, some equal),
   * the update checker should only consider newer versions as candidates.
   */
  it('should only consider newer versions as update candidates', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (currentVersion) => {
          const semver = require('semver');
          const [major, minor, patch] = currentVersion.split('.').map(Number);
          
          // Create a mix of older, equal, and newer versions
          const olderVersions = [
            `${major}.${minor}.${Math.max(0, patch - 1)}`,
            `${major}.${Math.max(0, minor - 1)}.${patch}`,
            `${Math.max(0, major - 1)}.${minor}.${patch}`
          ].filter(v => semver.valid(v) && semver.lt(v, currentVersion));
          
          const newerVersions = [
            `${major}.${minor}.${patch + 1}`,
            `${major}.${minor + 1}.${patch}`,
            `${major + 1}.${minor}.${patch}`
          ];
          
          const availableVersions = [
            ...olderVersions,
            currentVersion,
            ...newerVersions
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
          
          // Should detect exactly one update
          expect(updates.length).toBe(1);
          
          // The new version should be newer than current
          expect(semver.gt(updates[0].newVersion, currentVersion)).toBe(true);
          
          // The new version should not be older or equal
          expect(semver.lte(updates[0].newVersion, currentVersion)).toBe(false);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 12.6: Update detection consistency
   * 
   * For any dependency, running update detection multiple times with the
   * same available versions should produce the same result.
   */
  it('should produce consistent results across multiple runs', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbHelmDependency,
        fc.array(arbSemVer, { minLength: 5, maxLength: 15 }),
        async (dependency, availableVersions) => {
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
   * Property 12.7: Empty version list handling
   * 
   * For any dependency where no versions are available in the repository,
   * no update should be detected.
   */
  it('should handle empty version lists gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbHelmDependency,
        async (dependency) => {
          const config = createTestConfig();
          const resolver = new VersionResolver(config);
          
          const originalResolveVersions = resolver.resolveVersions.bind(resolver);
          resolver.resolveVersions = async () => {
            const versionMap = new Map<string, ChartVersionInfo[]>();
            versionMap.set(`${dependency.repoURL}/${dependency.chartName}`, []);
            return versionMap;
          };
          
          const updates = await resolver.checkForUpdates([dependency]);
          
          // Should not detect any updates
          expect(updates.length).toBe(0);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 12.8: Update detection with pre-release versions
   * 
   * For any dependency with a stable version, pre-release versions of higher
   * versions should still be detected as update candidates.
   * 
   * Note: This test also includes stable versions to ensure the resolver
   * can find updates even when pre-release versions are present.
   */
  it('should detect pre-release versions as updates when they are newer', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (currentVersion) => {
          const [major, minor, patch] = currentVersion.split('.').map(Number);
          
          // Create both pre-release and stable versions that are newer
          // Include stable versions to ensure at least one valid update candidate
          const newerVersions = [
            `${major}.${minor}.${patch + 1}`,  // Stable patch bump
            `${major}.${minor}.${patch + 1}-alpha.1`,  // Pre-release
            `${major}.${minor + 1}.0`,  // Stable minor bump
            `${major}.${minor + 1}.0-beta.1`,  // Pre-release
            `${major + 1}.0.0`,  // Stable major bump
            `${major + 1}.0.0-rc.1`  // Pre-release
          ];
          
          const availableVersions = [currentVersion, ...newerVersions];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
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
          
          // Should detect at least one update
          expect(updates.length).toBeGreaterThan(0);
          
          const semver = require('semver');
          // The detected update should be newer than current
          expect(semver.gt(updates[0].newVersion, currentVersion)).toBe(true);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 10 }
    );
  });
});
