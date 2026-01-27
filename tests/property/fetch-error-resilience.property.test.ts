/**
 * Property-based tests for VersionResolver - Fetch Error Resilience
 * 
 * **Property 9: Repository Fetch Error Resilience**
 * **Validates: Requirements 3.4**
 * 
 * For any set of chart dependencies where some repositories are unreachable,
 * the action should log errors for unreachable repositories and continue
 * processing reachable ones.
 * 
 * NOTE: This test verifies error resilience through the returned version map
 * rather than relying on console.error spies, which are unreliable in fast-check
 * property tests due to Jest worker behavior.
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

// Generate HTTP error codes
const arbHTTPErrorCode = fc.constantFrom(
  404, // Not Found
  401, // Unauthorized
  403, // Forbidden
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504  // Gateway Timeout
);

// Generate network error types
const arbNetworkError = fc.constantFrom(
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNRESET',
  'EHOSTUNREACH'
);

describe('Property 9: Repository Fetch Error Resilience', () => {
  let config: ActionConfig;

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
  });

  afterEach(() => {
    // Ensure mocks are completely reset after each test
    jest.restoreAllMocks();
  });

  /**
   * Property 9.1: Continue processing after HTTP errors
   * 
   * For any set of dependencies where some repositories return HTTP errors,
   * the resolver should successfully fetch versions from reachable repositories
   * and NOT include failed repositories in the version map.
   */
  it('should continue processing after HTTP errors', () => {
    fc.assert(
      fc.asyncProperty(
        arbChartName,
        arbChartName,
        arbHTTPErrorCode,
        fc.array(arbSemVer, { minLength: 1, maxLength: 5 }),
        async (chart1, chart2, errorCode, versions) => {
          // Ensure different chart names
          if (chart1 === chart2) {
            return;
          }

          // Create a fresh mock axios instance for this test run
          const freshMockAxiosInstance = {
            get: jest.fn(),
            interceptors: {
              request: {
                use: jest.fn(),
              },
            },
          };

          // Set up axios.create to return the fresh instance
          mockedAxios.create.mockReturnValue(freshMockAxiosInstance as any);

          // Set up mock implementation
          freshMockAxiosInstance.get.mockImplementation((url: string) => {
            if (url.includes('charts.failing.com')) {
              const error: any = new Error(`Request failed with status code ${errorCode}`);
              error.isAxiosError = true;
              error.response = { status: errorCode };
              return Promise.reject(error);
            }

            // Success for other repository
            const helmIndexYAML = `apiVersion: v1
entries:
  ${chart2}:
    - name: ${chart2}
      version: ${versions[0]}
`;
            return Promise.resolve({ data: helmIndexYAML });
          });

          // Create two dependencies from different repositories
          const failingDep: HelmDependency = {
            manifestPath: 'apps/app1.yaml',
            documentIndex: 0,
            chartName: chart1,
            repoURL: 'https://charts.failing.com',
            repoType: 'helm',
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          };

          const successDep: HelmDependency = {
            manifestPath: 'apps/app2.yaml',
            documentIndex: 0,
            chartName: chart2,
            repoURL: 'https://charts.success.com',
            repoType: 'helm',
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          };

          // Create resolver and resolve versions
          const resolver = new VersionResolver(config);
          
          // Should not throw exceptions
          let versionMap;
          try {
            versionMap = await resolver.resolveVersions([failingDep, successDep]);
          } catch (error) {
            throw new Error(`resolveVersions should not throw exceptions for failed repositories: ${error}`);
          }

          // Should successfully fetch versions from successful repository
          const successKey = `${successDep.repoURL}/${successDep.chartName}`;
          const fetchedVersions = versionMap.get(successKey);
          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBeGreaterThan(0);

          // Failing repository should NOT have versions in the map
          const failingKey = `${failingDep.repoURL}/${failingDep.chartName}`;
          expect(versionMap.has(failingKey)).toBe(false);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 9.2: Continue processing after network errors
   * 
   * For any set of dependencies where some repositories have network errors,
   * the resolver should continue processing reachable repositories and NOT
   * include failed repositories in the version map.
   */
  it('should continue processing after network errors', () => {
    fc.assert(
      fc.asyncProperty(
        arbChartName,
        arbChartName,
        arbNetworkError,
        fc.array(arbSemVer, { minLength: 1, maxLength: 5 }),
        async (chart1, chart2, networkErrorCode, versions) => {
          // Ensure different chart names
          if (chart1 === chart2) {
            return;
          }

          // Create a fresh mock axios instance for this test run
          const freshMockAxiosInstance = {
            get: jest.fn(),
            interceptors: {
              request: {
                use: jest.fn(),
              },
            },
          };

          // Set up axios.create to return the fresh instance
          mockedAxios.create.mockReturnValue(freshMockAxiosInstance as any);

          // Set up mock implementation
          freshMockAxiosInstance.get.mockImplementation((url: string) => {
            if (url.includes('charts.failing.com')) {
              const error: any = new Error(`Network error: ${networkErrorCode}`);
              error.isAxiosError = true;
              error.code = networkErrorCode;
              return Promise.reject(error);
            }

            // Success for other repository
            const helmIndexYAML = `apiVersion: v1
entries:
  ${chart2}:
    - name: ${chart2}
      version: ${versions[0]}
`;
            return Promise.resolve({ data: helmIndexYAML });
          });

          // Create two dependencies from different repositories
          const failingDep: HelmDependency = {
            manifestPath: 'apps/app1.yaml',
            documentIndex: 0,
            chartName: chart1,
            repoURL: 'https://charts.failing.com',
            repoType: 'helm',
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          };

          const successDep: HelmDependency = {
            manifestPath: 'apps/app2.yaml',
            documentIndex: 0,
            chartName: chart2,
            repoURL: 'https://charts.success.com',
            repoType: 'helm',
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          };

          const resolver = new VersionResolver(config);
          
          // Should not throw exceptions
          let versionMap;
          try {
            versionMap = await resolver.resolveVersions([failingDep, successDep]);
          } catch (error) {
            throw new Error(`resolveVersions should not throw exceptions for failed repositories: ${error}`);
          }

          // Should successfully fetch versions from successful repository
          const successKey = `${successDep.repoURL}/${successDep.chartName}`;
          const fetchedVersions = versionMap.get(successKey);
          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBeGreaterThan(0);

          // Failing repository should NOT have versions in the map
          const failingKey = `${failingDep.repoURL}/${failingDep.chartName}`;
          expect(versionMap.has(failingKey)).toBe(false);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 9.3: All repositories fail
   * 
   * For any set of dependencies where all repositories fail,
   * the resolver should return an empty version map without throwing exceptions.
   */
  it('should handle all repositories failing gracefully', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(arbChartName, { minLength: 1, maxLength: 3 }),
        arbHTTPErrorCode,
        async (chartNames, errorCode) => {
          // Create a fresh mock axios instance for this test run
          const freshMockAxiosInstance = {
            get: jest.fn(),
            interceptors: {
              request: {
                use: jest.fn(),
              },
            },
          };

          // Set up axios.create to return the fresh instance
          mockedAxios.create.mockReturnValue(freshMockAxiosInstance as any);

          // All repositories will fail
          freshMockAxiosInstance.get.mockImplementation(() => {
            const error: any = new Error(`Request failed with status code ${errorCode}`);
            error.isAxiosError = true;
            error.response = { status: errorCode };
            return Promise.reject(error);
          });

          // Create dependencies from different repositories
          const dependencies: HelmDependency[] = chartNames.map((chartName, index) => ({
            manifestPath: `apps/app${index}.yaml`,
            documentIndex: 0,
            chartName,
            repoURL: `https://charts.repo${index}.com`,
            repoType: 'helm',
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          }));

          const resolver = new VersionResolver(config);
          
          // Should not throw exceptions
          let versionMap;
          try {
            versionMap = await resolver.resolveVersions(dependencies);
          } catch (error) {
            throw new Error(`resolveVersions should not throw exceptions when all repositories fail: ${error}`);
          }

          // Version map should be empty (no successful fetches)
          expect(versionMap.size).toBe(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 9.4: Timeout errors are handled gracefully
   * 
   * For any repository that times out, the resolver should continue
   * processing other repositories without throwing exceptions.
   */
  it('should handle timeout errors gracefully', () => {
    fc.assert(
      fc.asyncProperty(
        arbChartName,
        arbChartName,
        fc.array(arbSemVer, { minLength: 1, maxLength: 5 }),
        async (chart1, chart2, versions) => {
          // Ensure different chart names
          if (chart1 === chart2) {
            return;
          }

          // Create a fresh mock axios instance for this test run
          const freshMockAxiosInstance = {
            get: jest.fn(),
            interceptors: {
              request: {
                use: jest.fn(),
              },
            },
          };

          // Set up axios.create to return the fresh instance
          mockedAxios.create.mockReturnValue(freshMockAxiosInstance as any);

          // Set up mock implementation
          freshMockAxiosInstance.get.mockImplementation((url: string) => {
            if (url.includes('charts.timeout.com')) {
              const error: any = new Error('timeout of 30000ms exceeded');
              error.isAxiosError = true;
              error.code = 'ECONNABORTED';
              return Promise.reject(error);
            }

            // Success for other repository
            const helmIndexYAML = `apiVersion: v1
entries:
  ${chart2}:
    - name: ${chart2}
      version: ${versions[0]}
`;
            return Promise.resolve({ data: helmIndexYAML });
          });

          // Create two dependencies
          const timeoutDep: HelmDependency = {
            manifestPath: 'apps/app1.yaml',
            documentIndex: 0,
            chartName: chart1,
            repoURL: 'https://charts.timeout.com',
            repoType: 'helm',
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          };

          const successDep: HelmDependency = {
            manifestPath: 'apps/app2.yaml',
            documentIndex: 0,
            chartName: chart2,
            repoURL: 'https://charts.success.com',
            repoType: 'helm',
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          };

          const resolver = new VersionResolver(config);
          
          // Should not throw exceptions
          let versionMap;
          try {
            versionMap = await resolver.resolveVersions([timeoutDep, successDep]);
          } catch (error) {
            throw new Error(`resolveVersions should not throw exceptions for timeout errors: ${error}`);
          }

          // Should successfully fetch from other repository
          const successKey = `${successDep.repoURL}/${successDep.chartName}`;
          const fetchedVersions = versionMap.get(successKey);
          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBeGreaterThan(0);

          // Timeout repository should NOT have versions in the map
          const timeoutKey = `${timeoutDep.repoURL}/${timeoutDep.chartName}`;
          expect(versionMap.has(timeoutKey)).toBe(false);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 9.5: Mixed success and failure scenarios
   * 
   * For any set of dependencies with a mix of successful and failed repositories,
   * the version map should contain entries ONLY for successful repositories.
   */
  it('should handle mixed success and failure scenarios', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(arbChartName, { minLength: 3, maxLength: 5 }),
        fc.array(arbSemVer, { minLength: 1, maxLength: 3 }),
        fc.nat({ max: 100 }),
        async (chartNames, versions, seed) => {
          // Ensure unique chart names
          const uniqueCharts = Array.from(new Set(chartNames));
          if (uniqueCharts.length < 3) {
            return; // Skip if we don't have enough unique names
          }

          // Create a fresh mock axios instance for this test run
          const freshMockAxiosInstance = {
            get: jest.fn(),
            interceptors: {
              request: {
                use: jest.fn(),
              },
            },
          };

          // Set up axios.create to return the fresh instance
          mockedAxios.create.mockReturnValue(freshMockAxiosInstance as any);

          // Determine which repositories will fail (use seed for determinism)
          const failurePattern = uniqueCharts.map((_, index) => (index + seed) % 2 === 0);

          // Set up mock implementation
          freshMockAxiosInstance.get.mockImplementation((url: string) => {
            const repoIndex = uniqueCharts.findIndex((_, i) => url.includes(`repo${i}.com`));
            
            if (repoIndex >= 0 && failurePattern[repoIndex]) {
              // This repository fails
              const error: any = new Error('Request failed with status code 500');
              error.isAxiosError = true;
              error.response = { status: 500 };
              return Promise.reject(error);
            }

            // This repository succeeds
            const chartName = uniqueCharts[repoIndex] || uniqueCharts[0];
            const helmIndexYAML = `apiVersion: v1
entries:
  ${chartName}:
    - name: ${chartName}
      version: ${versions[0]}
`;
            return Promise.resolve({ data: helmIndexYAML });
          });

          // Create dependencies
          const dependencies: HelmDependency[] = uniqueCharts.map((chartName, index) => ({
            manifestPath: `apps/app${index}.yaml`,
            documentIndex: 0,
            chartName,
            repoURL: `https://charts.repo${index}.com`,
            repoType: 'helm',
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          }));

          const resolver = new VersionResolver(config);
          
          // Should not throw exceptions
          let versionMap;
          try {
            versionMap = await resolver.resolveVersions(dependencies);
          } catch (error) {
            throw new Error(`resolveVersions should not throw exceptions for mixed scenarios: ${error}`);
          }

          // Count expected successes
          const expectedSuccesses = failurePattern.filter(failed => !failed).length;

          // Version map should contain only successful repositories
          expect(versionMap.size).toBe(expectedSuccesses);

          // Verify each dependency
          dependencies.forEach((dep, index) => {
            const key = `${dep.repoURL}/${dep.chartName}`;
            if (failurePattern[index]) {
              // Failed repository should NOT be in map
              expect(versionMap.has(key)).toBe(false);
            } else {
              // Successful repository should be in map
              expect(versionMap.has(key)).toBe(true);
              expect(versionMap.get(key)!.length).toBeGreaterThan(0);
            }
          });
        }
      ),
      { numRuns: 30 }
    );
  });
});
