/**
 * Configuration Manager for ArgoCD Helm Updater
 * 
 * Loads and validates action configuration from:
 * 1. GitHub Action inputs (via @actions/core)
 * 2. External configuration file (.argocd-updater.yml)
 * 
 * Provides sensible defaults for all options.
 */

import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  ActionConfig,
  ExternalConfig,
  ValidationResult,
} from '../types/config';

/**
 * Default configuration values
 */
const DEFAULTS: Omit<ActionConfig, 'githubToken'> = {
  includePaths: ['**/*.yaml', '**/*.yml'],
  excludePaths: ['node_modules/**', 'dist/**', '.git/**'],
  updateStrategy: 'all',
  registryCredentials: [],
  prStrategy: 'single',
  prLabels: ['dependencies', 'argocd', 'helm'],
  prAssignees: [],
  prReviewers: [],
  branchPrefix: 'argocd-helm-update',
  commitMessage: {
    prefix: 'chore',
    includeScope: true,
  },
  groups: {},
  ignore: [],
  autoMerge: {
    enabled: false,
    updateTypes: ['patch'],
    requireCIPass: true,
    requireApprovals: 0,
  },
  openPullRequestsLimit: 10,
  rebaseStrategy: 'auto',
  dryRun: false,
  logLevel: 'info',
};

/**
 * Configuration Manager class
 */
export class ConfigurationManager {
  /**
   * Load configuration from action inputs and optional external file
   * 
   * @returns Loaded and validated configuration
   * @throws Error if configuration is invalid
   */
  static load(): ActionConfig {
    // Start with defaults
    let config: ActionConfig = {
      ...DEFAULTS,
      githubToken: '', // Will be set from input
    };

    // Load external config file if specified
    const configFile = core.getInput('config-file');
    if (configFile) {
      const externalConfig = this.loadExternalConfig(configFile);
      config = this.mergeExternalConfig(config, externalConfig);
    }

    // Override with action inputs (inputs take precedence over file)
    config = this.loadFromInputs(config);

    // Validate the final configuration
    const validation = this.validate(config);
    if (!validation.valid) {
      throw new Error(
        `Configuration validation failed:\n${validation.errors.join('\n')}`
      );
    }

    return config;
  }

  /**
   * Load configuration from external YAML file
   * 
   * @param filePath Path to the configuration file
   * @returns Parsed external configuration
   */
  private static loadExternalConfig(filePath: string): ExternalConfig {
    try {
      const absolutePath = path.resolve(process.cwd(), filePath);
      
      if (!fs.existsSync(absolutePath)) {
        core.warning(`Configuration file not found: ${filePath}`);
        return {};
      }

      const fileContent = fs.readFileSync(absolutePath, 'utf8');
      const parsed = yaml.load(fileContent) as ExternalConfig;
      
      core.info(`Loaded configuration from ${filePath}`);
      return parsed || {};
    } catch (error) {
      core.warning(
        `Failed to load configuration file ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return {};
    }
  }

  /**
   * Merge external configuration with current config
   * 
   * @param config Current configuration
   * @param external External configuration from file
   * @returns Merged configuration
   */
  private static mergeExternalConfig(
    config: ActionConfig,
    external: ExternalConfig
  ): ActionConfig {
    const merged = { ...config };

    // File scanning
    if (external['include-paths']) {
      merged.includePaths = this.parseStringOrArray(external['include-paths']);
    }
    if (external['exclude-paths']) {
      merged.excludePaths = this.parseStringOrArray(external['exclude-paths']);
    }

    // Update strategy
    if (external['update-strategy']) {
      merged.updateStrategy = external['update-strategy'];
    }

    // Registry credentials
    if (external['registry-credentials']) {
      merged.registryCredentials = external['registry-credentials'];
    }

    // PR options
    if (external['pr-strategy']) {
      merged.prStrategy = external['pr-strategy'];
    }
    if (external['pr-labels']) {
      merged.prLabels = this.parseStringOrArray(external['pr-labels']);
    }
    if (external['pr-assignees']) {
      merged.prAssignees = this.parseStringOrArray(external['pr-assignees']);
    }
    if (external['pr-reviewers']) {
      merged.prReviewers = this.parseStringOrArray(external['pr-reviewers']);
    }
    if (external['branch-prefix']) {
      merged.branchPrefix = external['branch-prefix'];
    }

    // Commit message
    if (external['commit-message']) {
      merged.commitMessage = {
        prefix: external['commit-message'].prefix || merged.commitMessage.prefix,
        prefixDevelopment: external['commit-message']['prefix-development'],
        includeScope:
          external['commit-message']['include-scope'] !== undefined
            ? external['commit-message']['include-scope']
            : merged.commitMessage.includeScope,
      };
    }

    // Groups
    if (external.groups) {
      merged.groups = external.groups;
    }

    // Ignore rules
    if (external.ignore) {
      merged.ignore = external.ignore;
    }

    // Auto-merge
    if (external['auto-merge']) {
      merged.autoMerge = {
        enabled: external['auto-merge'].enabled ?? merged.autoMerge.enabled,
        updateTypes: external['auto-merge']['update-types']
          ? this.parseUpdateTypes(external['auto-merge']['update-types'])
          : merged.autoMerge.updateTypes,
        requireCIPass:
          external['auto-merge']['require-ci-pass'] ?? merged.autoMerge.requireCIPass,
        requireApprovals:
          external['auto-merge']['require-approvals'] ?? merged.autoMerge.requireApprovals,
      };
    }

    // Limits
    if (external['open-pull-requests-limit'] !== undefined) {
      merged.openPullRequestsLimit = external['open-pull-requests-limit'];
    }

    // Rebase strategy
    if (external['rebase-strategy']) {
      merged.rebaseStrategy = external['rebase-strategy'];
    }

    // Behavior
    if (external['dry-run'] !== undefined) {
      merged.dryRun = external['dry-run'];
    }
    if (external['log-level']) {
      merged.logLevel = external['log-level'];
    }

    return merged;
  }

  /**
   * Load configuration from GitHub Action inputs
   * 
   * @param config Current configuration (with defaults and external config)
   * @returns Configuration with action inputs applied
   */
  private static loadFromInputs(config: ActionConfig): ActionConfig {
    const result = { ...config };

    // File scanning
    const includePaths = core.getInput('include-paths');
    if (includePaths) {
      result.includePaths = this.parseCommaSeparated(includePaths);
    }

    const excludePaths = core.getInput('exclude-paths');
    if (excludePaths) {
      result.excludePaths = this.parseCommaSeparated(excludePaths);
    }

    // Update strategy
    const updateStrategy = core.getInput('update-strategy');
    if (updateStrategy) {
      result.updateStrategy = updateStrategy as ActionConfig['updateStrategy'];
    }

    // Registry credentials
    const registryCredentials = core.getInput('registry-credentials');
    if (registryCredentials) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        result.registryCredentials = JSON.parse(registryCredentials);
      } catch (error) {
        core.warning(
          `Failed to parse registry-credentials: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // PR options
    const prStrategy = core.getInput('pr-strategy');
    if (prStrategy) {
      result.prStrategy = prStrategy as ActionConfig['prStrategy'];
    }

    const prLabels = core.getInput('pr-labels');
    if (prLabels) {
      result.prLabels = this.parseCommaSeparated(prLabels);
    }

    const prAssignees = core.getInput('pr-assignees');
    if (prAssignees) {
      result.prAssignees = this.parseCommaSeparated(prAssignees);
    }

    const prReviewers = core.getInput('pr-reviewers');
    if (prReviewers) {
      result.prReviewers = this.parseCommaSeparated(prReviewers);
    }

    const branchPrefix = core.getInput('branch-prefix');
    if (branchPrefix) {
      result.branchPrefix = branchPrefix;
    }

    // Commit message
    const commitMessagePrefix = core.getInput('commit-message-prefix');
    if (commitMessagePrefix) {
      result.commitMessage.prefix = commitMessagePrefix;
    }

    const commitMessageIncludeScope = core.getInput('commit-message-include-scope');
    if (commitMessageIncludeScope) {
      result.commitMessage.includeScope = commitMessageIncludeScope === 'true';
    }

    // Groups
    const groups = core.getInput('groups');
    if (groups) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        result.groups = JSON.parse(groups);
      } catch (error) {
        core.warning(
          `Failed to parse groups: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Ignore rules
    const ignore = core.getInput('ignore');
    if (ignore) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        result.ignore = JSON.parse(ignore);
      } catch (error) {
        core.warning(
          `Failed to parse ignore rules: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Auto-merge
    const autoMergeEnabled = core.getInput('auto-merge-enabled');
    if (autoMergeEnabled) {
      result.autoMerge.enabled = autoMergeEnabled === 'true';
    }

    const autoMergeUpdateTypes = core.getInput('auto-merge-update-types');
    if (autoMergeUpdateTypes) {
      result.autoMerge.updateTypes = this.parseUpdateTypes(autoMergeUpdateTypes);
    }

    const autoMergeRequireCIPass = core.getInput('auto-merge-require-ci-pass');
    if (autoMergeRequireCIPass) {
      result.autoMerge.requireCIPass = autoMergeRequireCIPass === 'true';
    }

    const autoMergeRequireApprovals = core.getInput('auto-merge-require-approvals');
    if (autoMergeRequireApprovals) {
      result.autoMerge.requireApprovals = parseInt(autoMergeRequireApprovals, 10);
    }

    // Limits
    const openPullRequestsLimit = core.getInput('open-pull-requests-limit');
    if (openPullRequestsLimit) {
      result.openPullRequestsLimit = parseInt(openPullRequestsLimit, 10);
    }

    // Rebase strategy
    const rebaseStrategy = core.getInput('rebase-strategy');
    if (rebaseStrategy) {
      result.rebaseStrategy = rebaseStrategy as ActionConfig['rebaseStrategy'];
    }

    // Behavior
    const dryRun = core.getInput('dry-run');
    if (dryRun) {
      result.dryRun = dryRun === 'true';
    }

    const logLevel = core.getInput('log-level');
    if (logLevel) {
      result.logLevel = logLevel as ActionConfig['logLevel'];
    }

    // GitHub token (required)
    result.githubToken = core.getInput('github-token', { required: true });

    return result;
  }

  /**
   * Validate configuration
   * 
   * @param config Configuration to validate
   * @returns Validation result with any errors
   */
  static validate(config: ActionConfig): ValidationResult {
    const errors: string[] = [];

    // Validate update strategy
    const validUpdateStrategies = ['major', 'minor', 'patch', 'all'];
    if (!validUpdateStrategies.includes(config.updateStrategy)) {
      errors.push(
        `Invalid update-strategy: ${config.updateStrategy}. Must be one of: ${validUpdateStrategies.join(', ')}`
      );
    }

    // Validate PR strategy
    const validPRStrategies = ['single', 'per-chart', 'per-manifest'];
    if (!validPRStrategies.includes(config.prStrategy)) {
      errors.push(
        `Invalid pr-strategy: ${config.prStrategy}. Must be one of: ${validPRStrategies.join(', ')}`
      );
    }

    // Validate log level
    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLogLevels.includes(config.logLevel)) {
      errors.push(
        `Invalid log-level: ${config.logLevel}. Must be one of: ${validLogLevels.join(', ')}`
      );
    }

    // Validate rebase strategy
    const validRebaseStrategies = ['auto', 'disabled'];
    if (!validRebaseStrategies.includes(config.rebaseStrategy)) {
      errors.push(
        `Invalid rebase-strategy: ${config.rebaseStrategy}. Must be one of: ${validRebaseStrategies.join(', ')}`
      );
    }

    // Validate include paths (must not be empty)
    if (!config.includePaths || config.includePaths.length === 0) {
      errors.push('include-paths must not be empty');
    }

    // Validate glob patterns
    for (const pattern of config.includePaths) {
      if (!pattern || pattern.trim() === '') {
        errors.push(`Invalid include pattern: empty string`);
      } else if (pattern.includes('\\')) {
        errors.push(
          `Invalid include pattern "${pattern}": use forward slashes (/) instead of backslashes (\\)`
        );
      } else if (pattern.startsWith('/')) {
        errors.push(
          `Invalid include pattern "${pattern}": patterns should be relative, not absolute paths`
        );
      }
    }

    for (const pattern of config.excludePaths) {
      if (!pattern || pattern.trim() === '') {
        errors.push(`Invalid exclude pattern: empty string`);
      } else if (pattern.includes('\\')) {
        errors.push(
          `Invalid exclude pattern "${pattern}": use forward slashes (/) instead of backslashes (\\)`
        );
      } else if (pattern.startsWith('/')) {
        errors.push(
          `Invalid exclude pattern "${pattern}": patterns should be relative, not absolute paths`
        );
      }
    }

    // Validate registry credentials
    for (const cred of config.registryCredentials) {
      if (!cred.registry || !cred.username || !cred.password) {
        errors.push(
          'Registry credentials must include registry, username, and password'
        );
      } else {
        // Validate registry URL format
        try {
          new URL(cred.registry);
        } catch {
          // If not a valid URL, check if it's a valid hostname pattern
          if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(cred.registry)) {
            errors.push(
              `Invalid registry URL or hostname: ${cred.registry}`
            );
          }
        }
      }
    }

    // Validate auto-merge update types
    const validUpdateTypes = ['major', 'minor', 'patch'];
    for (const updateType of config.autoMerge.updateTypes) {
      if (!validUpdateTypes.includes(updateType)) {
        errors.push(
          `Invalid auto-merge update type: ${updateType}. Must be one of: ${validUpdateTypes.join(', ')}`
        );
      }
    }

    // Validate open pull requests limit
    if (config.openPullRequestsLimit < 0) {
      errors.push('open-pull-requests-limit must be a non-negative number');
    }

    // Validate auto-merge require approvals
    if (config.autoMerge.requireApprovals < 0) {
      errors.push('auto-merge-require-approvals must be a non-negative number');
    }

    // Validate GitHub token
    if (!config.githubToken) {
      errors.push('github-token is required');
    }

    // Validate PR labels (GitHub label names have restrictions)
    for (const label of config.prLabels) {
      if (!label || label.trim() === '') {
        errors.push('PR labels must not be empty strings');
      } else if (label.length > 50) {
        errors.push(`PR label "${label}" exceeds maximum length of 50 characters`);
      }
    }

    // Validate PR assignees and reviewers (GitHub usernames)
    for (const assignee of config.prAssignees) {
      if (!assignee || assignee.trim() === '') {
        errors.push('PR assignees must not be empty strings');
      } else if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(assignee)) {
        errors.push(
          `Invalid PR assignee "${assignee}": must be a valid GitHub username (alphanumeric and hyphens only, cannot start or end with hyphen)`
        );
      }
    }

    for (const reviewer of config.prReviewers) {
      if (!reviewer || reviewer.trim() === '') {
        errors.push('PR reviewers must not be empty strings');
      } else if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(reviewer)) {
        errors.push(
          `Invalid PR reviewer "${reviewer}": must be a valid GitHub username (alphanumeric and hyphens only, cannot start or end with hyphen)`
        );
      }
    }

    // Validate branch prefix (no spaces or special characters that are invalid in git branch names)
    if (config.branchPrefix) {
      if (/[\s~^:?*\[\\]/.test(config.branchPrefix)) {
        errors.push(
          `Invalid branch-prefix "${config.branchPrefix}": cannot contain spaces or special characters (~^:?*[\\)`
        );
      }
      if (config.branchPrefix.endsWith('.') || config.branchPrefix.endsWith('.lock')) {
        errors.push(
          `Invalid branch-prefix "${config.branchPrefix}": cannot end with "." or ".lock"`
        );
      }
    }

    // Validate commit message prefix (should be a valid conventional commit type)
    const validCommitPrefixes = [
      'feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'
    ];
    if (config.commitMessage.prefix && !validCommitPrefixes.includes(config.commitMessage.prefix)) {
      errors.push(
        `Invalid commit-message-prefix "${config.commitMessage.prefix}". Recommended values: ${validCommitPrefixes.join(', ')}`
      );
    }

    // Validate ignore rules
    for (const rule of config.ignore) {
      if (!rule.dependencyName) {
        errors.push('Ignore rule must include dependencyName');
      }
      if (rule.updateTypes) {
        for (const updateType of rule.updateTypes) {
          if (!validUpdateTypes.includes(updateType)) {
            errors.push(
              `Invalid ignore rule update type: ${updateType}. Must be one of: ${validUpdateTypes.join(', ')}`
            );
          }
        }
      }
      // Validate version patterns if provided
      if (rule.versions) {
        for (const version of rule.versions) {
          if (!version || version.trim() === '') {
            errors.push('Ignore rule version patterns must not be empty strings');
          }
        }
      }
    }

    // Validate dependency groups
    for (const [groupName, group] of Object.entries(config.groups)) {
      if (!group.patterns || group.patterns.length === 0) {
        errors.push(`Dependency group "${groupName}" must have at least one pattern`);
      } else {
        // Validate each pattern is not empty
        for (const pattern of group.patterns) {
          if (!pattern || pattern.trim() === '') {
            errors.push(`Dependency group "${groupName}" contains empty pattern`);
          }
        }
      }
      // Validate group name (no spaces or special characters)
      if (!/^[a-zA-Z0-9-_]+$/.test(groupName)) {
        errors.push(
          `Invalid group name "${groupName}": must contain only alphanumeric characters, hyphens, and underscores`
        );
      }
      if (group.updateTypes) {
        for (const updateType of group.updateTypes) {
          if (!validUpdateTypes.includes(updateType)) {
            errors.push(
              `Invalid group update type in "${groupName}": ${updateType}. Must be one of: ${validUpdateTypes.join(', ')}`
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Parse comma-separated string into array
   * 
   * @param value Comma-separated string
   * @returns Array of trimmed strings
   */
  private static parseCommaSeparated(value: string): string[] {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Parse string or array into array
   * 
   * @param value String or array
   * @returns Array of strings
   */
  private static parseStringOrArray(value: string | string[]): string[] {
    if (Array.isArray(value)) {
      return value;
    }
    return this.parseCommaSeparated(value);
  }

  /**
   * Parse update types from string or array
   * 
   * @param value String or array of update types
   * @returns Array of update types
   */
  private static parseUpdateTypes(
    value: string | string[]
  ): ('major' | 'minor' | 'patch')[] {
    const parsed = this.parseStringOrArray(value);
    return parsed.filter((t) =>
      ['major', 'minor', 'patch'].includes(t)
    ) as ('major' | 'minor' | 'patch')[];
  }
}
