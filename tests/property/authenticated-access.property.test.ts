/**
 * Property-based tests for VersionResolver - Authenticated Repository Access
 * 
 * **Property 8: Authenticated Repository Access**
 * **Validates: Requirements 3.3**
 * 
 * For any repository requiring authentication, when valid credentials are
 * provided in configuration, the action should successfully fetch version
 * information.
 */

import * as fc from 'fast-check';
import axios from 'axios';
import { VersionResolver } from '../../src/resolver/version-resolver';
import { ActionConfig, RegistryCredential } from '../../src/types/config';
import { HelmDependency } from '../../src/types/dependency';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Custom arbitraries for generating test data
 */

// Generate valid Kubernetes resource names (DNS-1123 subdomain)
// Must be 2-63 characters, start and end with alphanumeric, contain only lowercase alphanumeric and hyphens
// The regex ensures at least 2 characters by requiring start char, middle chars (0 or more), and end char
const arbChartName = fc.stringMatching(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/);

// Generate semantic version
const arbSemVer = fc.tuple(
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 }),
  fc.nat({ max: 100 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// Generate registry URL (without protocol for matching)
const arbRegistryDomain = fc.constantFrom(
  'charts.private.example.com',
  'registry.internal.company.com',
  'helm.secure.org',
  'private-registry.io',
  'ghcr.io'
);

// Generate Helm repository URL with private registry
const arbPrivateHelmRepoURL = arbRegistryDomain.map(
  domain => `https://${domain}/charts`
);

// Generate OCI registry URL with private registry
const arbPrivateOCIRepoURL = arbRegistryDomain.map(
  domain => `oci://${domain}`
);

// Generate username
const arbUsername = fc.stringMatching(/^[a-z][a-z0-9_-]{2,15}$/);

// Generate password/token
const arbPassword = fc.hexaString({ minLength: 16, maxLength: 64 });

// Generate auth type
const arbAuthType = fc.constantFrom('basic' as const, 'bearer' as const);

// Generate registry credential with proper username for basic auth
const arbRegistryCredential = fc
  .record({
    registry: arbRegistryDomain,
    authType: arbAuthType,
    password: arbPassword,
  })
  .chain((base) => {
    // If basic auth, username is required
    if (base.authType === 'basic') {
      return arbUsername.map((username) => ({
        ...base,
        username,
      }));
    }
    // If bearer auth, username is optional
    return fc.constant(base);
  });

// Generate Helm dependency with private repository
const arbPrivateHelmDependency = fc.record({
  manifestPath: fc.constantFrom('apps/app.yaml', 'manifests/deployment.yaml'),
  documentIndex: fc.nat({ max: 5 }),
  chartName: arbChartName,
  repoURL: arbPrivateHelmRepoURL,
  repoType: fc.constant('helm' as const),
  currentVersion: arbSemVer,
  versionPath: fc.constant(['spec', 'source', 'targetRevision']),
});

// Generate OCI dependency with private registry
const arbPrivateOCIDependency = fc.record({
  manifestPath: fc.constantFrom('apps/app.yaml', 'manifests/deployment.yaml'),
  documentIndex: fc.nat({ max: 5 }),
  chartName: arbChartName,
  repoURL: arbPrivateOCIRepoURL,
  repoType: fc.constant('oci' as const),
  currentVersion: arbSemVer,
  versionPath: fc.constant(['spec', 'source', 'targetRevision']),
});

describe('Property 8: Authenticated Repository Access', () => {
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

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
    // Ensure mocks are completely reset after each test
    jest.restoreAllMocks();
  });

  /**
   * Helper function to create config with credentials
   */
  function createConfigWithCredentials(
    credentials: RegistryCredential[]
  ): ActionConfig {
    return {
      includePaths: ['**/*.yaml'],
      excludePaths: [],
      updateStrategy: 'all',
      registryCredentials: credentials,
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
  }

  /**
   * Property 8.1: Basic authentication for Helm repositories
   * 
   * For any private Helm repository with basic auth credentials,
   * the resolver should successfully fetch versions using the
   * provided username and password.
   */
  it('should authenticate with basic auth for Helm repositories', () => {
    fc.assert(
      fc.asyncProperty(
        arbPrivateHelmDependency,
        arbUsername,
        arbPassword,
        fc.array(arbSemVer, { minLength: 1, maxLength: 10 }),
        async (dependency, username, password, versions) => {
          // Reset mock for each property test iteration
          mockAxiosInstance.get.mockReset();
          mockAxiosInstance.interceptors.request.use.mockReset();

          // Create credential matching the repository
          const registryDomain = dependency.repoURL.replace('https://', '').split('/')[0];
          const credential: RegistryCredential = {
            registry: registryDomain,
            authType: 'basic',
            username,
            password,
          };

          const config = createConfigWithCredentials([credential]);

          // Create Helm index YAML
          const helmIndexYAML = `apiVersion: v1
entries:
  ${dependency.chartName}:
${versions.map(v => `    - name: ${dependency.chartName}
      version: ${v}`).join('\n')}
`;

          // Capture the interceptor function
          let interceptorFn: any;
          mockAxiosInstance.interceptors.request.use.mockImplementation((fn: any) => {
            interceptorFn = fn;
          });

          // Mock successful response
          mockAxiosInstance.get.mockResolvedValueOnce({
            data: helmIndexYAML,
          });

          const resolver = new VersionResolver(config);

          // Verify interceptor was registered
          expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();

          // Simulate the interceptor being called
          if (interceptorFn) {
            const mockRequestConfig = {
              url: `${dependency.repoURL}/index.yaml`,
              headers: {},
            };
            const modifiedConfig = interceptorFn(mockRequestConfig);

            // Verify basic auth was added
            expect(modifiedConfig.auth).toBeDefined();
            expect(modifiedConfig.auth.username).toBe(username);
            expect(modifiedConfig.auth.password).toBe(password);
          }

          // Fetch versions
          const versionMap = await resolver.resolveVersions([dependency]);

          // Should successfully fetch versions
          const key = `${dependency.repoURL}/${dependency.chartName}`;
          const fetchedVersions = versionMap.get(key);

          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBe(versions.length);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 8.2: Bearer token authentication for Helm repositories
   * 
   * For any private Helm repository with bearer token credentials,
   * the resolver should successfully fetch versions using the
   * provided token.
   */
  it('should authenticate with bearer token for Helm repositories', () => {
    fc.assert(
      fc.asyncProperty(
        arbPrivateHelmDependency,
        arbPassword,
        fc.array(arbSemVer, { minLength: 1, maxLength: 10 }),
        async (dependency, token, versions) => {
          // Reset mock for each property test iteration
          mockAxiosInstance.get.mockReset();
          mockAxiosInstance.interceptors.request.use.mockReset();

          // Create credential matching the repository
          const registryDomain = dependency.repoURL.replace('https://', '').split('/')[0];
          const credential: RegistryCredential = {
            registry: registryDomain,
            authType: 'bearer',
            password: token,
          };

          const config = createConfigWithCredentials([credential]);

          // Create Helm index YAML
          const helmIndexYAML = `apiVersion: v1
entries:
  ${dependency.chartName}:
${versions.map(v => `    - name: ${dependency.chartName}
      version: ${v}`).join('\n')}
`;

          // Capture the interceptor function
          let interceptorFn: any;
          mockAxiosInstance.interceptors.request.use.mockImplementation((fn: any) => {
            interceptorFn = fn;
          });

          // Mock successful response
          mockAxiosInstance.get.mockResolvedValueOnce({
            data: helmIndexYAML,
          });

          const resolver = new VersionResolver(config);

          // Verify interceptor was registered
          expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();

          // Simulate the interceptor being called
          if (interceptorFn) {
            const mockRequestConfig = {
              url: `${dependency.repoURL}/index.yaml`,
              headers: {},
            };
            const modifiedConfig = interceptorFn(mockRequestConfig);

            // Verify bearer token was added
            expect(modifiedConfig.headers.Authorization).toBe(`Bearer ${token}`);
          }

          // Fetch versions
          const versionMap = await resolver.resolveVersions([dependency]);

          // Should successfully fetch versions
          const key = `${dependency.repoURL}/${dependency.chartName}`;
          const fetchedVersions = versionMap.get(key);

          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBe(versions.length);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 8.3: Basic authentication for OCI registries
   * 
   * For any private OCI registry with basic auth credentials,
   * the resolver should successfully fetch tags using the
   * provided username and password.
   */
  it('should authenticate with basic auth for OCI registries', () => {
    fc.assert(
      fc.asyncProperty(
        arbPrivateOCIDependency,
        arbUsername,
        arbPassword,
        fc.array(arbSemVer, { minLength: 1, maxLength: 10 }),
        async (dependency, username, password, tags) => {
          // Reset mock for each property test iteration
          mockAxiosInstance.get.mockReset();
          mockAxiosInstance.interceptors.request.use.mockReset();

          // Create credential matching the registry
          const registryDomain = dependency.repoURL.replace('oci://', '').split('/')[0];
          const credential: RegistryCredential = {
            registry: registryDomain,
            authType: 'basic',
            username,
            password,
          };

          const config = createConfigWithCredentials([credential]);

          // Create OCI tags response
          const ociResponse = {
            name: dependency.chartName,
            tags: tags,
          };

          // Capture the interceptor function
          let interceptorFn: any;
          mockAxiosInstance.interceptors.request.use.mockImplementation((fn: any) => {
            interceptorFn = fn;
          });

          // Mock successful response
          mockAxiosInstance.get.mockResolvedValueOnce({
            data: ociResponse,
          });

          const resolver = new VersionResolver(config);

          // Verify interceptor was registered
          expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();

          // Simulate the interceptor being called
          if (interceptorFn) {
            const mockRequestConfig = {
              url: `https://${registryDomain}/v2/${dependency.chartName}/tags/list`,
              headers: {},
            };
            const modifiedConfig = interceptorFn(mockRequestConfig);

            // Verify basic auth was added
            expect(modifiedConfig.auth).toBeDefined();
            expect(modifiedConfig.auth.username).toBe(username);
            expect(modifiedConfig.auth.password).toBe(password);
          }

          // Fetch versions
          const versionMap = await resolver.resolveVersions([dependency]);

          // Should successfully fetch tags
          const key = `${dependency.repoURL}/${dependency.chartName}`;
          const fetchedVersions = versionMap.get(key);

          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBe(tags.length);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 8.4: Bearer token authentication for OCI registries
   * 
   * For any private OCI registry with bearer token credentials,
   * the resolver should successfully fetch tags using the
   * provided token.
   */
  it('should authenticate with bearer token for OCI registries', () => {
    fc.assert(
      fc.asyncProperty(
        arbPrivateOCIDependency,
        arbPassword,
        fc.array(arbSemVer, { minLength: 1, maxLength: 10 }),
        async (dependency, token, tags) => {
          // Reset mock for each property test iteration
          mockAxiosInstance.get.mockReset();
          mockAxiosInstance.interceptors.request.use.mockReset();

          // Create credential matching the registry
          const registryDomain = dependency.repoURL.replace('oci://', '').split('/')[0];
          const credential: RegistryCredential = {
            registry: registryDomain,
            authType: 'bearer',
            password: token,
          };

          const config = createConfigWithCredentials([credential]);

          // Create OCI tags response
          const ociResponse = {
            name: dependency.chartName,
            tags: tags,
          };

          // Capture the interceptor function
          let interceptorFn: any;
          mockAxiosInstance.interceptors.request.use.mockImplementation((fn: any) => {
            interceptorFn = fn;
          });

          // Mock successful response
          mockAxiosInstance.get.mockResolvedValueOnce({
            data: ociResponse,
          });

          const resolver = new VersionResolver(config);

          // Verify interceptor was registered
          expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();

          // Simulate the interceptor being called
          if (interceptorFn) {
            const mockRequestConfig = {
              url: `https://${registryDomain}/v2/${dependency.chartName}/tags/list`,
              headers: {},
            };
            const modifiedConfig = interceptorFn(mockRequestConfig);

            // Verify bearer token was added
            expect(modifiedConfig.headers.Authorization).toBe(`Bearer ${token}`);
          }

          // Fetch versions
          const versionMap = await resolver.resolveVersions([dependency]);

          // Should successfully fetch tags
          const key = `${dependency.repoURL}/${dependency.chartName}`;
          const fetchedVersions = versionMap.get(key);

          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBe(tags.length);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 8.5: Multiple credentials for different registries
   * 
   * For any set of dependencies from different private registries,
   * each with their own credentials, the resolver should apply
   * the correct credentials to each request.
   */
  it('should apply correct credentials for multiple registries', () => {
    fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.tuple(arbRegistryDomain, arbAuthType, arbPassword, fc.option(arbUsername, { nil: undefined })),
          fc.tuple(arbRegistryDomain, arbAuthType, arbPassword, fc.option(arbUsername, { nil: undefined }))
        ),
        async ([tuple1, tuple2]) => {
          // Reset mock for each property test iteration
          mockAxiosInstance.get.mockReset();
          mockAxiosInstance.interceptors.request.use.mockReset();

          const [registryDomain1, authType1, password1, username1] = tuple1;
          const [registryDomain2, authType2, password2, username2] = tuple2;

          // Ensure different registries
          if (registryDomain1 === registryDomain2) {
            return;
          }

          // Skip if basic auth without username
          if ((authType1 === 'basic' && !username1) || (authType2 === 'basic' && !username2)) {
            return;
          }

          const credentials: RegistryCredential[] = [
            {
              registry: registryDomain1,
              authType: authType1,
              password: password1,
              ...(authType1 === 'basic' && username1 ? { username: username1 } : {}),
            },
            {
              registry: registryDomain2,
              authType: authType2,
              password: password2,
              ...(authType2 === 'basic' && username2 ? { username: username2 } : {}),
            },
          ];

          const config = createConfigWithCredentials(credentials);

          // Capture the interceptor function
          let interceptorFn: any;
          mockAxiosInstance.interceptors.request.use.mockImplementation((fn: any) => {
            interceptorFn = fn;
          });

          // Create resolver to register interceptor
          new VersionResolver(config);

          // Verify interceptor was registered
          expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
          expect(interceptorFn).toBeDefined();

          // Test that each registry gets the correct credentials
          if (interceptorFn) {
            // Test first registry
            const mockRequestConfig1 = {
              url: `https://${registryDomain1}/charts/index.yaml`,
              headers: {},
            };
            const modifiedConfig1 = interceptorFn(mockRequestConfig1);

            if (credentials[0].authType === 'bearer') {
              expect(modifiedConfig1.headers.Authorization).toBe(`Bearer ${credentials[0].password}`);
            } else {
              expect(modifiedConfig1.auth).toBeDefined();
              expect(modifiedConfig1.auth.username).toBe(credentials[0].username);
              expect(modifiedConfig1.auth.password).toBe(credentials[0].password);
            }

            // Test second registry
            const mockRequestConfig2 = {
              url: `https://${registryDomain2}/charts/index.yaml`,
              headers: {},
            };
            const modifiedConfig2 = interceptorFn(mockRequestConfig2);

            if (credentials[1].authType === 'bearer') {
              expect(modifiedConfig2.headers.Authorization).toBe(`Bearer ${credentials[1].password}`);
            } else {
              expect(modifiedConfig2.auth).toBeDefined();
              expect(modifiedConfig2.auth.username).toBe(credentials[1].username);
              expect(modifiedConfig2.auth.password).toBe(credentials[1].password);
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 8.6: No authentication for public repositories
   * 
   * For any dependency from a public repository (no matching credentials),
   * the resolver should fetch versions without adding authentication.
   */
  it('should not add authentication for public repositories', () => {
    fc.assert(
      fc.asyncProperty(
        arbPrivateHelmDependency,
        arbRegistryCredential,
        fc.array(arbSemVer, { minLength: 1, maxLength: 5 }),
        async (dependency, credential, versions) => {
          // Reset mock for each property test iteration
          mockAxiosInstance.get.mockReset();
          mockAxiosInstance.interceptors.request.use.mockReset();

          // Use a different registry domain for the credential
          const depRegistryDomain = dependency.repoURL.replace('https://', '').split('/')[0];
          const differentCredential: RegistryCredential = {
            ...credential,
            registry: 'different-' + credential.registry,
          };

          // Ensure they don't match
          if (depRegistryDomain === differentCredential.registry) {
            return; // Skip this iteration
          }

          const config = createConfigWithCredentials([differentCredential]);

          // Create Helm index YAML
          const helmIndexYAML = `apiVersion: v1
entries:
  ${dependency.chartName}:
${versions.map(v => `    - name: ${dependency.chartName}
      version: ${v}`).join('\n')}
`;

          // Capture the interceptor function
          let interceptorFn: any;
          mockAxiosInstance.interceptors.request.use.mockImplementation((fn: any) => {
            interceptorFn = fn;
          });

          // Mock successful response
          mockAxiosInstance.get.mockResolvedValueOnce({
            data: helmIndexYAML,
          });

          const resolver = new VersionResolver(config);

          // Verify interceptor was registered
          expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();

          // Simulate the interceptor being called
          if (interceptorFn) {
            const mockRequestConfig = {
              url: `${dependency.repoURL}/index.yaml`,
              headers: {},
            };
            const modifiedConfig = interceptorFn(mockRequestConfig);

            // Verify no authentication was added (credential doesn't match)
            expect(modifiedConfig.auth).toBeUndefined();
            expect(modifiedConfig.headers.Authorization).toBeUndefined();
          }

          // Fetch versions
          const versionMap = await resolver.resolveVersions([dependency]);

          // Should successfully fetch versions without auth
          const key = `${dependency.repoURL}/${dependency.chartName}`;
          const fetchedVersions = versionMap.get(key);

          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBe(versions.length);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 8.7: Credential pattern matching
   * 
   * For any repository URL and credential with a matching registry pattern,
   * the resolver should correctly identify and apply the credential.
   */
  it('should match credentials by registry pattern', () => {
    fc.assert(
      fc.asyncProperty(
        arbRegistryDomain,
        arbChartName,
        arbRegistryCredential,
        fc.array(arbSemVer, { minLength: 1, maxLength: 5 }),
        async (registryDomain, chartName, credential, versions) => {
          // Reset mock for each property test iteration
          mockAxiosInstance.get.mockReset();
          mockAxiosInstance.interceptors.request.use.mockReset();

          // Create dependency with the registry domain
          const dependency: HelmDependency = {
            manifestPath: 'apps/app.yaml',
            documentIndex: 0,
            chartName,
            repoURL: `https://${registryDomain}/charts`,
            repoType: 'helm',
            currentVersion: '1.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          };

          // Create credential that matches the registry domain
          const matchingCredential: RegistryCredential = {
            ...credential,
            registry: registryDomain,
          };

          const config = createConfigWithCredentials([matchingCredential]);

          // Create Helm index YAML
          const helmIndexYAML = `apiVersion: v1
entries:
  ${chartName}:
${versions.map(v => `    - name: ${chartName}
      version: ${v}`).join('\n')}
`;

          // Capture the interceptor function
          let interceptorFn: any;
          mockAxiosInstance.interceptors.request.use.mockImplementation((fn: any) => {
            interceptorFn = fn;
          });

          // Mock successful response
          mockAxiosInstance.get.mockResolvedValueOnce({
            data: helmIndexYAML,
          });

          const resolver = new VersionResolver(config);

          // Verify interceptor was registered
          expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();

          // Simulate the interceptor being called
          if (interceptorFn) {
            const mockRequestConfig = {
              url: `${dependency.repoURL}/index.yaml`,
              headers: {},
            };
            const modifiedConfig = interceptorFn(mockRequestConfig);

            // Verify authentication was added (credential matches)
            if (matchingCredential.authType === 'bearer') {
              expect(modifiedConfig.headers.Authorization).toBe(`Bearer ${matchingCredential.password}`);
            } else {
              expect(modifiedConfig.auth).toBeDefined();
              expect(modifiedConfig.auth.username).toBe(matchingCredential.username);
              expect(modifiedConfig.auth.password).toBe(matchingCredential.password);
            }
          }

          // Fetch versions
          const versionMap = await resolver.resolveVersions([dependency]);

          // Should successfully fetch versions with auth
          const key = `${dependency.repoURL}/${chartName}`;
          const fetchedVersions = versionMap.get(key);

          expect(fetchedVersions).toBeDefined();
          expect(fetchedVersions!.length).toBe(versions.length);
        }
      ),
      { numRuns: 30 }
    );
  });
});
