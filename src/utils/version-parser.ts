/**
 * VersionParser - Parses and validates semantic version constraints
 *
 * This utility is responsible for:
 * - Parsing exact versions (e.g., "1.2.3")
 * - Parsing version ranges (e.g., "^1.2.0", "~1.2.0", ">=1.0.0")
 * - Parsing version patterns
 * - Using semver library for constraint handling
 *
 * Requirements: 2.6
 */

import * as semver from 'semver';

/**
 * Represents a parsed version constraint
 */
export interface VersionConstraint {
  /** Original constraint string */
  original: string;
  /** Type of constraint */
  type: 'exact' | 'range' | 'pattern';
  /** Parsed semver range (if valid) */
  range: semver.Range | null;
  /** Whether the constraint is valid */
  isValid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * VersionParser provides utilities for parsing and validating version constraints
 */
export class VersionParser {
  /**
   * Parses a version constraint string
   *
   * Supports:
   * - Exact versions: "1.2.3"
   * - Caret ranges: "^1.2.0" (allows changes that do not modify left-most non-zero digit)
   * - Tilde ranges: "~1.2.0" (allows patch-level changes)
   * - Comparison operators: ">=1.0.0", ">1.0.0", "<=2.0.0", "<2.0.0", "=1.0.0"
   * - Hyphen ranges: "1.0.0 - 2.0.0"
   * - X-ranges: "1.2.x", "1.x", "*"
   * - Combined ranges: ">=1.0.0 <2.0.0"
   *
   * @param constraint - Version constraint string
   * @returns Parsed version constraint
   */
  static parse(constraint: string): VersionConstraint {
    // Trim whitespace
    const trimmed = constraint.trim();

    if (!trimmed) {
      return {
        original: constraint,
        type: 'exact',
        range: null,
        isValid: false,
        error: 'Empty constraint string',
      };
    }

    // Try to parse as a semver range
    try {
      const range = new semver.Range(trimmed);
      
      // Determine constraint type
      const type = this.determineConstraintType(trimmed);

      return {
        original: constraint,
        type,
        range,
        isValid: true,
      };
    } catch (error) {
      return {
        original: constraint,
        type: 'pattern',
        range: null,
        isValid: false,
        error: error instanceof Error ? error.message : 'Invalid semver constraint',
      };
    }
  }

  /**
   * Determines the type of version constraint
   *
   * @param constraint - Trimmed constraint string
   * @returns Constraint type
   * @private
   */
  private static determineConstraintType(constraint: string): 'exact' | 'range' | 'pattern' {
    // Check if it's an exact version (no operators or wildcards)
    if (semver.valid(constraint)) {
      return 'exact';
    }

    // Check for range operators
    const rangeOperators = ['^', '~', '>', '<', '=', '-', ' '];
    const hasRangeOperator = rangeOperators.some(op => constraint.includes(op));
    
    // Check for wildcards
    const hasWildcard = constraint.includes('x') || constraint.includes('X') || constraint.includes('*');

    if (hasRangeOperator || hasWildcard) {
      return 'range';
    }

    return 'pattern';
  }

  /**
   * Checks if a version satisfies a constraint
   *
   * @param version - Version string to check
   * @param constraint - Version constraint
   * @returns True if version satisfies constraint
   */
  static satisfies(version: string, constraint: VersionConstraint): boolean {
    if (!constraint.isValid || !constraint.range) {
      return false;
    }

    try {
      return semver.satisfies(version, constraint.range);
    } catch {
      return false;
    }
  }

  /**
   * Checks if a version string satisfies a constraint string
   *
   * Convenience method that combines parse and satisfies
   *
   * @param version - Version string to check
   * @param constraintStr - Constraint string
   * @returns True if version satisfies constraint
   */
  static versionSatisfies(version: string, constraintStr: string): boolean {
    const constraint = this.parse(constraintStr);
    return this.satisfies(version, constraint);
  }

  /**
   * Filters a list of versions to only those that satisfy a constraint
   *
   * @param versions - Array of version strings
   * @param constraint - Version constraint
   * @returns Filtered array of versions that satisfy the constraint
   */
  static filterVersions(versions: string[], constraint: VersionConstraint): string[] {
    if (!constraint.isValid || !constraint.range) {
      return [];
    }

    return versions.filter(version => {
      try {
        return semver.satisfies(version, constraint.range!);
      } catch {
        return false;
      }
    });
  }

  /**
   * Gets the maximum satisfying version from a list
   *
   * @param versions - Array of version strings
   * @param constraint - Version constraint
   * @returns Maximum version that satisfies constraint, or null if none
   */
  static maxSatisfying(versions: string[], constraint: VersionConstraint): string | null {
    if (!constraint.isValid || !constraint.range) {
      return null;
    }

    try {
      return semver.maxSatisfying(versions, constraint.range);
    } catch {
      return null;
    }
  }

  /**
   * Gets the minimum satisfying version from a list
   *
   * @param versions - Array of version strings
   * @param constraint - Version constraint
   * @returns Minimum version that satisfies constraint, or null if none
   */
  static minSatisfying(versions: string[], constraint: VersionConstraint): string | null {
    if (!constraint.isValid || !constraint.range) {
      return null;
    }

    try {
      return semver.minSatisfying(versions, constraint.range);
    } catch {
      return null;
    }
  }

  /**
   * Validates if a string is a valid semantic version
   *
   * @param version - Version string to validate
   * @returns True if valid semver
   */
  static isValidVersion(version: string): boolean {
    return semver.valid(version) !== null;
  }

  /**
   * Validates if a string is a valid version constraint
   *
   * @param constraint - Constraint string to validate
   * @returns True if valid constraint
   */
  static isValidConstraint(constraint: string): boolean {
    const parsed = this.parse(constraint);
    return parsed.isValid;
  }

  /**
   * Compares two versions
   *
   * @param v1 - First version
   * @param v2 - Second version
   * @returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2, null if invalid
   */
  static compare(v1: string, v2: string): -1 | 0 | 1 | null {
    try {
      return semver.compare(v1, v2);
    } catch {
      return null;
    }
  }

  /**
   * Sorts versions in ascending order
   *
   * @param versions - Array of version strings
   * @returns Sorted array (invalid versions filtered out)
   */
  static sort(versions: string[]): string[] {
    return versions
      .filter(v => this.isValidVersion(v))
      .sort((a, b) => semver.compare(a, b));
  }

  /**
   * Sorts versions in descending order
   *
   * @param versions - Array of version strings
   * @returns Sorted array (invalid versions filtered out)
   */
  static sortDescending(versions: string[]): string[] {
    return versions
      .filter(v => this.isValidVersion(v))
      .sort((a, b) => semver.rcompare(a, b));
  }
}
