/**
 * Unit tests for VersionResolver ignore rule filtering
 */

import axios from 'axios';
import { VersionResolver } from '../../../src/resolver/version-resolver';
import { ActionConfig } from '../../../src/types/config';
import { HelmDependency } from '../../../src/types/dependency';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VersionResolver - Ignore Rules', () => {
  let config: ActionConfig;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create default config
    config = {
      includePaths: ['**/*.yaml'],
      excludePaths: [],
      updateStrategy: 'all',
      registryCredentials: [],
      prStrategy: 'single',
      prLabels: [],
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
        updateTypes: [],
        requireCIPass: true,
        requireApprovals: 0,
      },
      openPullRequestsLimit: 10,
      rebaseStrategy: 'auto',
      dryRun: false,
      logLevel: 'info',
      githubToken: 'test-token',
    };

    // Mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn(),
        },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
  });

  describe('ignore by dependency name', () => {
    it('should ignore dependency by exact name match', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0
    - name: nginx
      version: 15.8.0
  postgresql:
    - name: postgresql
      version: 12.5.0
    - name: postgresql
      version: 12.4.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/postgresql.yaml',
          documentIndex: 0,
          chartName: 'postgresql',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '12.4.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should only return update for postgresql, nginx is ignored
      expect(updates).toHaveLength(1);
      expect(updates[0].dependency.chartName).toBe('postgresql');
      expect(updates[0].newVersion).toBe('12.5.0');

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        'Ignoring dependency nginx (matched ignore rule)'
      );

      consoleInfoSpy.mockRestore();
    });

    it('should not ignore dependency with different name', async () => {
      config.ignore = [
        {
          dependencyName: 'redis',
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0
    - name: nginx
      version: 15.8.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should return update for nginx since redis is ignored, not nginx
      expect(updates).toHaveLength(1);
      expect(updates[0].dependency.chartName).toBe('nginx');
      expect(updates[0].newVersion).toBe('15.9.0');
    });

    it('should ignore multiple dependencies by name', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
        },
        {
          dependencyName: 'postgresql',
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0
  postgresql:
    - name: postgresql
      version: 12.5.0
  redis:
    - name: redis
      version: 7.0.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/postgresql.yaml',
          documentIndex: 0,
          chartName: 'postgresql',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '12.4.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/redis.yaml',
          documentIndex: 0,
          chartName: 'redis',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '6.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should only return update for redis
      expect(updates).toHaveLength(1);
      expect(updates[0].dependency.chartName).toBe('redis');
    });
  });

  describe('ignore by version patterns', () => {
    it('should ignore exact version match', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          versions: ['16.0.0'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.9.0
    - name: nginx
      version: 15.8.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should update to 15.9.0, skipping 16.0.0
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.9.0');

      consoleInfoSpy.mockRestore();
    });

    it('should ignore version range using semver pattern', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          versions: ['>=16.0.0 <17.0.0'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 17.0.0
    - name: nginx
      version: 16.5.0
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.9.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.9.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should update to 17.0.0, skipping 16.x versions
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('17.0.0');
    });

    it('should ignore wildcard version pattern (major.x)', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          versions: ['16.x'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 17.0.0
    - name: nginx
      version: 16.5.0
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.9.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.9.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should update to 17.0.0, skipping all 16.x versions
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('17.0.0');
    });

    it('should ignore wildcard version pattern with asterisk (major.*)', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          versions: ['16.*'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 17.0.0
    - name: nginx
      version: 16.5.0
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.9.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.9.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should update to 17.0.0, skipping all 16.* versions
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('17.0.0');
    });

    it('should ignore multiple version patterns', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          versions: ['16.0.0', '15.10.0'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.10.0
    - name: nginx
      version: 15.9.0
    - name: nginx
      version: 15.8.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should update to 15.9.0, skipping 16.0.0 and 15.10.0
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.9.0');
    });
  });

  describe('ignore by update types', () => {
    it('should ignore major updates only', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          updateTypes: ['major'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.10.0
    - name: nginx
      version: 15.9.1
    - name: nginx
      version: 15.9.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.9.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should update to 15.10.0 (minor), skipping 16.0.0 (major)
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.10.0');

      consoleInfoSpy.mockRestore();
    });

    it('should ignore minor updates only', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          updateTypes: ['minor'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.10.0
    - name: nginx
      version: 15.9.1
    - name: nginx
      version: 15.9.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.9.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should update to 16.0.0 (major), skipping 15.10.0 (minor)
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('16.0.0');
    });

    it('should ignore patch updates only', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          updateTypes: ['patch'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.10.0
    - name: nginx
      version: 15.9.1
    - name: nginx
      version: 15.9.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.9.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should update to 16.0.0 (major), skipping 15.9.1 (patch)
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('16.0.0');
    });

    it('should ignore multiple update types', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          updateTypes: ['major', 'minor'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.10.0
    - name: nginx
      version: 15.9.1
    - name: nginx
      version: 15.9.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.9.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should update to 15.9.1 (patch), skipping major and minor
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.9.1');
    });
  });

  describe('combined ignore rules', () => {
    it('should apply both version and update type filters', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          versions: ['16.0.0'],
          updateTypes: ['minor'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 17.0.0
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.10.0
    - name: nginx
      version: 15.9.1
    - name: nginx
      version: 15.9.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.9.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should update to 17.0.0, skipping 16.0.0 (version) and 15.10.0 (minor)
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('17.0.0');
    });

    it('should handle multiple ignore rules for different dependencies', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          updateTypes: ['major'],
        },
        {
          dependencyName: 'postgresql',
          versions: ['13.x'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.10.0
  postgresql:
    - name: postgresql
      version: 13.5.0
    - name: postgresql
      version: 12.5.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.9.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/postgresql.yaml',
          documentIndex: 0,
          chartName: 'postgresql',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '12.4.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // nginx: should update to 15.10.0 (minor), skipping 16.0.0 (major)
      // postgresql: should update to 12.5.0, skipping 13.5.0 (13.x)
      expect(updates).toHaveLength(2);
      expect(updates[0].dependency.chartName).toBe('nginx');
      expect(updates[0].newVersion).toBe('15.10.0');
      expect(updates[1].dependency.chartName).toBe('postgresql');
      expect(updates[1].newVersion).toBe('12.5.0');
    });
  });

  describe('edge cases', () => {
    it('should handle empty ignore rules', async () => {
      config.ignore = [];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0
    - name: nginx
      version: 15.8.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should return update normally
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.9.0');
    });

    it('should handle ignore rule with empty versions array', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          versions: [],
          updateTypes: ['major'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.10.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.9.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should still apply updateTypes filter
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.10.0');
    });

    it('should handle ignore rule with empty updateTypes array', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          versions: ['16.0.0'],
          updateTypes: [],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.10.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.9.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should still apply version filter
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.10.0');
    });

    it('should handle invalid version pattern gracefully', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          versions: ['invalid-pattern'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0
    - name: nginx
      version: 15.8.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should not match invalid pattern, return update normally
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.9.0');
    });

    it('should work with OCI registry dependencies', async () => {
      config.ignore = [
        {
          dependencyName: 'bitnami/nginx',
          updateTypes: ['major'],
        },
      ];

      const mockTagsResponse = {
        name: 'bitnami/nginx',
        tags: ['16.0.0', '15.10.0', '15.9.0'],
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: mockTagsResponse,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'bitnami/nginx',
          repoURL: 'oci://registry-1.docker.io',
          repoType: 'oci',
          currentVersion: '15.9.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // Should update to 15.10.0 (minor), skipping 16.0.0 (major)
      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.10.0');
    });

    it('should not return any updates when all versions are ignored', async () => {
      config.ignore = [
        {
          dependencyName: 'nginx',
          versions: ['15.9.0', '15.10.0', '16.0.0'],
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.10.0
    - name: nginx
      version: 15.9.0
    - name: nginx
      version: 15.8.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      // All newer versions are ignored
      expect(updates).toEqual([]);
    });
  });
});
