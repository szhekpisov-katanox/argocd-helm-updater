/**
 * Configuration types for the ArgoCD Helm Updater action
 */

/**
 * Registry credential for authenticating with Helm repositories or OCI registries
 */
export interface RegistryCredential {
  /** Registry URL or pattern to match */
  registry: string;
  /** Authentication type: 'basic' for HTTP Basic Auth, 'bearer' for Bearer token */
  authType?: 'basic' | 'bearer';
  /** Username for authentication (required for 'basic' auth) */
  username?: string;
  /** Password or token for authentication */
  password: string;
}

/**
 * Commit message configuration
 */
export interface CommitMessageConfig {
  /** Prefix for commit messages (e.g., 'chore', 'fix', 'feat') */
  prefix: string;
  /** Prefix for development dependencies (if applicable) */
  prefixDevelopment?: string;
  /** Whether to include scope in commit messages */
  includeScope: boolean;
}

/**
 * Dependency group configuration for batching updates
 */
export interface DependencyGroup {
  /** Glob patterns to match dependency names */
  patterns: string[];
  /** Update types to include in this group */
  updateTypes?: ('major' | 'minor' | 'patch')[];
}

/**
 * Ignore rule for excluding specific dependencies or versions
 */
export interface IgnoreRule {
  /** Name of the dependency to ignore */
  dependencyName: string;
  /** Specific versions or version patterns to ignore */
  versions?: string[];
  /** Update types to ignore (e.g., only ignore major updates) */
  updateTypes?: ('major' | 'minor' | 'patch')[];
}

/**
 * Auto-merge configuration
 */
export interface AutoMergeConfig {
  /** Whether auto-merge is enabled */
  enabled: boolean;
  /** Update types eligible for auto-merge */
  updateTypes: ('major' | 'minor' | 'patch')[];
  /** Whether CI must pass before auto-merge */
  requireCIPass: boolean;
  /** Number of approvals required before auto-merge */
  requireApprovals: number;
}

/**
 * Main action configuration
 */
export interface ActionConfig {
  // File scanning
  /** Glob patterns for files to scan */
  includePaths: string[];
  /** Glob patterns for files to exclude */
  excludePaths: string[];

  // Update strategy
  /** Update strategy: major, minor, patch, or all */
  updateStrategy: 'major' | 'minor' | 'patch' | 'all';

  // Helm repository authentication
  /** Registry credentials for private repositories */
  registryCredentials: RegistryCredential[];

  // PR options
  /** PR creation strategy: single, per-chart, or per-manifest */
  prStrategy: 'single' | 'per-chart' | 'per-manifest';
  /** Labels to apply to pull requests */
  prLabels: string[];
  /** GitHub usernames to assign to pull requests */
  prAssignees: string[];
  /** GitHub usernames to request reviews from */
  prReviewers: string[];
  /** Prefix for created branches */
  branchPrefix: string;

  // Commit message configuration
  /** Commit message configuration */
  commitMessage: CommitMessageConfig;

  // Grouping configuration
  /** Dependency groups for batching updates */
  groups: { [groupName: string]: DependencyGroup };

  // Ignore rules
  /** Rules for ignoring specific dependencies or versions */
  ignore: IgnoreRule[];

  // Auto-merge configuration
  /** Auto-merge configuration */
  autoMerge: AutoMergeConfig;

  // Limits
  /** Maximum number of open pull requests to create */
  openPullRequestsLimit: number;

  // Rebase strategy
  /** Rebase strategy: auto or disabled */
  rebaseStrategy: 'auto' | 'disabled';

  // Behavior
  /** Run in dry-run mode (detect updates but do not create PRs) */
  dryRun: boolean;
  /** Log level: debug, info, warn, or error */
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // GitHub token
  /** GitHub token for API access */
  githubToken: string;
}

/**
 * External configuration file structure (.argocd-updater.yml)
 */
export interface ExternalConfig {
  'include-paths'?: string | string[];
  'exclude-paths'?: string | string[];
  'update-strategy'?: 'major' | 'minor' | 'patch' | 'all';
  'registry-credentials'?: RegistryCredential[];
  'pr-strategy'?: 'single' | 'per-chart' | 'per-manifest';
  'pr-labels'?: string | string[];
  'pr-assignees'?: string | string[];
  'pr-reviewers'?: string | string[];
  'branch-prefix'?: string;
  'commit-message'?: {
    prefix?: string;
    'prefix-development'?: string;
    'include-scope'?: boolean;
  };
  groups?: { [groupName: string]: DependencyGroup };
  ignore?: IgnoreRule[];
  'auto-merge'?: {
    enabled?: boolean;
    'update-types'?: string | string[];
    'require-ci-pass'?: boolean;
    'require-approvals'?: number;
  };
  'open-pull-requests-limit'?: number;
  'rebase-strategy'?: 'auto' | 'disabled';
  'dry-run'?: boolean;
  'log-level'?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** Error messages if validation failed */
  errors: string[];
}
