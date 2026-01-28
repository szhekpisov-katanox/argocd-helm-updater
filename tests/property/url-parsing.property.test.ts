/**
 * Property-based tests for URL Parsing - Chart Source URL Parsing
 * 
 * **Property 5: Chart Source URL Parsing**
 * **Validates: Requirements 2.3, 2.4**
 * 
 * For any valid Helm repository URL or OCI registry URL, the parser should
 * correctly extract the repository location, chart name, and repository type.
 */

import * as fc from 'fast-check';
import { DependencyExtractor } from '../../src/extractor/dependency-extractor';
import { YAMLDocument } from '../../src/types/manifest';

/**
 * Custom arbitraries for generating test data
 */

// Generate valid Kubernetes resource names (DNS-1123 subdomain)
const arbK8sName = fc.stringMatching(/^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/);

// Generate semantic version
const arbSemVer = fc.tuple(
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 }),
  fc.nat({ max: 100 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// Generate traditional Helm repository URLs
const arbHelmRepoURL = fc.oneof(
  // HTTPS URLs
  fc.record({
    protocol: fc.constant('https'),
    domain: fc.constantFrom(
      'charts.bitnami.com',
      'charts.example.com',
      'kubernetes-charts.storage.googleapis.com',
      'helm.releases.hashicorp.com',
      'charts.jetstack.io'
    ),
    path: fc.constantFrom('/bitnami', '/stable', '', '/charts'),
  }).map(({ protocol, domain, path }) => `${protocol}://${domain}${path}`),
  // HTTP URLs (less common but valid)
  fc.record({
    protocol: fc.constant('http'),
    domain: fc.constantFrom(
      'charts.internal.company.com',
      'helm.local.dev',
      'localhost:8080'
    ),
    path: fc.constantFrom('', '/charts', '/helm'),
  }).map(({ protocol, domain, path }) => `${protocol}://${domain}${path}`)
);

// Generate OCI registry URLs with oci:// prefix
const arbExplicitOCIRepoURL = fc.record({
  registry: fc.constantFrom(
    'ghcr.io',
    'registry.example.com',
    'public.ecr.aws',
    'quay.io',
    'gcr.io',
    'docker.io'
  ),
  path: fc.array(arbK8sName, { minLength: 1, maxLength: 3 }),
}).map(({ registry, path }) => `oci://${registry}/${path.join('/')}`);

// Generate OCI registry URLs without oci:// prefix (implicit OCI)
const arbImplicitOCIRepoURL = fc.record({
  registry: fc.constantFrom(
    'ghcr.io',
    'registry-1.docker.io',
    'docker.io',
    'gcr.io',
    'registry.gitlab.com',
    'quay.io',
    'public.ecr.aws',
    'myregistry.azurecr.io'
  ),
  path: fc.array(arbK8sName, { minLength: 1, maxLength: 3 }),
}).map(({ registry, path }) => `${registry}/${path.join('/')}`);

// Generate OCI URLs with chart name embedded in URL
const arbOCIURLWithChartName = fc.tuple(
  fc.constantFrom(
    'oci://ghcr.io',
    'oci://registry.example.com',
    'oci://public.ecr.aws',
    'ghcr.io',
    'docker.io'
  ),
  fc.array(arbK8sName, { minLength: 0, maxLength: 2 }),
  arbK8sName
).map(([registry, pathParts, chartName]) => {
  const path = pathParts.length > 0 ? `/${pathParts.join('/')}` : '';
  return {
    url: `${registry}${path}/${chartName}`,
    chartName,
  };
});

describe('Property 5: Chart Source URL Parsing', () => {
  let extractor: DependencyExtractor;

  beforeEach(() => {
    extractor = new DependencyExtractor();
  });

  /**
   * Property 5.1: Traditional Helm repository URL parsing
   * 
   * For any traditional Helm repository URL (http:// or https://),
   * the repository type should be detected as 'helm' and the URL
   * should be preserved correctly.
   */
  it('should correctly parse traditional Helm repository URLs', () => {
    fc.assert(
      fc.property(
        arbHelmRepoURL,
        arbK8sName,
        arbSemVer,
        (repoURL, chartName, version) => {
          const doc: YAMLDocument = {
            kind: 'Application',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'test-app', namespace: 'argocd' },
            spec: {
              source: {
                repoURL,
                chart: chartName,
                targetRevision: version,
              },
            },
            raw: {},
          };

          const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);

          expect(dependencies).toHaveLength(1);
          const dep = dependencies[0];

          // Should detect as Helm repository
          expect(dep.repoType).toBe('helm');
          
          // Should preserve the original URL
          expect(dep.repoURL).toBe(repoURL);
          
          // Should extract chart name from chart field
          expect(dep.chartName).toBe(chartName);
          
          // Should extract version
          expect(dep.currentVersion).toBe(version);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 5.2: Explicit OCI registry URL parsing
   * 
   * For any OCI registry URL with oci:// prefix, the repository type
   * should be detected as 'oci' and the URL should be preserved.
   */
  it('should correctly parse explicit OCI registry URLs (oci:// prefix)', () => {
    fc.assert(
      fc.property(
        arbExplicitOCIRepoURL,
        arbK8sName,
        arbSemVer,
        (repoURL, chartName, version) => {
          const doc: YAMLDocument = {
            kind: 'Application',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'test-app', namespace: 'argocd' },
            spec: {
              source: {
                repoURL,
                chart: chartName,
                targetRevision: version,
              },
            },
            raw: {},
          };

          const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);

          expect(dependencies).toHaveLength(1);
          const dep = dependencies[0];

          // Should detect as OCI registry
          expect(dep.repoType).toBe('oci');
          
          // Should preserve the original URL
          expect(dep.repoURL).toBe(repoURL);
          
          // Should extract chart name from chart field
          expect(dep.chartName).toBe(chartName);
          
          // Should extract version
          expect(dep.currentVersion).toBe(version);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 5.3: Implicit OCI registry URL parsing
   * 
   * For any OCI registry URL without oci:// prefix but with known
   * registry domains, the repository type should be detected as 'oci'.
   */
  it('should correctly parse implicit OCI registry URLs (known domains)', () => {
    fc.assert(
      fc.property(
        arbImplicitOCIRepoURL,
        arbK8sName,
        arbSemVer,
        (repoURL, chartName, version) => {
          const doc: YAMLDocument = {
            kind: 'Application',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'test-app', namespace: 'argocd' },
            spec: {
              source: {
                repoURL,
                chart: chartName,
                targetRevision: version,
              },
            },
            raw: {},
          };

          const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);

          expect(dependencies).toHaveLength(1);
          const dep = dependencies[0];

          // Should detect as OCI registry based on domain
          expect(dep.repoType).toBe('oci');
          
          // Should preserve the original URL
          expect(dep.repoURL).toBe(repoURL);
          
          // Should extract chart name from chart field
          expect(dep.chartName).toBe(chartName);
          
          // Should extract version
          expect(dep.currentVersion).toBe(version);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 5.4: OCI chart name extraction from URL
   * 
   * For any OCI registry URL where the chart name is embedded in the URL
   * (no explicit chart field), the chart name should be correctly extracted
   * from the last path segment.
   */
  it('should extract chart name from OCI URL when chart field is missing', () => {
    fc.assert(
      fc.property(
        arbOCIURLWithChartName,
        arbSemVer,
        ({ url, chartName }, version) => {
          const doc: YAMLDocument = {
            kind: 'Application',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'test-app', namespace: 'argocd' },
            spec: {
              source: {
                repoURL: url,
                targetRevision: version,
                // No chart field - chart name is in URL
              },
            },
            raw: {},
          };

          const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);

          expect(dependencies).toHaveLength(1);
          const dep = dependencies[0];

          // Should detect as OCI registry
          expect(dep.repoType).toBe('oci');
          
          // Should extract chart name from URL
          expect(dep.chartName).toBe(chartName);
          
          // Should preserve the original URL
          expect(dep.repoURL).toBe(url);
          
          // Should extract version
          expect(dep.currentVersion).toBe(version);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 5.5: URL parsing with various path structures
   * 
   * For any URL with different path structures (nested paths, trailing slashes),
   * the parser should handle them correctly.
   */
  it('should handle URLs with various path structures', () => {
    fc.assert(
      fc.property(
        fc.record({
          protocol: fc.constantFrom('https', 'http', 'oci'),
          domain: fc.constantFrom('charts.example.com', 'ghcr.io', 'docker.io'),
          pathSegments: fc.array(arbK8sName, { minLength: 0, maxLength: 4 }),
          trailingSlash: fc.boolean(),
        }),
        arbK8sName,
        arbSemVer,
        ({ protocol, domain, pathSegments, trailingSlash }, chartName, version) => {
          const pathStr = pathSegments.length > 0 ? `/${pathSegments.join('/')}` : '';
          const slash = trailingSlash && pathStr ? '/' : '';
          const repoURL = protocol === 'oci' 
            ? `oci://${domain}${pathStr}${slash}`
            : `${protocol}://${domain}${pathStr}${slash}`;

          const doc: YAMLDocument = {
            kind: 'Application',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'test-app', namespace: 'argocd' },
            spec: {
              source: {
                repoURL,
                chart: chartName,
                targetRevision: version,
              },
            },
            raw: {},
          };

          const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);

          expect(dependencies).toHaveLength(1);
          const dep = dependencies[0];

          // Should preserve the original URL exactly
          expect(dep.repoURL).toBe(repoURL);
          
          // Should extract chart name
          expect(dep.chartName).toBe(chartName);
          
          // Should detect correct repo type
          if (protocol === 'oci' || domain === 'ghcr.io' || domain === 'docker.io') {
            expect(dep.repoType).toBe('oci');
          } else {
            expect(dep.repoType).toBe('helm');
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 5.6: Case-insensitive domain detection
   * 
   * For any OCI registry domain with different casing, the repository type
   * should still be correctly detected as 'oci'.
   */
  it('should detect OCI registries case-insensitively', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'GHCR.IO',
          'GhCr.Io',
          'DOCKER.IO',
          'Docker.Io',
          'QUAY.IO',
          'Quay.io',
          'GCR.IO',
          'Gcr.io'
        ),
        arbK8sName,
        arbK8sName,
        arbSemVer,
        (domain, orgName, chartName, version) => {
          const repoURL = `${domain}/${orgName}`;

          const doc: YAMLDocument = {
            kind: 'Application',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'test-app', namespace: 'argocd' },
            spec: {
              source: {
                repoURL,
                chart: chartName,
                targetRevision: version,
              },
            },
            raw: {},
          };

          const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);

          expect(dependencies).toHaveLength(1);
          const dep = dependencies[0];

          // Should detect as OCI regardless of case
          expect(dep.repoType).toBe('oci');
          
          // Should preserve original URL with original casing
          expect(dep.repoURL).toBe(repoURL);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 5.7: URL parsing consistency
   * 
   * For any URL, parsing it multiple times should produce identical results
   * (idempotent operation).
   */
  it('should produce consistent results when parsing the same URL multiple times', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbHelmRepoURL, arbExplicitOCIRepoURL, arbImplicitOCIRepoURL),
        arbK8sName,
        arbSemVer,
        (repoURL, chartName, version) => {
          const doc: YAMLDocument = {
            kind: 'Application',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'test-app', namespace: 'argocd' },
            spec: {
              source: {
                repoURL,
                chart: chartName,
                targetRevision: version,
              },
            },
            raw: {},
          };

          const dependencies1 = extractor.extractFromApplication(doc, 'test.yaml', 0);
          const dependencies2 = extractor.extractFromApplication(doc, 'test.yaml', 0);

          // Results should be identical
          expect(dependencies1).toEqual(dependencies2);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 5.8: Chart name extraction from complex OCI URLs
   * 
   * For any OCI URL with nested paths, the chart name should be extracted
   * from the last path segment, regardless of path depth.
   */
  it('should extract chart name from last segment of complex OCI URLs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('oci://ghcr.io', 'oci://registry.example.com', 'ghcr.io', 'docker.io'),
        fc.array(arbK8sName, { minLength: 1, maxLength: 5 }),
        arbK8sName,
        arbSemVer,
        (baseRegistry, pathSegments, chartName, version) => {
          const fullPath = [...pathSegments, chartName].join('/');
          const repoURL = `${baseRegistry}/${fullPath}`;

          const doc: YAMLDocument = {
            kind: 'Application',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'test-app', namespace: 'argocd' },
            spec: {
              source: {
                repoURL,
                targetRevision: version,
                // No chart field
              },
            },
            raw: {},
          };

          const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);

          expect(dependencies).toHaveLength(1);
          const dep = dependencies[0];

          // Should extract the last segment as chart name
          expect(dep.chartName).toBe(chartName);
          
          // Should detect as OCI
          expect(dep.repoType).toBe('oci');
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 5.9: URL with query parameters and fragments
   * 
   * For any OCI URL with query parameters or fragments, the chart name
   * should be extracted correctly (ignoring query/fragment).
   */
  it('should handle URLs with query parameters and fragments', () => {
    fc.assert(
      fc.property(
        arbOCIURLWithChartName,
        arbSemVer,
        fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
        fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
        ({ url, chartName }, version, queryParam, fragment) => {
          let fullURL = url;
          if (queryParam) {
            fullURL += `?param=${queryParam}`;
          }
          if (fragment) {
            fullURL += `#${fragment}`;
          }

          const doc: YAMLDocument = {
            kind: 'Application',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'test-app', namespace: 'argocd' },
            spec: {
              source: {
                repoURL: fullURL,
                targetRevision: version,
                // No chart field
              },
            },
            raw: {},
          };

          const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);

          expect(dependencies).toHaveLength(1);
          const dep = dependencies[0];

          // Should extract chart name without query/fragment
          expect(dep.chartName).toBe(chartName);
          
          // Should preserve full URL
          expect(dep.repoURL).toBe(fullURL);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 5.10: Repository type detection determinism
   * 
   * For any URL, the repository type detection should be deterministic
   * and based solely on the URL structure/domain.
   */
  it('should deterministically detect repository type based on URL', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.constantFrom(
            { url: 'https://charts.bitnami.com/bitnami', expectedType: 'helm' as const },
            { url: 'http://charts.example.com', expectedType: 'helm' as const },
            { url: 'oci://ghcr.io/myorg/charts', expectedType: 'oci' as const },
            { url: 'ghcr.io/myorg/charts', expectedType: 'oci' as const },
            { url: 'docker.io/library/nginx', expectedType: 'oci' as const },
            { url: 'registry-1.docker.io/bitnamicharts', expectedType: 'oci' as const },
            { url: 'quay.io/myorg/charts', expectedType: 'oci' as const },
            { url: 'gcr.io/myproject/charts', expectedType: 'oci' as const }
          ),
          arbK8sName,
          arbSemVer
        ),
        ([{ url, expectedType }, chartName, version]) => {
          const doc: YAMLDocument = {
            kind: 'Application',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'test-app', namespace: 'argocd' },
            spec: {
              source: {
                repoURL: url,
                chart: chartName,
                targetRevision: version,
              },
            },
            raw: {},
          };

          const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);

          expect(dependencies).toHaveLength(1);
          expect(dependencies[0].repoType).toBe(expectedType);
        }
      ),
      { numRuns: 10 }
    );
  });
});
