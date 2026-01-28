/**
 * Property-based tests for Pull Request Content Completeness
 * 
 * **Property 20: Pull Request Content Completeness**
 * **Validates: Requirements 6.4, 6.5**
 * 
 * For any pull request created, the PR body should include all chart updates
 * with old versions, new versions, and links to release notes when available.
 */

import * as fc from 'fast-check';
import { PullRequestManager } from '../../src/pr/pull-request-manager';
import { ActionConfig } from '../../src/types/config';
import { FileUpdate } from '../../src/types/file-update';
import { VersionUpdate } from '../../src/types/version';
import { HelmDependency } from '../../src/types/dependency';
import * as github from '@actions/github';

// Mock @actions/github
jest.mock('@actions/github');

/**
 * Custom arbitraries for generating test data
 */

// Generate valid semantic versions
const arbSemVer = fc.tuple(
  fc.nat({ max: 10 }),
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// Generate valid chart names
const arbChartName = fc.constantFrom(
  'nginx',
  'postgresql',
  'redis',
  'mongodb',
  'mysql',
  'prometheus',
  'grafana',
  'elasticsearch',
  'cert-manager',
  'ingress-nginx'
);

// Generate valid repository URLs
const arbRepoURL = fc.constantFrom(
  'https://charts.bitnami.com/bitnami',
  'https://charts.example.com',
  'https://kubernetes-charts.storage.googleapis.com',
  'oci://registry-1.docker.io/bitnamicharts',
  'oci://ghcr.io/myorg/charts',
  'https://prometheus-community.github.io/helm-charts'
);

// Generate valid manifest paths
const arbManifestPath = fc.string({ minLength: 5, maxLength: 30 }).map(s => `manifests/${s}.yaml`);

// Generate optional release notes URL
const arbReleaseNotes = fc.option(
  fc.constantFrom(
    'https://github.com/bitnami/charts/releases/tag/nginx-15.9.0',
    'https://github.com/prometheus-community/helm-charts/releases/tag/prometheus-25.0.0',
    'https://artifacthub.io/packages/helm/bitnami/postgresql/12.5.0',
    'https://github.com/cert-manager/cert-manager/releases/tag/v1.13.0'
  ),
  { nil: undefined }
);

// Generate a version update
const arbVersionUpdate = fc.record({
  chartName: arbChartName,
  repoURL: arbRepoURL,
  currentVersion: arbSemVer,
  newVersion: arbSemVer,
  manifestPath: arbManifestPath,
  releaseNotes: arbReleaseNotes
}).map(({ chartName, repoURL, currentVersion, newVersion, manifestPath, releaseNotes }) => {
  const dependency: HelmDependency = {
    manifestPath,
    documentIndex: 0,
    chartName,
    repoURL,
    repoType: repoURL.startsWith('oci://') ? 'oci' : 'helm',
    currentVersion,
    versionPath: ['spec', 'source', 'targetRevision']
  };

  const versionUpdate: VersionUpdate = {
    dependency,
    currentVersion,
    newVersion,
    releaseNotes
  };

  return versionUpdate;
});

// Generate a file update with one or more chart updates
const arbFileUpdate = fc.record({
  manifestPath: arbManifestPath,
  updates: fc.array(arbVersionUpdate, { minLength: 1, maxLength: 3 })
}).map(({ manifestPath, updates }) => {
  // Update all dependencies to use the same manifest path
  const updatedVersions = updates.map(update => ({
    ...update,
    dependency: {
      ...update.dependency,
      manifestPath
    }
  }));

  const fileUpdate: FileUpdate = {
    path: manifestPath,
    originalContent: '',
    updatedContent: '',
    updates: updatedVersions
  };

  return fileUpdate;
});

// Generate multiple file updates
const arbMultipleFileUpdates = fc.array(arbFileUpdate, { minLength: 1, maxLength: 5 });

/**
 * Helper function to create a mock ActionConfig
 */
function createMockConfig(): ActionConfig {
  return {
    includePaths: ['**/*.yaml'],
    excludePaths: [],
    updateStrategy: 'all',
    registryCredentials: [],
    prStrategy: 'single',
    prLabels: [],
    prAssignees: [],
    prReviewers: [],
    branchPrefix: 'helm-updates',
    commitMessage: {
      prefix: 'chore',
      includeScope: true
    },
    groups: {},
    ignore: [],
    autoMerge: {
      enabled: false,
      updateTypes: [],
      requireCIPass: false,
      requireApprovals: 0
    },
    openPullRequestsLimit: 10,
    rebaseStrategy: 'disabled',
    dryRun: false,
    logLevel: 'info',
    githubToken: 'mock-token',
    changelog: {
      enabled: true,
      maxLength: 5000,
      cacheTTL: 3600,
    },
  };
}

/**
 * Helper function to create a mock Octokit instance
 */
function createMockOctokit(): ReturnType<typeof github.getOctokit> {
  return {} as ReturnType<typeof github.getOctokit>;
}

describe('Property 20: Pull Request Content Completeness', () => {
  beforeEach(() => {
    // Mock GitHub context
    (github.context as any) = {
      repo: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
    };
  });

  /**
   * Property 20.1: PR body includes all chart names
   * 
   * For any set of file updates, the generated PR body should include
   * the name of every chart being updated.
   */
  it('should include all chart names in PR body', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody = prManager.generatePRBody(fileUpdates);

          // Collect all unique chart names
          const allUpdates = fileUpdates.flatMap(file => file.updates);
          const chartNames = allUpdates.map(update => update.dependency.chartName);

          // Each chart name should appear in the PR body
          for (const chartName of chartNames) {
            expect(prBody).toContain(chartName);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.2: PR body includes all current versions
   * 
   * For any set of file updates, the generated PR body should include
   * the current version of every chart being updated.
   */
  it('should include all current versions in PR body', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody = prManager.generatePRBody(fileUpdates);

          // Collect all current versions
          const allUpdates = fileUpdates.flatMap(file => file.updates);
          const currentVersions = allUpdates.map(update => update.currentVersion);

          // Each current version should appear in the PR body
          for (const version of currentVersions) {
            expect(prBody).toContain(version);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.3: PR body includes all new versions
   * 
   * For any set of file updates, the generated PR body should include
   * the new version of every chart being updated.
   */
  it('should include all new versions in PR body', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody = prManager.generatePRBody(fileUpdates);

          // Collect all new versions
          const allUpdates = fileUpdates.flatMap(file => file.updates);
          const newVersions = allUpdates.map(update => update.newVersion);

          // Each new version should appear in the PR body
          for (const version of newVersions) {
            expect(prBody).toContain(version);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.4: PR body includes repository URLs
   * 
   * For any set of file updates, the generated PR body should include
   * links to the chart repositories.
   */
  it('should include repository URLs in PR body', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody = prManager.generatePRBody(fileUpdates);

          // Collect all unique repository URLs
          const allUpdates = fileUpdates.flatMap(file => file.updates);
          const repoURLs = [...new Set(allUpdates.map(update => update.dependency.repoURL))];

          // Each repository URL should appear in the PR body
          for (const repoURL of repoURLs) {
            expect(prBody).toContain(repoURL);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.5: PR body includes release notes links when available
   * 
   * For any set of file updates where release notes are provided,
   * the generated PR body should include links to those release notes.
   */
  it('should include release notes links when available', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody = prManager.generatePRBody(fileUpdates);

          // Collect all updates with release notes
          const allUpdates = fileUpdates.flatMap(file => file.updates);
          const updatesWithReleaseNotes = allUpdates.filter(update => update.releaseNotes);

          // Each release notes URL should appear in the PR body
          for (const update of updatesWithReleaseNotes) {
            expect(prBody).toContain(update.releaseNotes!);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.6: PR body shows placeholder for missing release notes
   * 
   * For any set of file updates where release notes are not provided,
   * the generated PR body should show a placeholder (e.g., '-') instead
   * of leaving the field empty.
   */
  it('should show placeholder for missing release notes', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody = prManager.generatePRBody(fileUpdates);

          // Collect all updates without release notes
          const allUpdates = fileUpdates.flatMap(file => file.updates);
          const updatesWithoutReleaseNotes = allUpdates.filter(update => !update.releaseNotes);

          // If there are updates without release notes, the PR body should contain
          // the placeholder character '-' in the release notes column
          if (updatesWithoutReleaseNotes.length > 0) {
            // The PR body should have a table with a Release Notes column
            expect(prBody).toContain('Release Notes');
            
            // Count the number of '-' placeholders in the table
            // (This is a simple heuristic - in a real implementation, we'd parse the markdown table)
            const placeholderMatches = prBody.match(/\|\s*-\s*\|/g);
            
            // There should be at least as many placeholders as updates without release notes
            if (placeholderMatches) {
              expect(placeholderMatches.length).toBeGreaterThanOrEqual(updatesWithoutReleaseNotes.length);
            }
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.7: PR body groups updates by manifest file
   * 
   * For any set of file updates, the generated PR body should group
   * updates by their manifest file path.
   */
  it('should group updates by manifest file', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody = prManager.generatePRBody(fileUpdates);

          // Each manifest file path should appear as a section header
          for (const fileUpdate of fileUpdates) {
            expect(prBody).toContain(fileUpdate.path);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.8: PR body is valid Markdown
   * 
   * For any set of file updates, the generated PR body should be
   * valid Markdown with proper table formatting.
   */
  it('should generate valid Markdown with tables', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody = prManager.generatePRBody(fileUpdates);

          // PR body should contain Markdown table headers
          expect(prBody).toContain('| Chart |');
          expect(prBody).toContain('| Repository |');
          expect(prBody).toContain('| Current Version |');
          expect(prBody).toContain('| New Version |');
          expect(prBody).toContain('| Release Notes |');

          // PR body should contain table separator
          expect(prBody).toContain('|-------|');

          // PR body should contain table rows (with pipe characters)
          const tableRows = prBody.split('\n').filter(line => 
            line.trim().startsWith('|') && 
            line.trim().endsWith('|') &&
            !line.includes('---')
          );

          // Should have at least header row + data rows
          const allUpdates = fileUpdates.flatMap(file => file.updates);
          expect(tableRows.length).toBeGreaterThanOrEqual(allUpdates.length + 1);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.9: PR body includes summary information
   * 
   * For any set of file updates, the generated PR body should include
   * a summary with the total number of charts and files being updated.
   */
  it('should include summary information', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody = prManager.generatePRBody(fileUpdates);

          const allUpdates = fileUpdates.flatMap(file => file.updates);
          const chartCount = allUpdates.length;
          const fileCount = fileUpdates.length;

          // PR body should mention the number of charts
          expect(prBody).toContain(`${chartCount}`);

          // PR body should mention the number of files
          expect(prBody).toContain(`${fileCount}`);

          // PR body should have a summary section
          expect(prBody).toContain('Helm Chart Updates');

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.10: PR body includes footer attribution
   * 
   * For any set of file updates, the generated PR body should include
   * a footer indicating it was automatically generated.
   */
  it('should include footer attribution', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody = prManager.generatePRBody(fileUpdates);

          // PR body should include attribution footer
          expect(prBody).toContain('automatically generated');
          expect(prBody).toContain('ArgoCD Helm Updater');

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.11: Empty updates produce minimal PR body
   * 
   * For an empty set of file updates, the generated PR body should
   * still be valid and contain a basic message.
   */
  it('should handle empty updates gracefully', () => {
    const config = createMockConfig();
    const octokit = createMockOctokit();
    const prManager = new PullRequestManager(octokit, config);

    const prBody = prManager.generatePRBody([]);

    // PR body should not be empty
    expect(prBody.length).toBeGreaterThan(0);

    // PR body should contain a basic message
    expect(prBody).toContain('Helm chart');
  });

  /**
   * Property 20.12: PR body handles special characters in chart names
   * 
   * For any chart name that may contain special characters (hyphens),
   * the PR body should properly display them without breaking the
   * Markdown formatting.
   */
  it('should handle special characters in chart names', () => {
    fc.assert(
      fc.property(
        arbSemVer,
        arbSemVer,
        arbManifestPath,
        arbRepoURL,
        (currentVersion, newVersion, manifestPath, repoURL) => {
          // Create a chart name with hyphens and special characters
          const chartName = 'my-complex-chart-name';

          const dependency: HelmDependency = {
            manifestPath,
            documentIndex: 0,
            chartName,
            repoURL,
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };

          const versionUpdate: VersionUpdate = {
            dependency,
            currentVersion,
            newVersion
          };

          const fileUpdate: FileUpdate = {
            path: manifestPath,
            originalContent: '',
            updatedContent: '',
            updates: [versionUpdate]
          };

          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody = prManager.generatePRBody([fileUpdate]);

          // Chart name should appear in the PR body
          expect(prBody).toContain(chartName);

          // PR body should still be valid Markdown
          expect(prBody).toContain('| Chart |');
          expect(prBody).toContain('|-------|');

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.13: PR body is deterministic for same inputs
   * 
   * For any set of file updates, generating the PR body multiple times
   * with the same inputs should produce the same result.
   */
  it('should generate deterministic PR body for same inputs', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody1 = prManager.generatePRBody(fileUpdates);
          const prBody2 = prManager.generatePRBody(fileUpdates);

          // Should produce the same PR body
          expect(prBody1).toBe(prBody2);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.14: PR body length is reasonable
   * 
   * For any set of file updates, the generated PR body should be
   * reasonably sized (not excessively long).
   */
  it('should generate reasonably sized PR body', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody = prManager.generatePRBody(fileUpdates);

          // PR body should not be excessively long
          // GitHub has a limit of 65536 characters for PR body
          expect(prBody.length).toBeLessThan(65536);

          // For typical updates, should be under 10KB
          const allUpdates = fileUpdates.flatMap(file => file.updates);
          if (allUpdates.length <= 10) {
            expect(prBody.length).toBeLessThan(10000);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 20.15: PR body correctly formats repository links
   * 
   * For any set of file updates, repository URLs should be formatted
   * as Markdown links with readable names.
   */
  it('should format repository URLs as Markdown links', () => {
    fc.assert(
      fc.property(
        arbMultipleFileUpdates,
        (fileUpdates) => {
          const config = createMockConfig();
          const octokit = createMockOctokit();
          const prManager = new PullRequestManager(octokit, config);

          const prBody = prManager.generatePRBody(fileUpdates);

          // Collect all unique repository URLs
          const allUpdates = fileUpdates.flatMap(file => file.updates);
          const repoURLs = [...new Set(allUpdates.map(update => update.dependency.repoURL))];

          // Each repository URL should be formatted as a Markdown link: [text](url)
          for (const repoURL of repoURLs) {
            // Check for Markdown link format
            const linkPattern = new RegExp(`\\[.+?\\]\\(${repoURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`);
            expect(prBody).toMatch(linkPattern);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });
});
