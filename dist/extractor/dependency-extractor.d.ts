/**
 * DependencyExtractor - Extracts Helm chart dependencies from ArgoCD manifests
 *
 * This class is responsible for:
 * - Extracting Helm chart sources from Application manifests (spec.source and spec.sources[])
 * - Extracting Helm chart sources from ApplicationSet manifests (spec.template.spec.source)
 * - Storing JSON path to targetRevision field for later updates
 * - Detecting repository type (Helm vs OCI)
 *
 * Requirements: 2.1, 2.2, 2.5
 */
import { YAMLDocument } from '../types/manifest';
import { HelmDependency } from '../types/dependency';
/**
 * DependencyExtractor extracts Helm chart dependencies from ArgoCD manifests
 */
export declare class DependencyExtractor {
    /**
     * Extracts Helm dependencies from an ArgoCD Application document
     *
     * Handles both:
     * - Single source: spec.source
     * - Multi-source: spec.sources[]
     *
     * @param doc - Parsed ArgoCD Application document
     * @param manifestPath - Path to the manifest file
     * @param documentIndex - Index of this document in the manifest file
     * @returns Array of HelmDependency objects
     */
    extractFromApplication(doc: YAMLDocument, manifestPath: string, documentIndex: number): HelmDependency[];
    /**
     * Extracts Helm dependencies from an ArgoCD ApplicationSet document
     *
     * Handles:
     * - Single source: spec.template.spec.source
     * - Multi-source: spec.template.spec.sources[]
     *
     * @param doc - Parsed ArgoCD ApplicationSet document
     * @param manifestPath - Path to the manifest file
     * @param documentIndex - Index of this document in the manifest file
     * @returns Array of HelmDependency objects
     */
    extractFromApplicationSet(doc: YAMLDocument, manifestPath: string, documentIndex: number): HelmDependency[];
    /**
     * Parses a source object to extract Helm chart information
     *
     * A source is considered a Helm chart if it has:
     * - A 'chart' field (chart name), OR
     * - A 'repoURL' field with an OCI prefix
     *
     * @param source - Source object from ArgoCD manifest
     * @param manifestPath - Path to the manifest file
     * @param documentIndex - Index of the document in the manifest file
     * @param basePath - JSON path to the source object
     * @returns HelmDependency object or null if not a Helm source
     * @private
     */
    private parseHelmSource;
    /**
     * Detects the repository type from a repository URL
     *
     * OCI registries are identified by:
     * - oci:// prefix
     * - Known registry domains (docker.io, ghcr.io, etc.)
     *
     * @param repoURL - Repository URL
     * @returns 'oci' for OCI registries, 'helm' for traditional Helm repositories
     * @private
     */
    private detectRepoType;
    /**
     * Extracts the chart name from an OCI registry URL
     *
     * OCI URLs can have formats like:
     * - oci://registry.example.com/chart-name
     * - oci://registry.example.com/path/to/chart-name
     *
     * @param repoURL - OCI registry URL
     * @returns Chart name extracted from the URL
     * @private
     */
    private extractChartNameFromOCI;
}
//# sourceMappingURL=dependency-extractor.d.ts.map