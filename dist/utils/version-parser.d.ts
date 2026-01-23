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
export declare class VersionParser {
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
    static parse(constraint: string): VersionConstraint;
    /**
     * Determines the type of version constraint
     *
     * @param constraint - Trimmed constraint string
     * @returns Constraint type
     * @private
     */
    private static determineConstraintType;
    /**
     * Checks if a version satisfies a constraint
     *
     * @param version - Version string to check
     * @param constraint - Version constraint
     * @returns True if version satisfies constraint
     */
    static satisfies(version: string, constraint: VersionConstraint): boolean;
    /**
     * Checks if a version string satisfies a constraint string
     *
     * Convenience method that combines parse and satisfies
     *
     * @param version - Version string to check
     * @param constraintStr - Constraint string
     * @returns True if version satisfies constraint
     */
    static versionSatisfies(version: string, constraintStr: string): boolean;
    /**
     * Filters a list of versions to only those that satisfy a constraint
     *
     * @param versions - Array of version strings
     * @param constraint - Version constraint
     * @returns Filtered array of versions that satisfy the constraint
     */
    static filterVersions(versions: string[], constraint: VersionConstraint): string[];
    /**
     * Gets the maximum satisfying version from a list
     *
     * @param versions - Array of version strings
     * @param constraint - Version constraint
     * @returns Maximum version that satisfies constraint, or null if none
     */
    static maxSatisfying(versions: string[], constraint: VersionConstraint): string | null;
    /**
     * Gets the minimum satisfying version from a list
     *
     * @param versions - Array of version strings
     * @param constraint - Version constraint
     * @returns Minimum version that satisfies constraint, or null if none
     */
    static minSatisfying(versions: string[], constraint: VersionConstraint): string | null;
    /**
     * Validates if a string is a valid semantic version
     *
     * @param version - Version string to validate
     * @returns True if valid semver
     */
    static isValidVersion(version: string): boolean;
    /**
     * Validates if a string is a valid version constraint
     *
     * @param constraint - Constraint string to validate
     * @returns True if valid constraint
     */
    static isValidConstraint(constraint: string): boolean;
    /**
     * Compares two versions
     *
     * @param v1 - First version
     * @param v2 - Second version
     * @returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2, null if invalid
     */
    static compare(v1: string, v2: string): -1 | 0 | 1 | null;
    /**
     * Sorts versions in ascending order
     *
     * @param versions - Array of version strings
     * @returns Sorted array (invalid versions filtered out)
     */
    static sort(versions: string[]): string[];
    /**
     * Sorts versions in descending order
     *
     * @param versions - Array of version strings
     * @returns Sorted array (invalid versions filtered out)
     */
    static sortDescending(versions: string[]): string[];
}
//# sourceMappingURL=version-parser.d.ts.map