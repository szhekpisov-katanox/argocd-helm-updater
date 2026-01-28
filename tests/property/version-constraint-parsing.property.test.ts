/**
 * Property-based tests for Version Constraint Parsing
 * 
 * **Property 6: Version Constraint Parsing**
 * **Validates: Requirements 2.6**
 * 
 * For any valid semantic version constraint (exact version, range, or pattern),
 * the parser should correctly interpret the constraint for version comparison.
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

// Generate caret range constraints
const arbCaretRange = arbSemVer.map(v => `^${v}`);

// Generate tilde range constraints
const arbTildeRange = arbSemVer.map(v => `~${v}`);

// Generate comparison operator constraints
const arbComparisonConstraint = fc.tuple(
  fc.constantFrom('>=', '>', '<=', '<', '='),
  arbSemVer
).map(([op, version]) => `${op}${version}`);

// Generate hyphen range constraints
const arbHyphenRange = fc.tuple(arbSemVer, arbSemVer).map(([v1, v2]) => `${v1} - ${v2}`);

// Generate X-range constraints
const arbXRange = fc.oneof(
  fc.tuple(fc.nat({ max: 20 })).map(([major]) => `${major}.x`),
  fc.tuple(fc.nat({ max: 20 }), fc.nat({ max: 50 })).map(([major, minor]) => `${major}.${minor}.x`),
  fc.constant('*')
);

// Generate combined range constraints
const arbCombinedRange = fc.tuple(
  arbComparisonConstraint,
  arbComparisonConstraint
).map(([c1, c2]) => `${c1} ${c2}`);

// Generate any valid constraint
const arbValidConstraint = fc.oneof(
  arbSemVer,
  arbSemVerWithPreRelease,
  arbCaretRange,
  arbTildeRange,
  arbComparisonConstraint,
  arbHyphenRange,
  arbXRange,
  arbCombinedRange
);

describe('Property 6: Version Constraint Parsing', () => {
  /**
   * Property 6.1: Valid constraint parsing
   * 
   * For any valid semantic version constraint, the parser should
   * successfully parse it and mark it as valid.
   */
  it('should successfully parse all valid semantic version constraints', () => {
    fc.assert(
      fc.property(arbValidConstraint, (constraint) => {
        const result = VersionParser.parse(constraint);

        // Should be marked as valid
        expect(result.isValid).toBe(true);
        
        // Should have a non-null range
        expect(result.range).not.toBeNull();
        
        // Should preserve original constraint
        expect(result.original).toBe(constraint);
        
        // Should not have an error
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.2: Exact version constraint type detection
   * 
   * For any exact semantic version (no operators or wildcards),
   * the parser should detect it as type 'exact'.
   */
  it('should detect exact versions correctly', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbSemVer, arbSemVerWithPreRelease, arbSemVerWithBuild),
        (version) => {
          const result = VersionParser.parse(version);

          expect(result.isValid).toBe(true);
          expect(result.type).toBe('exact');
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.3: Range constraint type detection
   * 
   * For any range constraint (with operators or wildcards),
   * the parser should detect it as type 'range'.
   */
  it('should detect range constraints correctly', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          arbCaretRange,
          arbTildeRange,
          arbComparisonConstraint,
          arbHyphenRange,
          arbXRange,
          arbCombinedRange
        ),
        (constraint) => {
          const result = VersionParser.parse(constraint);

          expect(result.isValid).toBe(true);
          expect(result.type).toBe('range');
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.4: Constraint parsing idempotence
   * 
   * For any constraint, parsing it multiple times should produce
   * identical results.
   */
  it('should produce consistent results when parsing the same constraint multiple times', () => {
    fc.assert(
      fc.property(arbValidConstraint, (constraint) => {
        const result1 = VersionParser.parse(constraint);
        const result2 = VersionParser.parse(constraint);

        expect(result1).toEqual(result2);
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.5: Caret range semantics
   * 
   * For any caret range constraint (^x.y.z), versions should satisfy
   * according to semver caret rules:
   * - ^1.2.3 allows >=1.2.3 <2.0.0
   * - ^0.2.3 allows >=0.2.3 <0.3.0 (0.x.y is special)
   * - ^0.0.3 allows only 0.0.3 (exact match for 0.0.x)
   * - ^0.0.0 allows only 0.0.0 (exact match)
   */
  it('should correctly interpret caret range semantics', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 20 }), fc.nat({ max: 30 })),
        fc.nat({ max: 10 }),
        fc.nat({ max: 10 }),
        ([major, minor, patch], minorDelta, patchDelta) => {
          const constraint = VersionParser.parse(`^${major}.${minor}.${patch}`);
          const baseVersion = `${major}.${minor}.${patch}`;
          
          // Base version should always satisfy
          expect(VersionParser.satisfies(baseVersion, constraint)).toBe(true);
          
          if (major > 0) {
            // For major > 0: ^x.y.z allows changes that don't modify left-most non-zero digit
            // Same major, higher minor should satisfy
            const higherMinor = `${major}.${minor + minorDelta + 1}.0`;
            expect(VersionParser.satisfies(higherMinor, constraint)).toBe(true);
            
            // Same major.minor, higher patch should satisfy
            const higherPatch = `${major}.${minor}.${patch + patchDelta + 1}`;
            expect(VersionParser.satisfies(higherPatch, constraint)).toBe(true);
            
            // Higher major should NOT satisfy
            if (major < 20) {
              const higherMajor = `${major + 1}.0.0`;
              expect(VersionParser.satisfies(higherMajor, constraint)).toBe(false);
            }
          } else if (minor > 0) {
            // For 0.x.y where x > 0: ^0.x.y allows >=0.x.y <0.(x+1).0
            // Same minor, higher patch should satisfy
            const higherPatch = `${major}.${minor}.${patch + patchDelta + 1}`;
            expect(VersionParser.satisfies(higherPatch, constraint)).toBe(true);
            
            // Higher minor should NOT satisfy
            if (minor < 50) {
              const higherMinor = `${major}.${minor + 1}.0`;
              expect(VersionParser.satisfies(higherMinor, constraint)).toBe(false);
            }
          } else {
            // For 0.0.x: ^0.0.x allows only 0.0.x (exact match)
            // Any other version should NOT satisfy
            if (patch < 100) {
              const higherPatch = `${major}.${minor}.${patch + 1}`;
              expect(VersionParser.satisfies(higherPatch, constraint)).toBe(false);
            }
            
            const higherMinor = `${major}.${minor + 1}.0`;
            expect(VersionParser.satisfies(higherMinor, constraint)).toBe(false);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.6: Tilde range semantics
   * 
   * For any tilde range constraint (~x.y.z), versions with the same
   * major.minor version (and >= patch) should satisfy the constraint.
   */
  it('should correctly interpret tilde range semantics', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 20 }), fc.nat({ max: 30 })),
        fc.nat({ max: 10 }),
        ([major, minor, patch], patchDelta) => {
          const constraint = VersionParser.parse(`~${major}.${minor}.${patch}`);
          
          // Same major.minor, higher patch should satisfy
          const higherPatch = `${major}.${minor}.${patch + patchDelta + 1}`;
          expect(VersionParser.satisfies(higherPatch, constraint)).toBe(true);
          
          // Higher minor should NOT satisfy
          if (minor < 50) {
            const higherMinor = `${major}.${minor + 1}.0`;
            expect(VersionParser.satisfies(higherMinor, constraint)).toBe(false);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.7: Comparison operator semantics
   * 
   * For any comparison operator constraint, versions should satisfy
   * the constraint according to the operator semantics.
   */
  it('should correctly interpret comparison operator semantics', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 20 }), fc.nat({ max: 30 })),
        ([major, minor, patch]) => {
          const version = `${major}.${minor}.${patch}`;
          
          // >= should include the version itself
          const gte = VersionParser.parse(`>=${version}`);
          expect(VersionParser.satisfies(version, gte)).toBe(true);
          
          // <= should include the version itself
          const lte = VersionParser.parse(`<=${version}`);
          expect(VersionParser.satisfies(version, lte)).toBe(true);
          
          // = should include the version itself
          const eq = VersionParser.parse(`=${version}`);
          expect(VersionParser.satisfies(version, eq)).toBe(true);
          
          // > should NOT include the version itself
          const gt = VersionParser.parse(`>${version}`);
          expect(VersionParser.satisfies(version, gt)).toBe(false);
          
          // < should NOT include the version itself
          const lt = VersionParser.parse(`<${version}`);
          expect(VersionParser.satisfies(version, lt)).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.8: Constraint transitivity
   * 
   * For any three versions v1 < v2 < v3 and constraint that satisfies v2,
   * if the constraint is >=v1, then v3 should also satisfy.
   */
  it('should maintain transitivity for >= constraints', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.nat({ max: 5 }),
          fc.nat({ max: 10 }),
          fc.nat({ max: 20 })
        ),
        fc.tuple(
          fc.nat({ max: 5 }),
          fc.nat({ max: 5 })
        ),
        ([major, minor, patch], [minorDelta, patchDelta]) => {
          const v1 = `${major}.${minor}.${patch}`;
          const v2 = `${major}.${minor + minorDelta}.${patch}`;
          const v3 = `${major}.${minor + minorDelta}.${patch + patchDelta + 1}`;
          
          const constraint = VersionParser.parse(`>=${v1}`);
          
          // If v2 satisfies, v3 should also satisfy (since v3 > v2 >= v1)
          if (VersionParser.satisfies(v2, constraint)) {
            expect(VersionParser.satisfies(v3, constraint)).toBe(true);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.9: Whitespace handling
   * 
   * For any constraint with leading/trailing whitespace, the parser
   * should handle it correctly and produce the same result as without whitespace.
   */
  it('should handle whitespace in constraints correctly', () => {
    fc.assert(
      fc.property(
        arbValidConstraint,
        fc.stringOf(fc.constantFrom(' ', '\t'), { maxLength: 5 }),
        fc.stringOf(fc.constantFrom(' ', '\t'), { maxLength: 5 }),
        (constraint, leading, trailing) => {
          const withWhitespace = `${leading}${constraint}${trailing}`;
          const result = VersionParser.parse(withWhitespace);

          // Should still be valid
          expect(result.isValid).toBe(true);
          
          // Original should preserve the whitespace
          expect(result.original).toBe(withWhitespace);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.10: Invalid constraint detection
   * 
   * For any string that is clearly not a valid semantic version constraint,
   * the parser should mark it as invalid. Note: semver accepts partial
   * versions like "1.2" as valid ranges (equivalent to "1.2.x").
   */
  it('should detect invalid constraints', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.constant('   '),
          // Strings that are clearly not version-related
          fc.constantFrom('not-a-version', 'invalid', 'hello-world', 'abc', 'xyz'),
          // Malformed operators
          fc.constantFrom('>>1.0.0', '<<1.0.0', '===1.0.0'),
          // Invalid characters
          fc.stringOf(fc.constantFrom('!', '@', '#', '$', '%', '&'), { minLength: 1, maxLength: 5 })
        ),
        (invalidConstraint) => {
          const result = VersionParser.parse(invalidConstraint);

          // Should be marked as invalid
          expect(result.isValid).toBe(false);
          
          // Should have null range
          expect(result.range).toBeNull();
          
          // Should have an error message
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.11: Constraint satisfaction reflexivity
   * 
   * For any exact version constraint, the version itself should
   * always satisfy the constraint.
   */
  it('should satisfy reflexivity for exact version constraints', () => {
    fc.assert(
      fc.property(arbSemVer, (version) => {
        const constraint = VersionParser.parse(version);
        
        // Version should satisfy itself
        expect(VersionParser.satisfies(version, constraint)).toBe(true);
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.12: Combined range constraint semantics
   * 
   * For any combined range constraint (e.g., ">=1.0.0 <2.0.0"),
   * a version should satisfy the constraint only if it satisfies
   * all individual constraints.
   */
  it('should correctly interpret combined range constraints', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 20 }), fc.nat({ max: 30 })),
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 20 }), fc.nat({ max: 30 })),
        ([major1, minor1, patch1], [major2, minor2, patch2]) => {
          // Ensure v1 < v2
          const v1 = `${Math.min(major1, major2)}.${minor1}.${patch1}`;
          const v2 = `${Math.max(major1, major2) + 1}.${minor2}.${patch2}`;
          
          const constraint = VersionParser.parse(`>=${v1} <${v2}`);
          
          // v1 should satisfy (>= v1)
          expect(VersionParser.satisfies(v1, constraint)).toBe(true);
          
          // v2 should NOT satisfy (< v2 means v2 is excluded)
          expect(VersionParser.satisfies(v2, constraint)).toBe(false);
          
          // Version between v1 and v2 should satisfy
          const vMid = `${Math.min(major1, major2) + 1}.0.0`;
          if (VersionParser.compare(vMid, v2) === -1) {
            expect(VersionParser.satisfies(vMid, constraint)).toBe(true);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.13: X-range wildcard semantics
   * 
   * For any X-range constraint (e.g., "1.2.x"), versions with matching
   * non-wildcard parts should satisfy the constraint.
   */
  it('should correctly interpret X-range wildcard semantics', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 20 })),
        fc.nat({ max: 30 }),
        ([major, minor], patch) => {
          const constraint = VersionParser.parse(`${major}.${minor}.x`);
          
          // Any patch version with same major.minor should satisfy
          const version = `${major}.${minor}.${patch}`;
          expect(VersionParser.satisfies(version, constraint)).toBe(true);
          
          // Different minor should NOT satisfy
          if (minor < 50) {
            const differentMinor = `${major}.${minor + 1}.${patch}`;
            expect(VersionParser.satisfies(differentMinor, constraint)).toBe(false);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.14: Pre-release version handling
   * 
   * For any constraint, pre-release versions should be handled
   * according to semver rules. Note: pre-release versions only
   * satisfy ranges if the range explicitly includes pre-release
   * versions (e.g., ">=1.0.0-alpha" or "1.0.0-alpha").
   */
  it('should handle pre-release versions correctly in constraints', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.integer({ min: 1, max: 10 }), fc.nat({ max: 20 }), fc.nat({ max: 30 })),
        ([major, minor, patch]) => {
          const release = `${major}.${minor}.${patch}`;
          const preRelease = `${major}.${minor}.${patch}-alpha.1`;
          
          // Pre-release should be less than release when comparing directly
          expect(VersionParser.compare(preRelease, release)).toBe(-1);
          
          // Exact pre-release constraint should match the pre-release version
          const exactPreReleaseConstraint = VersionParser.parse(preRelease);
          expect(VersionParser.satisfies(preRelease, exactPreReleaseConstraint)).toBe(true);
          
          // Range including pre-release should work
          const rangeWithPreRelease = VersionParser.parse(`>=${preRelease}`);
          expect(VersionParser.satisfies(preRelease, rangeWithPreRelease)).toBe(true);
          expect(VersionParser.satisfies(release, rangeWithPreRelease)).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.15: Constraint parsing preserves original string
   * 
   * For any constraint, the parsed result should preserve the
   * original constraint string exactly.
   */
  it('should preserve the original constraint string', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbValidConstraint, fc.string()),
        (constraint) => {
          const result = VersionParser.parse(constraint);
          
          // Original should be preserved exactly
          expect(result.original).toBe(constraint);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.16: Filter versions consistency
   * 
   * For any constraint and list of versions, filtering versions
   * should be equivalent to checking each version individually.
   */
  it('should filter versions consistently with individual satisfaction checks', () => {
    fc.assert(
      fc.property(
        arbValidConstraint,
        fc.array(arbSemVer, { minLength: 1, maxLength: 20 }),
        (constraintStr, versions) => {
          const constraint = VersionParser.parse(constraintStr);
          
          if (!constraint.isValid) {
            return true; // Skip invalid constraints
          }
          
          const filtered = VersionParser.filterVersions(versions, constraint);
          const manuallyFiltered = versions.filter(v => VersionParser.satisfies(v, constraint));
          
          // Results should be identical
          expect(filtered).toEqual(manuallyFiltered);
          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.17: Max satisfying version correctness
   * 
   * For any constraint and list of versions, the max satisfying version
   * should be the largest version that satisfies the constraint.
   */
  it('should find the maximum satisfying version correctly', () => {
    fc.assert(
      fc.property(
        arbValidConstraint,
        fc.array(arbSemVer, { minLength: 1, maxLength: 20 }),
        (constraintStr, versions) => {
          const constraint = VersionParser.parse(constraintStr);
          
          if (!constraint.isValid) {
            return true; // Skip invalid constraints
          }
          
          const max = VersionParser.maxSatisfying(versions, constraint);
          const filtered = VersionParser.filterVersions(versions, constraint);
          
          if (filtered.length === 0) {
            // No satisfying versions
            expect(max).toBeNull();
          } else {
            // Max should be in the filtered list
            expect(filtered).toContain(max);
            
            // Max should be >= all other satisfying versions
            filtered.forEach(v => {
              const cmp = VersionParser.compare(max!, v);
              expect(cmp).toBeGreaterThanOrEqual(0);
            });
          }
          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 6.18: Min satisfying version correctness
   * 
   * For any constraint and list of versions, the min satisfying version
   * should be the smallest version that satisfies the constraint.
   */
  it('should find the minimum satisfying version correctly', () => {
    fc.assert(
      fc.property(
        arbValidConstraint,
        fc.array(arbSemVer, { minLength: 1, maxLength: 20 }),
        (constraintStr, versions) => {
          const constraint = VersionParser.parse(constraintStr);
          
          if (!constraint.isValid) {
            return true; // Skip invalid constraints
          }
          
          const min = VersionParser.minSatisfying(versions, constraint);
          const filtered = VersionParser.filterVersions(versions, constraint);
          
          if (filtered.length === 0) {
            // No satisfying versions
            expect(min).toBeNull();
          } else {
            // Min should be in the filtered list
            expect(filtered).toContain(min);
            
            // Min should be <= all other satisfying versions
            filtered.forEach(v => {
              const cmp = VersionParser.compare(min!, v);
              expect(cmp).toBeLessThanOrEqual(0);
            });
          }
          return true;
        }
      ),
      { numRuns: 10 }
    );
  });
});
