/**
 * Types for Helm chart dependency extraction
 */
/**
 * Represents a Helm chart dependency extracted from an ArgoCD manifest
 */
export interface HelmDependency {
    /** Path to the manifest file containing this dependency */
    manifestPath: string;
    /** Index of the document within the manifest file (for multi-document files) */
    documentIndex: number;
    /** Name of the Helm chart */
    chartName: string;
    /** Repository URL (Helm repository or OCI registry) */
    repoURL: string;
    /** Repository type (traditional Helm or OCI) */
    repoType: 'helm' | 'oci';
    /** Current version/targetRevision */
    currentVersion: string;
    /** JSON path to the targetRevision field in the YAML document */
    versionPath: string[];
}
//# sourceMappingURL=dependency.d.ts.map