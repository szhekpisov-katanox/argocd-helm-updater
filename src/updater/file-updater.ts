/**
 * FileUpdater - Updates manifest files with new chart versions
 *
 * This class is responsible for:
 * - Updating targetRevision fields using JSON path
 * - Preserving YAML formatting and structure
 * - Preserving comments in YAML
 * - Grouping updates by file path to minimize file operations
 * - Validating updated YAML is still parseable
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import { VersionUpdate } from '../types/version';
import { FileUpdate } from '../types/file-update';

/**
 * FileUpdater class for updating manifest files with new chart versions
 */
export class FileUpdater {
  /**
   * Updates manifest files with new chart versions
   *
   * This method:
   * 1. Groups updates by file path
   * 2. Reads each file once
   * 3. Applies all updates to that file
   * 4. Validates the updated YAML is parseable
   * 5. Returns FileUpdate objects with original and updated content
   *
   * @param updates - List of version updates to apply
   * @returns List of FileUpdate objects representing changed files
   */
  async updateManifests(updates: VersionUpdate[]): Promise<FileUpdate[]> {
    // Group updates by file path
    const updatesByFile = this.groupUpdatesByFile(updates);

    const fileUpdates: FileUpdate[] = [];

    // Process each file
    for (const [filePath, updatesForFile] of updatesByFile) {
      try {
        // Read original file content
        const originalContent = await fs.readFile(filePath, 'utf-8');

        // Apply all updates to this file
        let updatedContent = originalContent;
        for (const update of updatesForFile) {
          updatedContent = this.updateYAMLField(
            updatedContent,
            update.dependency.versionPath,
            update.newVersion,
            update.dependency.documentIndex
          );
        }

        // Validate updated YAML is still parseable
        this.validateYAML(updatedContent);

        // Only include files that actually changed
        if (updatedContent !== originalContent) {
          fileUpdates.push({
            path: filePath,
            originalContent,
            updatedContent,
            updates: updatesForFile,
          });
        }
      } catch (error) {
        console.error(
          `Failed to update file ${filePath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        // Continue processing other files
      }
    }

    return fileUpdates;
  }

  /**
   * Groups version updates by file path
   *
   * @param updates - List of version updates
   * @returns Map of file paths to their updates
   * @private
   */
  private groupUpdatesByFile(
    updates: VersionUpdate[]
  ): Map<string, VersionUpdate[]> {
    const grouped = new Map<string, VersionUpdate[]>();

    for (const update of updates) {
      const filePath = update.dependency.manifestPath;
      const existing = grouped.get(filePath) || [];
      existing.push(update);
      grouped.set(filePath, existing);
    }

    return grouped;
  }

  /**
   * Updates a specific YAML field using JSON path
   *
   * This method uses string manipulation to preserve formatting and comments.
   * It does NOT re-serialize the YAML, which would lose formatting.
   *
   * Strategy:
   * 1. Split content into lines
   * 2. Parse YAML to find the exact line number of the field
   * 3. Use regex to replace the value on that line
   * 4. Preserve indentation and structure
   *
   * @param content - Original YAML content
   * @param path - JSON path to the field (e.g., ['spec', 'source', 'targetRevision'])
   * @param newValue - New value to set
   * @param documentIndex - Index of the document in multi-document YAML
   * @returns Updated YAML content
   * @private
   */
  private updateYAMLField(
    content: string,
    path: string[],
    newValue: string,
    documentIndex: number
  ): string {
    // Split content into lines for manipulation
    const lines = content.split('\n');

    // Parse YAML to understand structure
    const documents = yaml.loadAll(content);

    if (documentIndex >= documents.length) {
      throw new Error(
        `Document index ${documentIndex} out of range (only ${documents.length} documents)`
      );
    }

    // Find the line range for this document
    const { startLine, endLine } = this.findDocumentLineRange(
      lines,
      documentIndex
    );

    // Navigate to the target field within this document
    const targetLine = this.findFieldLine(
      lines,
      path,
      startLine,
      endLine,
      documents[documentIndex]
    );

    if (targetLine === -1) {
      throw new Error(
        `Could not find field at path ${path.join('.')} in document ${documentIndex}`
      );
    }

    // Replace the value on the target line
    lines[targetLine] = this.replaceValueOnLine(lines[targetLine], newValue);

    return lines.join('\n');
  }

  /**
   * Finds the line range for a specific document in multi-document YAML
   *
   * @param lines - Array of file lines
   * @param documentIndex - Index of the document
   * @returns Start and end line numbers (0-indexed)
   * @private
   */
  private findDocumentLineRange(
    lines: string[],
    documentIndex: number
  ): { startLine: number; endLine: number } {
    const separators: number[] = [];
    
    // Find all document separators (---)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '---') {
        separators.push(i);
      }
    }

    // If no separators, entire file is one document
    if (separators.length === 0) {
      if (documentIndex === 0) {
        return { startLine: 0, endLine: lines.length - 1 };
      } else {
        throw new Error(`Document index ${documentIndex} out of range (only 1 document)`);
      }
    }

    // Calculate document boundaries based on separators
    // Document 0: starts at line 0 (or after first ---), ends before second ---
    // Document 1: starts after first ---, ends before second ---
    // etc.
    
    let startLine: number;
    let endLine: number;

    if (documentIndex === 0) {
      // First document starts at line 0 or after the first separator
      // Check if first line is a separator
      if (separators[0] === 0) {
        startLine = 1;
      } else {
        startLine = 0;
      }
      
      // First document ends before the next separator (if any)
      if (separators.length > 1) {
        // Find the next separator after the start
        const nextSeparatorIndex = separators.findIndex(sep => sep > startLine);
        if (nextSeparatorIndex !== -1) {
          endLine = separators[nextSeparatorIndex] - 1;
        } else {
          endLine = lines.length - 1;
        }
      } else {
        endLine = lines.length - 1;
      }
    } else {
      // For subsequent documents, find the separator that starts this document
      // Document N starts after separator at index N-1 or N (depending on whether first line is ---)
      const separatorIndex = separators[0] === 0 ? documentIndex : documentIndex - 1;
      
      if (separatorIndex >= separators.length) {
        throw new Error(`Document index ${documentIndex} out of range`);
      }
      
      startLine = separators[separatorIndex] + 1;
      
      // Find the next separator
      const nextSeparatorIndex = separatorIndex + 1;
      if (nextSeparatorIndex < separators.length) {
        endLine = separators[nextSeparatorIndex] - 1;
      } else {
        endLine = lines.length - 1;
      }
    }

    return { startLine, endLine };
  }

  /**
   * Finds the line number of a specific field using JSON path
   *
   * This method navigates through the YAML structure to find the exact line
   * where the target field is defined.
   *
   * @param lines - Array of file lines
   * @param path - JSON path to the field
   * @param startLine - Start line of the document
   * @param endLine - End line of the document
   * @param document - Parsed YAML document for validation
   * @returns Line number (0-indexed) or -1 if not found
   * @private
   */
  private findFieldLine(
    lines: string[],
    path: string[],
    startLine: number,
    endLine: number,
    document: unknown
  ): number {
    // Validate that the path exists in the parsed document
    if (!this.pathExistsInDocument(path, document)) {
      return -1;
    }

    // Detect the indentation increment used in this file
    const indentIncrement = this.detectIndentIncrement(lines, startLine, endLine);

    let currentIndent = 0;
    let searchStartLine = startLine;

    // Navigate through each level of the path
    for (let pathIndex = 0; pathIndex < path.length; pathIndex++) {
      const key = path[pathIndex];
      const isArrayIndex = /^\d+$/.test(key);

      if (isArrayIndex) {
        // Handle array index
        const arrayIndex = parseInt(key, 10);
        const foundLine = this.findArrayElementLine(
          lines,
          arrayIndex,
          searchStartLine,
          endLine,
          currentIndent
        );

        if (foundLine === -1) {
          return -1;
        }

        searchStartLine = foundLine;
        // After finding array element, the next key should be indented more than the dash
        // The dash itself is at currentIndent, so nested keys are at currentIndent + indentIncrement
        const dashIndent = this.getIndentation(lines[foundLine]);
        currentIndent = dashIndent + indentIncrement;
      } else {
        // Handle object key
        const foundLine = this.findKeyLine(
          lines,
          key,
          searchStartLine,
          endLine,
          currentIndent
        );

        if (foundLine === -1) {
          return -1;
        }

        // If this is the last key in the path, we found our target
        if (pathIndex === path.length - 1) {
          return foundLine;
        }

        // Otherwise, continue searching from this line
        searchStartLine = foundLine + 1;
        // Expect nested content to be indented by the detected increment
        currentIndent = this.getIndentation(lines[foundLine]) + indentIncrement;
      }
    }

    return -1;
  }

  /**
   * Finds the line number of a specific key in YAML
   *
   * @param lines - Array of file lines
   * @param key - Key to find
   * @param startLine - Start line to search from
   * @param endLine - End line to search to
   * @param expectedIndent - Expected indentation level
   * @returns Line number (0-indexed) or -1 if not found
   * @private
   */
  private findKeyLine(
    lines: string[],
    key: string,
    startLine: number,
    endLine: number,
    expectedIndent: number
  ): number {
    // Debug logging
    const debug = false; // Set to true for debugging
    if (debug) {
      console.log(`\nSearching for key "${key}" from line ${startLine} to ${endLine}, expected indent: ${expectedIndent}`);
    }
    
    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i];
      const indent = this.getIndentation(line);

      if (debug && line.trim().length > 0) {
        console.log(`  Line ${i} (indent ${indent}): ${line.substring(0, 50)}`);
      }

      // Skip lines with wrong indentation
      if (indent !== expectedIndent) {
        continue;
      }

      const trimmed = line.trim();

      // Check if this line defines the key
      // Matches: "key:", "key: value", "'key':", '"key":'
      const keyPattern = new RegExp(
        `^(['"]?)${this.escapeRegex(key)}\\1:\\s*(.*)$`
      );
      if (keyPattern.test(trimmed)) {
        if (debug) {
          console.log(`  Found key "${key}" at line ${i}`);
        }
        return i;
      }
    }

    if (debug) {
      console.log(`  Key "${key}" not found`);
    }
    return -1;
  }

  /**
   * Finds the line number of a specific array element
   *
   * @param lines - Array of file lines
   * @param index - Array index to find
   * @param startLine - Start line to search from
   * @param endLine - End line to search to
   * @param minIndent - Minimum expected indentation level (array elements should be at or after this)
   * @returns Line number (0-indexed) or -1 if not found
   * @private
   */
  private findArrayElementLine(
    lines: string[],
    index: number,
    startLine: number,
    endLine: number,
    minIndent: number
  ): number {
    let currentIndex = 0;

    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i];
      const indent = this.getIndentation(line);

      // Skip lines with less indentation (we're looking for array elements at this level or deeper)
      if (indent < minIndent) {
        continue;
      }

      const trimmed = line.trim();

      // Check if this line starts an array element (starts with -)
      if (trimmed.startsWith('-')) {
        if (currentIndex === index) {
          return i;
        }
        currentIndex++;
      }
    }

    return -1;
  }

  /**
   * Gets the indentation level of a line (number of leading spaces)
   *
   * @param line - Line to check
   * @returns Number of leading spaces
   * @private
   */
  private getIndentation(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  /**
   * Detects the indentation increment used in a YAML document
   *
   * This method analyzes the document to determine how many spaces are used
   * for each level of indentation (typically 2 or 4 spaces).
   *
   * Strategy: Look at the differences between consecutive indentation levels
   * to find the most common increment.
   *
   * @param lines - Array of file lines
   * @param startLine - Start line of the document
   * @param endLine - End line of the document
   * @returns Number of spaces per indentation level (defaults to 2)
   * @private
   */
  private detectIndentIncrement(
    lines: string[],
    startLine: number,
    endLine: number
  ): number {
    const indents: number[] = [];

    // Collect indentation levels from non-empty, non-comment lines
    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (trimmed.length === 0 || trimmed.startsWith('#')) {
        continue;
      }

      const indent = this.getIndentation(line);
      indents.push(indent);
    }

    if (indents.length === 0) {
      return 2; // Default to 2-space indentation
    }

    // Calculate differences between consecutive indentation levels
    const increments: number[] = [];
    for (let i = 1; i < indents.length; i++) {
      const diff = Math.abs(indents[i] - indents[i - 1]);
      if (diff > 0) {
        increments.push(diff);
      }
    }

    if (increments.length === 0) {
      return 2; // Default to 2-space indentation
    }

    // Find the most common increment
    const incrementCounts = new Map<number, number>();
    for (const inc of increments) {
      incrementCounts.set(inc, (incrementCounts.get(inc) || 0) + 1);
    }

    // Get the most frequent increment
    let mostCommonIncrement = 2;
    let maxCount = 0;
    for (const [inc, count] of incrementCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonIncrement = inc;
      }
    }

    // If the most common increment is greater than 4, it might be a multiple
    // Try to find a smaller increment that divides evenly
    if (mostCommonIncrement > 4) {
      for (const divisor of [2, 3, 4]) {
        if (mostCommonIncrement % divisor === 0) {
          mostCommonIncrement = divisor;
          break;
        }
      }
    }

    return mostCommonIncrement;
  }

  /**
   * Replaces the value on a YAML line while preserving formatting
   *
   * Handles various YAML value formats:
   * - key: value
   * - key: "value"
   * - key: 'value'
   * - key: >- value
   *
   * @param line - Original line
   * @param newValue - New value to set
   * @returns Updated line
   * @private
   */
  private replaceValueOnLine(line: string, newValue: string): string {
    // Match the key and value parts
    // Pattern: (indentation)(key)(:)(whitespace)(value)(optional comment)
    const pattern = /^(\s*)([^:]+)(:)(\s+)([^\s#]+)(.*)$/;
    const match = line.match(pattern);

    if (!match) {
      // Fallback: just replace the last word-like token before any comment
      return line.replace(/(\S+)(\s*(?:#.*)?)$/, `${newValue}$2`);
    }

    const [, indent, key, colon, whitespace, , rest] = match;

    // Preserve the original quote style if present
    const oldValue = match[5];
    let quotedNewValue = newValue;

    if (oldValue.startsWith('"') && oldValue.endsWith('"')) {
      quotedNewValue = `"${newValue}"`;
    } else if (oldValue.startsWith("'") && oldValue.endsWith("'")) {
      quotedNewValue = `'${newValue}'`;
    }

    return `${indent}${key}${colon}${whitespace}${quotedNewValue}${rest}`;
  }

  /**
   * Validates that a path exists in a parsed YAML document
   *
   * @param path - JSON path to validate
   * @param document - Parsed YAML document
   * @returns True if the path exists
   * @private
   */
  private pathExistsInDocument(path: string[], document: unknown): boolean {
    let current: unknown = document;

    for (const key of path) {
      if (current === null || current === undefined) {
        return false;
      }

      if (typeof current !== 'object') {
        return false;
      }

      const isArrayIndex = /^\d+$/.test(key);

      if (isArrayIndex) {
        if (!Array.isArray(current)) {
          return false;
        }
        const index = parseInt(key, 10);
        if (index >= current.length) {
          return false;
        }
        current = current[index];
      } else {
        if (Array.isArray(current)) {
          return false;
        }
        const obj = current as Record<string, unknown>;
        if (!(key in obj)) {
          return false;
        }
        current = obj[key];
      }
    }

    return true;
  }

  /**
   * Validates that YAML content is parseable
   *
   * @param content - YAML content to validate
   * @throws Error if YAML is invalid
   * @private
   */
  private validateYAML(content: string): void {
    try {
      yaml.loadAll(content);
    } catch (error) {
      throw new Error(
        `Updated YAML is not valid: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Escapes special regex characters in a string
   *
   * @param str - String to escape
   * @returns Escaped string
   * @private
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
