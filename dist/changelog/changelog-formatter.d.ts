/**
 * ChangelogFormatter - Formats changelog content for inclusion in PR descriptions
 *
 * Validates Requirements:
 * - 5.1: Include changelog section for each updated chart
 * - 5.2: Format changelog content using markdown
 * - 5.3: Clearly label which chart each changelog belongs to
 * - 5.6: Distinguish between changelog and release notes
 * - 5.7: Truncate long content with link to full changelog
 */
import { ChangelogResult } from '../types/changelog';
/**
 * Options for formatting changelog content
 */
export interface FormatOptions {
    /** Chart name */
    chartName: string;
    /** Current version */
    currentVersion: string;
    /** Target version */
    targetVersion: string;
    /** Changelog result from finder */
    changelogResult: ChangelogResult;
    /** Pruned changelog text (optional, uses full changelog if not provided) */
    prunedChangelog?: string;
    /** Maximum length before truncation (default: 5000 characters) */
    maxLength?: number;
}
/**
 * ChangelogFormatter formats changelog content for PR body inclusion
 */
export declare class ChangelogFormatter {
    /**
     * Formats changelog for PR body inclusion
     *
     * Validates Requirements:
     * - 5.1: Include changelog section for each chart
     * - 5.2: Format using markdown
     * - 5.3: Label which chart
     * - 5.6: Distinguish changelog and release notes
     * - 5.7: Truncate with link
     *
     * @param options - Formatting options
     * @returns Formatted markdown string
     */
    static format(options: FormatOptions): string;
    /**
     * Truncates text to maximum length
     *
     * Validates Requirement 5.7: Truncate with link to full changelog
     *
     * @param text - Text to truncate
     * @param maxLength - Maximum length in characters
     * @param url - URL to full content (optional)
     * @returns Truncated text
     */
    static truncate(text: string, maxLength: number, url?: string): string;
    /**
     * Formats multiple changelog results for a PR body
     *
     * @param results - Map of chart names to changelog results
     * @param versionMap - Map of chart names to version info
     * @returns Formatted markdown string for all changelogs
     */
    static formatMultiple(results: Map<string, ChangelogResult>, versionMap: Map<string, {
        currentVersion: string;
        targetVersion: string;
        prunedChangelog?: string;
    }>): string;
}
//# sourceMappingURL=changelog-formatter.d.ts.map