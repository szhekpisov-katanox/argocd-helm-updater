/**
 * Property-based tests for Version Constraint Respect
 * 
 * **Property 15: Version Constraint Respect**
 * **Validates: Requirements 4.6**
 * 
 * For any chart dependency with version constraints, selected updates should satisfy those constraints.
 */

import * as fc from 'fast-check';
import { VersionResolver } from '../../src/resolver/version-resolver';
import { HelmDependency } from '../../src/types/dependency';
import { ActionConfig } from '../../src/types/config';
import { ChartVersionInfo } from '../../src/types/version';
import { VersionParser } from '../../src/utils/version-parser';
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

// Generate caret range constraints
const arbCaretRange = arbSemVer.map(v => `^${v}`);

// Generate tilde range constraints
const arbTildeRange = arbSemVer.map(v => `~${v}`);

// Generate comparison operator constraints
const arbComparisonConstraint = fc.tuple(
  fc.constantFrom('>=', '>', '<=', '<'),
  arbSemVer
).map(([op, version]) => `${op}${version}`);

// Generate combined range constraints
const arbCombinedRange = fc.tuple(
  arbSemVer,
  arbSemVer
).map(([v1, v2]) => {
  // Ensure v1 < v2
  const sorted = [v1, v2].sort(semver.compare);
  return `>=${sorted[0]} <${sorted[1]}`;
});


// Generate any valid constraint
const arbValidConstraint = fc.oneof(
  arbCaretRange,
  arbTildeRange,
  arbComparisonConstraint,
  arbCombinedRange
);

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

describe('Property 15: Version Constraint Respect', () => {
  /**
   * Property 15.1: Caret constraint satisfaction
   * 
   * For any dependency with a caret constraint (^x.y.z), the selected update
   * should satisfy the caret range semantics.
   */
  it('should respect caret constraints when selecting updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (baseVersion) => {
          const [major, minor, patch] = baseVersion.split('.').map(Number);
          const constraint = `^${baseVersion}`;
          
          // Generate versions that satisfy and don't satisfy the constraint
          const satisfyingVersions: string[] = [];
          const nonSatisfyingVersions: string[] = [];
          
          if (major > 0) {
            // For major > 0: ^x.y.z allows >=x.y.z <(x+1).0.0
            satisfyingVersions.push(
              `${major}.${minor}.${patch + 1}`,
              `${major}.${minor + 1}.0`,
              `${major}.${minor + 2}.0`
            );
            nonSatisfyingVersions.push(
              `${major + 1}.0.0`,
              `${major + 2}.0.0`
            );
          } else if (minor > 0) {
            // For 0.x.y where x > 0: ^0.x.y allows >=0.x.y <0.(x+1).0
            satisfyingVersions.push(
              `${major}.${minor}.${patch + 1}`,
              `${major}.${minor}.${patch + 2}`
            );
            nonSatisfyingVersions.push(
              `${major}.${minor + 1}.0`,
              `${major + 1}.0.0`
            );
          } else {
            // For 0.0.x: ^0.0.x allows only 0.0.x (exact match)
            satisfyingVersions.push(baseVersion);
            nonSatisfyingVersions.push(
              `${major}.${minor}.${patch + 1}`,
              `${major}.${minor + 1}.0`,
              `${major + 1}.0.0`
            );
          }
          
          const availableVersions = [baseVersion, ...satisfyingVersions, ...nonSatisfyingVersions];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: constraint,
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
            const selectedVersion = updates[0].newVersion;
            const parsedConstraint = VersionParser.parse(constraint);
            
            // The selected version must satisfy the constraint
            expect(VersionParser.satisfies(selectedVersion, parsedConstraint)).toBe(true);
            
            // The selected version must be semantically valid
            expect(semver.valid(selectedVersion)).not.toBeNull();
          }
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.2: Tilde constraint satisfaction
   * 
   * For any dependency with a tilde constraint (~x.y.z), the selected update
   * should satisfy the tilde range semantics (same major.minor, higher patch).
   */
  it('should respect tilde constraints when selecting updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (baseVersion) => {
          const [major, minor, patch] = baseVersion.split('.').map(Number);
          const constraint = `~${baseVersion}`;
          
          // Generate versions that satisfy and don't satisfy the constraint
          const satisfyingVersions = [
            `${major}.${minor}.${patch + 1}`,
            `${major}.${minor}.${patch + 2}`,
            `${major}.${minor}.${patch + 3}`
          ];
          
          const nonSatisfyingVersions = [
            `${major}.${minor + 1}.0`,
            `${major + 1}.0.0`
          ];
          
          const availableVersions = [baseVersion, ...satisfyingVersions, ...nonSatisfyingVersions];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: constraint,
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
            const selectedVersion = updates[0].newVersion;
            const parsedConstraint = VersionParser.parse(constraint);
            
            // The selected version must satisfy the constraint
            expect(VersionParser.satisfies(selectedVersion, parsedConstraint)).toBe(true);
            
            // For tilde ranges, major.minor must match
            const selectedParsed = semver.parse(selectedVersion);
            expect(selectedParsed?.major).toBe(major);
            expect(selectedParsed?.minor).toBe(minor);
          }
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.3: Comparison operator constraint satisfaction
   * 
   * For any dependency with a comparison operator constraint (>=, >, <=, <),
   * the selected update should satisfy the comparison.
   */
  it('should respect comparison operator constraints when selecting updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        fc.constantFrom('>=', '>'),
        async (baseVersion, operator) => {
          const [major, minor, patch] = baseVersion.split('.').map(Number);
          const constraint = `${operator}${baseVersion}`;
          
          // Generate versions that satisfy the constraint
          const satisfyingVersions = [
            `${major}.${minor}.${patch + 1}`,
            `${major}.${minor + 1}.0`,
            `${major + 1}.0.0`
          ];
          
          // For >= operator, base version also satisfies
          if (operator === '>=') {
            satisfyingVersions.unshift(baseVersion);
          }
          
          const availableVersions = [...satisfyingVersions];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: constraint,
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
            const selectedVersion = updates[0].newVersion;
            const parsedConstraint = VersionParser.parse(constraint);
            
            // The selected version must satisfy the constraint
            expect(VersionParser.satisfies(selectedVersion, parsedConstraint)).toBe(true);
            
            // Verify the comparison holds
            if (operator === '>=') {
              expect(semver.gte(selectedVersion, baseVersion)).toBe(true);
            } else if (operator === '>') {
              expect(semver.gt(selectedVersion, baseVersion)).toBe(true);
            }
          }
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.4: Combined range constraint satisfaction
   * 
   * For any dependency with a combined range constraint (e.g., ">=1.0.0 <2.0.0"),
   * the selected update should satisfy all parts of the constraint.
   */
  it('should respect combined range constraints when selecting updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (lowerBound) => {
          const [major, minor, patch] = lowerBound.split('.').map(Number);
          const upperBound = `${major + 2}.0.0`;
          const constraint = `>=${lowerBound} <${upperBound}`;
          
          // Generate versions within and outside the range
          const withinRange = [
            lowerBound,
            `${major}.${minor}.${patch + 1}`,
            `${major}.${minor + 1}.0`,
            `${major + 1}.0.0`
          ];
          
          const outsideRange = [
            upperBound,
            `${major + 2}.0.0`,
            `${major + 3}.0.0`
          ];
          
          const availableVersions = [...withinRange, ...outsideRange];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: constraint,
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
            const selectedVersion = updates[0].newVersion;
            const parsedConstraint = VersionParser.parse(constraint);
            
            // The selected version must satisfy the constraint
            expect(VersionParser.satisfies(selectedVersion, parsedConstraint)).toBe(true);
            
            // Verify it's within the range
            expect(semver.gte(selectedVersion, lowerBound)).toBe(true);
            expect(semver.lt(selectedVersion, upperBound)).toBe(true);
          }
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.5: No update when no versions satisfy constraint
   * 
   * For any dependency with a constraint where no available versions satisfy it,
   * no update should be detected.
   */
  it('should not detect updates when no versions satisfy the constraint', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (baseVersion) => {
          const [major, minor, patch] = baseVersion.split('.').map(Number);
          // Create a constraint that only allows the base version
          const constraint = `=${baseVersion}`;
          
          // Only provide versions that don't satisfy (older and newer)
          const availableVersions = [
            `${Math.max(0, major - 1)}.${minor}.${patch}`,
            `${major}.${Math.max(0, minor - 1)}.${patch}`,
            `${major}.${minor + 1}.0`,
            `${major + 1}.0.0`
          ].filter(v => semver.valid(v) && v !== baseVersion);
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: constraint,
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
          
          // Should not detect any updates since no versions satisfy the constraint
          expect(updates.length).toBe(0);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.6: Constraint with update strategy interaction
   * 
   * For any dependency with both a constraint and an update strategy,
   * the selected update should satisfy both the constraint and the strategy.
   */
  it('should respect both constraint and update strategy', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        fc.constantFrom('major', 'minor', 'patch', 'all') as fc.Arbitrary<'major' | 'minor' | 'patch' | 'all'>,
        async (baseVersion, strategy) => {
          const [major, minor, patch] = baseVersion.split('.').map(Number);
          // Use a caret constraint
          const constraint = `^${baseVersion}`;
          
          // Generate various versions
          const availableVersions = [
            baseVersion,
            `${major}.${minor}.${patch + 1}`,
            `${major}.${minor + 1}.0`,
            `${major + 1}.0.0`,
            `${major + 2}.0.0`
          ];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: constraint,
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
            const selectedVersion = updates[0].newVersion;
            const parsedConstraint = VersionParser.parse(constraint);
            const selectedParsed = semver.parse(selectedVersion);
            
            // Must satisfy the constraint
            expect(VersionParser.satisfies(selectedVersion, parsedConstraint)).toBe(true);
            
            // Must also satisfy the update strategy
            if (selectedParsed) {
              if (strategy === 'patch') {
                expect(selectedParsed.major).toBe(major);
                expect(selectedParsed.minor).toBe(minor);
              } else if (strategy === 'minor') {
                expect(selectedParsed.major).toBe(major);
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
   * Property 15.7: Constraint satisfaction is consistent
   * 
   * For any dependency with a constraint, running update detection multiple times
   * should produce the same result (constraint satisfaction is deterministic).
   */
  it('should consistently respect constraints across multiple runs', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidConstraint,
        fc.array(arbSemVer, { minLength: 5, maxLength: 15 }),
        async (constraint, availableVersions) => {
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: constraint,
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
            
            // All selected versions must satisfy the constraint
            const parsedConstraint = VersionParser.parse(constraint);
            if (parsedConstraint.isValid) {
              expect(VersionParser.satisfies(updates1[0].newVersion, parsedConstraint)).toBe(true);
            }
          }
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 15.8: Constraint with pre-release versions
   * 
   * For any dependency with a constraint, pre-release versions should be
   * considered if they satisfy the constraint.
   */
  it('should respect constraints when considering pre-release versions', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (baseVersion) => {
          const [major, minor, patch] = baseVersion.split('.').map(Number);
          const constraint = `>=${baseVersion}`;
          
          // Generate both stable and pre-release versions
          const availableVersions = [
            baseVersion,
            `${major}.${minor}.${patch + 1}`,
            `${major}.${minor}.${patch + 1}-alpha.1`,
            `${major}.${minor}.${patch + 1}-beta.1`,
            `${major}.${minor + 1}.0`,
            `${major}.${minor + 1}.0-rc.1`
          ];
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: constraint,
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
            const selectedVersion = updates[0].newVersion;
            const parsedConstraint = VersionParser.parse(constraint);
            
            // The selected version must satisfy the constraint
            expect(VersionParser.satisfies(selectedVersion, parsedConstraint)).toBe(true);
            
            // Must be >= base version
            expect(semver.gte(selectedVersion, baseVersion)).toBe(true);
          }
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.9: Maximum satisfying version selection
   * 
   * For any dependency with a constraint and multiple satisfying versions,
   * the selected update should be the maximum version that satisfies the constraint.
   */
  it('should select the maximum version that satisfies the constraint', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        async (baseVersion) => {
          const [major, minor, patch] = baseVersion.split('.').map(Number);
          const constraint = `^${baseVersion}`;
          
          // Generate multiple versions that satisfy the constraint
          const satisfyingVersions = [
            baseVersion,
            `${major}.${minor}.${patch + 1}`,
            `${major}.${minor}.${patch + 2}`,
            `${major}.${minor + 1}.0`,
            `${major}.${minor + 2}.0`
          ];
          
          // Add versions that don't satisfy (if major > 0)
          const availableVersions = major > 0 
            ? [...satisfyingVersions, `${major + 1}.0.0`, `${major + 2}.0.0`]
            : satisfyingVersions;
          
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: constraint,
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
            const selectedVersion = updates[0].newVersion;
            const parsedConstraint = VersionParser.parse(constraint);
            
            // Must satisfy the constraint
            expect(VersionParser.satisfies(selectedVersion, parsedConstraint)).toBe(true);
            
            // Should be the maximum satisfying version
            const maxSatisfying = VersionParser.maxSatisfying(availableVersions, parsedConstraint);
            expect(selectedVersion).toBe(maxSatisfying);
          }
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15.10: Invalid constraint handling
   * 
   * For any dependency with an invalid constraint, the system should handle it
   * gracefully (either treat as exact version or skip).
   */
  it('should handle invalid constraints gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('invalid', 'not-a-version', '>>1.0.0', 'abc.def.ghi'),
        fc.array(arbSemVer, { minLength: 3, maxLength: 10 }),
        async (invalidConstraint, availableVersions) => {
          const dependency: HelmDependency = {
            manifestPath: 'test.yaml',
            documentIndex: 0,
            chartName: 'test-chart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: invalidConstraint,
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
          
          // Should not throw an error
          const updates = await resolver.checkForUpdates([dependency]);
          
          // Should either return no updates or handle gracefully
          expect(Array.isArray(updates)).toBe(true);
          
          resolver.resolveVersions = originalResolveVersions;
        }
      ),
      { numRuns: 50 }
    );
  });
});
