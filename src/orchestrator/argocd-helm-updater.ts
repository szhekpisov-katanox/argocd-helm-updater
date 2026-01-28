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

import * as core from '@actions/core';
import * as github from '@actions/github';
import { ConfigurationManager } from '../config/configuration-manager';
import { ManifestScanner } from '../scanner/manifest-scanner';
import { DependencyExtractor } from '../extractor/dependency-extractor';
import { VersionResolver } from '../resolver/version-resolver';
import { FileUpdater } from '../updater/file-updater';
import { PullRequestManager } from '../pr/pull-request-manager';
import { ChangelogFinder } from '../changelog/changelog-finder';
import { ActionConfig } from '../types/config';
import { Logger, createLogger } from '../utils/logger';
import { HelmDependency } from '../types/dependency';
import { VersionUpdate } from '../types/version';
import { FileUpdate } from '../types/file-update';
import { ManifestFile } from '../types/manifest';
import { ChangelogResult } from '../types/changelog';

/**
 * Main orchestrator class for the ArgoCD Helm Updater
 */
export class ArgoCDHelmUpdater {
  private config: ActionConfig;
  private logger: Logger;
  private scanner: ManifestScanner;
  private extractor: DependencyExtractor;
  private resolver: VersionResolver;
  private updater: FileUpdater;
  private prManager: PullRequestManager | null = null;
  private changelogFinder: ChangelogFinder | null = null;

  /**
   * Creates a new ArgoCDHelmUpdater instance
   *
   * @param config - Action configuration (optional, will load from inputs if not provided)
   */
  constructor(config?: ActionConfig) {
    // Load configuration
    this.config = config || ConfigurationManager.load();

    // Validate configuration
    const validation = ConfigurationManager.validate(this.config);
    if (!validation.valid) {
      throw new Error(`Configuration validation failed:\n${validation.errors.join('\n')}`);
    }

    // Initialize logger
    this.logger = createLogger(this.config.logLevel);

    // Initialize components
    this.scanner = new ManifestScanner(this.config);
    this.extractor = new DependencyExtractor();
    this.resolver = new VersionResolver(this.config);
    this.updater = new FileUpdater();

    // Initialize PR manager only if not in dry-run mode
    if (!this.config.dryRun && this.config.githubToken) {
      const octokit = github.getOctokit(this.config.githubToken);
      this.prManager = new PullRequestManager(octokit, this.config);
    }

    // Initialize changelog finder if enabled (Requirement 9.1, 9.7)
    if (this.config.changelog.enabled) {
      this.changelogFinder = new ChangelogFinder({
        githubToken: this.config.githubToken,
        gitlabToken: this.config.changelog.gitlabToken,
        bitbucketCredentials: this.config.changelog.bitbucketCredentials,
        cacheTTL: this.config.changelog.cacheTTL,
        enableCache: true,
      });
      this.logger.info('Changelog generation enabled');
    } else {
      this.logger.info('Changelog generation disabled');
    }
  }

  /**
   * Main execution method - runs the complete workflow
   *
   * @returns Processing statistics
   */
  async run(): Promise<{
    filesScanned: number;
    chartsFound: number;
    updatesDetected: number;
    prsCreated: number;
  }> {
    try {
      this.logger.info('ArgoCD Helm Updater starting...');

      // Stage 1: Discover manifests
      this.logger.logStageStart('Discovering ArgoCD manifests');
      const manifests = await this.discoverManifests();
      this.logger.logStageComplete('Discovering ArgoCD manifests');

      if (manifests.length === 0) {
        this.logger.info('No ArgoCD manifests found');
        this.setOutputs(0, 0, null, null);
        return { filesScanned: 0, chartsFound: 0, updatesDetected: 0, prsCreated: 0 };
      }

      // Stage 2: Extract dependencies
      this.logger.logStageStart('Extracting Helm chart dependencies');
      const dependencies = await this.extractDependencies(manifests);
      this.logger.logStageComplete('Extracting Helm chart dependencies');

      if (dependencies.length === 0) {
        this.logger.info('No Helm chart dependencies found');
        this.setOutputs(manifests.length, 0, null, null);
        return {
          filesScanned: manifests.length,
          chartsFound: 0,
          updatesDetected: 0,
          prsCreated: 0,
        };
      }

      // Stage 3: Check for updates
      this.logger.logStageStart('Checking for available updates');
      const updates = await this.checkForUpdates(dependencies);
      this.logger.logStageComplete('Checking for available updates');

      if (updates.length === 0) {
        this.logger.logNoUpdatesFound();
        this.setOutputs(manifests.length, dependencies.length, null, null);
        return {
          filesScanned: manifests.length,
          chartsFound: dependencies.length,
          updatesDetected: 0,
          prsCreated: 0,
        };
      }

      // Log detected updates
      for (const update of updates) {
        this.logger.logUpdateDetected(
          update.dependency.chartName,
          update.currentVersion,
          update.newVersion,
          update.dependency.manifestPath
        );
      }

      // Stage 4: Update manifest files
      this.logger.logStageStart('Updating manifest files');
      const fileUpdates = await this.updateManifests(updates);
      this.logger.logStageComplete('Updating manifest files');

      // Stage 5: Create pull requests (unless dry-run)
      let prsCreated = 0;
      if (this.config.dryRun) {
        this.logger.info('Dry-run mode: Skipping PR creation');
        this.logger.info(`Would create PR(s) for ${updates.length} update(s)`);
        this.setOutputs(manifests.length, dependencies.length, null, null);
      } else {
        this.logger.logStageStart('Creating pull requests');
        prsCreated = await this.createPullRequests(fileUpdates);
        this.logger.logStageComplete('Creating pull requests');
      }

      // Log summary
      const stats = {
        filesScanned: manifests.length,
        chartsFound: dependencies.length,
        updatesDetected: updates.length,
        prsCreated,
      };
      this.logger.logProcessingSummary(stats);

      this.logger.info('ArgoCD Helm Updater completed successfully');
      return stats;
    } catch (error) {
      this.logger.error(
        `Fatal error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Stage 1: Discover and parse ArgoCD manifests
   *
   * @returns Array of discovered manifest files
   * @private
   */
  private async discoverManifests(): Promise<ManifestFile[]> {
    const manifests = await this.scanner.scanRepository();
    this.logger.logFilesDiscovered(manifests.length);
    return manifests;
  }

  /**
   * Stage 2: Extract Helm chart dependencies from manifests
   *
   * @param manifests - Discovered manifest files
   * @returns Array of Helm dependencies
   * @private
   */
  private async extractDependencies(
    manifests: Awaited<ReturnType<typeof this.scanner.scanRepository>>
  ): Promise<HelmDependency[]> {
    const allDependencies: HelmDependency[] = [];

    for (const manifest of manifests) {
      for (let i = 0; i < manifest.documents.length; i++) {
        const doc = manifest.documents[i];
        let dependencies: HelmDependency[] = [];

        if (doc.kind === 'Application') {
          dependencies = this.extractor.extractFromApplication(doc, manifest.path, i);
        } else if (doc.kind === 'ApplicationSet') {
          dependencies = this.extractor.extractFromApplicationSet(doc, manifest.path, i);
        }

        allDependencies.push(...dependencies);
      }
    }

    this.logger.info(`Found ${allDependencies.length} Helm chart dependencies`);
    return allDependencies;
  }

  /**
   * Stage 3: Check for available updates
   *
   * @param dependencies - Helm chart dependencies
   * @returns Array of available updates
   * @private
   */
  private async checkForUpdates(dependencies: HelmDependency[]): Promise<VersionUpdate[]> {
    const updates = await this.resolver.checkForUpdates(dependencies);
    this.logger.info(`Detected ${updates.length} available update(s)`);
    return updates;
  }

  /**
   * Stage 4: Update manifest files with new versions
   *
   * @param updates - Available updates
   * @returns Array of file updates
   * @private
   */
  private async updateManifests(updates: VersionUpdate[]): Promise<FileUpdate[]> {
    const fileUpdates = await this.updater.updateManifests(updates);
    this.logger.info(`Updated ${fileUpdates.length} manifest file(s)`);
    return fileUpdates;
  }

  /**
   * Stage 5: Create pull requests for updates
   *
   * @param fileUpdates - File updates to create PRs for
   * @returns Number of PRs created
   * @private
   */
  private async createPullRequests(fileUpdates: FileUpdate[]): Promise<number> {
    if (!this.prManager) {
      this.logger.warn('PR manager not initialized, skipping PR creation');
      return 0;
    }

    // Group updates according to PR strategy
    const groups = this.prManager.groupUpdatesByStrategy(fileUpdates);
    this.logger.info(`Creating ${groups.length} pull request(s) based on ${this.config.prStrategy} strategy`);

    let prsCreated = 0;
    const prNumbers: number[] = [];
    const prUrls: string[] = [];

    for (const group of groups) {
      try {
        // Fetch changelogs for all charts in this group (Requirement 9.1, 9.2)
        const changelogResults = await this.fetchChangelogs(group);

        // Generate PR title and body
        const title = this.prManager.generatePRTitle(group);
        const body = this.prManager.generatePRBody(group, changelogResults);
        const branch = this.prManager.generateBranchName(group);

        // Create or update PR
        const prNumber = await this.prManager.createOrUpdatePR(group, {
          title,
          body,
          branch,
          labels: this.config.prLabels,
          assignees: this.config.prAssignees,
          reviewers: this.config.prReviewers,
        });

        if (prNumber) {
          prsCreated++;
          prNumbers.push(prNumber);
          const prUrl = `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/pull/${prNumber}`;
          prUrls.push(prUrl);
          this.logger.info(`Created/updated PR #${prNumber}: ${prUrl}`);
        }
      } catch (error) {
        this.logger.logErrorWithContext(
          'creating pull request',
          error instanceof Error ? error : String(error)
        );
        // Continue with other PRs even if one fails
      }
    }

    // Set action outputs
    this.setOutputs(
      0, // filesScanned will be set by caller
      0, // chartsFound will be set by caller
      prNumbers.length > 0 ? prNumbers[0] : null,
      prUrls.length > 0 ? prUrls[0] : null
    );

    return prsCreated;
  }

  /**
   * Fetches changelogs for all charts in a group of file updates
   * 
   * Validates Requirements:
   * - 9.1: Integrate with PullRequestManager
   * - 9.2: Receive chart metadata from VersionResolver
   * - 9.4: Not block PR creation if changelog retrieval fails
   * - 9.5: Log all operations using existing logging framework
   *
   * @param fileUpdates - File updates to fetch changelogs for
   * @returns Map of chart names to changelog results
   * @private
   */
  private async fetchChangelogs(fileUpdates: FileUpdate[]): Promise<Map<string, ChangelogResult> | undefined> {
    // Return undefined if changelog finder is not initialized (Requirement 9.7)
    if (!this.changelogFinder) {
      return undefined;
    }

    const changelogResults = new Map<string, ChangelogResult>();
    const allUpdates = fileUpdates.flatMap((file) => file.updates);

    // Deduplicate by chart name (same chart may appear in multiple files)
    const uniqueUpdates = new Map<string, VersionUpdate>();
    for (const update of allUpdates) {
      const chartName = update.dependency.chartName;
      if (!uniqueUpdates.has(chartName)) {
        uniqueUpdates.set(chartName, update);
      }
    }

    // Fetch changelogs for each unique chart (Requirement 9.5)
    this.logger.info(`Fetching changelogs for ${uniqueUpdates.size} chart(s)`);

    for (const [chartName, update] of uniqueUpdates.entries()) {
      try {
        this.logger.debug(`Fetching changelog for ${chartName}`);
        const result = await this.changelogFinder.findChangelog(update);
        changelogResults.set(chartName, result);

        if (result.found) {
          this.logger.info(`Found changelog for ${chartName}`);
        } else {
          this.logger.debug(`No changelog found for ${chartName}`);
        }
      } catch (error) {
        // Log error but don't fail PR creation (Requirement 9.4, 6.1, 6.2)
        this.logger.warn(
          `Failed to fetch changelog for ${chartName}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        // Add a result indicating failure
        changelogResults.set(chartName, {
          found: false,
          sourceUrl: update.dependency.repoURL,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return changelogResults;
  }

  /**
   * Set GitHub Action outputs
   *
   * @param filesScanned - Number of files scanned
   * @param chartsFound - Number of charts found
   * @param prNumber - PR number (if created)
   * @param prUrl - PR URL (if created)
   * @private
   */
  private setOutputs(
    filesScanned: number,
    chartsFound: number,
    prNumber: number | null,
    prUrl: string | null
  ): void {
    core.setOutput('files-scanned', filesScanned.toString());
    core.setOutput('charts-found', chartsFound.toString());
    core.setOutput('updates-found', chartsFound > 0 ? 'true' : 'false');

    if (prNumber !== null) {
      core.setOutput('pr-number', prNumber.toString());
    }

    if (prUrl !== null) {
      core.setOutput('pr-url', prUrl);
    }
  }
}
