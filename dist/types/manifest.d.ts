/**
 * Types for ArgoCD manifest scanning and parsing
 */
/**
 * Represents a single YAML document within a manifest file
 */
export interface YAMLDocument {
    /** The kind of Kubernetes resource */
    kind: 'Application' | 'ApplicationSet' | 'Other';
    /** The API version of the resource */
    apiVersion: string;
    /** Resource metadata */
    metadata: Record<string, unknown>;
    /** Resource specification */
    spec: Record<string, unknown>;
    /** Original parsed YAML object */
    raw: Record<string, unknown>;
}
/**
 * Represents a manifest file containing one or more YAML documents
 */
export interface ManifestFile {
    /** Path to the manifest file relative to repository root */
    path: string;
    /** Raw file content */
    content: string;
    /** Parsed YAML documents from the file */
    documents: YAMLDocument[];
}
//# sourceMappingURL=manifest.d.ts.map