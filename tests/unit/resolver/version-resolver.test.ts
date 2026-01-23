/**
 * Unit tests for VersionResolver class
 */

import axios from 'axios';
import { VersionResolver } from '../../../src/resolver/version-resolver';
import { ActionConfig } from '../../../src/types/config';
import { HelmDependency } from '../../../src/types/dependency';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VersionResolver', () => {
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

  describe('constructor', () => {
    it('should create VersionResolver with default configuration', () => {
      const resolver = new VersionResolver(config);

      expect(resolver).toBeInstanceOf(VersionResolver);
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
          headers: {
            'User-Agent': 'argocd-helm-updater/1.0.0',
          },
          maxRedirects: 5,
        })
      );
    });

    it('should set up request interceptor for authentication', () => {
      new VersionResolver(config);

      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });
  });

  describe('fetchHelmRepoIndex', () => {
    it('should fetch and parse Helm repository index', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0
      appVersion: 1.25.3
      created: 2024-01-15T10:30:00Z
      digest: sha256:abc123
    - name: nginx
      version: 15.8.0
      appVersion: 1.25.2
      created: 2024-01-01T10:30:00Z
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

      const versionMap = await resolver.resolveVersions(dependencies);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://charts.bitnami.com/bitnami/index.yaml'
      );

      const versions = versionMap.get(
        'https://charts.bitnami.com/bitnami/nginx'
      );
      expect(versions).toBeDefined();
      expect(versions).toHaveLength(2);
      expect(versions![0].version).toBe('15.9.0');
      expect(versions![0].appVersion).toBe('1.25.3');
    });

    it('should normalize repository URL with trailing slash', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx: []
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
          repoURL: 'https://charts.bitnami.com/bitnami/',
          repoType: 'helm',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      await resolver.resolveVersions(dependencies);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://charts.bitnami.com/bitnami/index.yaml'
      );
    });

    it('should handle repository URL already ending with index.yaml', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx: []
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
          repoURL: 'https://charts.bitnami.com/bitnami/index.yaml',
          repoType: 'helm',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      await resolver.resolveVersions(dependencies);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://charts.bitnami.com/bitnami/index.yaml'
      );
    });

    it('should throw error for invalid Helm index structure', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: 'invalid: yaml: structure',
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

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log error and continue, returning empty map
      expect(versionMap.size).toBe(0);
    });

    it('should handle network errors gracefully', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

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

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log error and continue, returning empty map
      expect(versionMap.size).toBe(0);
    });
  });

  describe('fetchOCITags', () => {
    it('should fetch OCI registry tags', async () => {
      const mockTagsResponse = {
        name: 'bitnami/nginx',
        tags: ['15.9.0', '15.8.0', '15.7.0'],
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
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://registry-1.docker.io/v2/bitnami/nginx/tags/list'
      );

      const versions = versionMap.get(
        'oci://registry-1.docker.io/bitnami/nginx'
      );
      expect(versions).toBeDefined();
      expect(versions).toHaveLength(3);
      expect(versions![0].version).toBe('15.9.0');
    });

    it('should handle OCI URL without oci:// prefix', async () => {
      const mockTagsResponse = {
        name: 'bitnami/nginx',
        tags: ['15.9.0'],
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
          repoURL: 'registry-1.docker.io',
          repoType: 'oci',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      await resolver.resolveVersions(dependencies);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://registry-1.docker.io/v2/bitnami/nginx/tags/list'
      );
    });

    it('should handle OCI registry errors gracefully', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Registry error'));

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'bitnami/nginx',
          repoURL: 'oci://registry-1.docker.io',
          repoType: 'oci',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log error and continue, returning empty map
      expect(versionMap.size).toBe(0);
    });

    it('should handle GitHub Container Registry (GHCR)', async () => {
      const mockTagsResponse = {
        name: 'myorg/mychart',
        tags: ['1.0.0', '1.0.1', '1.1.0'],
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: mockTagsResponse,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/mychart.yaml',
          documentIndex: 0,
          chartName: 'myorg/mychart',
          repoURL: 'oci://ghcr.io',
          repoType: 'oci',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://ghcr.io/v2/myorg/mychart/tags/list'
      );

      const versions = versionMap.get('oci://ghcr.io/myorg/mychart');
      expect(versions).toBeDefined();
      expect(versions).toHaveLength(3);
    });

    it('should handle AWS ECR registry', async () => {
      const mockTagsResponse = {
        name: 'my-chart',
        tags: ['2.0.0', '2.1.0'],
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: mockTagsResponse,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/mychart.yaml',
          documentIndex: 0,
          chartName: 'my-chart',
          repoURL: 'oci://123456789012.dkr.ecr.us-east-1.amazonaws.com',
          repoType: 'oci',
          currentVersion: '2.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://123456789012.dkr.ecr.us-east-1.amazonaws.com/v2/my-chart/tags/list'
      );

      const versions = versionMap.get(
        'oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/my-chart'
      );
      expect(versions).toBeDefined();
      expect(versions).toHaveLength(2);
    });

    it('should handle Azure Container Registry (ACR)', async () => {
      const mockTagsResponse = {
        name: 'helm/mychart',
        tags: ['3.0.0', '3.1.0', '3.2.0'],
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: mockTagsResponse,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/mychart.yaml',
          documentIndex: 0,
          chartName: 'helm/mychart',
          repoURL: 'oci://myregistry.azurecr.io',
          repoType: 'oci',
          currentVersion: '3.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://myregistry.azurecr.io/v2/helm/mychart/tags/list'
      );

      const versions = versionMap.get(
        'oci://myregistry.azurecr.io/helm/mychart'
      );
      expect(versions).toBeDefined();
      expect(versions).toHaveLength(3);
    });

    it('should handle Google Artifact Registry (GAR)', async () => {
      const mockTagsResponse = {
        name: 'my-project/helm-charts/mychart',
        tags: ['4.0.0', '4.1.0'],
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: mockTagsResponse,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/mychart.yaml',
          documentIndex: 0,
          chartName: 'my-project/helm-charts/mychart',
          repoURL: 'oci://us-central1-docker.pkg.dev',
          repoType: 'oci',
          currentVersion: '4.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://us-central1-docker.pkg.dev/v2/my-project/helm-charts/mychart/tags/list'
      );

      const versions = versionMap.get(
        'oci://us-central1-docker.pkg.dev/my-project/helm-charts/mychart'
      );
      expect(versions).toBeDefined();
      expect(versions).toHaveLength(2);
    });

    it('should handle OCI URL with trailing slash', async () => {
      const mockTagsResponse = {
        name: 'bitnami/nginx',
        tags: ['15.9.0'],
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
          repoURL: 'oci://registry-1.docker.io/',
          repoType: 'oci',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      await resolver.resolveVersions(dependencies);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://registry-1.docker.io/v2/bitnami/nginx/tags/list'
      );
    });

    it('should handle OCI registry with nested chart paths', async () => {
      const mockTagsResponse = {
        name: 'org/team/project/chart',
        tags: ['1.0.0', '1.1.0'],
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: mockTagsResponse,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/mychart.yaml',
          documentIndex: 0,
          chartName: 'org/team/project/chart',
          repoURL: 'oci://registry.example.com',
          repoType: 'oci',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://registry.example.com/v2/org/team/project/chart/tags/list'
      );

      const versions = versionMap.get(
        'oci://registry.example.com/org/team/project/chart'
      );
      expect(versions).toBeDefined();
      expect(versions).toHaveLength(2);
    });

    it('should handle OCI registry with authentication', async () => {
      config.registryCredentials = [
        {
          registry: 'registry.example.com',
          authType: 'bearer',
          password: 'test-token',
        },
      ];

      const mockTagsResponse = {
        name: 'private/chart',
        tags: ['1.0.0'],
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: mockTagsResponse,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/mychart.yaml',
          documentIndex: 0,
          chartName: 'private/chart',
          repoURL: 'oci://registry.example.com',
          repoType: 'oci',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      await resolver.resolveVersions(dependencies);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://registry.example.com/v2/private/chart/tags/list'
      );
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });

    it('should handle OCI registry 401 authentication error', async () => {
      const authError = new Error('Authentication failed');
      (authError as any).isAxiosError = true;
      (authError as any).response = { status: 401 };

      mockAxiosInstance.get.mockRejectedValue(authError);

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'bitnami/nginx',
          repoURL: 'oci://registry-1.docker.io',
          repoType: 'oci',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      expect(versionMap.size).toBe(0);
    });

    it('should handle OCI registry 404 not found error', async () => {
      const notFoundError = new Error('Chart not found');
      (notFoundError as any).isAxiosError = true;
      (notFoundError as any).response = { status: 404 };

      mockAxiosInstance.get.mockRejectedValue(notFoundError);

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nonexistent/chart',
          repoURL: 'oci://registry-1.docker.io',
          repoType: 'oci',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      expect(versionMap.size).toBe(0);
    });

    it('should handle OCI registry timeout error', async () => {
      const timeoutError = new Error('Timeout');
      (timeoutError as any).isAxiosError = true;
      (timeoutError as any).code = 'ECONNABORTED';

      mockAxiosInstance.get.mockRejectedValue(timeoutError);

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'bitnami/nginx',
          repoURL: 'oci://registry-1.docker.io',
          repoType: 'oci',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      expect(versionMap.size).toBe(0);
    });

    it('should handle OCI response with null tags', async () => {
      const mockTagsResponse = {
        name: 'bitnami/nginx',
        tags: null,
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
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      const versions = versionMap.get(
        'oci://registry-1.docker.io/bitnami/nginx'
      );
      expect(versions).toEqual([]);
    });

    it('should handle OCI response with undefined tags', async () => {
      const mockTagsResponse = {
        name: 'bitnami/nginx',
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
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      const versions = versionMap.get(
        'oci://registry-1.docker.io/bitnami/nginx'
      );
      expect(versions).toEqual([]);
    });

    it('should handle multiple OCI charts from same registry', async () => {
      const mockNginxResponse = {
        name: 'bitnami/nginx',
        tags: ['15.9.0', '15.8.0'],
      };

      const mockPostgresResponse = {
        name: 'bitnami/postgresql',
        tags: ['12.5.0', '12.4.0'],
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: mockNginxResponse })
        .mockResolvedValueOnce({ data: mockPostgresResponse });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'bitnami/nginx',
          repoURL: 'oci://registry-1.docker.io',
          repoType: 'oci',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/postgresql.yaml',
          documentIndex: 0,
          chartName: 'bitnami/postgresql',
          repoURL: 'oci://registry-1.docker.io',
          repoType: 'oci',
          currentVersion: '12.4.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should fetch tags for each chart separately
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://registry-1.docker.io/v2/bitnami/nginx/tags/list'
      );
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        'https://registry-1.docker.io/v2/bitnami/postgresql/tags/list'
      );

      const nginxVersions = versionMap.get(
        'oci://registry-1.docker.io/bitnami/nginx'
      );
      const postgresVersions = versionMap.get(
        'oci://registry-1.docker.io/bitnami/postgresql'
      );

      expect(nginxVersions).toHaveLength(2);
      expect(postgresVersions).toHaveLength(2);
    });

    it('should cache OCI tags between calls', async () => {
      const mockTagsResponse = {
        name: 'bitnami/nginx',
        tags: ['15.9.0'],
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
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      // First call
      await resolver.resolveVersions(dependencies);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await resolver.resolveVersions(dependencies);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

      const stats = resolver.getCacheStats();
      expect(stats.ociTagsCacheSize).toBe(1);
    });
  });

  describe('caching', () => {
    it('should cache Helm repository index', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
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
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      // First call
      await resolver.resolveVersions(dependencies);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await resolver.resolveVersions(dependencies);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

      const stats = resolver.getCacheStats();
      expect(stats.helmIndexCacheSize).toBe(1);
    });

    it('should cache OCI registry tags', async () => {
      const mockTagsResponse = {
        name: 'bitnami/nginx',
        tags: ['15.9.0'],
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
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      // First call
      await resolver.resolveVersions(dependencies);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await resolver.resolveVersions(dependencies);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

      const stats = resolver.getCacheStats();
      expect(stats.ociTagsCacheSize).toBe(1);
    });

    it('should clear cache when requested', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
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
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      // First call
      await resolver.resolveVersions(dependencies);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

      // Clear cache
      resolver.clearCache();

      // Second call should fetch again
      await resolver.resolveVersions(dependencies);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);

      const stats = resolver.getCacheStats();
      expect(stats.helmIndexCacheSize).toBe(1);
    });

    it('should group dependencies by repository to minimize requests', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0
  postgresql:
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

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should only fetch index once for both charts
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

      // Both charts should have versions
      expect(
        versionMap.get('https://charts.bitnami.com/bitnami/nginx')
      ).toBeDefined();
      expect(
        versionMap.get('https://charts.bitnami.com/bitnami/postgresql')
      ).toBeDefined();
    });
  });

  describe('authentication', () => {
    it('should add HTTP Basic Auth for matching credentials', async () => {
      config.registryCredentials = [
        {
          registry: 'charts.example.com',
          authType: 'basic',
          username: 'testuser',
          password: 'testpass',
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  mychart: []
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/mychart.yaml',
          documentIndex: 0,
          chartName: 'mychart',
          repoURL: 'https://charts.example.com',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      await resolver.resolveVersions(dependencies);

      // Verify interceptor was set up
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });

    it('should add Bearer token authentication for matching credentials', async () => {
      config.registryCredentials = [
        {
          registry: 'charts.example.com',
          authType: 'bearer',
          password: 'test-bearer-token',
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  mychart: []
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/mychart.yaml',
          documentIndex: 0,
          chartName: 'mychart',
          repoURL: 'https://charts.example.com',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      await resolver.resolveVersions(dependencies);

      // Verify interceptor was set up
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });

    it('should default to basic auth when authType is not specified', async () => {
      config.registryCredentials = [
        {
          registry: 'charts.example.com',
          username: 'testuser',
          password: 'testpass',
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  mychart: []
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/mychart.yaml',
          documentIndex: 0,
          chartName: 'mychart',
          repoURL: 'https://charts.example.com',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      await resolver.resolveVersions(dependencies);

      // Verify interceptor was set up
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });

    it('should not add auth for non-matching URLs', async () => {
      config.registryCredentials = [
        {
          registry: 'charts.example.com',
          username: 'testuser',
          password: 'testpass',
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx: []
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

      await resolver.resolveVersions(dependencies);

      // Should still work without auth
      expect(mockAxiosInstance.get).toHaveBeenCalled();
    });

    it('should support multiple registry credentials', async () => {
      config.registryCredentials = [
        {
          registry: 'charts.example.com',
          authType: 'basic',
          username: 'user1',
          password: 'pass1',
        },
        {
          registry: 'registry.example.com',
          authType: 'bearer',
          password: 'token123',
        },
      ];

      const mockIndexYAML = `
apiVersion: v1
entries:
  mychart: []
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/mychart.yaml',
          documentIndex: 0,
          chartName: 'mychart',
          repoURL: 'https://charts.example.com',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      await resolver.resolveVersions(dependencies);

      // Verify interceptor was set up
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });
  });

  describe('checkForUpdates', () => {
    it('should return empty array when no updates available', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
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

      expect(updates).toEqual([]);
    });

    it('should detect single update when newer version available', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0
      appVersion: 1.25.3
    - name: nginx
      version: 15.8.0
      appVersion: 1.25.2
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

      expect(updates).toHaveLength(1);
      expect(updates[0].dependency.chartName).toBe('nginx');
      expect(updates[0].currentVersion).toBe('15.8.0');
      expect(updates[0].newVersion).toBe('15.9.0');
    });

    it('should detect multiple updates when multiple newer versions available', async () => {
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

      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('16.0.0'); // Should select latest
    });

    it('should detect updates for multiple dependencies', async () => {
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

      expect(updates).toHaveLength(2);
      expect(updates[0].dependency.chartName).toBe('nginx');
      expect(updates[0].newVersion).toBe('15.9.0');
      expect(updates[1].dependency.chartName).toBe('postgresql');
      expect(updates[1].newVersion).toBe('12.5.0');
    });

    it('should not detect update when current version is latest', async () => {
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
          currentVersion: '15.9.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      expect(updates).toEqual([]);
    });

    it('should detect update across major version boundary', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
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

      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('16.0.0');
    });

    it('should detect update across minor version boundary', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.10.0
    - name: nginx
      version: 15.9.5
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
          currentVersion: '15.9.5',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.10.0');
    });

    it('should detect patch version update', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
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

      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.9.1');
    });

    it('should handle pre-release versions correctly', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 16.0.0-rc.1
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

      expect(updates).toHaveLength(1);
      // Should select stable release over pre-release
      expect(updates[0].newVersion).toBe('16.0.0');
    });

    it('should detect update from pre-release to stable', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 16.0.0-rc.1
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
          currentVersion: '16.0.0-rc.1',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('16.0.0');
    });

    it('should handle versions with build metadata', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0+build.123
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

      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.9.0+build.123');
    });

    it('should filter out invalid version strings', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0
    - name: nginx
      version: invalid-version
    - name: nginx
      version: 15.8.0
    - name: nginx
      version: not-semver
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

      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.9.0');
    });

    it('should handle invalid current version gracefully', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: 'invalid-version',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      expect(updates).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('invalid-version is not a valid semver')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle dependencies with no available versions', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  otherchart: []
`;

      mockAxiosInstance.get.mockResolvedValue({
        data: mockIndexYAML,
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

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

      expect(updates).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No versions found for nginx')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should detect updates for OCI registry charts', async () => {
      const mockTagsResponse = {
        name: 'bitnami/nginx',
        tags: ['15.9.0', '15.8.0', '15.7.0'],
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
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('15.9.0');
    });

    it('should handle mixed Helm and OCI dependencies', async () => {
      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0
    - name: nginx
      version: 15.8.0
`,
        })
        .mockResolvedValueOnce({
          data: {
            name: 'bitnami/postgresql',
            tags: ['12.5.0', '12.4.0'],
          },
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
          chartName: 'bitnami/postgresql',
          repoURL: 'oci://registry-1.docker.io',
          repoType: 'oci',
          currentVersion: '12.4.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      expect(updates).toHaveLength(2);
      expect(updates[0].dependency.chartName).toBe('nginx');
      expect(updates[0].newVersion).toBe('15.9.0');
      expect(updates[1].dependency.chartName).toBe('bitnami/postgresql');
      expect(updates[1].newVersion).toBe('12.5.0');
    });

    it('should handle empty dependencies list', async () => {
      const resolver = new VersionResolver(config);
      const updates = await resolver.checkForUpdates([]);

      expect(updates).toEqual([]);
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });

    it('should handle version comparison with large version numbers', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 100.200.300
    - name: nginx
      version: 99.999.999
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
          currentVersion: '99.999.999',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const updates = await resolver.checkForUpdates(dependencies);

      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('100.200.300');
    });

    it('should select latest when multiple major versions available', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 18.0.0
    - name: nginx
      version: 17.0.0
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

      expect(updates).toHaveLength(1);
      expect(updates[0].newVersion).toBe('18.0.0');
    });

    it('should not propose downgrade when only older versions available', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.8.0
    - name: nginx
      version: 15.7.0
    - name: nginx
      version: 15.6.0
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

      expect(updates).toEqual([]);
    });
  });

  describe('error handling for unreachable repositories', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should log error and continue when Helm repository is unreachable', async () => {
      const networkError = new Error('Network error: ECONNREFUSED');
      (networkError as any).isAxiosError = true;
      (networkError as any).code = 'ECONNREFUSED';

      mockAxiosInstance.get.mockRejectedValue(networkError);

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://unreachable.example.com/charts',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/postgres.yaml',
          documentIndex: 0,
          chartName: 'postgresql',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '12.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log error for unreachable repository
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch versions from https://unreachable.example.com/charts')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Network error: ECONNREFUSED')
      );

      // Should continue processing and attempt second repository
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      
      // First repository should have no versions due to error
      expect(versionMap.get('https://unreachable.example.com/charts/nginx')).toBeUndefined();
    });

    it('should handle HTTP 500 server error and continue processing', async () => {
      const serverError = new Error('Internal Server Error');
      (serverError as any).isAxiosError = true;
      (serverError as any).response = { status: 500 };

      mockAxiosInstance.get
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({
          data: `
apiVersion: v1
entries:
  postgresql:
    - name: postgresql
      version: 12.5.0
`,
        });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'nginx',
          repoURL: 'https://failing.example.com/charts',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/postgres.yaml',
          documentIndex: 0,
          chartName: 'postgresql',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '12.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log error for failing repository
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch versions from https://failing.example.com/charts')
      );

      // Should successfully process second repository
      const postgresVersions = versionMap.get('https://charts.bitnami.com/bitnami/postgresql');
      expect(postgresVersions).toBeDefined();
      expect(postgresVersions).toHaveLength(1);
      expect(postgresVersions![0].version).toBe('12.5.0');
    });

    it('should handle HTTP 404 not found error and continue processing', async () => {
      const notFoundError = new Error('Not Found');
      (notFoundError as any).isAxiosError = true;
      (notFoundError as any).response = { status: 404 };

      mockAxiosInstance.get
        .mockRejectedValueOnce(notFoundError)
        .mockResolvedValueOnce({
          data: `
apiVersion: v1
entries:
  redis:
    - name: redis
      version: 17.0.0
`,
        });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/missing.yaml',
          documentIndex: 0,
          chartName: 'nonexistent',
          repoURL: 'https://charts.example.com',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/redis.yaml',
          documentIndex: 0,
          chartName: 'redis',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '16.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log error for 404
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch versions from https://charts.example.com')
      );

      // Should successfully process second repository
      const redisVersions = versionMap.get('https://charts.bitnami.com/bitnami/redis');
      expect(redisVersions).toBeDefined();
      expect(redisVersions).toHaveLength(1);
    });

    it('should handle HTTP 401 unauthorized error and continue processing', async () => {
      const authError = new Error('Unauthorized');
      (authError as any).isAxiosError = true;
      (authError as any).response = { status: 401 };

      mockAxiosInstance.get
        .mockRejectedValueOnce(authError)
        .mockResolvedValueOnce({
          data: `
apiVersion: v1
entries:
  mysql:
    - name: mysql
      version: 9.0.0
`,
        });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/private.yaml',
          documentIndex: 0,
          chartName: 'private-chart',
          repoURL: 'https://private.example.com/charts',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/mysql.yaml',
          documentIndex: 0,
          chartName: 'mysql',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '8.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log error for auth failure
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch versions from https://private.example.com/charts')
      );

      // Should successfully process second repository
      const mysqlVersions = versionMap.get('https://charts.bitnami.com/bitnami/mysql');
      expect(mysqlVersions).toBeDefined();
      expect(mysqlVersions).toHaveLength(1);
    });

    it('should handle HTTP 403 forbidden error and continue processing', async () => {
      const forbiddenError = new Error('Forbidden');
      (forbiddenError as any).isAxiosError = true;
      (forbiddenError as any).response = { status: 403 };

      mockAxiosInstance.get
        .mockRejectedValueOnce(forbiddenError)
        .mockResolvedValueOnce({
          data: {
            name: 'bitnami/nginx',
            tags: ['15.9.0'],
          },
        });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/forbidden.yaml',
          documentIndex: 0,
          chartName: 'forbidden-chart',
          repoURL: 'https://forbidden.example.com/charts',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/nginx.yaml',
          documentIndex: 0,
          chartName: 'bitnami/nginx',
          repoURL: 'oci://registry-1.docker.io',
          repoType: 'oci',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log error for forbidden access
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch versions from https://forbidden.example.com/charts')
      );

      // Should successfully process OCI repository
      const nginxVersions = versionMap.get('oci://registry-1.docker.io/bitnami/nginx');
      expect(nginxVersions).toBeDefined();
      expect(nginxVersions).toHaveLength(1);
    });

    it('should handle connection timeout and continue processing', async () => {
      const timeoutError = new Error('Timeout of 30000ms exceeded');
      (timeoutError as any).isAxiosError = true;
      (timeoutError as any).code = 'ECONNABORTED';

      mockAxiosInstance.get
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({
          data: {
            name: 'bitnami/postgresql',
            tags: ['12.5.0', '12.4.0'],
          },
        });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/slow.yaml',
          documentIndex: 0,
          chartName: 'slow-chart',
          repoURL: 'https://slow.example.com/charts',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/postgres.yaml',
          documentIndex: 0,
          chartName: 'bitnami/postgresql',
          repoURL: 'oci://registry-1.docker.io',
          repoType: 'oci',
          currentVersion: '12.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log error for timeout
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch versions from https://slow.example.com/charts')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Timeout')
      );

      // Should successfully process OCI repository
      const postgresVersions = versionMap.get('oci://registry-1.docker.io/bitnami/postgresql');
      expect(postgresVersions).toBeDefined();
      expect(postgresVersions).toHaveLength(2);
    });

    it('should handle DNS resolution failure and continue processing', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND invalid.example.com');
      (dnsError as any).isAxiosError = true;
      (dnsError as any).code = 'ENOTFOUND';

      mockAxiosInstance.get
        .mockRejectedValueOnce(dnsError)
        .mockResolvedValueOnce({
          data: `
apiVersion: v1
entries:
  mongodb:
    - name: mongodb
      version: 13.0.0
`,
        });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/invalid.yaml',
          documentIndex: 0,
          chartName: 'some-chart',
          repoURL: 'https://invalid.example.com/charts',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/mongodb.yaml',
          documentIndex: 0,
          chartName: 'mongodb',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '12.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log error for DNS failure
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch versions from https://invalid.example.com/charts')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ENOTFOUND')
      );

      // Should successfully process second repository
      const mongoVersions = versionMap.get('https://charts.bitnami.com/bitnami/mongodb');
      expect(mongoVersions).toBeDefined();
      expect(mongoVersions).toHaveLength(1);
    });

    it('should handle SSL/TLS certificate errors and continue processing', async () => {
      const sslError = new Error('unable to verify the first certificate');
      (sslError as any).isAxiosError = true;
      (sslError as any).code = 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';

      mockAxiosInstance.get
        .mockRejectedValueOnce(sslError)
        .mockResolvedValueOnce({
          data: {
            name: 'bitnami/redis',
            tags: ['17.0.0'],
          },
        });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/insecure.yaml',
          documentIndex: 0,
          chartName: 'insecure-chart',
          repoURL: 'https://insecure.example.com/charts',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/redis.yaml',
          documentIndex: 0,
          chartName: 'bitnami/redis',
          repoURL: 'oci://registry-1.docker.io',
          repoType: 'oci',
          currentVersion: '16.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log error for SSL failure
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch versions from https://insecure.example.com/charts')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('unable to verify the first certificate')
      );

      // Should successfully process OCI repository
      const redisVersions = versionMap.get('oci://registry-1.docker.io/bitnami/redis');
      expect(redisVersions).toBeDefined();
      expect(redisVersions).toHaveLength(1);
    });

    it('should handle multiple repository failures and continue processing successful ones', async () => {
      const error1 = new Error('Network error 1');
      (error1 as any).isAxiosError = true;
      
      const error2 = new Error('Network error 2');
      (error2 as any).isAxiosError = true;

      mockAxiosInstance.get
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2)
        .mockResolvedValueOnce({
          data: `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.0
`,
        });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/fail1.yaml',
          documentIndex: 0,
          chartName: 'chart1',
          repoURL: 'https://fail1.example.com/charts',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/fail2.yaml',
          documentIndex: 0,
          chartName: 'chart2',
          repoURL: 'https://fail2.example.com/charts',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
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

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log errors for both failures
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch versions from https://fail1.example.com/charts')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch versions from https://fail2.example.com/charts')
      );

      // Should successfully process third repository
      const nginxVersions = versionMap.get('https://charts.bitnami.com/bitnami/nginx');
      expect(nginxVersions).toBeDefined();
      expect(nginxVersions).toHaveLength(1);
      expect(nginxVersions![0].version).toBe('15.9.0');
    });

    it('should handle OCI registry errors and continue processing Helm repositories', async () => {
      const ociError = new Error('OCI registry error');
      (ociError as any).isAxiosError = true;
      (ociError as any).response = { status: 500 };

      mockAxiosInstance.get
        .mockRejectedValueOnce(ociError)
        .mockResolvedValueOnce({
          data: `
apiVersion: v1
entries:
  postgresql:
    - name: postgresql
      version: 12.5.0
`,
        });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/oci-fail.yaml',
          documentIndex: 0,
          chartName: 'bitnami/nginx',
          repoURL: 'oci://failing-registry.example.com',
          repoType: 'oci',
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/postgres.yaml',
          documentIndex: 0,
          chartName: 'postgresql',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '12.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log error for OCI failure
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch versions from oci://failing-registry.example.com')
      );

      // Should successfully process Helm repository
      const postgresVersions = versionMap.get('https://charts.bitnami.com/bitnami/postgresql');
      expect(postgresVersions).toBeDefined();
      expect(postgresVersions).toHaveLength(1);
    });

    it('should handle non-Axios errors gracefully', async () => {
      const genericError = new Error('Some unexpected error');

      mockAxiosInstance.get
        .mockRejectedValueOnce(genericError)
        .mockResolvedValueOnce({
          data: `
apiVersion: v1
entries:
  redis:
    - name: redis
      version: 17.0.0
`,
        });

      const resolver = new VersionResolver(config);
      const dependencies: HelmDependency[] = [
        {
          manifestPath: 'apps/error.yaml',
          documentIndex: 0,
          chartName: 'error-chart',
          repoURL: 'https://error.example.com/charts',
          repoType: 'helm',
          currentVersion: '1.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
        {
          manifestPath: 'apps/redis.yaml',
          documentIndex: 0,
          chartName: 'redis',
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm',
          currentVersion: '16.0.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch versions from https://error.example.com/charts')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Some unexpected error')
      );

      // Should successfully process second repository
      const redisVersions = versionMap.get('https://charts.bitnami.com/bitnami/redis');
      expect(redisVersions).toBeDefined();
      expect(redisVersions).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty dependencies list', async () => {
      const resolver = new VersionResolver(config);
      const versionMap = await resolver.resolveVersions([]);

      expect(versionMap.size).toBe(0);
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });

    it('should handle chart with no versions in index', async () => {
      const mockIndexYAML = `
apiVersion: v1
entries:
  nginx: []
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

      const versionMap = await resolver.resolveVersions(dependencies);

      const versions = versionMap.get(
        'https://charts.bitnami.com/bitnami/nginx'
      );
      expect(versions).toEqual([]);
    });

    it('should handle OCI registry with empty tags', async () => {
      const mockTagsResponse = {
        name: 'bitnami/nginx',
        tags: [],
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
          currentVersion: '15.8.0',
          versionPath: ['spec', 'source', 'targetRevision'],
        },
      ];

      const versionMap = await resolver.resolveVersions(dependencies);

      const versions = versionMap.get(
        'oci://registry-1.docker.io/bitnami/nginx'
      );
      expect(versions).toEqual([]);
    });
  });

  describe('update strategy selection', () => {
    describe('patch strategy', () => {
      it('should only allow patch version updates with same major.minor', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.10.0
    - name: nginx
      version: 15.9.2
    - name: nginx
      version: 15.9.1
    - name: nginx
      version: 15.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'patch';
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

        expect(updates).toHaveLength(1);
        // Should select 15.9.2 (latest patch), not 15.10.0 or 16.0.0
        expect(updates[0].newVersion).toBe('15.9.2');
      });

      it('should return null when no patch updates available', async () => {
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
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'patch';
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

        expect(updates).toEqual([]);
      });

      it('should handle patch updates with pre-release versions', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.2
    - name: nginx
      version: 15.9.2-rc.1
    - name: nginx
      version: 15.9.1
    - name: nginx
      version: 15.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'patch';
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

        expect(updates).toHaveLength(1);
        // Should select stable 15.9.2, not pre-release
        expect(updates[0].newVersion).toBe('15.9.2');
      });

      it('should handle patch updates from x.y.0 to x.y.z', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.5
    - name: nginx
      version: 15.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'patch';
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

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('15.9.5');
      });
    });

    describe('minor strategy', () => {
      it('should allow minor and patch updates with same major', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.10.5
    - name: nginx
      version: 15.10.0
    - name: nginx
      version: 15.9.2
    - name: nginx
      version: 15.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'minor';
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

        expect(updates).toHaveLength(1);
        // Should select 15.10.5 (latest minor), not 16.0.0
        expect(updates[0].newVersion).toBe('15.10.5');
      });

      it('should return null when no minor/patch updates available', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'minor';
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

        expect(updates).toEqual([]);
      });

      it('should allow patch updates within same minor version', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.3
    - name: nginx
      version: 15.9.2
    - name: nginx
      version: 15.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'minor';
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

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('15.9.3');
      });

      it('should handle minor updates across multiple minor versions', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.12.0
    - name: nginx
      version: 15.11.0
    - name: nginx
      version: 15.10.0
    - name: nginx
      version: 15.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'minor';
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

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('15.12.0');
      });

      it('should not allow major version updates', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'minor';
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

        expect(updates).toEqual([]);
      });
    });

    describe('major strategy', () => {
      it('should allow all updates including major versions', async () => {
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

        config.updateStrategy = 'major';
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

        expect(updates).toHaveLength(1);
        // Should select latest version across all major versions
        expect(updates[0].newVersion).toBe('17.0.0');
      });

      it('should allow minor version updates', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.10.0
    - name: nginx
      version: 15.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'major';
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

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('15.10.0');
      });

      it('should allow patch version updates', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.1
    - name: nginx
      version: 15.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'major';
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

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('15.9.1');
      });
    });

    describe('all strategy', () => {
      it('should allow all updates (same as major)', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 17.0.0
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'all';
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

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('17.0.0');
      });
    });

    describe('edge cases', () => {
      it('should handle version 0.x.y with patch strategy', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  mychart:
    - name: mychart
      version: 0.5.3
    - name: mychart
      version: 0.5.2
    - name: mychart
      version: 0.5.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'patch';
        const resolver = new VersionResolver(config);
        const dependencies: HelmDependency[] = [
          {
            manifestPath: 'apps/mychart.yaml',
            documentIndex: 0,
            chartName: 'mychart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: '0.5.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
        ];

        const updates = await resolver.checkForUpdates(dependencies);

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('0.5.3');
      });

      it('should handle version 0.x.y with minor strategy', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  mychart:
    - name: mychart
      version: 0.6.0
    - name: mychart
      version: 0.5.5
    - name: mychart
      version: 0.5.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'minor';
        const resolver = new VersionResolver(config);
        const dependencies: HelmDependency[] = [
          {
            manifestPath: 'apps/mychart.yaml',
            documentIndex: 0,
            chartName: 'mychart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: '0.5.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
        ];

        const updates = await resolver.checkForUpdates(dependencies);

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('0.6.0');
      });

      it('should not cross major version 0 to 1 with minor strategy', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  mychart:
    - name: mychart
      version: 1.0.0
    - name: mychart
      version: 0.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'minor';
        const resolver = new VersionResolver(config);
        const dependencies: HelmDependency[] = [
          {
            manifestPath: 'apps/mychart.yaml',
            documentIndex: 0,
            chartName: 'mychart',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: '0.9.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
        ];

        const updates = await resolver.checkForUpdates(dependencies);

        expect(updates).toEqual([]);
      });

      it('should handle pre-release versions with patch strategy', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.2
    - name: nginx
      version: 15.9.1
    - name: nginx
      version: 15.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'patch';
        const resolver = new VersionResolver(config);
        const dependencies: HelmDependency[] = [
          {
            manifestPath: 'apps/nginx.yaml',
            documentIndex: 0,
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm',
            currentVersion: '15.9.0-rc.1',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
        ];

        const updates = await resolver.checkForUpdates(dependencies);

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('15.9.2');
      });

      it('should handle build metadata with all strategies', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 15.9.1+build.456
    - name: nginx
      version: 15.9.0+build.123
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'patch';
        const resolver = new VersionResolver(config);
        const dependencies: HelmDependency[] = [
          {
            manifestPath: 'apps/nginx.yaml',
            documentIndex: 0,
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm',
            currentVersion: '15.9.0+build.123',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
        ];

        const updates = await resolver.checkForUpdates(dependencies);

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('15.9.1+build.456');
      });

      it('should handle large version numbers with all strategies', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 100.200.301
    - name: nginx
      version: 100.200.300
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        config.updateStrategy = 'patch';
        const resolver = new VersionResolver(config);
        const dependencies: HelmDependency[] = [
          {
            manifestPath: 'apps/nginx.yaml',
            documentIndex: 0,
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm',
            currentVersion: '100.200.300',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
        ];

        const updates = await resolver.checkForUpdates(dependencies);

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('100.200.301');
      });

      it('should warn and default to all for unknown strategy', async () => {
        const mockIndexYAML = `
apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 16.0.0
    - name: nginx
      version: 15.9.0
`;

        mockAxiosInstance.get.mockResolvedValue({
          data: mockIndexYAML,
        });

        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

        config.updateStrategy = 'unknown' as any;
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

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('16.0.0');
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Unknown update strategy 'unknown'")
        );

        consoleWarnSpy.mockRestore();
      });
    });

    describe('OCI registry with strategies', () => {
      it('should apply patch strategy to OCI registry versions', async () => {
        const mockTagsResponse = {
          name: 'bitnami/nginx',
          tags: ['15.10.0', '15.9.2', '15.9.1', '15.9.0'],
        };

        mockAxiosInstance.get.mockResolvedValue({
          data: mockTagsResponse,
        });

        config.updateStrategy = 'patch';
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

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('15.9.2');
      });

      it('should apply minor strategy to OCI registry versions', async () => {
        const mockTagsResponse = {
          name: 'bitnami/nginx',
          tags: ['16.0.0', '15.10.0', '15.9.0'],
        };

        mockAxiosInstance.get.mockResolvedValue({
          data: mockTagsResponse,
        });

        config.updateStrategy = 'minor';
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

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('15.10.0');
      });

      it('should apply major strategy to OCI registry versions', async () => {
        const mockTagsResponse = {
          name: 'bitnami/nginx',
          tags: ['16.0.0', '15.10.0', '15.9.0'],
        };

        mockAxiosInstance.get.mockResolvedValue({
          data: mockTagsResponse,
        });

        config.updateStrategy = 'major';
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

        expect(updates).toHaveLength(1);
        expect(updates[0].newVersion).toBe('16.0.0');
      });
    });
  });

  describe('groupUpdates', () => {
    let resolver: VersionResolver;
    let mockUpdates: any[];

    beforeEach(() => {
      // Create sample updates for testing
      mockUpdates = [
        {
          dependency: {
            manifestPath: 'apps/nginx.yaml',
            documentIndex: 0,
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm',
            currentVersion: '15.8.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '15.8.0',
          newVersion: '15.9.0',
        },
        {
          dependency: {
            manifestPath: 'apps/postgresql.yaml',
            documentIndex: 0,
            chartName: 'postgresql',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm',
            currentVersion: '12.4.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '12.4.0',
          newVersion: '13.0.0',
        },
        {
          dependency: {
            manifestPath: 'apps/prometheus.yaml',
            documentIndex: 0,
            chartName: 'prometheus',
            repoURL: 'https://prometheus-community.github.io/helm-charts',
            repoType: 'helm',
            currentVersion: '20.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '20.0.0',
          newVersion: '20.1.0',
        },
        {
          dependency: {
            manifestPath: 'apps/grafana.yaml',
            documentIndex: 0,
            chartName: 'grafana',
            repoURL: 'https://grafana.github.io/helm-charts',
            repoType: 'helm',
            currentVersion: '6.50.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '6.50.0',
          newVersion: '6.51.0',
        },
      ];
    });

    it('should return all updates as ungrouped when no groups are configured', () => {
      config.groups = {};
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(mockUpdates);

      expect(grouped.size).toBe(1);
      expect(grouped.has('ungrouped')).toBe(true);
      expect(grouped.get('ungrouped')).toHaveLength(4);
    });

    it('should group updates by exact chart name pattern', () => {
      config.groups = {
        'bitnami-charts': {
          patterns: ['nginx', 'postgresql'],
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(mockUpdates);

      expect(grouped.size).toBe(2);
      expect(grouped.has('bitnami-charts')).toBe(true);
      expect(grouped.has('ungrouped')).toBe(true);

      const bitnamiGroup = grouped.get('bitnami-charts');
      expect(bitnamiGroup).toHaveLength(2);
      expect(bitnamiGroup![0].dependency.chartName).toBe('nginx');
      expect(bitnamiGroup![1].dependency.chartName).toBe('postgresql');

      const ungrouped = grouped.get('ungrouped');
      expect(ungrouped).toHaveLength(2);
      expect(ungrouped![0].dependency.chartName).toBe('prometheus');
      expect(ungrouped![1].dependency.chartName).toBe('grafana');
    });

    it('should group updates by wildcard pattern', () => {
      config.groups = {
        'monitoring-stack': {
          patterns: ['*prometheus*', '*grafana*'],
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(mockUpdates);

      expect(grouped.size).toBe(2);
      expect(grouped.has('monitoring-stack')).toBe(true);
      expect(grouped.has('ungrouped')).toBe(true);

      const monitoringGroup = grouped.get('monitoring-stack');
      expect(monitoringGroup).toHaveLength(2);
      expect(monitoringGroup![0].dependency.chartName).toBe('prometheus');
      expect(monitoringGroup![1].dependency.chartName).toBe('grafana');

      const ungrouped = grouped.get('ungrouped');
      expect(ungrouped).toHaveLength(2);
      expect(ungrouped![0].dependency.chartName).toBe('nginx');
      expect(ungrouped![1].dependency.chartName).toBe('postgresql');
    });

    it('should group updates by prefix wildcard pattern', () => {
      config.groups = {
        'bitnami-all': {
          patterns: ['*'],
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(mockUpdates);

      expect(grouped.size).toBe(1);
      expect(grouped.has('bitnami-all')).toBe(true);
      expect(grouped.get('bitnami-all')).toHaveLength(4);
    });

    it('should filter groups by update type (patch only)', () => {
      config.groups = {
        'patch-updates': {
          patterns: ['*'],
          updateTypes: ['patch'],
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(mockUpdates);

      expect(grouped.size).toBe(1);
      expect(grouped.has('ungrouped')).toBe(true);
      // All updates are minor or major, so none match patch filter
      expect(grouped.get('ungrouped')).toHaveLength(4);
    });

    it('should filter groups by update type (minor only)', () => {
      config.groups = {
        'minor-updates': {
          patterns: ['*'],
          updateTypes: ['minor'],
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(mockUpdates);

      expect(grouped.size).toBe(2);
      expect(grouped.has('minor-updates')).toBe(true);
      expect(grouped.has('ungrouped')).toBe(true);

      const minorGroup = grouped.get('minor-updates');
      expect(minorGroup).toHaveLength(3);
      // nginx: 15.8.0 -> 15.9.0 (minor)
      // prometheus: 20.0.0 -> 20.1.0 (minor)
      // grafana: 6.50.0 -> 6.51.0 (minor)

      const ungrouped = grouped.get('ungrouped');
      expect(ungrouped).toHaveLength(1);
      // postgresql: 12.4.0 -> 13.0.0 (major)
      expect(ungrouped![0].dependency.chartName).toBe('postgresql');
    });

    it('should filter groups by update type (major only)', () => {
      config.groups = {
        'major-updates': {
          patterns: ['*'],
          updateTypes: ['major'],
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(mockUpdates);

      expect(grouped.size).toBe(2);
      expect(grouped.has('major-updates')).toBe(true);
      expect(grouped.has('ungrouped')).toBe(true);

      const majorGroup = grouped.get('major-updates');
      expect(majorGroup).toHaveLength(1);
      expect(majorGroup![0].dependency.chartName).toBe('postgresql');

      const ungrouped = grouped.get('ungrouped');
      expect(ungrouped).toHaveLength(3);
    });

    it('should filter groups by multiple update types', () => {
      config.groups = {
        'minor-and-patch': {
          patterns: ['*'],
          updateTypes: ['minor', 'patch'],
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(mockUpdates);

      expect(grouped.size).toBe(2);
      expect(grouped.has('minor-and-patch')).toBe(true);
      expect(grouped.has('ungrouped')).toBe(true);

      const minorPatchGroup = grouped.get('minor-and-patch');
      expect(minorPatchGroup).toHaveLength(3);
      // nginx, prometheus, grafana (all minor)

      const ungrouped = grouped.get('ungrouped');
      expect(ungrouped).toHaveLength(1);
      expect(ungrouped![0].dependency.chartName).toBe('postgresql');
    });

    it('should handle multiple groups with different patterns', () => {
      config.groups = {
        'bitnami-charts': {
          patterns: ['nginx', 'postgresql'],
        },
        'monitoring-stack': {
          patterns: ['prometheus', 'grafana'],
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(mockUpdates);

      expect(grouped.size).toBe(2);
      expect(grouped.has('bitnami-charts')).toBe(true);
      expect(grouped.has('monitoring-stack')).toBe(true);
      expect(grouped.has('ungrouped')).toBe(false);

      const bitnamiGroup = grouped.get('bitnami-charts');
      expect(bitnamiGroup).toHaveLength(2);

      const monitoringGroup = grouped.get('monitoring-stack');
      expect(monitoringGroup).toHaveLength(2);
    });

    it('should assign update to first matching group only', () => {
      config.groups = {
        'group-a': {
          patterns: ['nginx', 'postgresql'],
        },
        'group-b': {
          patterns: ['nginx'], // nginx matches both groups
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(mockUpdates);

      expect(grouped.size).toBe(2);
      expect(grouped.has('group-a')).toBe(true);
      expect(grouped.has('ungrouped')).toBe(true);

      const groupA = grouped.get('group-a');
      expect(groupA).toHaveLength(2);
      expect(groupA![0].dependency.chartName).toBe('nginx');
      expect(groupA![1].dependency.chartName).toBe('postgresql');

      // group-b should be empty and removed
      expect(grouped.has('group-b')).toBe(false);
    });

    it('should handle case-insensitive pattern matching', () => {
      config.groups = {
        'nginx-group': {
          patterns: ['NGINX'], // uppercase pattern
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(mockUpdates);

      expect(grouped.size).toBe(2);
      expect(grouped.has('nginx-group')).toBe(true);

      const nginxGroup = grouped.get('nginx-group');
      expect(nginxGroup).toHaveLength(1);
      expect(nginxGroup![0].dependency.chartName).toBe('nginx');
    });

    it('should handle question mark wildcard in patterns', () => {
      const updatesWithVariants = [
        {
          dependency: {
            manifestPath: 'apps/app1.yaml',
            documentIndex: 0,
            chartName: 'app1',
            repoURL: 'https://charts.example.com',
            repoType: 'helm' as const,
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '1.0.0',
          newVersion: '1.1.0',
        },
        {
          dependency: {
            manifestPath: 'apps/app2.yaml',
            documentIndex: 0,
            chartName: 'app2',
            repoURL: 'https://charts.example.com',
            repoType: 'helm' as const,
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '1.0.0',
          newVersion: '1.1.0',
        },
        {
          dependency: {
            manifestPath: 'apps/app10.yaml',
            documentIndex: 0,
            chartName: 'app10',
            repoURL: 'https://charts.example.com',
            repoType: 'helm' as const,
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '1.0.0',
          newVersion: '1.1.0',
        },
      ];

      config.groups = {
        'single-digit-apps': {
          patterns: ['app?'], // matches app1, app2 but not app10
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(updatesWithVariants);

      expect(grouped.size).toBe(2);
      expect(grouped.has('single-digit-apps')).toBe(true);
      expect(grouped.has('ungrouped')).toBe(true);

      const singleDigitGroup = grouped.get('single-digit-apps');
      expect(singleDigitGroup).toHaveLength(2);
      expect(singleDigitGroup![0].dependency.chartName).toBe('app1');
      expect(singleDigitGroup![1].dependency.chartName).toBe('app2');

      const ungrouped = grouped.get('ungrouped');
      expect(ungrouped).toHaveLength(1);
      expect(ungrouped![0].dependency.chartName).toBe('app10');
    });

    it('should handle empty updates array', () => {
      config.groups = {
        'test-group': {
          patterns: ['*'],
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates([]);

      expect(grouped.size).toBe(0);
    });

    it('should remove empty groups from result', () => {
      config.groups = {
        'bitnami-charts': {
          patterns: ['nginx', 'postgresql'],
        },
        'empty-group': {
          patterns: ['nonexistent-chart'],
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(mockUpdates);

      expect(grouped.size).toBe(2);
      expect(grouped.has('bitnami-charts')).toBe(true);
      expect(grouped.has('ungrouped')).toBe(true);
      expect(grouped.has('empty-group')).toBe(false);
    });

    it('should handle complex glob patterns with special characters', () => {
      const updatesWithNamespaces = [
        {
          dependency: {
            manifestPath: 'apps/chart.yaml',
            documentIndex: 0,
            chartName: 'bitnami/nginx',
            repoURL: 'oci://registry.example.com',
            repoType: 'oci' as const,
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '1.0.0',
          newVersion: '1.1.0',
        },
        {
          dependency: {
            manifestPath: 'apps/chart2.yaml',
            documentIndex: 0,
            chartName: 'bitnami/postgresql',
            repoURL: 'oci://registry.example.com',
            repoType: 'oci' as const,
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '1.0.0',
          newVersion: '1.1.0',
        },
        {
          dependency: {
            manifestPath: 'apps/chart3.yaml',
            documentIndex: 0,
            chartName: 'myorg/mychart',
            repoURL: 'oci://registry.example.com',
            repoType: 'oci' as const,
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '1.0.0',
          newVersion: '1.1.0',
        },
      ];

      config.groups = {
        'bitnami-oci': {
          patterns: ['bitnami/*'],
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(updatesWithNamespaces);

      expect(grouped.size).toBe(2);
      expect(grouped.has('bitnami-oci')).toBe(true);
      expect(grouped.has('ungrouped')).toBe(true);

      const bitnamiGroup = grouped.get('bitnami-oci');
      expect(bitnamiGroup).toHaveLength(2);
      expect(bitnamiGroup![0].dependency.chartName).toBe('bitnami/nginx');
      expect(bitnamiGroup![1].dependency.chartName).toBe('bitnami/postgresql');

      const ungrouped = grouped.get('ungrouped');
      expect(ungrouped).toHaveLength(1);
      expect(ungrouped![0].dependency.chartName).toBe('myorg/mychart');
    });

    it('should combine pattern matching and update type filtering', () => {
      config.groups = {
        'bitnami-minor-updates': {
          patterns: ['nginx', 'postgresql'],
          updateTypes: ['minor'],
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(mockUpdates);

      expect(grouped.size).toBe(2);
      expect(grouped.has('bitnami-minor-updates')).toBe(true);
      expect(grouped.has('ungrouped')).toBe(true);

      const bitnamiMinorGroup = grouped.get('bitnami-minor-updates');
      expect(bitnamiMinorGroup).toHaveLength(1);
      // Only nginx (15.8.0 -> 15.9.0) is minor
      // postgresql (12.4.0 -> 13.0.0) is major
      expect(bitnamiMinorGroup![0].dependency.chartName).toBe('nginx');

      const ungrouped = grouped.get('ungrouped');
      expect(ungrouped).toHaveLength(3);
    });

    it('should handle patch version updates correctly', () => {
      const patchUpdates = [
        {
          dependency: {
            manifestPath: 'apps/nginx.yaml',
            documentIndex: 0,
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm' as const,
            currentVersion: '15.9.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '15.9.0',
          newVersion: '15.9.1', // patch update
        },
        {
          dependency: {
            manifestPath: 'apps/postgresql.yaml',
            documentIndex: 0,
            chartName: 'postgresql',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm' as const,
            currentVersion: '12.5.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '12.5.0',
          newVersion: '12.5.2', // patch update
        },
      ];

      config.groups = {
        'patch-only': {
          patterns: ['*'],
          updateTypes: ['patch'],
        },
      };
      resolver = new VersionResolver(config);

      const grouped = resolver.groupUpdates(patchUpdates);

      expect(grouped.size).toBe(1);
      expect(grouped.has('patch-only')).toBe(true);

      const patchGroup = grouped.get('patch-only');
      expect(patchGroup).toHaveLength(2);
    });
  });
});
