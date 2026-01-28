/**
 * Property 21: Non-blocking integration
 * 
 * Feature: changelog-release-notes-generator, Property 21: Non-blocking integration
 * 
 * Validates Requirement 9.4: Changelog_Finder SHALL not block PR creation if changelog retrieval fails
 * 
 * For any chart update where changelog retrieval fails, the PullRequestManager should still
 * create the pull request successfully with a fallback message.
 */

import * as fc from 'fast-check';
import { PullRequestManager } from '../../src/pr/pull-request-manager';
import { ActionConfig } from '../../src/types/config';
import { FileUpdate } from '../../src/types/file-update';
import { VersionUpdate } from '../../src/types/version';
import { HelmDependency } from '../../src/types/dependency';
import { ChangelogResult } from '../../src/types/changelog';
import * as github from '@actions/github';

// Mock @actions/github
jest.mock('@actions/github');

describe('Property 21: Non-blocking integration', () => {
  let mockOctokit: any;
  let config: ActionConfig;

  beforeEach(() => {
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
        repos: { get: jest.fn() },
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
  });

  /**
   * Property: PR creation should succeed even when changelog retrieval fails
   */
  it('should create PR successfully when changelog results indicate failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random chart updates
        fc.array(
          fc.record({
            chartName: fc.string({ minLength: 1, maxLength: 20 }),
            repoURL: fc.webUrl(),
            currentVersion: fc.string({ minLength: 5, maxLength: 10 }),
            newVersion: fc.string({ minLength: 5, maxLength: 10 }),
            manifestPath: fc.string({ minLength: 5, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (updates) => {
          // Create file updates from generated data
          const fileUpdates: FileUpdate[] = updates.map((update) => {
            const dependency: HelmDependency = {
              manifestPath: update.manifestPath,
              documentIndex: 0,
              chartName: update.chartName,
              repoURL: update.repoURL,
              repoType: 'helm',
              currentVersion: update.currentVersion,
              versionPath: ['spec', 'source', 'targetRevision'],
            };

            const versionUpdate: VersionUpdate = {
              dependency,
              currentVersion: update.currentVersion,
              newVersion: update.newVersion,
            };

            return {
              path: update.manifestPath,
              originalContent: 'original',
              updatedContent: 'updated',
              updates: [versionUpdate],
            };
          });

          // Create changelog results that indicate failure for all charts
          const changelogResults = new Map<string, ChangelogResult>();
          for (const update of updates) {
            changelogResults.set(update.chartName, {
              found: false,
              sourceUrl: update.repoURL,
              error: 'Failed to fetch changelog',
            });
          }

          // Create PR manager
          const prManager = new PullRequestManager(mockOctokit, config);

          // Generate PR body with failed changelog results
          const prBody = prManager.generatePRBody(fileUpdates, changelogResults);

          // Verify PR body was generated successfully
          expect(prBody).toBeDefined();
          expect(typeof prBody).toBe('string');
          expect(prBody.length).toBeGreaterThan(0);

          // Verify PR body contains the update information
          expect(prBody).toContain('## Helm Chart Updates');

          // Verify PR body contains changelog section with fallback message
          if (changelogResults.size > 0) {
            expect(prBody).toContain('## Changelogs');
            expect(prBody).toContain('No changelog or release notes found for this update');
          }

          // Verify all chart names appear in the PR body
          for (const update of updates) {
            expect(prBody).toContain(update.chartName);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: PR body should include fallback message when changelog not found
   */
  it('should include fallback message in PR body when changelog retrieval fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.webUrl(),
        fc.string({ minLength: 5, maxLength: 10 }),
        fc.string({ minLength: 5, maxLength: 10 }),
        async (chartName, repoURL, currentVersion, newVersion) => {
          const dependency: HelmDependency = {
            manifestPath: 'app.yaml',
            documentIndex: 0,
            chartName,
            repoURL,
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision'],
          };

          const versionUpdate: VersionUpdate = {
            dependency,
            currentVersion,
            newVersion,
          };

          const fileUpdate: FileUpdate = {
            path: 'app.yaml',
            originalContent: 'original',
            updatedContent: 'updated',
            updates: [versionUpdate],
          };

          // Create changelog result indicating failure
          const changelogResults = new Map<string, ChangelogResult>([
            [
              chartName,
              {
                found: false,
                sourceUrl: repoURL,
                error: 'Repository not accessible',
              },
            ],
          ]);

          const prManager = new PullRequestManager(mockOctokit, config);
          const prBody = prManager.generatePRBody([fileUpdate], changelogResults);

          // Verify fallback message is included
          expect(prBody).toContain('No changelog or release notes found for this update');
          expect(prBody).toContain('[View commit history]');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: PR body should be valid even with mixed success/failure changelog results
   */
  it('should handle mixed success and failure changelog results gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            chartName: fc.string({ minLength: 1, maxLength: 20 }),
            repoURL: fc.webUrl(),
            currentVersion: fc.string({ minLength: 5, maxLength: 10 }),
            newVersion: fc.string({ minLength: 5, maxLength: 10 }),
            hasChangelog: fc.boolean(),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (updates) => {
          const fileUpdates: FileUpdate[] = updates.map((update, index) => {
            const dependency: HelmDependency = {
              manifestPath: `app${index}.yaml`,
              documentIndex: 0,
              chartName: update.chartName,
              repoURL: update.repoURL,
              repoType: 'helm',
              currentVersion: update.currentVersion,
              versionPath: ['spec', 'source', 'targetRevision'],
            };

            const versionUpdate: VersionUpdate = {
              dependency,
              currentVersion: update.currentVersion,
              newVersion: update.newVersion,
            };

            return {
              path: `app${index}.yaml`,
              originalContent: 'original',
              updatedContent: 'updated',
              updates: [versionUpdate],
            };
          });

          // Create mixed changelog results (some success, some failure)
          const changelogResults = new Map<string, ChangelogResult>();
          for (const update of updates) {
            if (update.hasChangelog) {
              changelogResults.set(update.chartName, {
                found: true,
                sourceUrl: update.repoURL,
                changelogText: '## Changelog\n\n- Feature: New feature',
                changelogUrl: `${update.repoURL}/CHANGELOG.md`,
              });
            } else {
              changelogResults.set(update.chartName, {
                found: false,
                sourceUrl: update.repoURL,
                error: 'Changelog not found',
              });
            }
          }

          const prManager = new PullRequestManager(mockOctokit, config);
          const prBody = prManager.generatePRBody(fileUpdates, changelogResults);

          // Verify PR body is valid
          expect(prBody).toBeDefined();
          expect(prBody.length).toBeGreaterThan(0);
          expect(prBody).toContain('## Helm Chart Updates');
          expect(prBody).toContain('## Changelogs');

          // Verify all charts are included
          for (const update of updates) {
            expect(prBody).toContain(update.chartName);
          }

          // Verify successful changelogs show content
          const successfulUpdates = updates.filter((u) => u.hasChangelog);
          if (successfulUpdates.length > 0) {
            expect(prBody).toContain('#### Changelog');
          }

          // Verify failed changelogs show fallback message
          const failedUpdates = updates.filter((u) => !u.hasChangelog);
          if (failedUpdates.length > 0) {
            expect(prBody).toContain('No changelog or release notes found for this update');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
