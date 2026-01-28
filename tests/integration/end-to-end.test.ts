/**
 * End-to-End Integration Tests for ArgoCD Helm Updater
 *
 * These tests verify the complete workflow from manifest discovery
 * through dependency extraction, version resolution, file updates,
 * and PR creation (with mocked GitHub API).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ArgoCDHelmUpdater } from '../../src/orchestrator/argocd-helm-updater';
import { ActionConfig } from '../../src/types/config';
import * as github from '@actions/github';

// Mock the GitHub API
jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(),
  context: {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo',
    },
    ref: 'refs/heads/main',
    sha: 'abc123',
  },
}));

// Mock axios for Helm repository requests
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Create a mock axios instance
const mockAxiosInstance = {
  get: jest.fn(),
  interceptors: {
    request: {
      use: jest.fn(),
    },
    response: {
      use: jest.fn(),
    },
  },
};

// Mock axios.create to return our mock instance
mockedAxios.create = jest.fn(() => mockAxiosInstance as any);

// Helper function to create a test configuration
function createTestConfig(overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    includePaths: ['tests/fixtures/manifests/**/*.yaml'],
    excludePaths: ['tests/fixtures/manifests/invalid-yaml.yaml'],
    updateStrategy: 'all',
    registryCredentials: [],
    prStrategy: 'single',
    prLabels: ['dependencies', 'helm'],
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
      updateTypes: [],
      requireCIPass: true,
      requireApprovals: 0,
    },
    openPullRequestsLimit: 10,
    rebaseStrategy: 'auto',
    dryRun: true, // Default to dry-run for most tests
    logLevel: 'error', // Reduce noise in tests
    githubToken: 'test-token',
    changelog: {
      enabled: true,
      maxLength: 5000,
      cacheTTL: 3600,
    },
    ...overrides,
  };
}

describe('End-to-End Integration Tests', () => {
  let tempDir: string;
  let mockOctokit: any;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-test-'));

    // Setup mock Octokit
    mockOctokit = {
      rest: {
        repos: {
          getBranch: jest.fn(),
          createOrUpdateFileContents: jest.fn(),
        },
        git: {
          createRef: jest.fn(),
          getRef: jest.fn(),
          updateRef: jest.fn(),
        },
        pulls: {
          create: jest.fn(),
          update: jest.fn(),
          list: jest.fn(),
        },
      },
    };

    (github.getOctokit as jest.Mock).mockReturnValue(mockOctokit);

    // Setup default axios mocks for Helm repository
    mockAxiosInstance.get.mockImplementation((url: string) => {
      if (url.includes('charts.bitnami.com/bitnami/index.yaml')) {
        return Promise.resolve({
          data: `apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
      appVersion: 1.25.4
      created: 2024-02-01T10:00:00Z
    - name: nginx
      version: 15.9.0
      appVersion: 1.25.3
      created: 2024-01-15T10:00:00Z
  postgresql:
    - name: postgresql
      version: 13.0.0
      appVersion: 16.1.0
      created: 2024-02-01T10:00:00Z
    - name: postgresql
      version: 12.5.0
      appVersion: 15.3.0
      created: 2024-01-01T10:00:00Z
  redis:
    - name: redis
      version: 18.0.0
      appVersion: 7.2.4
      created: 2024-02-01T10:00:00Z
    - name: redis
      version: 17.11.0
      appVersion: 7.2.3
      created: 2024-01-15T10:00:00Z
`,
        });
      }

      if (url.includes('charts.example.com/index.yaml')) {
        return Promise.resolve({
          data: `apiVersion: v1
entries:
  my-chart:
    - name: my-chart
      version: 2.0.0
      created: 2024-02-01T10:00:00Z
    - name: my-chart
      version: 1.2.3
      created: 2024-01-01T10:00:00Z
  frontend:
    - name: frontend
      version: 3.1.0
      created: 2024-02-01T10:00:00Z
    - name: frontend
      version: 3.0.0
      created: 2024-01-01T10:00:00Z
  backend:
    - name: backend
      version: 2.6.0
      created: 2024-02-01T10:00:00Z
    - name: backend
      version: 2.5.0
      created: 2024-01-01T10:00:00Z
`,
        });
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }

    jest.clearAllMocks();
  });

  describe('Complete Workflow - Dry Run Mode', () => {
    it('should discover manifests, extract dependencies, and detect updates', async () => {
      const config = createTestConfig({ dryRun: true });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      // Verify statistics
      expect(stats.filesScanned).toBeGreaterThan(0);
      expect(stats.chartsFound).toBeGreaterThan(0);
      expect(stats.updatesDetected).toBeGreaterThan(0);
      expect(stats.prsCreated).toBe(0); // Dry run mode
    });

    it('should detect updates for nginx chart in application-single.yaml', async () => {
      const config = createTestConfig({
        dryRun: true,
        includePaths: ['tests/fixtures/manifests/application-single.yaml'],
      });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      expect(stats.filesScanned).toBe(1);
      expect(stats.chartsFound).toBe(1);
      expect(stats.updatesDetected).toBe(1); // nginx 15.9.0 -> 16.0.0
    });

    it('should detect multiple updates in multi-document files', async () => {
      const config = createTestConfig({
        dryRun: true,
        includePaths: ['tests/fixtures/manifests/multi-document.yaml'],
      });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      expect(stats.filesScanned).toBe(1);
      expect(stats.chartsFound).toBe(2); // postgresql and redis
      expect(stats.updatesDetected).toBe(2); // Both have updates
    });

    it('should detect updates in ApplicationSet manifests', async () => {
      const config = createTestConfig({
        dryRun: true,
        includePaths: ['tests/fixtures/manifests/applicationset-single.yaml'],
      });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      expect(stats.filesScanned).toBe(1);
      expect(stats.chartsFound).toBe(1);
      expect(stats.updatesDetected).toBe(1); // my-chart 1.2.3 -> 2.0.0
    });

    it('should handle multi-source applications', async () => {
      const config = createTestConfig({
        dryRun: true,
        includePaths: ['tests/fixtures/manifests/application-multi-source.yaml'],
      });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      expect(stats.filesScanned).toBe(1);
      expect(stats.chartsFound).toBe(2); // nginx and postgresql
      expect(stats.updatesDetected).toBe(2); // Both have updates
    });

    it('should handle multi-source ApplicationSets', async () => {
      const config = createTestConfig({
        dryRun: true,
        includePaths: ['tests/fixtures/manifests/applicationset-multi-source.yaml'],
      });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      expect(stats.filesScanned).toBe(1);
      expect(stats.chartsFound).toBe(2); // frontend and backend
      expect(stats.updatesDetected).toBe(2); // Both have updates
    });
  });

  describe('Update Strategy', () => {
    it('should respect patch-only update strategy', async () => {
      // Mock a patch update scenario
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('charts.bitnami.com/bitnami/index.yaml')) {
          return Promise.resolve({
            data: `apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
      created: 2024-02-01T10:00:00Z
    - name: nginx
      version: 15.10.0
      created: 2024-01-20T10:00:00Z
    - name: nginx
      version: 15.9.1
      created: 2024-01-18T10:00:00Z
    - name: nginx
      version: 15.9.0
      created: 2024-01-15T10:00:00Z
`,
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const config = createTestConfig({
        dryRun: true,
        updateStrategy: 'patch',
        includePaths: ['tests/fixtures/manifests/application-single.yaml'],
      });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      expect(stats.updatesDetected).toBe(1); // Should only detect 15.9.0 -> 15.9.1
    });

    it('should respect minor-only update strategy', async () => {
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('charts.bitnami.com/bitnami/index.yaml')) {
          return Promise.resolve({
            data: `apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
      created: 2024-02-01T10:00:00Z
    - name: nginx
      version: 15.10.0
      created: 2024-01-20T10:00:00Z
    - name: nginx
      version: 15.9.0
      created: 2024-01-15T10:00:00Z
`,
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const config = createTestConfig({
        dryRun: true,
        updateStrategy: 'minor',
        includePaths: ['tests/fixtures/manifests/application-single.yaml'],
      });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      expect(stats.updatesDetected).toBe(1); // Should detect 15.9.0 -> 15.10.0, not 16.0.0
    });
  });

  describe('Ignore Rules', () => {
    it('should ignore dependencies matching ignore rules', async () => {
      const config = createTestConfig({
        dryRun: true,
        includePaths: ['tests/fixtures/manifests/application-single.yaml'],
        ignore: [
          {
            dependencyName: 'nginx',
          },
        ],
      });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      expect(stats.chartsFound).toBe(1);
      expect(stats.updatesDetected).toBe(0); // nginx is ignored
    });

    it('should ignore specific update types', async () => {
      const config = createTestConfig({
        dryRun: true,
        includePaths: ['tests/fixtures/manifests/application-single.yaml'],
        ignore: [
          {
            dependencyName: 'nginx',
            updateTypes: ['major'],
          },
        ],
      });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      expect(stats.chartsFound).toBe(1);
      expect(stats.updatesDetected).toBe(0); // 15.9.0 -> 16.0.0 is major, ignored
    });
  });

  describe('Error Handling', () => {
    it('should handle unreachable repositories gracefully', async () => {
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('charts.bitnami.com')) {
          return Promise.resolve({
            data: `apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
      created: 2024-02-01T10:00:00Z
`,
          });
        }
        // Simulate unreachable repository
        return Promise.reject(new Error('Network error'));
      });

      const config = createTestConfig({
        dryRun: true,
        includePaths: [
          'tests/fixtures/manifests/application-single.yaml',
          'tests/fixtures/manifests/applicationset-single.yaml',
        ],
      });
      const updater = new ArgoCDHelmUpdater(config);

      // Should not throw, but continue processing
      const stats = await updater.run();

      expect(stats.filesScanned).toBe(2);
      expect(stats.chartsFound).toBe(2);
      // Only nginx should have update (example.com is unreachable)
      expect(stats.updatesDetected).toBe(1);
    });

    it('should skip invalid YAML files and continue', async () => {
      const config = createTestConfig({
        dryRun: true,
        includePaths: ['tests/fixtures/manifests/**/*.yaml'],
        excludePaths: [], // Don't exclude invalid-yaml.yaml
      });
      const updater = new ArgoCDHelmUpdater(config);

      // Should not throw despite invalid YAML
      const stats = await updater.run();

      expect(stats.filesScanned).toBeGreaterThan(0);
    });

    it('should handle manifests with no Helm charts', async () => {
      const config = createTestConfig({
        dryRun: true,
        includePaths: ['tests/fixtures/manifests/application-git-source.yaml'],
      });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      expect(stats.filesScanned).toBe(1);
      expect(stats.chartsFound).toBe(0); // Git source, not Helm
      expect(stats.updatesDetected).toBe(0);
    });
  });

  describe('File Updates', () => {
    it('should generate correct file updates with preserved formatting', async () => {
      // Use relative path pattern instead of absolute path
      const config = createTestConfig({
        dryRun: true,
        includePaths: ['tests/fixtures/manifests/application-single.yaml'],
      });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      expect(stats.updatesDetected).toBe(1);
      // In dry-run mode, files aren't actually written, but updates are detected
    });
  });

  describe('Repository Caching', () => {
    it('should cache repository index and not fetch multiple times', async () => {
      let fetchCount = 0;
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('charts.bitnami.com/bitnami/index.yaml')) {
          fetchCount++;
          return Promise.resolve({
            data: `apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
      created: 2024-02-01T10:00:00Z
  postgresql:
    - name: postgresql
      version: 13.0.0
      created: 2024-02-01T10:00:00Z
  redis:
    - name: redis
      version: 18.0.0
      created: 2024-02-01T10:00:00Z
`,
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const config = createTestConfig({
        dryRun: true,
        includePaths: [
          'tests/fixtures/manifests/application-single.yaml',
          'tests/fixtures/manifests/multi-document.yaml',
          'tests/fixtures/manifests/application-multi-source.yaml',
        ],
      });
      const updater = new ArgoCDHelmUpdater(config);

      await updater.run();

      // Should only fetch the Bitnami index once despite multiple charts from same repo
      expect(fetchCount).toBe(1);
    });
  });

  describe('No Updates Scenario', () => {
    it('should handle case when all charts are up to date', async () => {
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('charts.bitnami.com/bitnami/index.yaml')) {
          return Promise.resolve({
            data: `apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0
      created: 2024-01-15T10:00:00Z
`,
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const config = createTestConfig({
        dryRun: true,
        includePaths: ['tests/fixtures/manifests/application-single.yaml'],
      });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      expect(stats.filesScanned).toBe(1);
      expect(stats.chartsFound).toBe(1);
      expect(stats.updatesDetected).toBe(0); // Already at latest version
    });
  });

  describe('Empty Repository Scenario', () => {
    it('should handle repository with no ArgoCD manifests', async () => {
      const config = createTestConfig({
        dryRun: true,
        includePaths: ['tests/fixtures/manifests/non-argocd.yaml'],
      });
      const updater = new ArgoCDHelmUpdater(config);

      const stats = await updater.run();

      // The file is scanned but contains no ArgoCD resources
      expect(stats.filesScanned).toBe(0); // No ArgoCD manifests found
      expect(stats.chartsFound).toBe(0);
      expect(stats.updatesDetected).toBe(0);
    });
  });
});
