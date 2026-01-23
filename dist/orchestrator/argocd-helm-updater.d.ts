/**
 * ArgoCDHelmUpdater - Main orchestrator for the GitHub Action
 *
 * This class coordinates all components and executes the workflow:
 * 1. Load configuration
 * 2. Discover and parse ArgoCD manifests
 * 3. Extract Helm chart dependencies
 * 4. Resolve available versions from repositories
 * 5. Detect updates
 * 6. Update manifest files
 * 7. Create pull requests
 *
 * Requirements: All
 */
import { ActionConfig } from '../types/config';
/**
 * Main orchestrator class for the ArgoCD Helm Updater
 */
export declare class ArgoCDHelmUpdater {
    private config;
    private logger;
    private scanner;
    private extractor;
    private resolver;
    private updater;
    private prManager;
    /**
     * Creates a new ArgoCDHelmUpdater instance
     *
     * @param config - Action configuration (optional, will load from inputs if not provided)
     */
    constructor(config?: ActionConfig);
    /**
     * Main execution method - runs the complete workflow
     *
     * @returns Processing statistics
     */
    run(): Promise<{
        filesScanned: number;
        chartsFound: number;
        updatesDetected: number;
        prsCreated: number;
    }>;
    /**
     * Stage 1: Discover and parse ArgoCD manifests
     *
     * @returns Array of discovered manifest files
     * @private
     */
    private discoverManifests;
    /**
     * Stage 2: Extract Helm chart dependencies from manifests
     *
     * @param manifests - Discovered manifest files
     * @returns Array of Helm dependencies
     * @private
     */
    private extractDependencies;
    /**
     * Stage 3: Check for available updates
     *
     * @param dependencies - Helm chart dependencies
     * @returns Array of available updates
     * @private
     */
    private checkForUpdates;
    /**
     * Stage 4: Update manifest files with new versions
     *
     * @param updates - Available updates
     * @returns Array of file updates
     * @private
     */
    private updateManifests;
    /**
     * Stage 5: Create pull requests for updates
     *
     * @param fileUpdates - File updates to create PRs for
     * @returns Number of PRs created
     * @private
     */
    private createPullRequests;
    /**
     * Set GitHub Action outputs
     *
     * @param filesScanned - Number of files scanned
     * @param chartsFound - Number of charts found
     * @param prNumber - PR number (if created)
     * @param prUrl - PR URL (if created)
     * @private
     */
    private setOutputs;
}
//# sourceMappingURL=argocd-helm-updater.d.ts.map