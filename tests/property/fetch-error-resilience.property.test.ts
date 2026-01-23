/**
 * Property-based tests for VersionResolver - Fetch Error Resilience
 * 
 * **Property 9: Repository Fetch Error Resilience**
 * **Validates: Requirements 3.4**
 * 
 * For any set of chart dependencies where some repositories are unreachable,
 * the action should log errors for unreachable repositories and continue
 * processing reachable ones.
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
  let mockAxiosInstance: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Spy on console.error to verify error logging (don't mock implementation)
    consoleErrorSpy = jest.spyOn(console, 'error');

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

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
    
    // Ensure mocks are completely reset after each test
    jest.restoreAllMocks();
  });

  /**
   * Property 9.1: Continue processing after HTTP errors
   * 
   * For any set of dependencies where some repositories return HTTP errors,
   * the resolver should log errors for failed repositories and successfully
   * fetch versions from reachable repositories.
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

          // Reset mocks
          mockAxiosInstance.get.mockReset();
          consoleErrorSpy.mockClear();
          

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

          // Mock implementation
          mockAxiosInstance.get.mockImplementation((url: string) => {
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

          const resolver = new VersionResolver(config);
          const versionMap = await resolver.resolveVersions([failingDep, successDep]);

          // Should log error for failing repository
          expect(consoleErrorSpy).toHaveBeenCalled();
          const errorMessages = consoleErrorSpy.mock.calls.map(call => String(call[0]));
          const hasFailingRepoError = errorMessages.some(msg =>
            msg.includes('charts.failing.com')
          );
          expect(hasFailingRepoError).toBe(true);

          // Should successfully fetch versions from successful repository
          const successKey = `${successDep.repoURL}/${successDep.chartName}`;
          const fetchedVersions = versionMap.get(successKey);
          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBeGreaterThan(0);

          // Failing repository should not have versions in the map
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
   * the resolver should log errors and continue processing reachable repositories.
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

          // Reset mocks
          mockAxiosInstance.get.mockReset();
          consoleErrorSpy.mockClear();
          

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

          // Mock implementation
          mockAxiosInstance.get.mockImplementation((url: string) => {
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

          const resolver = new VersionResolver(config);
          const versionMap = await resolver.resolveVersions([failingDep, successDep]);

          // Should log error for failing repository
          expect(consoleErrorSpy).toHaveBeenCalled();
          const errorMessages = consoleErrorSpy.mock.calls.map(call => String(call[0]));
          const hasFailingRepoError = errorMessages.some(msg =>
            msg.includes('charts.failing.com')
          );
          expect(hasFailingRepoError).toBe(true);

          // Should successfully fetch versions from successful repository
          const successKey = `${successDep.repoURL}/${successDep.chartName}`;
          const fetchedVersions = versionMap.get(successKey);
          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBeGreaterThan(0);

          // Failing repository should not have versions in the map
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
   * the resolver should log errors for all repositories and
   * return an empty version map without throwing exceptions.
   */
  it('should handle all repositories failing gracefully', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(arbChartName, { minLength: 1, maxLength: 3 }),
        arbHTTPErrorCode,
        async (chartNames, errorCode) => {
          // Reset mocks
          mockAxiosInstance.get.mockReset();
          consoleErrorSpy.mockClear();
          

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

          // All repositories will fail
          mockAxiosInstance.get.mockImplementation(() => {
            const error: any = new Error(`Request failed with status code ${errorCode}`);
            error.isAxiosError = true;
            error.response = { status: errorCode };
            return Promise.reject(error);
          });

          const resolver = new VersionResolver(config);
          
          // Should not throw
          const versionMap = await resolver.resolveVersions(dependencies);

          // Should log errors for all repositories
          expect(consoleErrorSpy).toHaveBeenCalled();
          expect(consoleErrorSpy.mock.calls.length).toBeGreaterThanOrEqual(dependencies.length);

          // Version map should be empty
          expect(versionMap.size).toBe(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 9.4: Error message contains repository URL
   * 
   * For any repository that fails, the error message logged should
   * contain the repository URL to help with debugging.
   */
  it('should include repository URL in error messages', () => {
    fc.assert(
      fc.asyncProperty(
        arbChartName,
        arbHTTPErrorCode,
        async (chartName, errorCode) => {
          // Reset mocks
          mockAxiosInstance.get.mockReset();
          consoleErrorSpy.mockClear();
          

          const dependency: HelmDependency = {
            manifestPath: 'apps/app.yaml',
            documentIndex: 0,
            chartName,
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          };

          // Repository will fail
          mockAxiosInstance.get.mockImplementation(() => {
            const error: any = new Error(`Request failed with status code ${errorCode}`);
            error.isAxiosError = true;
            error.response = { status: errorCode };
            return Promise.reject(error);
          });

          const resolver = new VersionResolver(config);
          await resolver.resolveVersions([dependency]);

          // Should log error
          expect(consoleErrorSpy).toHaveBeenCalled();

          // Error message should contain repository URL
          const errorMessages = consoleErrorSpy.mock.calls.map(call => String(call[0]));
          const hasRepoURL = errorMessages.some(msg =>
            msg.includes(dependency.repoURL)
          );
          expect(hasRepoURL).toBe(true);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 9.5: Timeout errors are handled gracefully
   * 
   * For any repository that times out, the resolver should log
   * the error and continue processing other repositories.
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

          // Reset mocks
          mockAxiosInstance.get.mockReset();
          consoleErrorSpy.mockClear();
          

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

          // Mock implementation
          mockAxiosInstance.get.mockImplementation((url: string) => {
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

          const resolver = new VersionResolver(config);
          const versionMap = await resolver.resolveVersions([timeoutDep, successDep]);

          // Should log error for timeout
          expect(consoleErrorSpy).toHaveBeenCalled();

          // Should successfully fetch from other repository
          const successKey = `${successDep.repoURL}/${successDep.chartName}`;
          const fetchedVersions = versionMap.get(successKey);
          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 30 }
    );
  });
});
