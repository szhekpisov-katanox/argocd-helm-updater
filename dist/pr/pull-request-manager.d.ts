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
import { ActionConfig } from '../types/config';
import { FileUpdate } from '../types/file-update';
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
export declare class PullRequestManager {
    private octokit;
    private config;
    private owner;
    private repo;
    private logger;
    /**
     * Creates a new PullRequestManager instance
     *
     * @param octokit - Authenticated Octokit client
     * @param config - Action configuration
     */
    constructor(octokit: ReturnType<typeof github.getOctokit>, config: ActionConfig);
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
    createOrUpdatePR(fileUpdates: FileUpdate[], prOptions: PROptions): Promise<number | null>;
    /**
     * Creates a new branch from the base branch
     *
     * @param branchName - Name of the branch to create
     * @throws Error if branch creation fails
     */
    createBranch(branchName: string): Promise<void>;
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
    commitChanges(branch: string, fileUpdates: FileUpdate[]): Promise<void>;
    /**
     * Finds an existing pull request for a branch
     *
     * @param branch - Branch name to search for
     * @returns PR number if found, null otherwise
     */
    findExistingPR(branch: string): Promise<number | null>;
    /**
     * Creates a new pull request
     *
     * @param options - PR options (title, body, branch, labels, assignees, reviewers)
     * @param fileUpdates - List of file updates for auto-merge eligibility check
     * @returns PR number
     * @throws Error if PR creation fails
     */
    createPR(options: PROptions, fileUpdates?: FileUpdate[]): Promise<number>;
    /**
     * Updates an existing pull request
     *
     * @param prNumber - PR number to update
     * @param options - PR options (title, body, labels, assignees, reviewers)
     * @param fileUpdates - List of file updates for auto-merge eligibility check
     * @throws Error if PR update fails
     */
    updatePR(prNumber: number, options: PROptions, fileUpdates?: FileUpdate[]): Promise<void>;
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
    private applyAutoMergeIfEligible;
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
    generateBranchName(fileUpdates: FileUpdate[]): string;
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
    generatePRBody(fileUpdates: FileUpdate[]): string;
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
    private formatRepoName;
    /**
     * Determines the update type (major, minor, patch) for a version change
     *
     * @param currentVersion - Current version string
     * @param newVersion - New version string
     * @returns Update type or null if versions are invalid
     * @private
     */
    private getUpdateType;
    /**
     * Determines the highest update type from a list of updates
     *
     * Priority: major > minor > patch
     *
     * @param updates - List of version updates
     * @returns Highest update type
     * @private
     */
    private getHighestUpdateType;
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
    private generateCommitMessage;
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
    groupUpdatesByStrategy(fileUpdates: FileUpdate[]): FileUpdate[][];
    /**
     * Generates a PR title based on the file updates
     *
     * @param fileUpdates - List of file updates
     * @returns PR title string
     */
    generatePRTitle(fileUpdates: FileUpdate[]): string;
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
    private checkOpenPRLimit;
    /**
     * Logs information about skipped updates
     *
     * Requirements: Additional Feature 6
     *
     * @param fileUpdates - List of file updates that were skipped
     * @private
     */
    private logSkippedUpdates;
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
    private rebasePRIfNeeded;
}
//# sourceMappingURL=pull-request-manager.d.ts.map