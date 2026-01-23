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
import { ActionConfig } from '../types/config';
import { ManifestFile, YAMLDocument } from '../types/manifest';
/**
 * ManifestScanner discovers and parses ArgoCD manifest files
 */
export declare class ManifestScanner {
    private config;
    private logger;
    /**
     * Creates a new ManifestScanner instance
     * @param config - Action configuration containing include/exclude patterns
     */
    constructor(config: ActionConfig);
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
    scanRepository(): Promise<ManifestFile[]>;
    /**
     * Discovers YAML files in the repository based on include/exclude patterns
     *
     * @returns Promise resolving to array of file paths
     * @private
     */
    private discoverYAMLFiles;
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
    parseYAML(content: string): YAMLDocument[];
    /**
     * Checks if a document is an ArgoCD Application or ApplicationSet resource
     *
     * @param doc - Parsed YAML document
     * @returns true if the document is an ArgoCD resource
     */
    isArgoCDResource(doc: YAMLDocument): boolean;
    /**
     * Extracts the kind field from a raw YAML document
     * @private
     */
    private extractKind;
    /**
     * Extracts the apiVersion field from a raw YAML document
     * @private
     */
    private extractApiVersion;
    /**
     * Extracts the metadata field from a raw YAML document
     * @private
     */
    private extractMetadata;
    /**
     * Extracts the spec field from a raw YAML document
     * @private
     */
    private extractSpec;
}
//# sourceMappingURL=manifest-scanner.d.ts.map