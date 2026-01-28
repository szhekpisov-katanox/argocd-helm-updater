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
import { VersionUpdate } from '../types/version';
import { FileUpdate } from '../types/file-update';
/**
 * FileUpdater class for updating manifest files with new chart versions
 */
export declare class FileUpdater {
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
    updateManifests(updates: VersionUpdate[]): Promise<FileUpdate[]>;
    /**
     * Groups version updates by file path
     *
     * @param updates - List of version updates
     * @returns Map of file paths to their updates
     * @private
     */
    private groupUpdatesByFile;
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
    private updateYAMLField;
    /**
     * Finds the line range for a specific document in multi-document YAML
     *
     * @param lines - Array of file lines
     * @param documentIndex - Index of the document
     * @returns Start and end line numbers (0-indexed)
     * @private
     */
    private findDocumentLineRange;
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
    private findFieldLine;
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
    private findKeyLine;
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
    private findArrayElementLine;
    /**
     * Gets the indentation level of a line (number of leading spaces)
     *
     * @param line - Line to check
     * @returns Number of leading spaces
     * @private
     */
    private getIndentation;
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
    private detectIndentIncrement;
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
    private replaceValueOnLine;
    /**
     * Validates that a path exists in a parsed YAML document
     *
     * @param path - JSON path to validate
     * @param document - Parsed YAML document
     * @returns True if the path exists
     * @private
     */
    private pathExistsInDocument;
    /**
     * Validates that YAML content is parseable
     *
     * @param content - YAML content to validate
     * @throws Error if YAML is invalid
     * @private
     */
    private validateYAML;
    /**
     * Escapes special regex characters in a string
     *
     * @param str - String to escape
     * @returns Escaped string
     * @private
     */
    private escapeRegex;
}
//# sourceMappingURL=file-updater.d.ts.map