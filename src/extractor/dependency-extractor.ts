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
export class DependencyExtractor {
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
  extractFromApplication(
    doc: YAMLDocument,
    manifestPath: string,
    documentIndex: number
  ): HelmDependency[] {
    const dependencies: HelmDependency[] = [];

    if (!doc.spec) {
      return dependencies;
    }

    // Handle single source (spec.source)
    if (doc.spec.source) {
      const dep = this.parseHelmSource(
        doc.spec.source as Record<string, unknown>,
        manifestPath,
        documentIndex,
        ['spec', 'source']
      );
      if (dep) {
        dependencies.push(dep);
      }
    }

    // Handle multi-source (spec.sources[])
    if (doc.spec.sources && Array.isArray(doc.spec.sources)) {
      doc.spec.sources.forEach((source, index) => {
        const dep = this.parseHelmSource(
          source as Record<string, unknown>,
          manifestPath,
          documentIndex,
          ['spec', 'sources', index.toString()]
        );
        if (dep) {
          dependencies.push(dep);
        }
      });
    }

    return dependencies;
  }

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
  extractFromApplicationSet(
    doc: YAMLDocument,
    manifestPath: string,
    documentIndex: number
  ): HelmDependency[] {
    const dependencies: HelmDependency[] = [];

    if (!doc.spec || !doc.spec.template) {
      return dependencies;
    }

    const template = doc.spec.template as Record<string, unknown>;
    const templateSpec = template.spec as Record<string, unknown> | undefined;

    if (!templateSpec) {
      return dependencies;
    }

    // Handle single source (spec.template.spec.source)
    if (templateSpec.source) {
      const dep = this.parseHelmSource(
        templateSpec.source as Record<string, unknown>,
        manifestPath,
        documentIndex,
        ['spec', 'template', 'spec', 'source']
      );
      if (dep) {
        dependencies.push(dep);
      }
    }

    // Handle multi-source (spec.template.spec.sources[])
    if (templateSpec.sources && Array.isArray(templateSpec.sources)) {
      templateSpec.sources.forEach((source, index) => {
        const dep = this.parseHelmSource(
          source as Record<string, unknown>,
          manifestPath,
          documentIndex,
          ['spec', 'template', 'spec', 'sources', index.toString()]
        );
        if (dep) {
          dependencies.push(dep);
        }
      });
    }

    return dependencies;
  }

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
  private parseHelmSource(
    source: Record<string, unknown>,
    manifestPath: string,
    documentIndex: number,
    basePath: string[]
  ): HelmDependency | null {
    // Extract fields
    const chart = source.chart as string | undefined;
    const repoURL = source.repoURL as string | undefined;
    const targetRevision = source.targetRevision as string | undefined;

    // Must have a repoURL
    if (!repoURL) {
      return null;
    }

    // Must have either a chart name or be an OCI URL
    const repoType = this.detectRepoType(repoURL);
    
    // For traditional Helm repos, we need a chart name
    // For OCI repos, the chart name might be in the URL
    let chartName: string;
    
    if (chart) {
      chartName = chart;
    } else if (repoType === 'oci') {
      // Extract chart name from OCI URL
      // Format: oci://registry.example.com/path/to/chart
      chartName = this.extractChartNameFromOCI(repoURL);
    } else {
      // Not a Helm chart source (might be a Git source)
      return null;
    }

    // Must have a targetRevision
    if (!targetRevision) {
      return null;
    }

    return {
      manifestPath,
      documentIndex,
      chartName,
      repoURL,
      repoType,
      currentVersion: targetRevision,
      versionPath: [...basePath, 'targetRevision'],
    };
  }

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
  private detectRepoType(repoURL: string): 'helm' | 'oci' {
    // Check for explicit OCI prefix
    if (repoURL.startsWith('oci://')) {
      return 'oci';
    }

    // Check for known OCI registry domains
    const ociRegistryPatterns = [
      'registry-1.docker.io',
      'docker.io',
      'ghcr.io',
      'gcr.io',
      'registry.gitlab.com',
      'quay.io',
      'public.ecr.aws',
      'azurecr.io',
    ];

    const lowerURL = repoURL.toLowerCase();
    for (const pattern of ociRegistryPatterns) {
      if (lowerURL.includes(pattern)) {
        return 'oci';
      }
    }

    // Default to traditional Helm repository
    return 'helm';
  }

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
  private extractChartNameFromOCI(repoURL: string): string {
    // Remove oci:// prefix if present
    let url = repoURL;
    if (url.startsWith('oci://')) {
      url = url.substring(6);
    }

    // Remove protocol if present (http://, https://)
    url = url.replace(/^https?:\/\//, '');

    // Split by / and get the last part
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1];

    // Remove any query parameters or fragments
    return lastPart.split('?')[0].split('#')[0];
  }
}
