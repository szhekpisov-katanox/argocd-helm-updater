/**
 * Types for file update operations
 */

import { VersionUpdate } from './version';

/**
 * Represents a file that needs to be updated with new chart versions
 */
export interface FileUpdate {
  /** Path to the file being updated */
  path: string;
  /** Original file content before updates */
  originalContent: string;
  /** Updated file content with new versions */
  updatedContent: string;
  /** List of version updates applied to this file */
  updates: VersionUpdate[];
}
