/**
 * Property-based tests for VersionResolver - Repository Version Fetching
 * 
 * **Property 7: Repository Version Fetching**
 * **Validates: Requirements 3.1, 3.2, 3.6**
 * 
 * For any accessible Helm repository or OCI registry, the version resolver
 * should fetch all available versions for the specified chart.
 */

import * as fc from 'fast-check';
import axios from 'axios';
import { VersionResolver } from '../../src/resolver/version-resolver';
import { ActionConfig } from '../../src/types/config';
import { HelmDependency } from '../../src/types/dependency';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Custom arbitraries for generating test data
 */

// Generate valid Kubernetes resource names (DNS-1123 subdomain)
const arbChartName = fc.stringMatching(/^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/);

// Generate semantic version
const arbSemVer = fc.tuple(
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 }),
  fc.nat({ max: 100 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// Generate Helm repository URL
const arbHelmRepoURL = fc.constantFrom(
  'https://charts.bitnami.com/bitnami',
  'https://charts.example.com',
  'https://kubernetes-charts.storage.googleapis.com',
  'https://helm.releases.hashicorp.com',
  'http://charts.internal.company.com'
);

// Generate OCI registry URL
const arbOCIRepoURL = fc.constantFrom(
  'oci://ghcr.io',
  'oci://registry-1.docker.io',
  'oci://public.ecr.aws',
  'oci://quay.io',
  'oci://registry.example.com'
);

// Generate chart version info
const arbChartVersionInfo = fc.record({
  version: arbSemVer,
  appVersion: fc.option(arbSemVer, { nil: undefined }),
  created: fc.option(fc.date(), { nil: undefined }),
  digest: fc.option(
    fc.hexaString({ minLength: 64, maxLength: 64 }).map(h => `sha256:${h}`),
    { nil: undefined }
  ),
});

// Note: arbHelmIndex and arbOCITagsResponse are not used as arbitraries
// because we construct responses dynamically in tests based on generated data

// Generate Helm dependency
const arbHelmDependency = fc.record({
  manifestPath: fc.constantFrom('apps/app.yaml', 'manifests/deployment.yaml'),
  documentIndex: fc.nat({ max: 5 }),
  chartName: arbChartName,
  repoURL: arbHelmRepoURL,
  repoType: fc.constant('helm' as const),
  currentVersion: arbSemVer,
  versionPath: fc.constant(['spec', 'source', 'targetRevision']),
});

// Generate OCI dependency
const arbOCIDependency = fc.record({
  manifestPath: fc.constantFrom('apps/app.yaml', 'manifests/deployment.yaml'),
  documentIndex: fc.nat({ max: 5 }),
  chartName: arbChartName,
  repoURL: arbOCIRepoURL,
  repoType: fc.constant('oci' as const),
  currentVersion: arbSemVer,
  versionPath: fc.constant(['spec', 'source', 'targetRevision']),
});

describe('Property 7: Repository Version Fetching', () => {
  let config: ActionConfig;

  beforeEach(() => {
    // Clear mock call history but keep implementations
    // Note: Using mockClear() instead of clearAllMocks() to preserve mockImplementationOnce
    mockedAxios.create.mockClear();

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

    // Mock axios.create to return a fresh mock instance each time it's called
    mockedAxios.create.mockImplementation((() => ({
      get: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn(),
        },
      },
    })) as any);
  });

  afterEach(() => {
    // Clear mocks after each test (but not between property test iterations)
    // Note: This is called after each `it()` block, not after each property test iteration
  });

  /**
   * Property 7.1: Helm repository version fetching completeness
   * 
   * For any Helm repository with available chart versions, all versions
   * should be fetched and returned in the version map.
   */
  it('should fetch all available versions from Helm repository', () => {
    fc.assert(
      fc.asyncProperty(
        arbHelmDependency,
        fc.array(arbChartVersionInfo, { minLength: 1, maxLength: 20 }),
        async (dependency, chartVersions) => {
          // Capture the mock instance that will be created for this VersionResolver
          let mockAxiosInstance: any;
          
          // Create Helm index YAML
          const helmIndexYAML = `apiVersion: v1
entries:
  ${dependency.chartName}:
${chartVersions.map(v => `    - name: ${dependency.chartName}
      version: ${v.version}
      ${v.appVersion ? `appVersion: ${v.appVersion}` : ''}
      ${v.digest ? `digest: ${v.digest}` : ''}`).join('\n')}
`;

          mockedAxios.create.mockImplementationOnce(() => {
            mockAxiosInstance = {
              get: jest.fn().mockResolvedValue({
                data: helmIndexYAML,
              }),
              interceptors: {
                request: {
                  use: jest.fn(),
                },
              },
            };
            return mockAxiosInstance;
          });

          const resolver = new VersionResolver(config);
          const versionMap = await resolver.resolveVersions([dependency]);

          const key = `${dependency.repoURL}/${dependency.chartName}`;
          const fetchedVersions = versionMap.get(key);

          // Should fetch all versions
          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBe(chartVersions.length);

          // All version strings should match
          const fetchedVersionStrings = fetchedVersions!.map(v => v.version).sort();
          const expectedVersionStrings = chartVersions.map(v => v.version).sort();
          expect(fetchedVersionStrings).toEqual(expectedVersionStrings);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 7.2: OCI registry version fetching completeness
   * 
   * For any OCI registry with available tags, all tags should be
   * fetched and returned as chart versions.
   */
  it('should fetch all available tags from OCI registry', () => {
    fc.assert(
      fc.asyncProperty(
        arbOCIDependency,
        fc.array(arbSemVer, { minLength: 1, maxLength: 20 }),
        async (dependency, tags) => {
          // Capture the mock instance that will be created for this VersionResolver
          let mockAxiosInstance: any;
          
          const ociResponse = {
            name: dependency.chartName,
            tags: tags,
          };

          mockedAxios.create.mockImplementationOnce(() => {
            mockAxiosInstance = {
              get: jest.fn().mockResolvedValue({
                data: ociResponse,
              }),
              interceptors: {
                request: {
                  use: jest.fn(),
                },
              },
            };
            return mockAxiosInstance;
          });

          const resolver = new VersionResolver(config);
          const versionMap = await resolver.resolveVersions([dependency]);

          const key = `${dependency.repoURL}/${dependency.chartName}`;
          const fetchedVersions = versionMap.get(key);

          // Should fetch all tags
          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBe(tags.length);

          // All version strings should match
          const fetchedVersionStrings = fetchedVersions!.map(v => v.version).sort();
          const expectedVersionStrings = tags.sort();
          expect(fetchedVersionStrings).toEqual(expectedVersionStrings);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 7.3: Helm repository URL normalization
   * 
   * For any Helm repository URL (with or without trailing slash,
   * with or without index.yaml), the resolver should correctly
   * construct the index URL and fetch versions.
   */
  it('should normalize Helm repository URLs correctly', () => {
    fc.assert(
      fc.asyncProperty(
        fc.webUrl({ withFragments: false, withQueryParameters: false }),
        arbChartName,
        fc.array(arbChartVersionInfo, { minLength: 1, maxLength: 5 }),
        fc.constantFrom('', '/', '/index.yaml'),
        async (baseURL, chartName, chartVersions, suffix) => {
          // Capture the mock instance that will be created for this VersionResolver
          let mockAxiosInstance: any;
          
          const repoURL = `${baseURL}${suffix}`;
          
          const dependency: HelmDependency = {
            manifestPath: 'apps/app.yaml',
            documentIndex: 0,
            chartName,
            repoURL,
            repoType: 'helm',
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          };

          const helmIndexYAML = `apiVersion: v1
entries:
  ${chartName}:
${chartVersions.map(v => `    - name: ${chartName}
      version: ${v.version}`).join('\n')}
`;

          // Calculate the expected index URL based on how the resolver normalizes URLs
          // The resolver removes one trailing slash and adds /index.yaml
          let expectedIndexURL: string;
          if (repoURL.endsWith('/index.yaml')) {
            // Already has index.yaml
            expectedIndexURL = repoURL.replace(/\/$/, '');
          } else {
            // Remove one trailing slash and add /index.yaml
            const normalized = repoURL.replace(/\/$/, '');
            expectedIndexURL = `${normalized}/index.yaml`;
          }

          mockedAxios.create.mockImplementationOnce(() => {
            mockAxiosInstance = {
              get: jest.fn().mockImplementation((url: string) => {
                if (url === expectedIndexURL) {
                  return Promise.resolve({ data: helmIndexYAML });
                }
                return Promise.reject(new Error(`Unexpected URL: ${url}`));
              }),
              interceptors: {
                request: {
                  use: jest.fn(),
                },
              },
            };
            return mockAxiosInstance;
          });

          const resolver = new VersionResolver(config);
          const versionMap = await resolver.resolveVersions([dependency]);

          // Should successfully fetch versions regardless of URL format
          const key = `${repoURL}/${chartName}`;
          const fetchedVersions = versionMap.get(key);
          
          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBe(chartVersions.length);

          // Verify the correct index URL was called
          expect(mockAxiosInstance.get).toHaveBeenCalledWith(expectedIndexURL);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 7.4: OCI registry URL construction
   * 
   * For any OCI registry URL (with or without oci:// prefix,
   * with or without trailing slash), the resolver should correctly
   * construct the tags list URL.
   */
  it('should construct OCI tags URLs correctly', () => {
    fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'ghcr.io',
          'registry-1.docker.io',
          'public.ecr.aws',
          'quay.io'
        ),
        arbChartName,
        fc.array(arbSemVer, { minLength: 1, maxLength: 5 }),
        fc.constantFrom('oci://', ''),
        fc.constantFrom('', '/'),
        async (registry, chartName, tags, prefix, suffix) => {
          // Capture the mock instance that will be created for this VersionResolver
          let mockAxiosInstance: any;
          
          const repoURL = `${prefix}${registry}${suffix}`;
          
          const dependency: HelmDependency = {
            manifestPath: 'apps/app.yaml',
            documentIndex: 0,
            chartName,
            repoURL,
            repoType: 'oci',
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          };

          const ociResponse = {
            name: chartName,
            tags: tags,
          };

          // Use mockImplementationOnce to return the correct response for this specific test
          const expectedTagsURL = `https://${registry}/v2/${chartName}/tags/list`;
          mockedAxios.create.mockImplementationOnce(() => {
            mockAxiosInstance = {
              get: jest.fn().mockImplementation((url: string) => {
                if (url === expectedTagsURL) {
                  return Promise.resolve({ data: ociResponse });
                }
                return Promise.reject(new Error(`Unexpected URL: ${url}`));
              }),
              interceptors: {
                request: {
                  use: jest.fn(),
                },
              },
            };
            return mockAxiosInstance;
          });

          const resolver = new VersionResolver(config);
          const versionMap = await resolver.resolveVersions([dependency]);

          // Should successfully fetch tags regardless of URL format
          const key = `${repoURL}/${chartName}`;
          const fetchedVersions = versionMap.get(key);
          
          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBe(tags.length);

          // Verify the correct tags URL was called
          expect(mockAxiosInstance.get).toHaveBeenCalledWith(expectedTagsURL);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 7.5: Multiple charts from same repository
   * 
   * For any set of dependencies from the same Helm repository,
   * the repository index should be fetched only once (caching).
   */
  it('should cache repository index for multiple charts from same repository', async () => {
    // Test with a specific example first
    const repoURL = 'https://charts.bitnami.com/bitnami';
    const chartNames = ['nginx', 'postgresql'];
    
    let mockAxiosInstance: any;
    
    const dependencies: HelmDependency[] = chartNames.map(chartName => ({
      manifestPath: `apps/${chartName}.yaml`,
      documentIndex: 0,
      chartName,
      repoURL,
      repoType: 'helm',
      currentVersion: '1.0.0',
      versionPath: ['spec', 'source', 'targetRevision'],
    }));

    const helmIndexYAML = `apiVersion: v1
entries:
  nginx:
    - name: nginx
      version: 1.0.0
  postgresql:
    - name: postgresql
      version: 1.0.0
`;

    mockedAxios.create.mockImplementationOnce(() => {
      mockAxiosInstance = {
        get: jest.fn().mockResolvedValue({
          data: helmIndexYAML,
        }),
        interceptors: {
          request: {
            use: jest.fn(),
          },
        },
      };
      return mockAxiosInstance;
    });

    const resolver = new VersionResolver(config);
    const versionMap = await resolver.resolveVersions(dependencies);

    // Should fetch index only once
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

    // All charts should have versions
    chartNames.forEach(chartName => {
      const key = `${repoURL}/${chartName}`;
      expect(versionMap.get(key)).toBeDefined();
    });
  });

  /**
   * Property 7.6: Version metadata preservation
   * 
   * For any Helm repository with chart versions containing metadata
   * (appVersion, created, digest), all metadata should be preserved
   * in the fetched versions.
   */
  it('should preserve version metadata from Helm repository', () => {
    fc.assert(
      fc.asyncProperty(
        arbHelmDependency,
        arbChartVersionInfo,
        async (dependency, versionInfo) => {
          // Capture the mock instance that will be created for this VersionResolver
          let mockAxiosInstance: any;
          
          const helmIndexYAML = `apiVersion: v1
entries:
  ${dependency.chartName}:
    - name: ${dependency.chartName}
      version: ${versionInfo.version}
      ${versionInfo.appVersion ? `appVersion: ${versionInfo.appVersion}` : ''}
      ${versionInfo.digest ? `digest: ${versionInfo.digest}` : ''}
`;

          mockedAxios.create.mockImplementationOnce(() => {
            mockAxiosInstance = {
              get: jest.fn().mockResolvedValue({
                data: helmIndexYAML,
              }),
              interceptors: {
                request: {
                  use: jest.fn(),
                },
              },
            };
            return mockAxiosInstance;
          });

          const resolver = new VersionResolver(config);
          const versionMap = await resolver.resolveVersions([dependency]);

          const key = `${dependency.repoURL}/${dependency.chartName}`;
          const fetchedVersions = versionMap.get(key);

          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBe(1);

          const fetchedVersion = fetchedVersions![0];
          expect(fetchedVersion.version).toBe(versionInfo.version);
          
          if (versionInfo.appVersion) {
            expect(fetchedVersion.appVersion).toBe(versionInfo.appVersion);
          }
          
          if (versionInfo.digest) {
            expect(fetchedVersion.digest).toBe(versionInfo.digest);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 7.7: Empty repository handling
   * 
   * For any repository that returns an empty list of versions/tags,
   * the resolver should return an empty array without errors.
   */
  it('should handle repositories with no versions gracefully', () => {
    fc.assert(
      fc.asyncProperty(
        fc.oneof(arbHelmDependency, arbOCIDependency),
        async (dependency) => {
          // Capture the mock instance that will be created for this VersionResolver
          let mockAxiosInstance: any;
          
          if (dependency.repoType === 'helm') {
            const helmIndexYAML = `apiVersion: v1\nentries:\n  ${dependency.chartName}: []`;
            mockedAxios.create.mockImplementationOnce(() => {
              mockAxiosInstance = {
                get: jest.fn().mockResolvedValue({
                  data: helmIndexYAML,
                }),
                interceptors: {
                  request: {
                    use: jest.fn(),
                  },
                },
              };
              return mockAxiosInstance;
            });
          } else {
            const ociResponse = {
              name: dependency.chartName,
              tags: [],
            };
            mockedAxios.create.mockImplementationOnce(() => {
              mockAxiosInstance = {
                get: jest.fn().mockResolvedValue({
                  data: ociResponse,
                }),
                interceptors: {
                  request: {
                    use: jest.fn(),
                  },
                },
              };
              return mockAxiosInstance;
            });
          }

          const resolver = new VersionResolver(config);
          const versionMap = await resolver.resolveVersions([dependency]);

          const key = `${dependency.repoURL}/${dependency.chartName}`;
          const fetchedVersions = versionMap.get(key);

          // Should return empty array, not undefined
          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions).toEqual([]);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 7.8: Chart not in repository
   * 
   * For any Helm repository that doesn't contain the requested chart,
   * the resolver should return an empty array for that chart.
   */
  it('should return empty array when chart is not in repository', () => {
    fc.assert(
      fc.asyncProperty(
        arbHelmDependency,
        arbChartName,
        async (dependency, otherChartName) => {
          // Capture the mock instance that will be created for this VersionResolver
          let mockAxiosInstance: any;
          
          // Ensure we're looking for a different chart
          if (dependency.chartName === otherChartName) {
            return;
          }

          // Index contains a different chart
          const helmIndexYAML = `apiVersion: v1
entries:
  ${otherChartName}:
    - name: ${otherChartName}
      version: 1.0.0
`;

          mockedAxios.create.mockImplementationOnce(() => {
            mockAxiosInstance = {
              get: jest.fn().mockResolvedValue({
                data: helmIndexYAML,
              }),
              interceptors: {
                request: {
                  use: jest.fn(),
                },
              },
            };
            return mockAxiosInstance;
          });

          const resolver = new VersionResolver(config);
          const versionMap = await resolver.resolveVersions([dependency]);

          const key = `${dependency.repoURL}/${dependency.chartName}`;
          const fetchedVersions = versionMap.get(key);

          // Should return empty array for missing chart
          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions).toEqual([]);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 7.9: Consistent results across multiple calls
   * 
   * For any dependency, fetching versions multiple times should
   * return identical results (idempotent operation with caching).
   */
  it('should return consistent results across multiple fetches', () => {
    fc.assert(
      fc.asyncProperty(
        fc.oneof(arbHelmDependency, arbOCIDependency),
        fc.array(arbSemVer, { minLength: 1, maxLength: 10 }),
        async (dependency, versions) => {
          // Capture the mock instance that will be created for this VersionResolver
          let mockAxiosInstance: any;
          
          if (dependency.repoType === 'helm') {
            const helmIndexYAML = `apiVersion: v1
entries:
  ${dependency.chartName}:
${versions.map(v => `    - name: ${dependency.chartName}\n      version: ${v}`).join('\n')}
`;
            mockedAxios.create.mockImplementationOnce(() => {
              mockAxiosInstance = {
                get: jest.fn().mockResolvedValue({
                  data: helmIndexYAML,
                }),
                interceptors: {
                  request: {
                    use: jest.fn(),
                  },
                },
              };
              return mockAxiosInstance;
            });
          } else {
            const ociResponse = {
              name: dependency.chartName,
              tags: versions,
            };
            mockedAxios.create.mockImplementationOnce(() => {
              mockAxiosInstance = {
                get: jest.fn().mockResolvedValue({
                  data: ociResponse,
                }),
                interceptors: {
                  request: {
                    use: jest.fn(),
                  },
                },
              };
              return mockAxiosInstance;
            });
          }

          const resolver = new VersionResolver(config);
          
          // First fetch
          const versionMap1 = await resolver.resolveVersions([dependency]);
          const key = `${dependency.repoURL}/${dependency.chartName}`;
          const versions1 = versionMap1.get(key);

          // Second fetch (should use cache)
          const versionMap2 = await resolver.resolveVersions([dependency]);
          const versions2 = versionMap2.get(key);

          // Results should be identical
          expect(versions1).toEqual(versions2);

          // Should only fetch once (second call uses cache)
          expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 7.10: Mixed repository types
   * 
   * For any set of dependencies with mixed repository types
   * (Helm and OCI), all versions should be fetched correctly.
   */
  it('should fetch versions from mixed Helm and OCI repositories', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(arbHelmDependency, { minLength: 1, maxLength: 3 }),
        fc.array(arbOCIDependency, { minLength: 1, maxLength: 3 }),
        async (helmDeps, ociDeps) => {
          const allDeps = [...helmDeps, ...ociDeps];

          // Capture the mock instance that will be created for this VersionResolver
          let mockAxiosInstance: any;

          // Group Helm dependencies by repository
          const helmDepsByRepo = new Map<string, typeof helmDeps>();
          helmDeps.forEach(dep => {
            const normalizedRepo = dep.repoURL.replace(/\/$/, '');
            if (!helmDepsByRepo.has(normalizedRepo)) {
              helmDepsByRepo.set(normalizedRepo, []);
            }
            helmDepsByRepo.get(normalizedRepo)!.push(dep);
          });

          // Mock responses for each dependency
          mockedAxios.create.mockImplementationOnce(() => {
            mockAxiosInstance = {
              get: jest.fn().mockImplementation((url: string) => {
                if (url.includes('/index.yaml')) {
                  // Helm repository - find which repo this is for
                  for (const [repoURL, deps] of helmDepsByRepo.entries()) {
                    if (url.includes(repoURL)) {
                      // Build index with all charts from this repository
                      const entries = deps.map(d => 
                        `  ${d.chartName}:\n    - name: ${d.chartName}\n      version: 1.0.0`
                      ).join('\n');
                      return Promise.resolve({
                        data: `apiVersion: v1\nentries:\n${entries}`,
                      });
                    }
                  }
                } else if (url.includes('/tags/list')) {
                  // OCI registry - extract chart name from URL
                  // URL format: https://registry/v2/{chartName}/tags/list
                  const match = url.match(/\/v2\/([^/]+)\/tags\/list$/);
                  if (match) {
                    const chartName = match[1];
                    const dep = ociDeps.find(d => d.chartName === chartName);
                    if (dep) {
                      return Promise.resolve({
                        data: { name: dep.chartName, tags: ['1.0.0'] },
                      });
                    }
                  }
                }
                return Promise.reject(new Error('Not found'));
              }),
              interceptors: {
                request: {
                  use: jest.fn(),
                },
              },
            };
            return mockAxiosInstance;
          });

          const resolver = new VersionResolver(config);
          const versionMap = await resolver.resolveVersions(allDeps);

          // All dependencies should have versions
          allDeps.forEach(dep => {
            const key = `${dep.repoURL}/${dep.chartName}`;
            const versions = versionMap.get(key);
            expect(versions).toBeDefined();
            expect(versions!.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 20 }
    );
  });
});
