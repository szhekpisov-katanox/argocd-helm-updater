/**
 * Property-based tests for Version Ordering
 * 
 * **Property 11: Semantic Version Ordering**
 * **Validates: Requirements 4.1**
 * 
 * For any two semantic versions, the version comparator should correctly
 * determine their ordering according to semver rules (major.minor.patch precedence).
 */

import * as fc from 'fast-check';
import { VersionParser } from '../../src/utils/version-parser';

/**
 * Custom arbitraries for generating test data
 */

// Generate valid semantic versions
const arbSemVer = fc.tuple(
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 }),
  fc.nat({ max: 100 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// Generate semantic versions with pre-release tags
const arbSemVerWithPreRelease = fc.tuple(
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 }),
  fc.nat({ max: 100 }),
  fc.constantFrom('alpha', 'beta', 'rc', 'dev', 'snapshot'),
  fc.nat({ max: 10 })
).map(([major, minor, patch, tag, num]) => `${major}.${minor}.${patch}-${tag}.${num}`);

// Generate semantic versions with build metadata
const arbSemVerWithBuild = fc.tuple(
  arbSemVer,
  fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 1, maxLength: 10 })
).map(([version, build]) => `${version}+build.${build}`);

// Generate any valid semantic version
const arbAnyValidSemVer = fc.oneof(
  arbSemVer,
  arbSemVerWithPreRelease,
  arbSemVerWithBuild
);

describe('Property 11: Semantic Version Ordering', () => {
  /**
   * Property 11.1: Reflexivity
   * 
   * For any version v, compare(v, v) should return 0 (equal).
   */
  it('should satisfy reflexivity: v === v', () => {
    fc.assert(
      fc.property(arbAnyValidSemVer, (version) => {
        const result = VersionParser.compare(version, version);
        expect(result).toBe(0);
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.2: Antisymmetry
   * 
   * For any two versions v1 and v2, if compare(v1, v2) returns x,
   * then compare(v2, v1) should return -x.
   */
  it('should satisfy antisymmetry: compare(v1, v2) === -compare(v2, v1)', () => {
    fc.assert(
      fc.property(arbAnyValidSemVer, arbAnyValidSemVer, (v1, v2) => {
        const result1 = VersionParser.compare(v1, v2);
        const result2 = VersionParser.compare(v2, v1);
        
        if (result1 === null || result2 === null) {
          // Both should be null if either is null
          expect(result1).toBe(result2);
        } else {
          expect(result1).toBe(-result2);
        }
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.3: Transitivity
   * 
   * For any three versions v1, v2, v3, if v1 < v2 and v2 < v3,
   * then v1 < v3.
   */
  it('should satisfy transitivity: v1 < v2 && v2 < v3 => v1 < v3', () => {
    fc.assert(
      fc.property(
        arbAnyValidSemVer,
        arbAnyValidSemVer,
        arbAnyValidSemVer,
        (v1, v2, v3) => {
          const cmp12 = VersionParser.compare(v1, v2);
          const cmp23 = VersionParser.compare(v2, v3);
          const cmp13 = VersionParser.compare(v1, v3);
          
          // Skip if any comparison is null
          if (cmp12 === null || cmp23 === null || cmp13 === null) {
            return true;
          }
          
          // If v1 < v2 and v2 < v3, then v1 < v3
          if (cmp12 === -1 && cmp23 === -1) {
            expect(cmp13).toBe(-1);
          }
          
          // If v1 > v2 and v2 > v3, then v1 > v3
          if (cmp12 === 1 && cmp23 === 1) {
            expect(cmp13).toBe(1);
          }
          
          // If v1 === v2 and v2 === v3, then v1 === v3
          if (cmp12 === 0 && cmp23 === 0) {
            expect(cmp13).toBe(0);
          }
          
          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.4: Major version precedence
   * 
   * For any two versions with different major versions,
   * the one with the higher major version should be greater,
   * regardless of minor and patch versions.
   */
  it('should prioritize major version in comparison', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 50 }), fc.nat({ max: 100 })),
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 50 }), fc.nat({ max: 100 })),
        fc.integer({ min: 1, max: 5 }),
        ([major1, minor1, patch1], [minor2, patch2], majorDelta) => {
          const v1 = `${major1}.${minor1}.${patch1}`;
          const v2 = `${major1 + majorDelta}.${minor2}.${patch2}`;
          
          const result = VersionParser.compare(v1, v2);
          
          // v1 should be less than v2 (major1 < major1 + majorDelta)
          expect(result).toBe(-1);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.5: Minor version precedence (when major is equal)
   * 
   * For any two versions with the same major version but different
   * minor versions, the one with the higher minor version should be greater,
   * regardless of patch version.
   */
  it('should prioritize minor version when major versions are equal', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 50 }), fc.nat({ max: 100 })),
        fc.nat({ max: 100 }),
        fc.integer({ min: 1, max: 5 }),
        ([major, minor1, patch1], patch2, minorDelta) => {
          const v1 = `${major}.${minor1}.${patch1}`;
          const v2 = `${major}.${minor1 + minorDelta}.${patch2}`;
          
          const result = VersionParser.compare(v1, v2);
          
          // v1 should be less than v2 (minor1 < minor1 + minorDelta)
          expect(result).toBe(-1);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.6: Patch version precedence (when major and minor are equal)
   * 
   * For any two versions with the same major and minor versions,
   * the one with the higher patch version should be greater.
   */
  it('should prioritize patch version when major and minor versions are equal', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 50 }), fc.nat({ max: 100 })),
        fc.integer({ min: 1, max: 5 }),
        ([major, minor, patch], patchDelta) => {
          const v1 = `${major}.${minor}.${patch}`;
          const v2 = `${major}.${minor}.${patch + patchDelta}`;
          
          const result = VersionParser.compare(v1, v2);
          
          // v1 should be less than v2 (patch < patch + patchDelta)
          expect(result).toBe(-1);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.7: Pre-release version ordering
   * 
   * For any version, the pre-release version should be less than
   * the release version (e.g., 1.0.0-alpha < 1.0.0).
   */
  it('should order pre-release versions before release versions', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 50 }), fc.nat({ max: 100 })),
        fc.constantFrom('alpha', 'beta', 'rc'),
        fc.nat({ max: 10 }),
        ([major, minor, patch], tag, num) => {
          const release = `${major}.${minor}.${patch}`;
          const preRelease = `${major}.${minor}.${patch}-${tag}.${num}`;
          
          const result = VersionParser.compare(preRelease, release);
          
          // Pre-release should be less than release
          expect(result).toBe(-1);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.8: Pre-release tag ordering
   * 
   * For any two pre-release versions with the same base version,
   * they should be ordered lexicographically by their pre-release tags.
   */
  it('should order pre-release versions lexicographically', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 50 }), fc.nat({ max: 100 })),
        fc.nat({ max: 10 }),
        ([major, minor, patch], num) => {
          const base = `${major}.${minor}.${patch}`;
          
          // alpha < beta < rc (lexicographic order)
          const alpha = `${base}-alpha.${num}`;
          const beta = `${base}-beta.${num}`;
          const rc = `${base}-rc.${num}`;
          
          expect(VersionParser.compare(alpha, beta)).toBe(-1);
          expect(VersionParser.compare(beta, rc)).toBe(-1);
          expect(VersionParser.compare(alpha, rc)).toBe(-1);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.9: Build metadata is ignored in comparison
   * 
   * For any two versions that differ only in build metadata,
   * they should be considered equal.
   */
  it('should ignore build metadata in version comparison', () => {
    fc.assert(
      fc.property(
        arbSemVer,
        fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 1, maxLength: 10 }),
        fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 1, maxLength: 10 }),
        (version, build1, build2) => {
          const v1 = `${version}+build.${build1}`;
          const v2 = `${version}+build.${build2}`;
          
          const result = VersionParser.compare(v1, v2);
          
          // Versions should be equal (build metadata is ignored)
          expect(result).toBe(0);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.10: Sort consistency
   * 
   * For any list of versions, sorting them should produce a list
   * where each version is less than or equal to the next.
   */
  it('should produce correctly ordered list when sorting', () => {
    fc.assert(
      fc.property(
        fc.array(arbSemVer, { minLength: 2, maxLength: 20 }),
        (versions) => {
          const sorted = VersionParser.sort(versions);
          
          // Check that each version is <= the next
          for (let i = 0; i < sorted.length - 1; i++) {
            const cmp = VersionParser.compare(sorted[i], sorted[i + 1]);
            expect(cmp).toBeLessThanOrEqual(0);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.11: Descending sort consistency
   * 
   * For any list of versions, sorting them in descending order
   * should produce a list where each version is greater than or equal to the next.
   */
  it('should produce correctly ordered list when sorting in descending order', () => {
    fc.assert(
      fc.property(
        fc.array(arbSemVer, { minLength: 2, maxLength: 20 }),
        (versions) => {
          const sorted = VersionParser.sortDescending(versions);
          
          // Check that each version is >= the next
          for (let i = 0; i < sorted.length - 1; i++) {
            const cmp = VersionParser.compare(sorted[i], sorted[i + 1]);
            expect(cmp).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.12: Sort and reverse equivalence
   * 
   * For any list of versions, sorting in ascending order and then
   * reversing should be equivalent to sorting in descending order.
   */
  it('should have sort().reverse() equivalent to sortDescending()', () => {
    fc.assert(
      fc.property(
        fc.array(arbSemVer, { minLength: 1, maxLength: 20 }),
        (versions) => {
          const sortedAsc = VersionParser.sort(versions);
          const sortedDesc = VersionParser.sortDescending(versions);
          
          // Reverse the ascending sort
          const reversedAsc = [...sortedAsc].reverse();
          
          // Should be equal to descending sort
          expect(reversedAsc).toEqual(sortedDesc);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.13: Sort idempotence
   * 
   * For any list of versions, sorting it multiple times should
   * produce the same result.
   */
  it('should produce the same result when sorting multiple times', () => {
    fc.assert(
      fc.property(
        fc.array(arbSemVer, { minLength: 1, maxLength: 20 }),
        (versions) => {
          const sorted1 = VersionParser.sort(versions);
          const sorted2 = VersionParser.sort(sorted1);
          
          expect(sorted1).toEqual(sorted2);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.14: Sort preserves valid versions
   * 
   * For any list of versions, sorting should not add or remove
   * any valid versions (only filters out invalid ones).
   */
  it('should preserve all valid versions when sorting', () => {
    fc.assert(
      fc.property(
        fc.array(arbSemVer, { minLength: 1, maxLength: 20 }),
        (versions) => {
          const sorted = VersionParser.sort(versions);
          
          // All input versions should be in the sorted output
          versions.forEach(v => {
            expect(sorted).toContain(v);
          });
          
          // Sorted output should have same length (all are valid)
          expect(sorted.length).toBe(versions.length);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.15: Comparison with invalid versions
   * 
   * For any invalid version string, comparison should return null.
   */
  it('should return null when comparing invalid versions', () => {
    fc.assert(
      fc.property(
        arbSemVer,
        fc.constantFrom('invalid', 'not-a-version', 'abc', '1.2', '1.x.3'),
        (validVersion, invalidVersion) => {
          const result1 = VersionParser.compare(validVersion, invalidVersion);
          const result2 = VersionParser.compare(invalidVersion, validVersion);
          const result3 = VersionParser.compare(invalidVersion, invalidVersion);
          
          // All comparisons involving invalid versions should return null
          expect(result1).toBeNull();
          expect(result2).toBeNull();
          expect(result3).toBeNull();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.16: Comparison consistency with semver library
   * 
   * For any two valid versions, our comparison should match
   * the semver library's comparison.
   */
  it('should match semver library comparison results', () => {
    fc.assert(
      fc.property(
        arbAnyValidSemVer,
        arbAnyValidSemVer,
        (v1, v2) => {
          const ourResult = VersionParser.compare(v1, v2);
          
          // Import semver for direct comparison
          const semver = require('semver');
          
          if (ourResult === null) {
            // If our comparison returns null, at least one version should be invalid
            expect(semver.valid(v1) === null || semver.valid(v2) === null).toBe(true);
          } else {
            // Our result should match semver's compare
            const semverResult = semver.compare(v1, v2);
            expect(ourResult).toBe(semverResult);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.17: Total ordering
   * 
   * For any two distinct valid versions, one must be less than the other
   * (no incomparable versions).
   */
  it('should provide total ordering for all valid versions', () => {
    fc.assert(
      fc.property(
        arbSemVer,
        arbSemVer,
        (v1, v2) => {
          const result = VersionParser.compare(v1, v2);
          
          // Result should be one of -1, 0, or 1 (never null for valid versions)
          expect(result).not.toBeNull();
          expect([-1, 0, 1]).toContain(result);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 11.18: Ordering respects version components
   * 
   * For any version v = major.minor.patch, incrementing any component
   * should produce a greater version.
   */
  it('should respect version component increments', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 50 }), fc.nat({ max: 100 })),
        ([major, minor, patch]) => {
          const base = `${major}.${minor}.${patch}`;
          
          // Incrementing major should produce greater version
          if (major < 20) {
            const majorIncremented = `${major + 1}.${minor}.${patch}`;
            expect(VersionParser.compare(base, majorIncremented)).toBe(-1);
          }
          
          // Incrementing minor should produce greater version
          if (minor < 100) {
            const minorIncremented = `${major}.${minor + 1}.${patch}`;
            expect(VersionParser.compare(base, minorIncremented)).toBe(-1);
          }
          
          // Incrementing patch should produce greater version
          if (patch < 200) {
            const patchIncremented = `${major}.${minor}.${patch + 1}`;
            expect(VersionParser.compare(base, patchIncremented)).toBe(-1);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});
