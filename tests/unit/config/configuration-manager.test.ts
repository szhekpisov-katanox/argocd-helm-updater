/**
 * Unit tests for ConfigurationManager
 */

// Mock fs before any imports
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
  };
});

import * as core from '@actions/core';
import * as fs from 'fs';
import { ConfigurationManager } from '../../../src/config/configuration-manager';
import { ActionConfig } from '../../../src/types/config';

// Mock @actions/core
jest.mock('@actions/core');
const mockCore = core as jest.Mocked<typeof core>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConfigurationManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockCore.getInput.mockImplementation((name: string) => {
      if (name === 'github-token') {
        return 'test-token';
      }
      return '';
    });
    
    mockCore.info.mockImplementation(() => {});
    mockCore.warning.mockImplementation(() => {});
  });

  describe('load', () => {
    it('should load configuration with defaults when no inputs provided', () => {
      const config = ConfigurationManager.load();

      expect(config.includePaths).toEqual(['**/*.yaml', '**/*.yml']);
      expect(config.excludePaths).toEqual(['node_modules/**', 'dist/**', '.git/**']);
      expect(config.updateStrategy).toBe('all');
      expect(config.prStrategy).toBe('single');
      expect(config.prLabels).toEqual(['dependencies', 'argocd', 'helm']);
      expect(config.branchPrefix).toBe('argocd-helm-update');
      expect(config.dryRun).toBe(false);
      expect(config.logLevel).toBe('info');
      expect(config.githubToken).toBe('test-token');
    });

    it('should override defaults with action inputs', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'github-token': 'test-token',
          'include-paths': '*.yaml,apps/**/*.yml',
          'update-strategy': 'minor',
          'pr-strategy': 'per-chart',
          'pr-labels': 'helm,updates',
          'branch-prefix': 'helm-update',
          'dry-run': 'true',
          'log-level': 'debug',
        };
        return inputs[name] || '';
      });

      const config = ConfigurationManager.load();

      expect(config.includePaths).toEqual(['*.yaml', 'apps/**/*.yml']);
      expect(config.updateStrategy).toBe('minor');
      expect(config.prStrategy).toBe('per-chart');
      expect(config.prLabels).toEqual(['helm', 'updates']);
      expect(config.branchPrefix).toBe('helm-update');
      expect(config.dryRun).toBe(true);
      expect(config.logLevel).toBe('debug');
    });

    it('should parse JSON inputs correctly', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'github-token': 'test-token',
          'registry-credentials': JSON.stringify([
            {
              registry: 'https://registry.example.com',
              username: 'user',
              password: 'pass',
            },
          ]),
          groups: JSON.stringify({
            'production-charts': {
              patterns: ['bitnami/*', 'stable/*'],
              updateTypes: ['minor', 'patch'],
            },
          }),
          ignore: JSON.stringify([
            {
              dependencyName: 'nginx',
              versions: ['16.x'],
            },
          ]),
        };
        return inputs[name] || '';
      });

      const config = ConfigurationManager.load();

      expect(config.registryCredentials).toHaveLength(1);
      expect(config.registryCredentials[0].registry).toBe(
        'https://registry.example.com'
      );
      expect(config.groups['production-charts']).toBeDefined();
      expect(config.groups['production-charts'].patterns).toEqual([
        'bitnami/*',
        'stable/*',
      ]);
      expect(config.ignore).toHaveLength(1);
      expect(config.ignore[0].dependencyName).toBe('nginx');
    });

    it('should handle invalid JSON gracefully', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'github-token': 'test-token',
          'registry-credentials': 'invalid-json',
          groups: '{invalid}',
        };
        return inputs[name] || '';
      });

      const config = ConfigurationManager.load();

      // Should use defaults when JSON parsing fails
      expect(config.registryCredentials).toEqual([]);
      expect(config.groups).toEqual({});
      expect(mockCore.warning).toHaveBeenCalled();
    });

    it('should load external configuration file when specified', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'config-file') {
          return '.argocd-updater.yml';
        }
        if (name === 'github-token') {
          return 'test-token';
        }
        return '';
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        `include-paths:
  - custom/**/*.yaml
update-strategy: patch
pr-labels:
  - custom-label`
      );

      const config = ConfigurationManager.load();

      expect(config.includePaths).toEqual(['custom/**/*.yaml']);
      expect(config.updateStrategy).toBe('patch');
      expect(config.prLabels).toEqual(['custom-label']);
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('Loaded configuration from')
      );
    });

    it('should handle missing external configuration file gracefully', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'config-file') {
          return '.argocd-updater.yml';
        }
        if (name === 'github-token') {
          return 'test-token';
        }
        return '';
      });

      mockFs.existsSync.mockReturnValue(false);

      const config = ConfigurationManager.load();

      // Should use defaults when file doesn't exist
      expect(config.includePaths).toEqual(['**/*.yaml', '**/*.yml']);
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Configuration file not found')
      );
    });

    it('should prioritize action inputs over external config', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'config-file': '.argocd-updater.yml',
          'github-token': 'test-token',
          'update-strategy': 'major', // This should override file config
        };
        return inputs[name] || '';
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('update-strategy: patch');

      const config = ConfigurationManager.load();

      // Action input should take precedence
      expect(config.updateStrategy).toBe('major');
    });

    it('should parse commit message configuration', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'github-token': 'test-token',
          'commit-message-prefix': 'feat',
          'commit-message-include-scope': 'false',
        };
        return inputs[name] || '';
      });

      const config = ConfigurationManager.load();

      expect(config.commitMessage.prefix).toBe('feat');
      expect(config.commitMessage.includeScope).toBe(false);
    });

    it('should parse auto-merge configuration', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'github-token': 'test-token',
          'auto-merge-enabled': 'true',
          'auto-merge-update-types': 'minor,patch',
          'auto-merge-require-ci-pass': 'false',
          'auto-merge-require-approvals': '2',
        };
        return inputs[name] || '';
      });

      const config = ConfigurationManager.load();

      expect(config.autoMerge.enabled).toBe(true);
      expect(config.autoMerge.updateTypes).toEqual(['minor', 'patch']);
      expect(config.autoMerge.requireCIPass).toBe(false);
      expect(config.autoMerge.requireApprovals).toBe(2);
    });

    it('should parse numeric configuration values', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'github-token': 'test-token',
          'open-pull-requests-limit': '5',
        };
        return inputs[name] || '';
      });

      const config = ConfigurationManager.load();

      expect(config.openPullRequestsLimit).toBe(5);
    });
  });

  describe('validate', () => {
    let validConfig: ActionConfig;

    beforeEach(() => {
      validConfig = {
        includePaths: ['**/*.yaml'],
        excludePaths: ['node_modules/**'],
        updateStrategy: 'all',
        registryCredentials: [],
        prStrategy: 'single',
        prLabels: ['dependencies'],
        prAssignees: [],
        prReviewers: [],
        branchPrefix: 'helm-update',
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
        githubToken: 'test-token',
        changelog: {
          enabled: true,
          maxLength: 5000,
          cacheTTL: 3600,
        },
      };
    });

    it('should validate a valid configuration', () => {
      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid update strategy', () => {
      validConfig.updateStrategy = 'invalid' as any;

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid update-strategy'))).toBe(true);
    });

    it('should reject invalid PR strategy', () => {
      validConfig.prStrategy = 'invalid' as any;

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid pr-strategy'))).toBe(true);
    });

    it('should reject invalid log level', () => {
      validConfig.logLevel = 'invalid' as any;

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid log-level'))).toBe(true);
    });

    it('should reject invalid rebase strategy', () => {
      validConfig.rebaseStrategy = 'invalid' as any;

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid rebase-strategy'))).toBe(true);
    });

    it('should reject empty include paths', () => {
      validConfig.includePaths = [];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('include-paths must not be empty');
    });

    it('should reject empty pattern strings', () => {
      validConfig.includePaths = ['**/*.yaml', '', '  '];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject incomplete registry credentials', () => {
      validConfig.registryCredentials = [
        {
          registry: 'https://example.com',
          username: 'user',
          password: '',
        },
      ];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Registry credentials must include'))).toBe(true);
    });

    it('should reject invalid auto-merge update types', () => {
      validConfig.autoMerge.updateTypes = ['invalid' as any];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid auto-merge update type'))).toBe(true);
    });

    it('should reject negative open pull requests limit', () => {
      validConfig.openPullRequestsLimit = -1;

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('open-pull-requests-limit must be a non-negative number'))).toBe(true);
    });

    it('should reject negative auto-merge require approvals', () => {
      validConfig.autoMerge.requireApprovals = -1;

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('auto-merge-require-approvals must be a non-negative number'))).toBe(true);
    });

    it('should reject missing GitHub token', () => {
      validConfig.githubToken = '';

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('github-token is required');
    });

    it('should reject ignore rules without dependency name', () => {
      validConfig.ignore = [
        {
          dependencyName: '',
          versions: ['1.x'],
        },
      ];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Ignore rule must include dependencyName');
    });

    it('should reject invalid ignore rule update types', () => {
      validConfig.ignore = [
        {
          dependencyName: 'nginx',
          updateTypes: ['invalid' as any],
        },
      ];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid ignore rule update type'))).toBe(true);
    });

    it('should reject dependency groups without patterns', () => {
      validConfig.groups = {
        'test-group': {
          patterns: [],
        },
      };

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('must have at least one pattern'))).toBe(true);
    });

    it('should reject invalid group update types', () => {
      validConfig.groups = {
        'test-group': {
          patterns: ['nginx'],
          updateTypes: ['invalid' as any],
        },
      };

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid group update type'))).toBe(true);
    });

    it('should accumulate multiple validation errors', () => {
      validConfig.updateStrategy = 'invalid' as any;
      validConfig.prStrategy = 'invalid' as any;
      validConfig.logLevel = 'invalid' as any;

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('should reject glob patterns with backslashes', () => {
      validConfig.includePaths = ['src\\**\\*.yaml'];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('use forward slashes'))).toBe(true);
    });

    it('should reject invalid registry URLs', () => {
      validConfig.registryCredentials = [
        {
          registry: 'not a valid url or hostname!',
          username: 'user',
          password: 'pass',
        },
      ];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid registry URL or hostname'))).toBe(true);
    });

    it('should accept valid registry URLs', () => {
      validConfig.registryCredentials = [
        {
          registry: 'https://registry.example.com',
          username: 'user',
          password: 'pass',
        },
      ];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(true);
    });

    it('should accept valid registry hostnames', () => {
      validConfig.registryCredentials = [
        {
          registry: 'registry.example.com',
          username: 'user',
          password: 'pass',
        },
      ];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid group names', () => {
      validConfig.groups = {
        'invalid group name': {
          patterns: ['nginx'],
        },
      };

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid group name'))).toBe(true);
    });

    it('should accept valid group names', () => {
      validConfig.groups = {
        'valid-group_name123': {
          patterns: ['nginx'],
        },
      };

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid branch prefix with spaces', () => {
      validConfig.branchPrefix = 'helm update';

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid branch-prefix'))).toBe(true);
    });

    it('should reject invalid branch prefix with special characters', () => {
      validConfig.branchPrefix = 'helm:update';

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid branch-prefix'))).toBe(true);
    });

    it('should reject branch prefix ending with dot', () => {
      validConfig.branchPrefix = 'helm-update.';

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot end with'))).toBe(true);
    });

    it('should reject branch prefix ending with .lock', () => {
      validConfig.branchPrefix = 'helm-update.lock';

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot end with'))).toBe(true);
    });

    it('should accept valid branch prefix', () => {
      validConfig.branchPrefix = 'helm-update-123';

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid commit message prefix', () => {
      validConfig.commitMessage.prefix = 'invalid-prefix';

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid commit-message-prefix'))).toBe(true);
    });

    it('should accept valid commit message prefixes', () => {
      const validPrefixes = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
      
      for (const prefix of validPrefixes) {
        validConfig.commitMessage.prefix = prefix;
        const result = ConfigurationManager.validate(validConfig);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject absolute paths in glob patterns', () => {
      validConfig.includePaths = ['/absolute/path/*.yaml'];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('patterns should be relative'))).toBe(true);
    });

    it('should reject empty PR labels', () => {
      validConfig.prLabels = ['valid-label', '', '  '];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('PR labels must not be empty'))).toBe(true);
    });

    it('should reject PR labels exceeding maximum length', () => {
      validConfig.prLabels = ['a'.repeat(51)];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds maximum length'))).toBe(true);
    });

    it('should reject invalid PR assignee usernames', () => {
      validConfig.prAssignees = ['valid-user', '-invalid', 'invalid-', 'invalid user'];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.filter(e => e.includes('Invalid PR assignee')).length).toBeGreaterThan(0);
    });

    it('should accept valid PR assignee usernames', () => {
      validConfig.prAssignees = ['user123', 'valid-user', 'User-Name-123'];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid PR reviewer usernames', () => {
      validConfig.prReviewers = ['valid-user', '-invalid', 'invalid-', 'invalid user'];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.filter(e => e.includes('Invalid PR reviewer')).length).toBeGreaterThan(0);
    });

    it('should accept valid PR reviewer usernames', () => {
      validConfig.prReviewers = ['user123', 'valid-user', 'User-Name-123'];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(true);
    });

    it('should reject empty version patterns in ignore rules', () => {
      validConfig.ignore = [
        {
          dependencyName: 'nginx',
          versions: ['1.x', '', '  '],
        },
      ];

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('version patterns must not be empty'))).toBe(true);
    });

    it('should reject empty patterns in dependency groups', () => {
      validConfig.groups = {
        'test-group': {
          patterns: ['nginx', '', '  '],
        },
      };

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('contains empty pattern'))).toBe(true);
    });

    // Changelog configuration validation tests (Requirement 9.7)
    it('should validate changelog configuration with defaults', () => {
      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(true);
      expect(validConfig.changelog.enabled).toBe(true);
      expect(validConfig.changelog.maxLength).toBe(5000);
      expect(validConfig.changelog.cacheTTL).toBe(3600);
    });

    it('should reject negative changelog max length', () => {
      validConfig.changelog.maxLength = -1;

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('changelog-max-length must be a non-negative number'))).toBe(true);
    });

    it('should reject negative changelog cache TTL', () => {
      validConfig.changelog.cacheTTL = -1;

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('changelog-cache-ttl must be a non-negative number'))).toBe(true);
    });

    it('should accept zero values for changelog configuration', () => {
      validConfig.changelog.maxLength = 0;
      validConfig.changelog.cacheTTL = 0;

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(true);
    });

    it('should accept changelog configuration with GitLab token', () => {
      validConfig.changelog.gitlabToken = 'gitlab-token-123';

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(true);
    });

    it('should accept changelog configuration with Bitbucket credentials', () => {
      validConfig.changelog.bitbucketCredentials = {
        username: 'bitbucket-user',
        password: 'bitbucket-pass',
      };

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(true);
    });

    it('should reject incomplete Bitbucket credentials (username only)', () => {
      validConfig.changelog.bitbucketCredentials = {
        username: 'bitbucket-user',
        password: '',
      };

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Both bitbucket-username and bitbucket-password must be provided together'))).toBe(true);
    });

    it('should reject incomplete Bitbucket credentials (password only)', () => {
      validConfig.changelog.bitbucketCredentials = {
        username: '',
        password: 'bitbucket-pass',
      };

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Both bitbucket-username and bitbucket-password must be provided together'))).toBe(true);
    });

    it('should accept changelog disabled configuration', () => {
      validConfig.changelog.enabled = false;

      const result = ConfigurationManager.validate(validConfig);

      expect(result.valid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty comma-separated strings', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'github-token': 'test-token',
          'pr-labels': ',,',
          'pr-assignees': '',
        };
        return inputs[name] || '';
      });

      const config = ConfigurationManager.load();

      expect(config.prLabels).toEqual([]);
      expect(config.prAssignees).toEqual([]);
    });

    it('should trim whitespace from comma-separated values', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'github-token': 'test-token',
          'pr-labels': ' label1 , label2 , label3 ',
        };
        return inputs[name] || '';
      });

      const config = ConfigurationManager.load();

      expect(config.prLabels).toEqual(['label1', 'label2', 'label3']);
    });

    it('should handle external config with array values', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'config-file') {
          return '.argocd-updater.yml';
        }
        if (name === 'github-token') {
          return 'test-token';
        }
        return '';
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        `pr-labels:
  - label1
  - label2
  - label3`
      );

      const config = ConfigurationManager.load();

      expect(config.prLabels).toEqual(['label1', 'label2', 'label3']);
    });

    it('should handle external config with string values', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        if (name === 'config-file') {
          return '.argocd-updater.yml';
        }
        if (name === 'github-token') {
          return 'test-token';
        }
        return '';
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('pr-labels: label1,label2,label3');

      const config = ConfigurationManager.load();

      expect(config.prLabels).toEqual(['label1', 'label2', 'label3']);
    });

    it('should use default changelog values when inputs not provided', () => {
      const config = ConfigurationManager.load();

      expect(config.changelog.enabled).toBe(true);
      expect(config.changelog.maxLength).toBe(5000);
      expect(config.changelog.cacheTTL).toBe(3600);
      expect(config.changelog.gitlabToken).toBeUndefined();
      expect(config.changelog.bitbucketCredentials).toBeUndefined();
    });

    it('should load changelog configuration from action inputs', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'github-token': 'test-token',
          'changelog-enabled': 'false',
          'changelog-max-length': '10000',
          'changelog-cache-ttl': '7200',
          'gitlab-token': 'gitlab-token-123',
          'bitbucket-username': 'bb-user',
          'bitbucket-password': 'bb-pass',
        };
        return inputs[name] || '';
      });

      const config = ConfigurationManager.load();

      expect(config.changelog.enabled).toBe(false);
      expect(config.changelog.maxLength).toBe(10000);
      expect(config.changelog.cacheTTL).toBe(7200);
      expect(config.changelog.gitlabToken).toBe('gitlab-token-123');
      expect(config.changelog.bitbucketCredentials).toEqual({
        username: 'bb-user',
        password: 'bb-pass',
      });
    });
  });
});
