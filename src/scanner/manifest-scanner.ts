/**
 * ManifestScanner - Discovers and parses ArgoCD Application and ApplicationSet YAML files
 *
 * This class is responsible for:
 * - Discovering YAML files in the repository based on include/exclude patterns
 * - Reading file contents from discovered paths
 * - Parsing YAML files (including multi-document files)
 * - Filtering for ArgoCD resources (Application and ApplicationSet)
 *
 * Requirements: 1.1, 1.2, 1.5
 */

import * as fs from 'fs/promises';
import { glob } from 'glob';
import * as yaml from 'js-yaml';
import { ActionConfig } from '../types/config';
import { ManifestFile, YAMLDocument } from '../types/manifest';
import { createLogger, Logger } from '../utils/logger';

/**
 * ManifestScanner discovers and parses ArgoCD manifest files
 */
export class ManifestScanner {
  private config: ActionConfig;
  private logger: Logger;

  /**
   * Creates a new ManifestScanner instance
   * @param config - Action configuration containing include/exclude patterns
   */
  constructor(config: ActionConfig) {
    this.config = config;
    this.logger = createLogger(config.logLevel);
  }

  /**
   * Scans the repository for ArgoCD manifest files
   *
   * This method:
   * 1. Uses glob patterns to discover YAML files
   * 2. Reads file contents
   * 3. Parses YAML documents
   * 4. Filters for ArgoCD resources
   *
   * @returns Promise resolving to array of ManifestFile objects
   * @throws Error if file system operations fail critically
   */
  async scanRepository(): Promise<ManifestFile[]> {
    const manifestFiles: ManifestFile[] = [];

    // Discover YAML files using glob patterns
    const filePaths = await this.discoverYAMLFiles();

    // Process each file
    for (const filePath of filePaths) {
      try {
        // Read file content
        const content = await fs.readFile(filePath, 'utf-8');

        // Parse YAML documents
        const documents = this.parseYAML(content);

        // Filter for ArgoCD resources
        const argoCDDocuments = documents.filter((doc) =>
          this.isArgoCDResource(doc)
        );

        // Only include files that contain ArgoCD resources
        if (argoCDDocuments.length > 0) {
          manifestFiles.push({
            path: filePath,
            content,
            documents: argoCDDocuments,
          });
        }
      } catch (error) {
        // Log warning for individual file errors but continue processing
        this.logger.warn(
          `Failed to process file ${filePath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        // Continue processing other files (graceful error handling)
      }
    }

    return manifestFiles;
  }

  /**
   * Discovers YAML files in the repository based on include/exclude patterns
   *
   * @returns Promise resolving to array of file paths
   * @private
   */
  private async discoverYAMLFiles(): Promise<string[]> {
    const allFiles: Set<string> = new Set();

    // Process include patterns
    for (const pattern of this.config.includePaths) {
      try {
        const matches = await glob(pattern, {
          ignore: this.config.excludePaths,
          nodir: true, // Only match files, not directories
          absolute: false, // Return relative paths
        });
        matches.forEach((file) => allFiles.add(file));
      } catch (error) {
        this.logger.warn(
          `Failed to process glob pattern "${pattern}": ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return Array.from(allFiles);
  }

  /**
   * Parses YAML content into an array of documents
   *
   * Handles:
   * - Single document YAML files
   * - Multi-document YAML files (separated by ---)
   * - Invalid YAML (returns empty array)
   *
   * @param content - Raw YAML file content
   * @returns Array of parsed YAML documents
   */
  parseYAML(content: string): YAMLDocument[] {
    const documents: YAMLDocument[] = [];

    try {
      // Use loadAll to handle multi-document YAML files
      const rawDocs = yaml.loadAll(content);

      for (const raw of rawDocs) {
        // Skip null/undefined documents (empty documents in multi-doc files)
        if (!raw || typeof raw !== 'object') {
          continue;
        }

        // Cast to Record for type safety
        const rawObj = raw as Record<string, unknown>;

        // Extract common Kubernetes resource fields
        const kind = this.extractKind(rawObj);
        const apiVersion = this.extractApiVersion(rawObj);
        const metadata = this.extractMetadata(rawObj);
        const spec = this.extractSpec(rawObj);

        documents.push({
          kind,
          apiVersion,
          metadata,
          spec,
          raw: rawObj,
        });
      }
    } catch (error) {
      // Invalid YAML - return empty array
      // The caller will log a warning
      return [];
    }

    return documents;
  }

  /**
   * Checks if a document is an ArgoCD Application or ApplicationSet resource
   *
   * @param doc - Parsed YAML document
   * @returns true if the document is an ArgoCD resource
   */
  isArgoCDResource(doc: YAMLDocument): boolean {
    // Check for ArgoCD API version
    const isArgoCDApiVersion =
      doc.apiVersion === 'argoproj.io/v1alpha1' ||
      doc.apiVersion.startsWith('argoproj.io/');

    // Check for Application or ApplicationSet kind
    const isArgoCDKind =
      doc.kind === 'Application' || doc.kind === 'ApplicationSet';

    return isArgoCDApiVersion && isArgoCDKind;
  }

  /**
   * Extracts the kind field from a raw YAML document
   * @private
   */
  private extractKind(raw: Record<string, unknown>): 'Application' | 'ApplicationSet' | 'Other' {
    const kind = raw.kind as string;
    if (kind === 'Application' || kind === 'ApplicationSet') {
      return kind;
    }
    return 'Other';
  }

  /**
   * Extracts the apiVersion field from a raw YAML document
   * @private
   */
  private extractApiVersion(raw: Record<string, unknown>): string {
    return (raw.apiVersion as string) || '';
  }

  /**
   * Extracts the metadata field from a raw YAML document
   * @private
   */
  private extractMetadata(raw: Record<string, unknown>): Record<string, unknown> {
    return (raw.metadata as Record<string, unknown>) || {};
  }

  /**
   * Extracts the spec field from a raw YAML document
   * @private
   */
  private extractSpec(raw: Record<string, unknown>): Record<string, unknown> {
    return (raw.spec as Record<string, unknown>) || {};
  }
}
