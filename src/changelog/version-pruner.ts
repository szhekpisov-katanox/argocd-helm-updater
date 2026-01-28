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
export class VersionPruner {
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
  static prune(options: PruneOptions): PruneResult {
    const { currentVersion, targetVersion, changelogText } = options;

    // Split changelog into lines
    const lines = changelogText.split('\n');

    // Find line numbers for target and current versions
    const targetLine = this.findVersionLine(lines, targetVersion);
    const currentLine = this.findVersionLine(lines, currentVersion);

    // If we can't find both versions, return full changelog with warning
    if (targetLine === null || currentLine === null) {
      return {
        prunedText: changelogText,
        versionsFound: false,
        warning: `Could not find version headers for ${targetVersion} and/or ${currentVersion}`,
      };
    }

    // Find the next version after current (to know where to stop)
    const nextVersionLine = this.findNextVersionLine(lines, currentLine + 1);

    // Extract the range (from target to current, or to next version if found)
    const endLine = nextVersionLine !== null ? nextVersionLine - 1 : lines.length - 1;
    const prunedText = this.extractVersionRange(lines, targetLine, endLine);

    return {
      prunedText,
      versionsFound: true,
    };
  }

  /**
   * Finds the line number of a version header in the changelog
   * 
   * Validates Requirement 4.3: Recognize common version header formats
   * 
   * @param lines - Changelog lines
   * @param version - Version to find
   * @returns Line number (0-indexed) or null if not found
   */
  static findVersionLine(lines: string[], version: string): number | null {
    // Normalize version for matching (remove 'v' prefix if present)
    const normalizedVersion = version.replace(/^v/, '');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip unreleased sections unless explicitly looking for them
      if (this.isUnreleasedHeader(line) && !version.toLowerCase().includes('unreleased')) {
        continue;
      }

      // Check if this line contains the version
      if (this.isVersionHeader(line, normalizedVersion)) {
        return i;
      }

      // Check for underlined version headers (next line has underline)
      if (i < lines.length - 1) {
        const nextLine = lines[i + 1].trim();
        if (this.isUnderline(nextLine) && line.includes(normalizedVersion)) {
          return i;
        }
      }
    }

    return null;
  }

  /**
   * Finds the next version header after a given line
   * 
   * @param lines - Changelog lines
   * @param startLine - Line to start searching from
   * @returns Line number of next version or null if not found
   */
  private static findNextVersionLine(lines: string[], startLine: number): number | null {
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if this is a version header
      if (this.looksLikeVersionHeader(line)) {
        return i;
      }

      // Check for underlined headers
      if (i < lines.length - 1) {
        const nextLine = lines[i + 1].trim();
        if (this.isUnderline(nextLine) && this.looksLikeVersionHeader(line)) {
          return i;
        }
      }
    }

    return null;
  }

  /**
   * Checks if a line is a version header for a specific version
   * 
   * @param line - Line to check
   * @param version - Version to match
   * @returns true if line is a version header for the version
   */
  private static isVersionHeader(line: string, version: string): boolean {
    // Escape special regex characters in version
    const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Common version header patterns
    const patterns = [
      // Markdown headers: ## [1.2.3], ## 1.2.3, ## v1.2.3
      new RegExp(`^#+\\s*\\[?v?${escapedVersion}\\]?`, 'i'),
      // Keep a Changelog format: ## [1.2.3] - 2024-01-15
      new RegExp(`^#+\\s*\\[v?${escapedVersion}\\]\\s*-`, 'i'),
      // Plain version: 1.2.3, v1.2.3
      new RegExp(`^v?${escapedVersion}:?\\s*$`, 'i'),
      // Version with date: 1.2.3 - 2024-01-15
      new RegExp(`^v?${escapedVersion}\\s*-\\s*\\d{4}`, 'i'),
      // Bullet point: - version 1.2.3, * 1.2.3
      new RegExp(`^[\\*\\-\\+]\\s*(version\\s+)?v?${escapedVersion}`, 'i'),
      // reStructuredText: Version 1.2.3
      new RegExp(`^version\\s+v?${escapedVersion}`, 'i'),
    ];

    return patterns.some(pattern => pattern.test(line));
  }

  /**
   * Checks if a line looks like a version header (without specific version)
   * 
   * @param line - Line to check
   * @returns true if line looks like a version header
   */
  private static looksLikeVersionHeader(line: string): boolean {
    // Common patterns that indicate a version header
    const patterns = [
      /^#+\s*\[?\d+\.\d+/,           // ## [1.2.3] or ## 1.2.3
      /^#+\s*v\d+\.\d+/,              // ## v1.2.3
      /^v?\d+\.\d+\.\d+/,             // 1.2.3 or v1.2.3
      /^[\*\-\+]\s*v?\d+\.\d+/,       // - 1.2.3 or * v1.2.3
      /^version\s+\d+\.\d+/i,         // Version 1.2.3
      /^\d{4}-\d{2}-\d{2}/,           // 2024-01-15 (date-based)
    ];

    return patterns.some(pattern => pattern.test(line));
  }

  /**
   * Checks if a line is an underline (for underlined headers)
   * 
   * @param line - Line to check
   * @returns true if line is an underline
   */
  private static isUnderline(line: string): boolean {
    return /^[=\-\+]{3,}\s*$/.test(line);
  }

  /**
   * Checks if a line is an "unreleased" header
   * 
   * Validates Requirement 4.7: Handle unreleased sections
   * 
   * @param line - Line to check
   * @returns true if line is an unreleased header
   */
  private static isUnreleasedHeader(line: string): boolean {
    const lowerLine = line.toLowerCase();
    return (
      lowerLine.includes('unreleased') ||
      lowerLine.includes('upcoming') ||
      lowerLine.includes('next release')
    );
  }

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
  static extractVersionRange(lines: string[], startLine: number, endLine: number): string {
    // Handle edge cases
    if (startLine < 0 || startLine >= lines.length) {
      return '';
    }

    if (endLine < 0 || endLine >= lines.length) {
      endLine = lines.length - 1;
    }

    if (startLine > endLine) {
      return '';
    }

    // Extract the range (inclusive)
    const extractedLines = lines.slice(startLine, endLine + 1);

    // Join lines preserving formatting
    return extractedLines.join('\n').trim();
  }
}
