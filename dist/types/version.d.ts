/**
 * Types for version resolution and update detection
 */
import { HelmDependency } from './dependency';
/**
 * Information about a specific chart version
 */
export interface ChartVersionInfo {
    /** Semantic version string */
    version: string;
    /** Application version (optional) */
    appVersion?: string;
    /** Creation date (optional) */
    created?: Date;
    /** Digest/checksum (optional) */
    digest?: string;
}
/**
 * Represents a detected version update for a chart
 */
export interface VersionUpdate {
    /** The dependency being updated */
    dependency: HelmDependency;
    /** Current version */
    currentVersion: string;
    /** New version to update to */
    newVersion: string;
    /** Link to release notes (optional) */
    releaseNotes?: string;
}
/**
 * Helm repository index structure (index.yaml)
 */
export interface HelmIndex {
    /** API version of the index format */
    apiVersion: string;
    /** Map of chart names to their version entries */
    entries: {
        [chartName: string]: ChartVersionInfo[];
    };
}
/**
 * OCI registry tags list response
 */
export interface OCITagsResponse {
    /** Repository name */
    name: string;
    /** List of available tags */
    tags: string[];
}
//# sourceMappingURL=version.d.ts.map