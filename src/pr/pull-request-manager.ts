/**
 * PullRequestManager - Manages GitHub pull request operations
 *
 * This class is responsible for:
 * - Creating branches for updates
 * - Committing file changes
 * - Creating and updating pull requests
 * - Checking for existing PRs to avoid duplicates
 *
 * Requirements: 6.1
 */

import * as github from '@actions/github';
import * as semver from 'semver';
import { ActionConfig } from '../types/config';
import { FileUpdate } from '../types/file-update';
import { VersionUpdate } from '../types/version';
import { Logger, createLogger } from '../utils/logger';

/**
 * Options for creating or updating a pull request
 */
export interface PROptions {
  /** PR title */
  title: string;
  /** PR body/description */
  body: string;
  /** Branch name for the PR */
  branch: string;
  /** Labels to apply to the PR */
  labels: string[];
  /** GitHub usernames to assign to the PR */
  assignees: string[];
  /** GitHub usernames to request reviews from */
  reviewers: string[];
}

/**
 * PullRequestManager class for managing GitHub PR operations
 */
export class PullRequestManager {
  private octokit: ReturnType<typeof github.getOctokit>;
  private config: ActionConfig;
  private owner: string;
  private repo: string;
  private logger: Logger;

  /**
   * Creates a new PullRequestManager instance
   *
   * @param octokit - Authenticated Octokit client
   * @param config - Action configuration
   */
  constructor(octokit: ReturnType<typeof github.getOctokit>, config: ActionConfig) {
    this.octokit = octokit;
    this.config = config;
    this.logger = createLogger(config.logLevel);

    // Extract owner and repo from GitHub context
    const { owner, repo } = github.context.repo;
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Creates or updates a pull request with file updates
   *
   * This is the main entry point that orchestrates the PR workflow:
   * 1. Check if open PR limit has been reached
   * 2. Create a new branch from the base branch
   * 3. Commit the file changes to the new branch
   * 4. Check if a PR already exists for this branch
   * 5. Create a new PR or update the existing one
   *
   * @param fileUpdates - List of file updates to commit
   * @param prOptions - Options for the pull request
   * @returns PR number if created/updated, null if skipped
   */
  async createOrUpdatePR(
    fileUpdates: FileUpdate[],
    prOptions: PROptions
  ): Promise<number | null> {
    if (fileUpdates.length === 0) {
      this.logger.info('No file updates to commit');
      return null;
    }

    try {
      // Check if we've reached the open PR limit
      const existingPR = await this.findExistingPR(prOptions.branch);
      
      if (!existingPR) {
        // Only check limit when creating a new PR (not when updating existing)
        const canCreatePR = await this.checkOpenPRLimit();
        if (!canCreatePR) {
          this.logger.info(
            `Skipping PR creation: open pull request limit (${this.config.openPullRequestsLimit}) reached`
          );
          this.logSkippedUpdates(fileUpdates);
          return null;
        }
      }

      // Create a new branch
      await this.createBranch(prOptions.branch);

      // Commit the changes
      await this.commitChanges(prOptions.branch, fileUpdates);

      if (existingPR) {
        // Update existing PR
        await this.updatePR(existingPR, prOptions, fileUpdates);
        
        // Rebase if configured
        if (this.config.rebaseStrategy === 'auto') {
          await this.rebasePRIfNeeded(existingPR);
        }
        
        this.logger.info(`Updated existing PR #${existingPR}`);
        return existingPR;
      } else {
        // Create new PR
        const prNumber = await this.createPR(prOptions, fileUpdates);
        this.logger.info(`Created new PR #${prNumber}`);
        return prNumber;
      }
    } catch (error) {
      this.logger.error(
        `Failed to create or update PR: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Creates a new branch from the base branch
   *
   * @param branchName - Name of the branch to create
   * @throws Error if branch creation fails
   */
  async createBranch(branchName: string): Promise<void> {
    try {
      // Get the default branch (usually 'main' or 'master')
      const { data: repo } = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo,
      });

      const baseBranch = repo.default_branch;

      // Get the SHA of the base branch
      const { data: ref } = await this.octokit.rest.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${baseBranch}`,
      });

      const baseSha = ref.object.sha;

      // Create the new branch
      try {
        await this.octokit.rest.git.createRef({
          owner: this.owner,
          repo: this.repo,
          ref: `refs/heads/${branchName}`,
          sha: baseSha,
        });
        this.logger.info(`Created branch: ${branchName} from ${baseBranch}`);
      } catch (error) {
        // Branch might already exist, which is okay
        if (error instanceof Error && 'status' in error && error.status === 422) {
          this.logger.info(`Branch ${branchName} already exists, will update it`);
        } else {
          throw error;
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to create branch ${branchName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Commits file changes to a branch
   *
   * This method uses the GitHub API to create commits with updated files.
   * It batches all file changes into a single commit for efficiency.
   *
   * @param branch - Branch name to commit to
   * @param fileUpdates - List of file updates to commit
   * @throws Error if commit creation fails
   */
  async commitChanges(branch: string, fileUpdates: FileUpdate[]): Promise<void> {
    try {
      // Get the current commit SHA of the branch
      const { data: ref } = await this.octokit.rest.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branch}`,
      });

      const currentCommitSha = ref.object.sha;

      // Get the tree SHA of the current commit
      const { data: currentCommit } = await this.octokit.rest.git.getCommit({
        owner: this.owner,
        repo: this.repo,
        commit_sha: currentCommitSha,
      });

      const baseTreeSha = currentCommit.tree.sha;

      // Create blobs for each updated file
      const tree = await Promise.all(
        fileUpdates.map(async (fileUpdate) => {
          const { data: blob } = await this.octokit.rest.git.createBlob({
            owner: this.owner,
            repo: this.repo,
            content: Buffer.from(fileUpdate.updatedContent).toString('base64'),
            encoding: 'base64',
          });

          return {
            path: fileUpdate.path,
            mode: '100644' as const,
            type: 'blob' as const,
            sha: blob.sha,
          };
        })
      );

      // Create a new tree with the updated files
      const { data: newTree } = await this.octokit.rest.git.createTree({
        owner: this.owner,
        repo: this.repo,
        base_tree: baseTreeSha,
        tree,
      });

      // Generate commit message
      const commitMessage = this.generateCommitMessage(fileUpdates);

      // Create a new commit
      const { data: newCommit } = await this.octokit.rest.git.createCommit({
        owner: this.owner,
        repo: this.repo,
        message: commitMessage,
        tree: newTree.sha,
        parents: [currentCommitSha],
      });

      // Update the branch reference to point to the new commit
      await this.octokit.rest.git.updateRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha,
      });

      this.logger.info(`Committed ${fileUpdates.length} file(s) to ${branch}`);
    } catch (error) {
      throw new Error(
        `Failed to commit changes to ${branch}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Finds an existing pull request for a branch
   *
   * @param branch - Branch name to search for
   * @returns PR number if found, null otherwise
   */
  async findExistingPR(branch: string): Promise<number | null> {
    try {
      const { data: pulls } = await this.octokit.rest.pulls.list({
        owner: this.owner,
        repo: this.repo,
        head: `${this.owner}:${branch}`,
        state: 'open',
      });

      if (pulls.length > 0) {
        return pulls[0].number;
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Failed to search for existing PR: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  /**
   * Creates a new pull request
   *
   * @param options - PR options (title, body, branch, labels, assignees, reviewers)
   * @param fileUpdates - List of file updates for auto-merge eligibility check
   * @returns PR number
   * @throws Error if PR creation fails
   */
  async createPR(options: PROptions, fileUpdates: FileUpdate[] = []): Promise<number> {
    try {
      // Get the default branch
      const { data: repo } = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo,
      });

      const baseBranch = repo.default_branch;

      // Create the pull request
      const { data: pr } = await this.octokit.rest.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title: options.title,
        body: options.body,
        head: options.branch,
        base: baseBranch,
      });

      // Apply labels if specified
      if (options.labels.length > 0) {
        await this.octokit.rest.issues.addLabels({
          owner: this.owner,
          repo: this.repo,
          issue_number: pr.number,
          labels: options.labels,
        });
      }

      // Add assignees if specified
      if (options.assignees.length > 0) {
        await this.octokit.rest.issues.addAssignees({
          owner: this.owner,
          repo: this.repo,
          issue_number: pr.number,
          assignees: options.assignees,
        });
      }

      // Request reviewers if specified
      if (options.reviewers.length > 0) {
        await this.octokit.rest.pulls.requestReviewers({
          owner: this.owner,
          repo: this.repo,
          pull_number: pr.number,
          reviewers: options.reviewers,
        });
      }

      // Apply auto-merge if configured and eligible
      await this.applyAutoMergeIfEligible(pr.number, fileUpdates);

      return pr.number;
    } catch (error) {
      throw new Error(
        `Failed to create PR: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Updates an existing pull request
   *
   * @param prNumber - PR number to update
   * @param options - PR options (title, body, labels, assignees, reviewers)
   * @param fileUpdates - List of file updates for auto-merge eligibility check
   * @throws Error if PR update fails
   */
  async updatePR(prNumber: number, options: PROptions, fileUpdates: FileUpdate[] = []): Promise<void> {
    try {
      // Update PR title and body
      await this.octokit.rest.pulls.update({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        title: options.title,
        body: options.body,
      });

      // Get current labels
      const { data: currentLabels } = await this.octokit.rest.issues.listLabelsOnIssue({
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber,
      });

      const currentLabelNames = currentLabels.map((label) => label.name);

      // Add new labels that aren't already present
      const labelsToAdd = options.labels.filter(
        (label) => !currentLabelNames.includes(label)
      );

      if (labelsToAdd.length > 0) {
        await this.octokit.rest.issues.addLabels({
          owner: this.owner,
          repo: this.repo,
          issue_number: prNumber,
          labels: labelsToAdd,
        });
      }

      // Get current assignees
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
      });

      const currentAssignees = pr.assignees?.map((assignee) => assignee.login) || [];

      // Add new assignees that aren't already assigned
      const assigneesToAdd = options.assignees.filter(
        (assignee) => !currentAssignees.includes(assignee)
      );

      if (assigneesToAdd.length > 0) {
        await this.octokit.rest.issues.addAssignees({
          owner: this.owner,
          repo: this.repo,
          issue_number: prNumber,
          assignees: assigneesToAdd,
        });
      }

      // Get current reviewers
      const { data: reviews } = await this.octokit.rest.pulls.listRequestedReviewers({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
      });

      const currentReviewers = reviews.users.map((user) => user.login);

      // Add new reviewers that aren't already requested
      const reviewersToAdd = options.reviewers.filter(
        (reviewer) => !currentReviewers.includes(reviewer)
      );

      if (reviewersToAdd.length > 0) {
        await this.octokit.rest.pulls.requestReviewers({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
          reviewers: reviewersToAdd,
        });
      }

      // Apply auto-merge if configured and eligible
      await this.applyAutoMergeIfEligible(prNumber, fileUpdates);
    } catch (error) {
      throw new Error(
        `Failed to update PR #${prNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Applies auto-merge configuration to a PR if it meets the criteria
   *
   * Checks if the PR is eligible for auto-merge based on:
   * - Auto-merge is enabled in configuration
   * - All updates are of allowed update types (major, minor, patch)
   *
   * If eligible, adds the 'automerge' label to the PR.
   * Note: This requires GitHub's auto-merge feature to be enabled in repository settings.
   *
   * Requirements: Additional Feature 4
   *
   * @param prNumber - PR number to check
   * @param fileUpdates - List of file updates in the PR
   * @private
   */
  private async applyAutoMergeIfEligible(
    prNumber: number,
    fileUpdates: FileUpdate[]
  ): Promise<void> {
    // Check if auto-merge is enabled
    if (!this.config.autoMerge.enabled) {
      return;
    }

    // If no file updates provided (e.g., during update), skip eligibility check
    if (fileUpdates.length === 0) {
      this.logger.debug(`Skipping auto-merge eligibility check for PR #${prNumber} (no file updates provided)`);
      return;
    }

    // Collect all updates
    const allUpdates = fileUpdates.flatMap((file) => file.updates);

    if (allUpdates.length === 0) {
      return;
    }

    // Check if all updates are of allowed types
    const allowedTypes = this.config.autoMerge.updateTypes;
    const allEligible = allUpdates.every((update) => {
      const updateType = this.getUpdateType(update.currentVersion, update.newVersion);
      return updateType && allowedTypes.includes(updateType);
    });

    if (!allEligible) {
      this.logger.info(
        `PR #${prNumber} is not eligible for auto-merge (contains updates outside allowed types: ${allowedTypes.join(', ')})`
      );
      return;
    }

    try {
      // Add automerge label
      await this.octokit.rest.issues.addLabels({
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber,
        labels: ['automerge'],
      });

      this.logger.info(
        `Added 'automerge' label to PR #${prNumber} (eligible for auto-merge)`
      );

      // Optionally enable auto-merge via GitHub API
      // Note: This requires the repository to have auto-merge enabled
      // and the PR to meet branch protection requirements
      if (this.config.autoMerge.requireCIPass || this.config.autoMerge.requireApprovals > 0) {
        this.logger.info(
          `Auto-merge configured with requirements: CI pass=${this.config.autoMerge.requireCIPass}, approvals=${this.config.autoMerge.requireApprovals}`
        );
        this.logger.info(
          'Ensure branch protection rules are configured to enforce these requirements'
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to apply auto-merge to PR #${prNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Generates a branch name for file updates
   *
   * Creates a descriptive branch name based on the updates:
   * - Single chart update: ${branchPrefix}/${chart-name}-${new-version}
   * - Multiple chart updates: ${branchPrefix}/helm-updates-${timestamp}
   *
   * Requirements: 6.2
   *
   * @param fileUpdates - List of file updates
   * @returns Generated branch name
   */
  generateBranchName(fileUpdates: FileUpdate[]): string {
    const prefix = this.config.branchPrefix;

    // Collect all chart updates
    const allUpdates = fileUpdates.flatMap((file) => file.updates);

    if (allUpdates.length === 0) {
      // Fallback for empty updates
      const timestamp = Date.now();
      return `${prefix}/helm-updates-${timestamp}`;
    }

    if (allUpdates.length === 1) {
      // Single chart update: include chart name and version
      const update = allUpdates[0];
      const chartName = update.dependency.chartName;
      const newVersion = update.newVersion;
      return `${prefix}/${chartName}-${newVersion}`;
    }

    // Multiple chart updates: use timestamp
    const timestamp = Date.now();
    return `${prefix}/helm-updates-${timestamp}`;
  }

  /**
   * Generates a pull request body with update details
   *
   * Creates a formatted PR body that includes:
   * - Summary of updates
   * - Table of chart updates grouped by manifest file
   * - Links to chart repositories
   * - Links to release notes when available
   *
   * Requirements: 6.3, 6.4, 6.5
   *
   * @param fileUpdates - List of file updates
   * @returns Formatted PR body in Markdown
   */
  generatePRBody(fileUpdates: FileUpdate[]): string {
    const allUpdates = fileUpdates.flatMap((file) => file.updates);

    if (allUpdates.length === 0) {
      return 'This PR updates Helm chart versions in ArgoCD manifests.';
    }

    // Build the PR body
    const sections: string[] = [];

    // Summary section
    const chartCount = allUpdates.length;
    const fileCount = fileUpdates.length;
    sections.push('## Helm Chart Updates');
    sections.push('');
    sections.push(
      `This PR updates ${chartCount} Helm chart${chartCount > 1 ? 's' : ''} across ${fileCount} manifest file${fileCount > 1 ? 's' : ''}.`
    );
    sections.push('');

    // Group updates by manifest file
    for (const fileUpdate of fileUpdates) {
      if (fileUpdate.updates.length === 0) {
        continue;
      }

      sections.push(`### \`${fileUpdate.path}\``);
      sections.push('');

      // Create table header
      sections.push('| Chart | Repository | Current Version | New Version | Release Notes |');
      sections.push('|-------|------------|-----------------|-------------|---------------|');

      // Add table rows for each update
      for (const update of fileUpdate.updates) {
        const chartName = update.dependency.chartName;
        const repoURL = update.dependency.repoURL;
        const currentVersion = update.currentVersion;
        const newVersion = update.newVersion;

        // Format repository link
        const repoLink = `[${this.formatRepoName(repoURL)}](${repoURL})`;

        // Format release notes link if available
        const releaseNotesLink = update.releaseNotes
          ? `[View](${update.releaseNotes})`
          : '-';

        sections.push(
          `| ${chartName} | ${repoLink} | \`${currentVersion}\` | \`${newVersion}\` | ${releaseNotesLink} |`
        );
      }

      sections.push('');
    }

    // Add footer with helpful information
    sections.push('---');
    sections.push('');
    sections.push('*This PR was automatically generated by ArgoCD Helm Updater*');

    return sections.join('\n');
  }

  /**
   * Formats a repository URL into a readable name
   *
   * Extracts a human-readable name from the repository URL.
   * Examples:
   * - https://charts.bitnami.com/bitnami -> bitnami
   * - oci://registry-1.docker.io/bitnamicharts -> bitnamicharts
   * - https://charts.example.com -> charts.example.com
   *
   * @param repoURL - Repository URL
   * @returns Formatted repository name
   * @private
   */
  private formatRepoName(repoURL: string): string {
    try {
      // Handle OCI URLs
      if (repoURL.startsWith('oci://')) {
        const withoutProtocol = repoURL.replace('oci://', '');
        const parts = withoutProtocol.split('/');
        // Return the last meaningful part (usually the organization/namespace)
        return parts[parts.length - 1] || withoutProtocol;
      }

      // Handle HTTP/HTTPS URLs
      const url = new URL(repoURL);
      const pathParts = url.pathname.split('/').filter((part) => part.length > 0);

      // If there's a meaningful path, use the last part
      if (pathParts.length > 0) {
        return pathParts[pathParts.length - 1];
      }

      // Otherwise, use the hostname
      return url.hostname;
    } catch {
      // If URL parsing fails, return the original URL
      return repoURL;
    }
  }

  /**
   * Determines the update type (major, minor, patch) for a version change
   *
   * @param currentVersion - Current version string
   * @param newVersion - New version string
   * @returns Update type or null if versions are invalid
   * @private
   */
  private getUpdateType(
    currentVersion: string,
    newVersion: string
  ): 'major' | 'minor' | 'patch' | null {
    try {
      const current = semver.parse(currentVersion);
      const next = semver.parse(newVersion);

      if (!current || !next) {
        return null;
      }

      if (next.major > current.major) {
        return 'major';
      }

      if (next.minor > current.minor) {
        return 'minor';
      }

      if (next.patch > current.patch) {
        return 'patch';
      }

      // If versions are equal or new is older, return null
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Determines the highest update type from a list of updates
   *
   * Priority: major > minor > patch
   *
   * @param updates - List of version updates
   * @returns Highest update type
   * @private
   */
  private getHighestUpdateType(updates: VersionUpdate[]): 'major' | 'minor' | 'patch' {
    let hasMajor = false;
    let hasMinor = false;

    for (const update of updates) {
      const updateType = this.getUpdateType(update.currentVersion, update.newVersion);

      if (updateType === 'major') {
        hasMajor = true;
      } else if (updateType === 'minor') {
        hasMinor = true;
      }
    }

    if (hasMajor) {
      return 'major';
    }
    if (hasMinor) {
      return 'minor';
    }
    // Default to patch if no major or minor updates found
    return 'patch';
  }

  /**
   * Generates a commit message for file updates
   *
   * Uses conventional commit format with the configured prefix.
   * Supports different prefixes based on update type:
   * - Major updates: Uses configured prefix with breaking change indicator (!)
   * - Minor updates: Uses configured prefix (default: chore)
   * - Patch updates: Uses configured prefix (default: chore)
   *
   * Format examples:
   * - Patch: "chore(deps): update nginx chart to 15.9.1"
   * - Minor: "chore(deps): update nginx chart to 15.10.0"
   * - Major: "chore(deps)!: update nginx chart to 16.0.0"
   *
   * Requirements: Additional Feature 1
   *
   * @param fileUpdates - List of file updates
   * @returns Formatted commit message
   * @private
   */
  private generateCommitMessage(fileUpdates: FileUpdate[]): string {
    const prefix = this.config.commitMessage.prefix;
    const includeScope = this.config.commitMessage.includeScope;

    // Collect all chart updates
    const allUpdates = fileUpdates.flatMap((file) => file.updates);

    if (allUpdates.length === 0) {
      return `${prefix}: update Helm charts`;
    }

    if (allUpdates.length === 1) {
      const update = allUpdates[0];
      const updateType = this.getUpdateType(update.currentVersion, update.newVersion);
      const scope = includeScope ? '(deps)' : '';
      const breakingChange = updateType === 'major' ? '!' : '';

      return `${prefix}${scope}${breakingChange}: update ${update.dependency.chartName} to ${update.newVersion}`;
    }

    // Multiple updates - use highest update type
    const highestUpdateType = this.getHighestUpdateType(allUpdates);
    const scope = includeScope ? '(deps)' : '';
    const breakingChange = highestUpdateType === 'major' ? '!' : '';

    return `${prefix}${scope}${breakingChange}: update ${allUpdates.length} Helm charts`;
  }

  /**
   * Groups file updates according to the configured PR strategy
   *
   * Strategies:
   * - 'single': All updates in one group (one PR for everything)
   * - 'per-chart': Group by chart name (one PR per chart across all manifests)
   * - 'per-manifest': Group by manifest file (one PR per manifest file)
   *
   * Requirements: 6.7
   *
   * @param fileUpdates - List of file updates to group
   * @returns Array of grouped file updates
   */
  groupUpdatesByStrategy(fileUpdates: FileUpdate[]): FileUpdate[][] {
    const strategy = this.config.prStrategy;

    if (strategy === 'single') {
      // All updates in a single group
      return fileUpdates.length > 0 ? [fileUpdates] : [];
    }

    if (strategy === 'per-manifest') {
      // Each file update is its own group
      return fileUpdates.map((fileUpdate) => [fileUpdate]);
    }

    if (strategy === 'per-chart') {
      // Group by chart name across all files
      const chartGroups = new Map<string, FileUpdate[]>();

      for (const fileUpdate of fileUpdates) {
        for (const update of fileUpdate.updates) {
          const chartName = update.dependency.chartName;

          if (!chartGroups.has(chartName)) {
            chartGroups.set(chartName, []);
          }

          // Check if this file is already in the group for this chart
          const group = chartGroups.get(chartName)!;
          const existingFile = group.find((f) => f.path === fileUpdate.path);

          if (existingFile) {
            // Add this update to the existing file entry
            existingFile.updates.push(update);
          } else {
            // Create a new file entry with just this update
            group.push({
              path: fileUpdate.path,
              originalContent: fileUpdate.originalContent,
              updatedContent: fileUpdate.updatedContent,
              updates: [update],
            });
          }
        }
      }

      return Array.from(chartGroups.values());
    }

    // Default fallback (should never reach here due to validation)
    return fileUpdates.length > 0 ? [fileUpdates] : [];
  }

  /**
   * Generates a PR title based on the file updates
   *
   * @param fileUpdates - List of file updates
   * @returns PR title string
   */
  generatePRTitle(fileUpdates: FileUpdate[]): string {
    const allUpdates = fileUpdates.flatMap((file) => file.updates);

    if (allUpdates.length === 0) {
      return 'Update Helm charts';
    }

    if (allUpdates.length === 1) {
      const update = allUpdates[0];
      return `Update ${update.dependency.chartName} to ${update.newVersion}`;
    }

    // Check if all updates are for the same chart
    const uniqueCharts = new Set(allUpdates.map((u) => u.dependency.chartName));
    if (uniqueCharts.size === 1) {
      const chartName = Array.from(uniqueCharts)[0];
      return `Update ${chartName} across multiple manifests`;
    }

    // Multiple different charts
    return `Update ${allUpdates.length} Helm charts`;
  }

  /**
   * Checks if the open pull request limit has been reached
   *
   * Counts the number of open PRs created by this action (identified by branch prefix)
   * and compares against the configured limit.
   *
   * Requirements: Additional Feature 6
   *
   * @returns true if a new PR can be created, false if limit reached
   * @private
   */
  private async checkOpenPRLimit(): Promise<boolean> {
    try {
      // Get all open PRs
      const { data: pulls } = await this.octokit.rest.pulls.list({
        owner: this.owner,
        repo: this.repo,
        state: 'open',
        per_page: 100, // Get up to 100 PRs (should be enough for most cases)
      });

      // Filter PRs created by this action (by branch prefix)
      const actionPRs = pulls.filter((pr) =>
        pr.head.ref.startsWith(this.config.branchPrefix)
      );

      const openCount = actionPRs.length;
      const limit = this.config.openPullRequestsLimit;

      this.logger.debug(
        `Open PRs created by action: ${openCount}/${limit}`
      );

      return openCount < limit;
    } catch (error) {
      this.logger.warn(
        `Failed to check open PR limit: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // On error, allow PR creation (fail open)
      return true;
    }
  }

  /**
   * Logs information about skipped updates
   *
   * Requirements: Additional Feature 6
   *
   * @param fileUpdates - List of file updates that were skipped
   * @private
   */
  private logSkippedUpdates(fileUpdates: FileUpdate[]): void {
    const allUpdates = fileUpdates.flatMap((file) => file.updates);

    this.logger.info(`Skipped ${allUpdates.length} update(s):`);

    for (const update of allUpdates) {
      this.logger.info(
        `  - ${update.dependency.chartName}: ${update.currentVersion} → ${update.newVersion}`
      );
    }

    this.logger.info(
      'To create PRs for these updates, close some existing PRs or increase the open-pull-requests-limit'
    );
  }

  /**
   * Rebases a PR branch if it's behind the base branch
   *
   * Checks if the PR branch is behind the base branch and updates it
   * using GitHub's update branch API.
   *
   * Requirements: Additional Feature 7
   *
   * @param prNumber - PR number to check and rebase
   * @private
   */
  private async rebasePRIfNeeded(prNumber: number): Promise<void> {
    try {
      // Get PR details
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
      });

      // Check if branch is behind base
      if (pr.mergeable_state === 'behind' || pr.mergeable_state === 'dirty') {
        this.logger.info(
          `PR #${prNumber} branch is behind base, updating branch...`
        );

        // Update the branch using GitHub's update branch API
        await this.octokit.rest.pulls.updateBranch({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
        });

        this.logger.info(`Successfully updated branch for PR #${prNumber}`);
      } else {
        this.logger.debug(
          `PR #${prNumber} branch is up to date (mergeable_state: ${pr.mergeable_state})`
        );
      }
    } catch (error) {
      // Log warning but don't fail - rebase is a nice-to-have
      this.logger.warn(
        `Failed to rebase PR #${prNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
