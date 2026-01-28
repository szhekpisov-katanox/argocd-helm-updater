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
export class ChangelogFormatter {
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
  static format(options: FormatOptions): string {
    const {
      chartName,
      currentVersion,
      targetVersion,
      changelogResult,
      prunedChangelog,
      maxLength = 5000,
    } = options;

    const sections: string[] = [];

    // Header with chart name and version range (Requirement 5.3)
    sections.push(`### 📦 ${chartName} (${currentVersion} → ${targetVersion})`);
    sections.push('');

    // Check if we have any content
    const hasChangelog = changelogResult.found && (prunedChangelog || changelogResult.changelogText);
    const hasReleaseNotes = changelogResult.found && changelogResult.releaseNotes;

    if (!hasChangelog && !hasReleaseNotes) {
      // No changelog or release notes found (Requirement 5.6)
      sections.push('No changelog or release notes found for this update.');
      sections.push('');

      // Add link to commit history as fallback
      if (changelogResult.sourceUrl) {
        sections.push(`[View commit history](${changelogResult.sourceUrl}/commits)`);
      }

      return sections.join('\n');
    }

    // Add changelog section if available (Requirement 5.6)
    if (hasChangelog) {
      sections.push('#### Changelog');
      sections.push('');

      const changelogContent = prunedChangelog || changelogResult.changelogText || '';
      const truncatedChangelog = this.truncate(
        changelogContent,
        maxLength,
        changelogResult.changelogUrl
      );

      sections.push(truncatedChangelog);
      sections.push('');

      // Add link to full changelog if available
      if (changelogResult.changelogUrl) {
        sections.push(`[View full changelog](${changelogResult.changelogUrl})`);
        sections.push('');
      }
    }

    // Add release notes section if available (Requirement 5.6)
    if (hasReleaseNotes) {
      sections.push('#### Release Notes');
      sections.push('');

      const releaseNotesContent = changelogResult.releaseNotes || '';
      const truncatedReleaseNotes = this.truncate(
        releaseNotesContent,
        maxLength,
        changelogResult.releaseNotesUrl
      );

      sections.push(truncatedReleaseNotes);
      sections.push('');

      // Add link to release if available
      if (changelogResult.releaseNotesUrl) {
        sections.push(`[View release](${changelogResult.releaseNotesUrl})`);
        sections.push('');
      }
    }

    return sections.join('\n').trim();
  }

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
  static truncate(text: string, maxLength: number, url?: string): string {
    if (text.length <= maxLength) {
      return text;
    }

    // Find a good breaking point (end of line, paragraph, or sentence)
    let truncateAt = maxLength;

    // Try to break at a newline
    const lastNewline = text.lastIndexOf('\n', maxLength);
    if (lastNewline > maxLength * 0.8) {
      truncateAt = lastNewline;
    } else {
      // Try to break at a sentence
      const lastPeriod = text.lastIndexOf('. ', maxLength);
      if (lastPeriod > maxLength * 0.8) {
        truncateAt = lastPeriod + 1;
      } else {
        // Try to break at a word
        const lastSpace = text.lastIndexOf(' ', maxLength);
        if (lastSpace > maxLength * 0.8) {
          truncateAt = lastSpace;
        }
      }
    }

    // Ensure we don't break in the middle of a code block
    const beforeTruncate = text.substring(0, truncateAt);
    const codeBlockCount = (beforeTruncate.match(/```/g) || []).length;
    
    // If odd number of code block markers, we're inside a code block
    if (codeBlockCount % 2 !== 0) {
      // Find the end of the code block
      const codeBlockEnd = text.indexOf('```', truncateAt);
      if (codeBlockEnd !== -1 && codeBlockEnd < maxLength * 1.2) {
        truncateAt = codeBlockEnd + 3;
      }
    }

    let truncated = text.substring(0, truncateAt).trim();

    // Add ellipsis and link
    truncated += '\n\n...';

    if (url) {
      truncated += `\n\n*Content truncated. [View full content](${url})*`;
    }

    return truncated;
  }

  /**
   * Formats multiple changelog results for a PR body
   * 
   * @param results - Map of chart names to changelog results
   * @param versionMap - Map of chart names to version info
   * @returns Formatted markdown string for all changelogs
   */
  static formatMultiple(
    results: Map<string, ChangelogResult>,
    versionMap: Map<string, { currentVersion: string; targetVersion: string; prunedChangelog?: string }>
  ): string {
    if (results.size === 0) {
      return '';
    }

    const sections: string[] = [];
    sections.push('## Changelogs');
    sections.push('');

    for (const [chartName, result] of results.entries()) {
      const versionInfo = versionMap.get(chartName);
      if (!versionInfo) {
        continue;
      }

      const formatted = this.format({
        chartName,
        currentVersion: versionInfo.currentVersion,
        targetVersion: versionInfo.targetVersion,
        changelogResult: result,
        prunedChangelog: versionInfo.prunedChangelog,
      });

      sections.push(formatted);
      sections.push('');
      sections.push('---');
      sections.push('');
    }

    return sections.join('\n').trim();
  }
}
