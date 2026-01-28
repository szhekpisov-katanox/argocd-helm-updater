/**
 * Unit tests for PullRequestManager
 */

import { PullRequestManager, PROptions } from '../../../src/pr/pull-request-manager';
import { ActionConfig } from '../../../src/types/config';
import { FileUpdate } from '../../../src/types/file-update';
import { VersionUpdate } from '../../../src/types/version';
import { HelmDependency } from '../../../src/types/dependency';
import * as github from '@actions/github';

// Mock @actions/github
jest.mock('@actions/github');

describe('PullRequestManager', () => {
  let mockOctokit: any;
  let config: ActionConfig;
  let manager: PullRequestManager;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock GitHub context
    (github.context as any) = {
      repo: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
    };

    // Create mock Octokit client
    mockOctokit = {
      rest: {
        repos: {
          get: jest.fn(),
        },
        git: {
          getRef: jest.fn(),
          createRef: jest.fn(),
          getCommit: jest.fn(),
          createBlob: jest.fn(),
          createTree: jest.fn(),
          createCommit: jest.fn(),
          updateRef: jest.fn(),
        },
        pulls: {
          list: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          get: jest.fn(),
          listRequestedReviewers: jest.fn(),
          requestReviewers: jest.fn(),
        },
        issues: {
          addLabels: jest.fn(),
          addAssignees: jest.fn(),
          listLabelsOnIssue: jest.fn(),
        },
      },
    };

    // Create test configuration
    config = {
      includePaths: ['**/*.yaml'],
      excludePaths: [],
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

    // Create manager instance
    manager = new PullRequestManager(mockOctokit, config);
  });

  describe('createBranch', () => {
    it('should create a new branch from the default branch', async () => {
      // Mock repository info
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' },
      });

      // Mock getting base branch ref
      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'base-sha-123' } },
      });

      // Mock creating new ref
      mockOctokit.rest.git.createRef.mockResolvedValue({
        data: { ref: 'refs/heads/test-branch' },
      });

      await manager.createBranch('test-branch');

      expect(mockOctokit.rest.repos.get).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
      });

      expect(mockOctokit.rest.git.getRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: 'heads/main',
      });

      expect(mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: 'refs/heads/test-branch',
        sha: 'base-sha-123',
      });
    });

    it('should handle existing branch gracefully', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' },
      });

      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'base-sha-123' } },
      });

      // Mock branch already exists error (422)
      const error: any = new Error('Reference already exists');
      error.status = 422;
      mockOctokit.rest.git.createRef.mockRejectedValue(error);

      // Should not throw
      await expect(manager.createBranch('existing-branch')).resolves.not.toThrow();
    });

    it('should throw error for other failures', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' },
      });

      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'base-sha-123' } },
      });

      // Mock different error
      mockOctokit.rest.git.createRef.mockRejectedValue(new Error('API error'));

      await expect(manager.createBranch('test-branch')).rejects.toThrow(
        'Failed to create branch test-branch'
      );
    });
  });

  describe('commitChanges', () => {
    const createFileUpdate = (path: string, chartName: string): FileUpdate => {
      const dependency: HelmDependency = {
        manifestPath: path,
        documentIndex: 0,
        chartName,
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const update: VersionUpdate = {
        dependency,
        currentVersion: '1.0.0',
        newVersion: '1.1.0',
      };

      return {
        path,
        originalContent: 'original content',
        updatedContent: 'updated content',
        updates: [update],
      };
    };

    it('should commit file changes to a branch', async () => {
      const fileUpdates = [
        createFileUpdate('app1.yaml', 'nginx'),
        createFileUpdate('app2.yaml', 'redis'),
      ];

      // Mock getting branch ref
      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'current-commit-sha' } },
      });

      // Mock getting current commit
      mockOctokit.rest.git.getCommit.mockResolvedValue({
        data: { tree: { sha: 'base-tree-sha' } },
      });

      // Mock creating blobs
      mockOctokit.rest.git.createBlob.mockResolvedValue({
        data: { sha: 'blob-sha' },
      });

      // Mock creating tree
      mockOctokit.rest.git.createTree.mockResolvedValue({
        data: { sha: 'new-tree-sha' },
      });

      // Mock creating commit
      mockOctokit.rest.git.createCommit.mockResolvedValue({
        data: { sha: 'new-commit-sha' },
      });

      // Mock updating ref
      mockOctokit.rest.git.updateRef.mockResolvedValue({
        data: { ref: 'refs/heads/test-branch' },
      });

      await manager.commitChanges('test-branch', fileUpdates);

      expect(mockOctokit.rest.git.createBlob).toHaveBeenCalledTimes(2);
      expect(mockOctokit.rest.git.createTree).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        base_tree: 'base-tree-sha',
        tree: expect.arrayContaining([
          expect.objectContaining({ path: 'app1.yaml' }),
          expect.objectContaining({ path: 'app2.yaml' }),
        ]),
      });

      expect(mockOctokit.rest.git.createCommit).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        message: expect.stringContaining('chore(deps)'),
        tree: 'new-tree-sha',
        parents: ['current-commit-sha'],
      });

      expect(mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: 'heads/test-branch',
        sha: 'new-commit-sha',
      });
    });

    it('should generate correct commit message for single update', async () => {
      const fileUpdates = [createFileUpdate('app.yaml', 'nginx')];

      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'current-commit-sha' } },
      });

      mockOctokit.rest.git.getCommit.mockResolvedValue({
        data: { tree: { sha: 'base-tree-sha' } },
      });

      mockOctokit.rest.git.createBlob.mockResolvedValue({
        data: { sha: 'blob-sha' },
      });

      mockOctokit.rest.git.createTree.mockResolvedValue({
        data: { sha: 'new-tree-sha' },
      });

      mockOctokit.rest.git.createCommit.mockResolvedValue({
        data: { sha: 'new-commit-sha' },
      });

      mockOctokit.rest.git.updateRef.mockResolvedValue({
        data: { ref: 'refs/heads/test-branch' },
      });

      await manager.commitChanges('test-branch', fileUpdates);

      expect(mockOctokit.rest.git.createCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'chore(deps): update nginx to 1.1.0',
        })
      );
    });

    it('should generate correct commit message for multiple updates', async () => {
      const fileUpdates = [
        createFileUpdate('app1.yaml', 'nginx'),
        createFileUpdate('app2.yaml', 'redis'),
      ];

      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'current-commit-sha' } },
      });

      mockOctokit.rest.git.getCommit.mockResolvedValue({
        data: { tree: { sha: 'base-tree-sha' } },
      });

      mockOctokit.rest.git.createBlob.mockResolvedValue({
        data: { sha: 'blob-sha' },
      });

      mockOctokit.rest.git.createTree.mockResolvedValue({
        data: { sha: 'new-tree-sha' },
      });

      mockOctokit.rest.git.createCommit.mockResolvedValue({
        data: { sha: 'new-commit-sha' },
      });

      mockOctokit.rest.git.updateRef.mockResolvedValue({
        data: { ref: 'refs/heads/test-branch' },
      });

      await manager.commitChanges('test-branch', fileUpdates);

      expect(mockOctokit.rest.git.createCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'chore(deps): update 2 Helm charts',
        })
      );
    });

    it('should respect commit message configuration without scope', async () => {
      config.commitMessage.includeScope = false;
      manager = new PullRequestManager(mockOctokit, config);

      const fileUpdates = [createFileUpdate('app.yaml', 'nginx')];

      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'current-commit-sha' } },
      });

      mockOctokit.rest.git.getCommit.mockResolvedValue({
        data: { tree: { sha: 'base-tree-sha' } },
      });

      mockOctokit.rest.git.createBlob.mockResolvedValue({
        data: { sha: 'blob-sha' },
      });

      mockOctokit.rest.git.createTree.mockResolvedValue({
        data: { sha: 'new-tree-sha' },
      });

      mockOctokit.rest.git.createCommit.mockResolvedValue({
        data: { sha: 'new-commit-sha' },
      });

      mockOctokit.rest.git.updateRef.mockResolvedValue({
        data: { ref: 'refs/heads/test-branch' },
      });

      await manager.commitChanges('test-branch', fileUpdates);

      expect(mockOctokit.rest.git.createCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'chore: update nginx to 1.1.0',
        })
      );
    });

    it('should add breaking change indicator for major version updates', async () => {
      const dependency: HelmDependency = {
        manifestPath: 'app.yaml',
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.5.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const update: VersionUpdate = {
        dependency,
        currentVersion: '1.5.0',
        newVersion: '2.0.0', // Major version bump
      };

      const fileUpdates: FileUpdate[] = [
        {
          path: 'app.yaml',
          originalContent: 'original content',
          updatedContent: 'updated content',
          updates: [update],
        },
      ];

      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'current-commit-sha' } },
      });

      mockOctokit.rest.git.getCommit.mockResolvedValue({
        data: { tree: { sha: 'base-tree-sha' } },
      });

      mockOctokit.rest.git.createBlob.mockResolvedValue({
        data: { sha: 'blob-sha' },
      });

      mockOctokit.rest.git.createTree.mockResolvedValue({
        data: { sha: 'new-tree-sha' },
      });

      mockOctokit.rest.git.createCommit.mockResolvedValue({
        data: { sha: 'new-commit-sha' },
      });

      mockOctokit.rest.git.updateRef.mockResolvedValue({
        data: { ref: 'refs/heads/test-branch' },
      });

      await manager.commitChanges('test-branch', fileUpdates);

      expect(mockOctokit.rest.git.createCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'chore(deps)!: update nginx to 2.0.0',
        })
      );
    });

    it('should not add breaking change indicator for minor version updates', async () => {
      const dependency: HelmDependency = {
        manifestPath: 'app.yaml',
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.5.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const update: VersionUpdate = {
        dependency,
        currentVersion: '1.5.0',
        newVersion: '1.6.0', // Minor version bump
      };

      const fileUpdates: FileUpdate[] = [
        {
          path: 'app.yaml',
          originalContent: 'original content',
          updatedContent: 'updated content',
          updates: [update],
        },
      ];

      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'current-commit-sha' } },
      });

      mockOctokit.rest.git.getCommit.mockResolvedValue({
        data: { tree: { sha: 'base-tree-sha' } },
      });

      mockOctokit.rest.git.createBlob.mockResolvedValue({
        data: { sha: 'blob-sha' },
      });

      mockOctokit.rest.git.createTree.mockResolvedValue({
        data: { sha: 'new-tree-sha' },
      });

      mockOctokit.rest.git.createCommit.mockResolvedValue({
        data: { sha: 'new-commit-sha' },
      });

      mockOctokit.rest.git.updateRef.mockResolvedValue({
        data: { ref: 'refs/heads/test-branch' },
      });

      await manager.commitChanges('test-branch', fileUpdates);

      expect(mockOctokit.rest.git.createCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'chore(deps): update nginx to 1.6.0',
        })
      );
    });

    it('should not add breaking change indicator for patch version updates', async () => {
      const dependency: HelmDependency = {
        manifestPath: 'app.yaml',
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.5.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const update: VersionUpdate = {
        dependency,
        currentVersion: '1.5.0',
        newVersion: '1.5.1', // Patch version bump
      };

      const fileUpdates: FileUpdate[] = [
        {
          path: 'app.yaml',
          originalContent: 'original content',
          updatedContent: 'updated content',
          updates: [update],
        },
      ];

      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'current-commit-sha' } },
      });

      mockOctokit.rest.git.getCommit.mockResolvedValue({
        data: { tree: { sha: 'base-tree-sha' } },
      });

      mockOctokit.rest.git.createBlob.mockResolvedValue({
        data: { sha: 'blob-sha' },
      });

      mockOctokit.rest.git.createTree.mockResolvedValue({
        data: { sha: 'new-tree-sha' },
      });

      mockOctokit.rest.git.createCommit.mockResolvedValue({
        data: { sha: 'new-commit-sha' },
      });

      mockOctokit.rest.git.updateRef.mockResolvedValue({
        data: { ref: 'refs/heads/test-branch' },
      });

      await manager.commitChanges('test-branch', fileUpdates);

      expect(mockOctokit.rest.git.createCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'chore(deps): update nginx to 1.5.1',
        })
      );
    });

    it('should add breaking change indicator for multiple updates with at least one major', async () => {
      const dependency1: HelmDependency = {
        manifestPath: 'app1.yaml',
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.5.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const dependency2: HelmDependency = {
        manifestPath: 'app2.yaml',
        documentIndex: 0,
        chartName: 'redis',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '6.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const update1: VersionUpdate = {
        dependency: dependency1,
        currentVersion: '1.5.0',
        newVersion: '2.0.0', // Major version bump
      };

      const update2: VersionUpdate = {
        dependency: dependency2,
        currentVersion: '6.0.0',
        newVersion: '6.2.0', // Minor version bump
      };

      const fileUpdates: FileUpdate[] = [
        {
          path: 'app1.yaml',
          originalContent: 'original content',
          updatedContent: 'updated content',
          updates: [update1],
        },
        {
          path: 'app2.yaml',
          originalContent: 'original content',
          updatedContent: 'updated content',
          updates: [update2],
        },
      ];

      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'current-commit-sha' } },
      });

      mockOctokit.rest.git.getCommit.mockResolvedValue({
        data: { tree: { sha: 'base-tree-sha' } },
      });

      mockOctokit.rest.git.createBlob.mockResolvedValue({
        data: { sha: 'blob-sha' },
      });

      mockOctokit.rest.git.createTree.mockResolvedValue({
        data: { sha: 'new-tree-sha' },
      });

      mockOctokit.rest.git.createCommit.mockResolvedValue({
        data: { sha: 'new-commit-sha' },
      });

      mockOctokit.rest.git.updateRef.mockResolvedValue({
        data: { ref: 'refs/heads/test-branch' },
      });

      await manager.commitChanges('test-branch', fileUpdates);

      expect(mockOctokit.rest.git.createCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'chore(deps)!: update 2 Helm charts',
        })
      );
    });

    it('should use custom commit prefix when configured', async () => {
      config.commitMessage.prefix = 'feat';
      manager = new PullRequestManager(mockOctokit, config);

      const fileUpdates = [createFileUpdate('app.yaml', 'nginx')];

      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'current-commit-sha' } },
      });

      mockOctokit.rest.git.getCommit.mockResolvedValue({
        data: { tree: { sha: 'base-tree-sha' } },
      });

      mockOctokit.rest.git.createBlob.mockResolvedValue({
        data: { sha: 'blob-sha' },
      });

      mockOctokit.rest.git.createTree.mockResolvedValue({
        data: { sha: 'new-tree-sha' },
      });

      mockOctokit.rest.git.createCommit.mockResolvedValue({
        data: { sha: 'new-commit-sha' },
      });

      mockOctokit.rest.git.updateRef.mockResolvedValue({
        data: { ref: 'refs/heads/test-branch' },
      });

      await manager.commitChanges('test-branch', fileUpdates);

      expect(mockOctokit.rest.git.createCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'feat(deps): update nginx to 1.1.0',
        })
      );
    });
  });

  describe('findExistingPR', () => {
    it('should return PR number if PR exists', async () => {
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [{ number: 42 }],
      });

      const result = await manager.findExistingPR('test-branch');

      expect(result).toBe(42);
      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        head: 'test-owner:test-branch',
        state: 'open',
      });
    });

    it('should return null if no PR exists', async () => {
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [],
      });

      const result = await manager.findExistingPR('test-branch');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockOctokit.rest.pulls.list.mockRejectedValue(new Error('API error'));

      const result = await manager.findExistingPR('test-branch');

      expect(result).toBeNull();
    });
  });

  describe('createPR', () => {
    const prOptions: PROptions = {
      title: 'Update Helm charts',
      body: 'This PR updates Helm chart versions',
      branch: 'test-branch',
      labels: ['dependencies', 'helm'],
      assignees: ['user1'],
      reviewers: ['user2'],
    };

    it('should create a new pull request', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' },
      });

      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 42 },
      });

      mockOctokit.rest.issues.addLabels.mockResolvedValue({});
      mockOctokit.rest.issues.addAssignees.mockResolvedValue({});
      mockOctokit.rest.pulls.requestReviewers.mockResolvedValue({});

      const prNumber = await manager.createPR(prOptions);

      expect(prNumber).toBe(42);

      expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        title: 'Update Helm charts',
        body: 'This PR updates Helm chart versions',
        head: 'test-branch',
        base: 'main',
      });

      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 42,
        labels: ['dependencies', 'helm'],
      });

      expect(mockOctokit.rest.issues.addAssignees).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 42,
        assignees: ['user1'],
      });

      expect(mockOctokit.rest.pulls.requestReviewers).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 42,
        reviewers: ['user2'],
      });
    });

    it('should create PR without labels, assignees, or reviewers if not specified', async () => {
      const minimalOptions: PROptions = {
        title: 'Update Helm charts',
        body: 'This PR updates Helm chart versions',
        branch: 'test-branch',
        labels: [],
        assignees: [],
        reviewers: [],
      };

      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' },
      });

      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 42 },
      });

      await manager.createPR(minimalOptions);

      expect(mockOctokit.rest.issues.addLabels).not.toHaveBeenCalled();
      expect(mockOctokit.rest.issues.addAssignees).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.requestReviewers).not.toHaveBeenCalled();
    });

    it('should throw error if PR creation fails', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' },
      });

      mockOctokit.rest.pulls.create.mockRejectedValue(new Error('API error'));

      await expect(manager.createPR(prOptions)).rejects.toThrow('Failed to create PR');
    });
  });

  describe('updatePR', () => {
    const prOptions: PROptions = {
      title: 'Update Helm charts',
      body: 'This PR updates Helm chart versions',
      branch: 'test-branch',
      labels: ['dependencies', 'helm'],
      assignees: ['user1'],
      reviewers: ['user2'],
    };

    it('should update an existing pull request', async () => {
      mockOctokit.rest.pulls.update.mockResolvedValue({});

      mockOctokit.rest.issues.listLabelsOnIssue.mockResolvedValue({
        data: [{ name: 'dependencies' }],
      });

      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: { assignees: [] },
      });

      mockOctokit.rest.pulls.listRequestedReviewers.mockResolvedValue({
        data: { users: [] },
      });

      mockOctokit.rest.issues.addLabels.mockResolvedValue({});
      mockOctokit.rest.issues.addAssignees.mockResolvedValue({});
      mockOctokit.rest.pulls.requestReviewers.mockResolvedValue({});

      await manager.updatePR(42, prOptions);

      expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 42,
        title: 'Update Helm charts',
        body: 'This PR updates Helm chart versions',
      });

      // Should only add 'helm' label (dependencies already exists)
      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 42,
        labels: ['helm'],
      });
    });

    it('should not add labels/assignees/reviewers that already exist', async () => {
      mockOctokit.rest.pulls.update.mockResolvedValue({});

      mockOctokit.rest.issues.listLabelsOnIssue.mockResolvedValue({
        data: [{ name: 'dependencies' }, { name: 'helm' }],
      });

      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: { assignees: [{ login: 'user1' }] },
      });

      mockOctokit.rest.pulls.listRequestedReviewers.mockResolvedValue({
        data: { users: [{ login: 'user2' }] },
      });

      await manager.updatePR(42, prOptions);

      // Should not add any labels, assignees, or reviewers
      expect(mockOctokit.rest.issues.addLabels).not.toHaveBeenCalled();
      expect(mockOctokit.rest.issues.addAssignees).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.requestReviewers).not.toHaveBeenCalled();
    });

    it('should throw error if PR update fails', async () => {
      mockOctokit.rest.pulls.update.mockRejectedValue(new Error('API error'));

      await expect(manager.updatePR(42, prOptions)).rejects.toThrow(
        'Failed to update PR #42'
      );
    });
  });

  describe('createOrUpdatePR', () => {
    const createFileUpdate = (path: string, chartName: string): FileUpdate => {
      const dependency: HelmDependency = {
        manifestPath: path,
        documentIndex: 0,
        chartName,
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const update: VersionUpdate = {
        dependency,
        currentVersion: '1.0.0',
        newVersion: '1.1.0',
      };

      return {
        path,
        originalContent: 'original content',
        updatedContent: 'updated content',
        updates: [update],
      };
    };

    const prOptions: PROptions = {
      title: 'Update Helm charts',
      body: 'This PR updates Helm chart versions',
      branch: 'test-branch',
      labels: ['dependencies'],
      assignees: [],
      reviewers: [],
    };

    beforeEach(() => {
      // Mock all the methods used in the workflow
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { default_branch: 'main' },
      });

      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha: 'sha-123' } },
      });

      mockOctokit.rest.git.createRef.mockResolvedValue({});

      mockOctokit.rest.git.getCommit.mockResolvedValue({
        data: { tree: { sha: 'tree-sha' } },
      });

      mockOctokit.rest.git.createBlob.mockResolvedValue({
        data: { sha: 'blob-sha' },
      });

      mockOctokit.rest.git.createTree.mockResolvedValue({
        data: { sha: 'new-tree-sha' },
      });

      mockOctokit.rest.git.createCommit.mockResolvedValue({
        data: { sha: 'new-commit-sha' },
      });

      mockOctokit.rest.git.updateRef.mockResolvedValue({});
    });

    it('should create a new PR when none exists', async () => {
      const fileUpdates = [createFileUpdate('app.yaml', 'nginx')];

      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [],
      });

      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: { number: 42 },
      });

      mockOctokit.rest.issues.addLabels.mockResolvedValue({});

      const result = await manager.createOrUpdatePR(fileUpdates, prOptions);

      expect(result).toBe(42);
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.update).not.toHaveBeenCalled();
    });

    it('should update existing PR when one exists', async () => {
      const fileUpdates = [createFileUpdate('app.yaml', 'nginx')];

      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [{ number: 42 }],
      });

      mockOctokit.rest.pulls.update.mockResolvedValue({});
      mockOctokit.rest.issues.listLabelsOnIssue.mockResolvedValue({
        data: [],
      });
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: { assignees: [] },
      });
      mockOctokit.rest.pulls.listRequestedReviewers.mockResolvedValue({
        data: { users: [] },
      });
      mockOctokit.rest.issues.addLabels.mockResolvedValue({});

      const result = await manager.createOrUpdatePR(fileUpdates, prOptions);

      expect(result).toBe(42);
      expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
      expect(mockOctokit.rest.pulls.update).toHaveBeenCalled();
    });

    it('should return null if no file updates provided', async () => {
      const result = await manager.createOrUpdatePR([], prOptions);

      expect(result).toBeNull();
      expect(mockOctokit.rest.git.createRef).not.toHaveBeenCalled();
    });

    it('should throw error if workflow fails', async () => {
      const fileUpdates = [createFileUpdate('app.yaml', 'nginx')];

      mockOctokit.rest.git.createRef.mockRejectedValue(new Error('API error'));

      await expect(manager.createOrUpdatePR(fileUpdates, prOptions)).rejects.toThrow(
        'Failed to create branch'
      );
    });
  });

  describe('generatePRBody', () => {
    const createFileUpdate = (
      path: string,
      updates: Array<{
        chartName: string;
        repoURL: string;
        currentVersion: string;
        newVersion: string;
        releaseNotes?: string;
      }>
    ): FileUpdate => {
      const versionUpdates: VersionUpdate[] = updates.map((u) => {
        const dependency: HelmDependency = {
          manifestPath: path,
          documentIndex: 0,
          chartName: u.chartName,
          repoURL: u.repoURL,
          repoType: u.repoURL.startsWith('oci://') ? 'oci' : 'helm',
          currentVersion: u.currentVersion,
          versionPath: ['spec', 'source', 'targetRevision'],
        };

        return {
          dependency,
          currentVersion: u.currentVersion,
          newVersion: u.newVersion,
          releaseNotes: u.releaseNotes,
        };
      });

      return {
        path,
        originalContent: 'original content',
        updatedContent: 'updated content',
        updates: versionUpdates,
      };
    };

    it('should generate PR body for single chart update', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
        ]),
      ];

      const body = manager.generatePRBody(fileUpdates);

      expect(body).toContain('## Helm Chart Updates');
      expect(body).toContain('This PR updates 1 Helm chart across 1 manifest file.');
      expect(body).toContain('### `manifests/app.yaml`');
      expect(body).toContain('| Chart | Repository | Current Version | New Version | Release Notes |');
      expect(body).toContain('| nginx |');
      expect(body).toContain('[bitnami](https://charts.bitnami.com/bitnami)');
      expect(body).toContain('`15.9.0`');
      expect(body).toContain('`15.10.0`');
      expect(body).toContain('*This PR was automatically generated by ArgoCD Helm Updater*');
    });

    it('should generate PR body for multiple charts in single file', () => {
      const fileUpdates = [
        createFileUpdate('manifests/apps.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
          {
            chartName: 'redis',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '18.0.0',
            newVersion: '18.1.0',
          },
        ]),
      ];

      const body = manager.generatePRBody(fileUpdates);

      expect(body).toContain('This PR updates 2 Helm charts across 1 manifest file.');
      expect(body).toContain('| nginx |');
      expect(body).toContain('| redis |');
      expect(body).toContain('`15.9.0`');
      expect(body).toContain('`15.10.0`');
      expect(body).toContain('`18.0.0`');
      expect(body).toContain('`18.1.0`');
    });

    it('should generate PR body for multiple files', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app1.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
        ]),
        createFileUpdate('manifests/app2.yaml', [
          {
            chartName: 'redis',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '18.0.0',
            newVersion: '18.1.0',
          },
        ]),
      ];

      const body = manager.generatePRBody(fileUpdates);

      expect(body).toContain('This PR updates 2 Helm charts across 2 manifest files.');
      expect(body).toContain('### `manifests/app1.yaml`');
      expect(body).toContain('### `manifests/app2.yaml`');
      expect(body).toContain('| nginx |');
      expect(body).toContain('| redis |');
    });

    it('should include release notes links when available', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
            releaseNotes: 'https://github.com/bitnami/charts/releases/tag/nginx-15.10.0',
          },
        ]),
      ];

      const body = manager.generatePRBody(fileUpdates);

      expect(body).toContain(
        '[View](https://github.com/bitnami/charts/releases/tag/nginx-15.10.0)'
      );
    });

    it('should show dash for missing release notes', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
        ]),
      ];

      const body = manager.generatePRBody(fileUpdates);

      // Check that the release notes column has a dash
      const lines = body.split('\n');
      const nginxLine = lines.find((line) => line.includes('| nginx |'));
      expect(nginxLine).toContain('| - |');
    });

    it('should handle OCI registry URLs', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'oci://registry-1.docker.io/bitnamicharts',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
        ]),
      ];

      const body = manager.generatePRBody(fileUpdates);

      expect(body).toContain('[bitnamicharts](oci://registry-1.docker.io/bitnamicharts)');
    });

    it('should handle empty file updates', () => {
      const fileUpdates: FileUpdate[] = [];

      const body = manager.generatePRBody(fileUpdates);

      expect(body).toBe('This PR updates Helm chart versions in ArgoCD manifests.');
    });

    it('should handle file updates with no version updates', () => {
      const fileUpdates: FileUpdate[] = [
        {
          path: 'manifests/app.yaml',
          originalContent: 'original',
          updatedContent: 'updated',
          updates: [],
        },
      ];

      const body = manager.generatePRBody(fileUpdates);

      expect(body).toBe('This PR updates Helm chart versions in ArgoCD manifests.');
    });

    it('should format repository names correctly', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app.yaml', [
          {
            chartName: 'chart1',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '1.0.0',
            newVersion: '1.1.0',
          },
          {
            chartName: 'chart2',
            repoURL: 'https://kubernetes-charts.storage.googleapis.com',
            currentVersion: '2.0.0',
            newVersion: '2.1.0',
          },
          {
            chartName: 'chart3',
            repoURL: 'oci://ghcr.io/myorg/charts',
            currentVersion: '3.0.0',
            newVersion: '3.1.0',
          },
        ]),
      ];

      const body = manager.generatePRBody(fileUpdates);

      expect(body).toContain('[bitnami](https://charts.bitnami.com/bitnami)');
      expect(body).toContain(
        '[kubernetes-charts.storage.googleapis.com](https://kubernetes-charts.storage.googleapis.com)'
      );
      expect(body).toContain('[charts](oci://ghcr.io/myorg/charts)');
    });

    it('should handle complex manifest paths', () => {
      const fileUpdates = [
        createFileUpdate('apps/production/us-east-1/nginx.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
        ]),
      ];

      const body = manager.generatePRBody(fileUpdates);

      expect(body).toContain('### `apps/production/us-east-1/nginx.yaml`');
    });

    it('should handle version strings with pre-release tags', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0-alpha.1',
          },
        ]),
      ];

      const body = manager.generatePRBody(fileUpdates);

      expect(body).toContain('`15.10.0-alpha.1`');
    });

    it('should skip files with no updates in grouped display', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app1.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
        ]),
        {
          path: 'manifests/app2.yaml',
          originalContent: 'original',
          updatedContent: 'updated',
          updates: [],
        },
      ];

      const body = manager.generatePRBody(fileUpdates);

      expect(body).toContain('### `manifests/app1.yaml`');
      expect(body).not.toContain('### `manifests/app2.yaml`');
    });

    it('should include changelog sections when changelog results are provided', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
        ]),
      ];

      const changelogResults = new Map([
        [
          'nginx',
          {
            found: true,
            sourceUrl: 'https://github.com/bitnami/charts',
            changelogText: '## [15.10.0]\n\n- Feature: Added new capability\n- Fix: Resolved bug',
            changelogUrl: 'https://github.com/bitnami/charts/blob/main/CHANGELOG.md',
          },
        ],
      ]);

      const body = manager.generatePRBody(fileUpdates, changelogResults);

      expect(body).toContain('## Changelogs');
      expect(body).toContain('### 📦 nginx (15.9.0 → 15.10.0)');
      expect(body).toContain('#### Changelog');
      expect(body).toContain('Feature: Added new capability');
      expect(body).toContain('[View full changelog](https://github.com/bitnami/charts/blob/main/CHANGELOG.md)');
    });

    it('should include release notes in changelog sections when available', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
        ]),
      ];

      const changelogResults = new Map([
        [
          'nginx',
          {
            found: true,
            sourceUrl: 'https://github.com/bitnami/charts',
            releaseNotes: 'This release includes important security updates.',
            releaseNotesUrl: 'https://github.com/bitnami/charts/releases/tag/nginx-15.10.0',
          },
        ],
      ]);

      const body = manager.generatePRBody(fileUpdates, changelogResults);

      expect(body).toContain('## Changelogs');
      expect(body).toContain('#### Release Notes');
      expect(body).toContain('This release includes important security updates.');
      expect(body).toContain('[View release](https://github.com/bitnami/charts/releases/tag/nginx-15.10.0)');
    });

    it('should include both changelog and release notes when both are available', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
        ]),
      ];

      const changelogResults = new Map([
        [
          'nginx',
          {
            found: true,
            sourceUrl: 'https://github.com/bitnami/charts',
            changelogText: '## [15.10.0]\n\n- Feature: Added new capability',
            changelogUrl: 'https://github.com/bitnami/charts/blob/main/CHANGELOG.md',
            releaseNotes: 'This release includes important security updates.',
            releaseNotesUrl: 'https://github.com/bitnami/charts/releases/tag/nginx-15.10.0',
          },
        ],
      ]);

      const body = manager.generatePRBody(fileUpdates, changelogResults);

      expect(body).toContain('#### Changelog');
      expect(body).toContain('Feature: Added new capability');
      expect(body).toContain('#### Release Notes');
      expect(body).toContain('This release includes important security updates.');
    });

    it('should handle multiple charts with changelogs', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app1.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
        ]),
        createFileUpdate('manifests/app2.yaml', [
          {
            chartName: 'redis',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '18.0.0',
            newVersion: '18.1.0',
          },
        ]),
      ];

      const changelogResults = new Map([
        [
          'nginx',
          {
            found: true,
            sourceUrl: 'https://github.com/bitnami/charts',
            changelogText: '## [15.10.0]\n\n- Nginx updates',
            changelogUrl: 'https://github.com/bitnami/charts/blob/main/nginx/CHANGELOG.md',
          },
        ],
        [
          'redis',
          {
            found: true,
            sourceUrl: 'https://github.com/bitnami/charts',
            changelogText: '## [18.1.0]\n\n- Redis updates',
            changelogUrl: 'https://github.com/bitnami/charts/blob/main/redis/CHANGELOG.md',
          },
        ],
      ]);

      const body = manager.generatePRBody(fileUpdates, changelogResults);

      expect(body).toContain('### 📦 nginx (15.9.0 → 15.10.0)');
      expect(body).toContain('Nginx updates');
      expect(body).toContain('### 📦 redis (18.0.0 → 18.1.0)');
      expect(body).toContain('Redis updates');
    });

    it('should not include changelog section when no changelog results provided', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
        ]),
      ];

      const body = manager.generatePRBody(fileUpdates);

      expect(body).not.toContain('## Changelogs');
      expect(body).not.toContain('#### Changelog');
    });

    it('should not include changelog section when changelog results map is empty', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
        ]),
      ];

      const changelogResults = new Map();

      const body = manager.generatePRBody(fileUpdates, changelogResults);

      expect(body).not.toContain('## Changelogs');
    });

    it('should show fallback message when changelog not found', () => {
      const fileUpdates = [
        createFileUpdate('manifests/app.yaml', [
          {
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            currentVersion: '15.9.0',
            newVersion: '15.10.0',
          },
        ]),
      ];

      const changelogResults = new Map([
        [
          'nginx',
          {
            found: false,
            sourceUrl: 'https://github.com/bitnami/charts',
          },
        ],
      ]);

      const body = manager.generatePRBody(fileUpdates, changelogResults);

      expect(body).toContain('## Changelogs');
      expect(body).toContain('### 📦 nginx (15.9.0 → 15.10.0)');
      expect(body).toContain('No changelog or release notes found for this update.');
      expect(body).toContain('[View commit history](https://github.com/bitnami/charts/commits)');
    });
  });

  describe('generateBranchName', () => {
    const createFileUpdate = (
      path: string,
      chartName: string,
      currentVersion: string,
      newVersion: string
    ): FileUpdate => {
      const dependency: HelmDependency = {
        manifestPath: path,
        documentIndex: 0,
        chartName,
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion,
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const update: VersionUpdate = {
        dependency,
        currentVersion,
        newVersion,
      };

      return {
        path,
        originalContent: 'original content',
        updatedContent: 'updated content',
        updates: [update],
      };
    };

    it('should generate branch name for single chart update', () => {
      const fileUpdates = [createFileUpdate('app.yaml', 'nginx', '1.0.0', '1.1.0')];

      const branchName = manager.generateBranchName(fileUpdates);

      expect(branchName).toBe('helm-update/nginx-1.1.0');
    });

    it('should generate branch name for multiple chart updates with timestamp', () => {
      const fileUpdates = [
        createFileUpdate('app1.yaml', 'nginx', '1.0.0', '1.1.0'),
        createFileUpdate('app2.yaml', 'redis', '6.0.0', '6.2.0'),
      ];

      const branchName = manager.generateBranchName(fileUpdates);

      expect(branchName).toMatch(/^helm-update\/helm-updates-\d+$/);
    });

    it('should generate branch name with timestamp for empty updates', () => {
      const fileUpdates: FileUpdate[] = [
        {
          path: 'app.yaml',
          originalContent: 'original',
          updatedContent: 'updated',
          updates: [],
        },
      ];

      const branchName = manager.generateBranchName(fileUpdates);

      expect(branchName).toMatch(/^helm-update\/helm-updates-\d+$/);
    });

    it('should respect configured branch prefix', () => {
      config.branchPrefix = 'custom-prefix';
      manager = new PullRequestManager(mockOctokit, config);

      const fileUpdates = [createFileUpdate('app.yaml', 'nginx', '1.0.0', '1.1.0')];

      const branchName = manager.generateBranchName(fileUpdates);

      expect(branchName).toBe('custom-prefix/nginx-1.1.0');
    });

    it('should handle chart names with special characters', () => {
      const fileUpdates = [
        createFileUpdate('app.yaml', 'my-chart-name', '1.0.0', '2.0.0'),
      ];

      const branchName = manager.generateBranchName(fileUpdates);

      expect(branchName).toBe('helm-update/my-chart-name-2.0.0');
    });

    it('should handle version strings with pre-release tags', () => {
      const fileUpdates = [
        createFileUpdate('app.yaml', 'nginx', '1.0.0', '1.1.0-alpha.1'),
      ];

      const branchName = manager.generateBranchName(fileUpdates);

      expect(branchName).toBe('helm-update/nginx-1.1.0-alpha.1');
    });

    it('should handle multiple updates from same file', () => {
      const dependency1: HelmDependency = {
        manifestPath: 'app.yaml',
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const dependency2: HelmDependency = {
        manifestPath: 'app.yaml',
        documentIndex: 1,
        chartName: 'redis',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '6.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const update1: VersionUpdate = {
        dependency: dependency1,
        currentVersion: '1.0.0',
        newVersion: '1.1.0',
      };

      const update2: VersionUpdate = {
        dependency: dependency2,
        currentVersion: '6.0.0',
        newVersion: '6.2.0',
      };

      const fileUpdates: FileUpdate[] = [
        {
          path: 'app.yaml',
          originalContent: 'original',
          updatedContent: 'updated',
          updates: [update1, update2],
        },
      ];

      const branchName = manager.generateBranchName(fileUpdates);

      // Should use timestamp format for multiple updates
      expect(branchName).toMatch(/^helm-update\/helm-updates-\d+$/);
    });
  });

  describe('groupUpdatesByStrategy', () => {
    const createFileUpdate = (
      path: string,
      updates: Array<{ chartName: string; currentVersion: string; newVersion: string }>
    ): FileUpdate => {
      const versionUpdates = updates.map((u) => {
        const dependency: HelmDependency = {
          manifestPath: path,
          documentIndex: 0,
          chartName: u.chartName,
          repoURL: 'https://charts.example.com',
          repoType: 'helm',
          currentVersion: u.currentVersion,
          versionPath: ['spec', 'source', 'targetRevision'],
        };

        return {
          dependency,
          currentVersion: u.currentVersion,
          newVersion: u.newVersion,
        };
      });

      return {
        path,
        originalContent: 'original content',
        updatedContent: 'updated content',
        updates: versionUpdates,
      };
    };

    describe('single strategy', () => {
      beforeEach(() => {
        config.prStrategy = 'single';
        manager = new PullRequestManager(mockOctokit, config);
      });

      it('should group all updates into a single group', () => {
        const fileUpdates = [
          createFileUpdate('app1.yaml', [{ chartName: 'nginx', currentVersion: '1.0.0', newVersion: '1.1.0' }]),
          createFileUpdate('app2.yaml', [{ chartName: 'redis', currentVersion: '6.0.0', newVersion: '6.2.0' }]),
        ];

        const groups = manager.groupUpdatesByStrategy(fileUpdates);

        expect(groups).toHaveLength(1);
        expect(groups[0]).toHaveLength(2);
        expect(groups[0]).toEqual(fileUpdates);
      });

      it('should return empty array for empty input', () => {
        const groups = manager.groupUpdatesByStrategy([]);

        expect(groups).toEqual([]);
      });

      it('should handle single file update', () => {
        const fileUpdates = [
          createFileUpdate('app.yaml', [{ chartName: 'nginx', currentVersion: '1.0.0', newVersion: '1.1.0' }]),
        ];

        const groups = manager.groupUpdatesByStrategy(fileUpdates);

        expect(groups).toHaveLength(1);
        expect(groups[0]).toEqual(fileUpdates);
      });
    });

    describe('per-manifest strategy', () => {
      beforeEach(() => {
        config.prStrategy = 'per-manifest';
        manager = new PullRequestManager(mockOctokit, config);
      });

      it('should create one group per manifest file', () => {
        const fileUpdates = [
          createFileUpdate('app1.yaml', [{ chartName: 'nginx', currentVersion: '1.0.0', newVersion: '1.1.0' }]),
          createFileUpdate('app2.yaml', [{ chartName: 'redis', currentVersion: '6.0.0', newVersion: '6.2.0' }]),
          createFileUpdate('app3.yaml', [{ chartName: 'postgres', currentVersion: '12.0.0', newVersion: '13.0.0' }]),
        ];

        const groups = manager.groupUpdatesByStrategy(fileUpdates);

        expect(groups).toHaveLength(3);
        expect(groups[0]).toEqual([fileUpdates[0]]);
        expect(groups[1]).toEqual([fileUpdates[1]]);
        expect(groups[2]).toEqual([fileUpdates[2]]);
      });

      it('should handle file with multiple chart updates', () => {
        const fileUpdates = [
          createFileUpdate('apps.yaml', [
            { chartName: 'nginx', currentVersion: '1.0.0', newVersion: '1.1.0' },
            { chartName: 'redis', currentVersion: '6.0.0', newVersion: '6.2.0' },
          ]),
        ];

        const groups = manager.groupUpdatesByStrategy(fileUpdates);

        expect(groups).toHaveLength(1);
        expect(groups[0][0].updates).toHaveLength(2);
      });
    });

    describe('per-chart strategy', () => {
      beforeEach(() => {
        config.prStrategy = 'per-chart';
        manager = new PullRequestManager(mockOctokit, config);
      });

      it('should create one group per chart', () => {
        const fileUpdates = [
          createFileUpdate('app1.yaml', [{ chartName: 'nginx', currentVersion: '1.0.0', newVersion: '1.1.0' }]),
          createFileUpdate('app2.yaml', [{ chartName: 'redis', currentVersion: '6.0.0', newVersion: '6.2.0' }]),
        ];

        const groups = manager.groupUpdatesByStrategy(fileUpdates);

        expect(groups).toHaveLength(2);
        
        // Find nginx group
        const nginxGroup = groups.find(g => 
          g.some(f => f.updates.some(u => u.dependency.chartName === 'nginx'))
        );
        expect(nginxGroup).toBeDefined();
        expect(nginxGroup![0].updates[0].dependency.chartName).toBe('nginx');

        // Find redis group
        const redisGroup = groups.find(g => 
          g.some(f => f.updates.some(u => u.dependency.chartName === 'redis'))
        );
        expect(redisGroup).toBeDefined();
        expect(redisGroup![0].updates[0].dependency.chartName).toBe('redis');
      });

      it('should group same chart across multiple files', () => {
        const fileUpdates = [
          createFileUpdate('prod/app.yaml', [{ chartName: 'nginx', currentVersion: '1.0.0', newVersion: '1.1.0' }]),
          createFileUpdate('staging/app.yaml', [{ chartName: 'nginx', currentVersion: '1.0.0', newVersion: '1.1.0' }]),
          createFileUpdate('dev/app.yaml', [{ chartName: 'nginx', currentVersion: '1.0.0', newVersion: '1.1.0' }]),
        ];

        const groups = manager.groupUpdatesByStrategy(fileUpdates);

        expect(groups).toHaveLength(1);
        expect(groups[0]).toHaveLength(3);
        
        // All should be nginx updates
        groups[0].forEach(fileUpdate => {
          expect(fileUpdate.updates[0].dependency.chartName).toBe('nginx');
        });
      });

      it('should handle file with multiple different charts', () => {
        const fileUpdates = [
          createFileUpdate('apps.yaml', [
            { chartName: 'nginx', currentVersion: '1.0.0', newVersion: '1.1.0' },
            { chartName: 'redis', currentVersion: '6.0.0', newVersion: '6.2.0' },
          ]),
        ];

        const groups = manager.groupUpdatesByStrategy(fileUpdates);

        expect(groups).toHaveLength(2);
        
        // Each group should have one file with one update
        groups.forEach(group => {
          expect(group).toHaveLength(1);
          expect(group[0].updates).toHaveLength(1);
        });
      });

      it('should handle complex scenario with mixed charts and files', () => {
        const fileUpdates = [
          createFileUpdate('app1.yaml', [
            { chartName: 'nginx', currentVersion: '1.0.0', newVersion: '1.1.0' },
            { chartName: 'redis', currentVersion: '6.0.0', newVersion: '6.2.0' },
          ]),
          createFileUpdate('app2.yaml', [
            { chartName: 'nginx', currentVersion: '1.0.0', newVersion: '1.1.0' },
          ]),
          createFileUpdate('app3.yaml', [
            { chartName: 'postgres', currentVersion: '12.0.0', newVersion: '13.0.0' },
          ]),
        ];

        const groups = manager.groupUpdatesByStrategy(fileUpdates);

        expect(groups).toHaveLength(3); // nginx, redis, postgres

        // Find nginx group - should have 2 files
        const nginxGroup = groups.find(g => 
          g.some(f => f.updates.some(u => u.dependency.chartName === 'nginx'))
        );
        expect(nginxGroup).toBeDefined();
        expect(nginxGroup!).toHaveLength(2);

        // Find redis group - should have 1 file
        const redisGroup = groups.find(g => 
          g.some(f => f.updates.some(u => u.dependency.chartName === 'redis'))
        );
        expect(redisGroup).toBeDefined();
        expect(redisGroup!).toHaveLength(1);

        // Find postgres group - should have 1 file
        const postgresGroup = groups.find(g => 
          g.some(f => f.updates.some(u => u.dependency.chartName === 'postgres'))
        );
        expect(postgresGroup).toBeDefined();
        expect(postgresGroup!).toHaveLength(1);
      });
    });
  });

  describe('generatePRTitle', () => {
    const createFileUpdate = (
      path: string,
      chartName: string,
      currentVersion: string,
      newVersion: string
    ): FileUpdate => {
      const dependency: HelmDependency = {
        manifestPath: path,
        documentIndex: 0,
        chartName,
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion,
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const update = {
        dependency,
        currentVersion,
        newVersion,
      };

      return {
        path,
        originalContent: 'original content',
        updatedContent: 'updated content',
        updates: [update],
      };
    };

    it('should generate title for single chart update', () => {
      const fileUpdates = [createFileUpdate('app.yaml', 'nginx', '1.0.0', '1.1.0')];

      const title = manager.generatePRTitle(fileUpdates);

      expect(title).toBe('Update nginx to 1.1.0');
    });

    it('should generate title for same chart across multiple files', () => {
      const fileUpdates = [
        createFileUpdate('prod/app.yaml', 'nginx', '1.0.0', '1.1.0'),
        createFileUpdate('staging/app.yaml', 'nginx', '1.0.0', '1.1.0'),
      ];

      const title = manager.generatePRTitle(fileUpdates);

      expect(title).toBe('Update nginx across multiple manifests');
    });

    it('should generate title for multiple different charts', () => {
      const fileUpdates = [
        createFileUpdate('app1.yaml', 'nginx', '1.0.0', '1.1.0'),
        createFileUpdate('app2.yaml', 'redis', '6.0.0', '6.2.0'),
      ];

      const title = manager.generatePRTitle(fileUpdates);

      expect(title).toBe('Update 2 Helm charts');
    });

    it('should generate title for multiple updates of same chart in one file', () => {
      const dependency1: HelmDependency = {
        manifestPath: 'app.yaml',
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'sources', '0', 'targetRevision'],
      };

      const dependency2: HelmDependency = {
        manifestPath: 'app.yaml',
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'sources', '1', 'targetRevision'],
      };

      const fileUpdates: FileUpdate[] = [
        {
          path: 'app.yaml',
          originalContent: 'original',
          updatedContent: 'updated',
          updates: [
            {
              dependency: dependency1,
              currentVersion: '1.0.0',
              newVersion: '1.1.0',
            },
            {
              dependency: dependency2,
              currentVersion: '1.0.0',
              newVersion: '1.1.0',
            },
          ],
        },
      ];

      const title = manager.generatePRTitle(fileUpdates);

      expect(title).toBe('Update nginx across multiple manifests');
    });

    it('should handle empty file updates', () => {
      const fileUpdates: FileUpdate[] = [];

      const title = manager.generatePRTitle(fileUpdates);

      expect(title).toBe('Update Helm charts');
    });

    it('should handle file updates with no version updates', () => {
      const fileUpdates: FileUpdate[] = [
        {
          path: 'app.yaml',
          originalContent: 'original',
          updatedContent: 'updated',
          updates: [],
        },
      ];

      const title = manager.generatePRTitle(fileUpdates);

      expect(title).toBe('Update Helm charts');
    });
  });
});
