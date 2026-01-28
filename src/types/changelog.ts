/**
 * Changelog and release notes types
 */

/**
 * Result of changelog discovery
 */
export interface ChangelogResult {
  /** Changelog file content (if found) */
  changelogText?: string;
  /** URL to the changelog file */
  changelogUrl?: string;
  /** Release notes content (if found) */
  releaseNotes?: string;
  /** URL to the release notes */
  releaseNotesUrl?: string;
  /** Source repository URL */
  sourceUrl: string;
  /** Whether the changelog was found */
  found: boolean;
  /** Error message if retrieval failed */
  error?: string;
}

/**
 * Repository file information
 */
export interface RepositoryFile {
  /** File name */
  name: string;
  /** File path */
  path: string;
  /** File type (file or dir) */
  type: 'file' | 'dir';
  /** File size in bytes */
  size: number;
  /** URL to view the file */
  htmlUrl: string;
  /** URL to download the file */
  downloadUrl: string;
}

/**
 * Repository information parsed from URL
 */
export interface RepositoryInfo {
  /** Platform (github, gitlab, bitbucket) */
  platform: 'github' | 'gitlab' | 'bitbucket' | 'unknown';
  /** Owner/organization name */
  owner: string;
  /** Repository name */
  repo: string;
  /** Full repository URL */
  url: string;
}

/**
 * Repository client interface for platform-specific API access
 */
export interface RepositoryClient {
  /** Lists files in the repository */
  listFiles(ref?: string): Promise<RepositoryFile[]>;
  
  /** Gets file content */
  getFileContent(path: string, ref?: string): Promise<string>;
  
  /** Gets release notes for a version */
  getReleaseNotes(version: string): Promise<{body: string, url: string} | null>;
}
