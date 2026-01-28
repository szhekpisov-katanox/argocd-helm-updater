/**
 * VersionPruner - Extracts relevant version sections from changelog content
 *
 * Validates Requirements:
 * - 4.1: Parse changelog to identify version sections
 * - 4.2: Extract content for all versions within the version range
 * - 4.3: Recognize common version header formats
 * - 4.5: Preserve markdown formatting in extracted sections
 * - 4.6: Include version headers in extracted content
 * - 4.7: Handle unreleased sections appropriately
 */
/**
 * Options for pruning changelog content
 */
export interface PruneOptions {
    /** Current version */
    currentVersion: string;
    /** Target version */
    targetVersion: string;
    /** Full changelog text */
    changelogText: string;
}
/**
 * Result of changelog pruning
 */
export interface PruneResult {
    /** Extracted changelog section */
    prunedText: string;
    /** Whether version sections were found */
    versionsFound: boolean;
    /** Warning message if parsing failed */
    warning?: string;
}
/**
 * VersionPruner extracts relevant version sections from changelog content
 */
export declare class VersionPruner {
    /**
     * Extracts relevant version sections from changelog
     *
     * Validates Requirements:
     * - 4.1: Parse changelog to identify version sections
     * - 4.2: Extract content for all versions within version range
     * - 4.4: Return full changelog with warning if parsing fails
     * - 4.5: Preserve markdown formatting
     *
     * @param options - Pruning options
     * @returns Pruned changelog result
     */
    static prune(options: PruneOptions): PruneResult;
    /**
     * Finds the line number of a version header in the changelog
     *
     * Validates Requirement 4.3: Recognize common version header formats
     *
     * @param lines - Changelog lines
     * @param version - Version to find
     * @returns Line number (0-indexed) or null if not found
     */
    static findVersionLine(lines: string[], version: string): number | null;
    /**
     * Finds the next version header after a given line
     *
     * @param lines - Changelog lines
     * @param startLine - Line to start searching from
     * @returns Line number of next version or null if not found
     */
    private static findNextVersionLine;
    /**
     * Checks if a line is a version header for a specific version
     *
     * @param line - Line to check
     * @param version - Version to match
     * @returns true if line is a version header for the version
     */
    private static isVersionHeader;
    /**
     * Checks if a line looks like a version header (without specific version)
     *
     * @param line - Line to check
     * @returns true if line looks like a version header
     */
    private static looksLikeVersionHeader;
    /**
     * Checks if a line is an underline (for underlined headers)
     *
     * @param line - Line to check
     * @returns true if line is an underline
     */
    private static isUnderline;
    /**
     * Checks if a line is an "unreleased" header
     *
     * Validates Requirement 4.7: Handle unreleased sections
     *
     * @param line - Line to check
     * @returns true if line is an unreleased header
     */
    private static isUnreleasedHeader;
    /**
     * Extracts lines between start and end (inclusive)
     *
     * Validates Requirements:
     * - 4.5: Preserve markdown formatting
     * - 4.6: Include version headers
     *
     * @param lines - All changelog lines
     * @param startLine - Start line (inclusive)
     * @param endLine - End line (inclusive)
     * @returns Extracted text
     */
    static extractVersionRange(lines: string[], startLine: number, endLine: number): string;
}
//# sourceMappingURL=version-pruner.d.ts.map