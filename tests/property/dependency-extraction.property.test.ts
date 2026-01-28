/**
 * Property-based tests for DependencyExtractor - Helm Dependency Extraction
 * 
 * **Property 4: Helm Dependency Extraction Completeness**
 * **Validates: Requirements 2.1, 2.2, 2.5**
 * 
 * For any ArgoCD Application or ApplicationSet manifest with Helm chart sources,
 * all chart references and target revisions should be correctly extracted regardless
 * of manifest structure (single source, multi-source, or templated).
 */

import * as fc from 'fast-check';
import { DependencyExtractor } from '../../src/extractor/dependency-extractor';
import { YAMLDocument } from '../../src/types/manifest';
import { HelmDependency } from '../../src/types/dependency';

/**
 * Custom arbitraries for generating test data
 */

// Generate valid Kubernetes resource names (DNS-1123 subdomain)
const arbK8sName = fc.stringMatching(/^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/);

// Generate ArgoCD API versions
const arbArgoCDApiVersion = fc.constantFrom(
  'argoproj.io/v1alpha1',
  'argoproj.io/v1beta1'
);

// Generate semantic version
const arbSemVer = fc.tuple(
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 }),
  fc.nat({ max: 100 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// Generate semantic version with pre-release
const arbSemVerWithPrerelease = fc.tuple(
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 }),
  fc.nat({ max: 100 }),
  fc.constantFrom('alpha', 'beta', 'rc'),
  fc.nat({ max: 10 })
).map(([major, minor, patch, prerelease, num]) => 
  `${major}.${minor}.${patch}-${prerelease}.${num}`
);

// Generate any semantic version (with or without pre-release)
const arbAnyVersion = fc.oneof(arbSemVer, arbSemVerWithPrerelease);

// Generate traditional Helm repository URL
const arbHelmRepoURL = fc.constantFrom(
  'https://charts.bitnami.com/bitnami',
  'https://charts.example.com',
  'https://kubernetes-charts.storage.googleapis.com',
  'https://helm.releases.hashicorp.com',
  'http://charts.internal.company.com'
);

// Generate OCI registry URL with oci:// prefix
const arbOCIRepoURL = fc.constantFrom(
  'oci://ghcr.io/myorg/charts',
  'oci://registry.example.com/charts',
  'oci://public.ecr.aws/myorg/charts',
  'oci://quay.io/myorg/charts'
);

// Generate OCI registry URL without oci:// prefix (implicit OCI)
const arbImplicitOCIRepoURL = fc.constantFrom(
  'ghcr.io/myorg/charts',
  'registry-1.docker.io/bitnamicharts',
  'docker.io/library',
  'gcr.io/myproject/charts',
  'registry.gitlab.com/mygroup/charts',
  'quay.io/myorg/charts',
  'public.ecr.aws/myorg/charts',
  'myregistry.azurecr.io/charts'
);

// Generate Git repository URL (should not be extracted)
const arbGitRepoURL = fc.constantFrom(
  'https://github.com/myorg/myrepo',
  'https://gitlab.com/mygroup/myproject',
  'git@github.com:myorg/myrepo.git',
  'ssh://git@github.com/myorg/myrepo.git'
);

// Generate Helm source with chart field
const arbHelmSource = fc.record({
  repoURL: arbHelmRepoURL,
  chart: arbK8sName,
  targetRevision: arbAnyVersion,
});

// Generate OCI source with explicit chart field
const arbOCISourceWithChart = fc.record({
  repoURL: fc.oneof(arbOCIRepoURL, arbImplicitOCIRepoURL),
  chart: arbK8sName,
  targetRevision: arbAnyVersion,
});

// Generate OCI source without chart field (chart name in URL)
const arbOCISourceWithoutChart = fc.tuple(
  arbOCIRepoURL,
  arbK8sName,
  arbAnyVersion
).map(([baseURL, chartName, version]) => ({
  repoURL: `${baseURL}/${chartName}`,
  targetRevision: version,
}));

// Generate Git source (should not be extracted)
const arbGitSource = fc.record({
  repoURL: arbGitRepoURL,
  path: fc.constantFrom('manifests', 'k8s', 'deploy'),
  targetRevision: fc.constantFrom('main', 'master', 'develop', 'v1.0.0'),
});

// Generate any valid Helm source
const arbAnyHelmSource = fc.oneof(
  arbHelmSource,
  arbOCISourceWithChart,
  arbOCISourceWithoutChart
);

// Generate ArgoCD Application with single source
const arbApplicationSingleSource = fc.record({
  kind: fc.constant('Application'),
  apiVersion: arbArgoCDApiVersion,
  metadata: fc.record({
    name: arbK8sName,
    namespace: fc.constant('argocd'),
  }),
  spec: fc.record({
    source: arbAnyHelmSource,
  }),
  raw: fc.constant({}),
});

// Generate ArgoCD Application with multi-source
const arbApplicationMultiSource = fc.record({
  kind: fc.constant('Application'),
  apiVersion: arbArgoCDApiVersion,
  metadata: fc.record({
    name: arbK8sName,
    namespace: fc.constant('argocd'),
  }),
  spec: fc.record({
    sources: fc.array(arbAnyHelmSource, { minLength: 1, maxLength: 5 }),
  }),
  raw: fc.constant({}),
});

// Generate ArgoCD ApplicationSet with single source
const arbApplicationSetSingleSource = fc.record({
  kind: fc.constant('ApplicationSet'),
  apiVersion: arbArgoCDApiVersion,
  metadata: fc.record({
    name: arbK8sName,
    namespace: fc.constant('argocd'),
  }),
  spec: fc.record({
    template: fc.record({
      spec: fc.record({
        source: arbAnyHelmSource,
      }),
    }),
  }),
  raw: fc.constant({}),
});

// Generate ArgoCD ApplicationSet with multi-source
const arbApplicationSetMultiSource = fc.record({
  kind: fc.constant('ApplicationSet'),
  apiVersion: arbArgoCDApiVersion,
  metadata: fc.record({
    name: arbK8sName,
    namespace: fc.constant('argocd'),
  }),
  spec: fc.record({
    template: fc.record({
      spec: fc.record({
        sources: fc.array(arbAnyHelmSource, { minLength: 1, maxLength: 5 }),
      }),
    }),
  }),
  raw: fc.constant({}),
});

describe('Property 4: Helm Dependency Extraction Completeness', () => {
  let extractor: DependencyExtractor;

  beforeEach(() => {
    extractor = new DependencyExtractor();
  });

  /**
   * Property 4.1: Application single source extraction
   * 
   * For any Application with a single Helm source, exactly one dependency
   * should be extracted with correct chart name, repo URL, and version.
   */
  it('should extract exactly one dependency from Application with single Helm source', () => {
    fc.assert(
      fc.property(
        arbApplicationSingleSource,
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.nat({ max: 10 }),
        (doc, manifestPath, documentIndex) => {
          const dependencies = extractor.extractFromApplication(
            doc as YAMLDocument,
            manifestPath,
            documentIndex
          );

          // Should extract exactly one dependency
          expect(dependencies).toHaveLength(1);

          const dep = dependencies[0];
          const source = doc.spec.source as Record<string, unknown>;

          // Verify basic fields
          expect(dep.manifestPath).toBe(manifestPath);
          expect(dep.documentIndex).toBe(documentIndex);
          expect(dep.currentVersion).toBe(source.targetRevision);
          expect(dep.repoURL).toBe(source.repoURL);

          // Verify chart name (either from chart field or extracted from OCI URL)
          if (source.chart) {
            expect(dep.chartName).toBe(source.chart);
          } else {
            // Chart name should be extracted from URL
            expect(dep.chartName).toBeTruthy();
            expect(typeof dep.chartName).toBe('string');
          }

          // Verify version path
          expect(dep.versionPath).toEqual(['spec', 'source', 'targetRevision']);

          // Verify repo type
          expect(['helm', 'oci']).toContain(dep.repoType);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.2: Application multi-source extraction
   * 
   * For any Application with multiple Helm sources, the number of extracted
   * dependencies should equal the number of sources, and each should have
   * correct version paths.
   */
  it('should extract all dependencies from Application with multi-source', () => {
    fc.assert(
      fc.property(
        arbApplicationMultiSource,
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.nat({ max: 10 }),
        (doc, manifestPath, documentIndex) => {
          const dependencies = extractor.extractFromApplication(
            doc as YAMLDocument,
            manifestPath,
            documentIndex
          );

          const sources = doc.spec.sources as Array<Record<string, unknown>>;

          // Should extract one dependency per source
          expect(dependencies).toHaveLength(sources.length);

          // Verify each dependency
          dependencies.forEach((dep, index) => {
            const source = sources[index];

            expect(dep.manifestPath).toBe(manifestPath);
            expect(dep.documentIndex).toBe(documentIndex);
            expect(dep.currentVersion).toBe(source.targetRevision);
            expect(dep.repoURL).toBe(source.repoURL);

            // Verify version path includes correct index
            expect(dep.versionPath).toEqual([
              'spec',
              'sources',
              index.toString(),
              'targetRevision',
            ]);
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.3: ApplicationSet single source extraction
   * 
   * For any ApplicationSet with a single Helm source in the template,
   * exactly one dependency should be extracted with correct template path.
   */
  it('should extract exactly one dependency from ApplicationSet with single Helm source', () => {
    fc.assert(
      fc.property(
        arbApplicationSetSingleSource,
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.nat({ max: 10 }),
        (doc, manifestPath, documentIndex) => {
          const dependencies = extractor.extractFromApplicationSet(
            doc as YAMLDocument,
            manifestPath,
            documentIndex
          );

          // Should extract exactly one dependency
          expect(dependencies).toHaveLength(1);

          const dep = dependencies[0];
          const template = doc.spec.template as Record<string, unknown>;
          const templateSpec = template.spec as Record<string, unknown>;
          const source = templateSpec.source as Record<string, unknown>;

          // Verify basic fields
          expect(dep.manifestPath).toBe(manifestPath);
          expect(dep.documentIndex).toBe(documentIndex);
          expect(dep.currentVersion).toBe(source.targetRevision);
          expect(dep.repoURL).toBe(source.repoURL);

          // Verify chart name
          if (source.chart) {
            expect(dep.chartName).toBe(source.chart);
          } else {
            expect(dep.chartName).toBeTruthy();
          }

          // Verify version path includes template
          expect(dep.versionPath).toEqual([
            'spec',
            'template',
            'spec',
            'source',
            'targetRevision',
          ]);

          // Verify repo type
          expect(['helm', 'oci']).toContain(dep.repoType);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.4: ApplicationSet multi-source extraction
   * 
   * For any ApplicationSet with multiple Helm sources in the template,
   * all dependencies should be extracted with correct template paths.
   */
  it('should extract all dependencies from ApplicationSet with multi-source', () => {
    fc.assert(
      fc.property(
        arbApplicationSetMultiSource,
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.nat({ max: 10 }),
        (doc, manifestPath, documentIndex) => {
          const dependencies = extractor.extractFromApplicationSet(
            doc as YAMLDocument,
            manifestPath,
            documentIndex
          );

          const template = doc.spec.template as Record<string, unknown>;
          const templateSpec = template.spec as Record<string, unknown>;
          const sources = templateSpec.sources as Array<Record<string, unknown>>;

          // Should extract one dependency per source
          expect(dependencies).toHaveLength(sources.length);

          // Verify each dependency
          dependencies.forEach((dep, index) => {
            const source = sources[index];

            expect(dep.manifestPath).toBe(manifestPath);
            expect(dep.documentIndex).toBe(documentIndex);
            expect(dep.currentVersion).toBe(source.targetRevision);
            expect(dep.repoURL).toBe(source.repoURL);

            // Verify version path includes template and correct index
            expect(dep.versionPath).toEqual([
              'spec',
              'template',
              'spec',
              'sources',
              index.toString(),
              'targetRevision',
            ]);
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.5: Git sources should not be extracted
   * 
   * For any Application with Git sources (no chart field, Git URL),
   * no dependencies should be extracted.
   */
  it('should not extract dependencies from Git sources', () => {
    fc.assert(
      fc.property(
        fc.record({
          kind: fc.constant('Application'),
          apiVersion: arbArgoCDApiVersion,
          metadata: fc.record({
            name: arbK8sName,
            namespace: fc.constant('argocd'),
          }),
          spec: fc.record({
            source: arbGitSource,
          }),
          raw: fc.constant({}),
        }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.nat({ max: 10 }),
        (doc, manifestPath, documentIndex) => {
          const dependencies = extractor.extractFromApplication(
            doc as YAMLDocument,
            manifestPath,
            documentIndex
          );

          // Git sources should not be extracted
          expect(dependencies).toHaveLength(0);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.6: Mixed Helm and Git sources
   * 
   * For any Application with both Helm and Git sources in multi-source,
   * only Helm sources should be extracted.
   */
  it('should extract only Helm sources from mixed Helm and Git sources', () => {
    fc.assert(
      fc.property(
        fc.array(arbAnyHelmSource, { minLength: 1, maxLength: 3 }),
        fc.array(arbGitSource, { minLength: 1, maxLength: 3 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.nat({ max: 10 }),
        (helmSources, gitSources, manifestPath, documentIndex) => {
          // Interleave Helm and Git sources
          const allSources = [...helmSources, ...gitSources];

          const doc: YAMLDocument = {
            kind: 'Application',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'mixed-app', namespace: 'argocd' },
            spec: {
              sources: allSources,
            },
            raw: {},
          };

          const dependencies = extractor.extractFromApplication(
            doc,
            manifestPath,
            documentIndex
          );

          // Should extract only Helm sources
          expect(dependencies).toHaveLength(helmSources.length);

          // All extracted dependencies should have chart names
          dependencies.forEach(dep => {
            expect(dep.chartName).toBeTruthy();
            expect(typeof dep.chartName).toBe('string');
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.7: Repository type detection
   * 
   * For any Helm source, the repository type should be correctly detected
   * as either 'helm' or 'oci' based on the URL.
   */
  it('should correctly detect repository type from URL', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(arbHelmRepoURL, fc.constant('helm')),
          fc.tuple(arbOCIRepoURL, fc.constant('oci')),
          fc.tuple(arbImplicitOCIRepoURL, fc.constant('oci'))
        ),
        arbK8sName,
        arbAnyVersion,
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.nat({ max: 10 }),
        ([repoURL, expectedType], chartName, version, manifestPath, documentIndex) => {
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

          const dependencies = extractor.extractFromApplication(
            doc,
            manifestPath,
            documentIndex
          );

          expect(dependencies).toHaveLength(1);
          expect(dependencies[0].repoType).toBe(expectedType);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.8: Missing required fields
   * 
   * For any source missing required fields (repoURL or targetRevision),
   * no dependency should be extracted.
   */
  it('should not extract dependencies when required fields are missing', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Missing repoURL
          fc.record({
            chart: arbK8sName,
            targetRevision: arbAnyVersion,
          }),
          // Missing targetRevision
          fc.record({
            repoURL: arbHelmRepoURL,
            chart: arbK8sName,
          }),
          // Missing both chart and repoURL
          fc.record({
            targetRevision: arbAnyVersion,
          })
        ),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.nat({ max: 10 }),
        (source, manifestPath, documentIndex) => {
          const doc: YAMLDocument = {
            kind: 'Application',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'incomplete-app', namespace: 'argocd' },
            spec: {
              source,
            },
            raw: {},
          };

          const dependencies = extractor.extractFromApplication(
            doc,
            manifestPath,
            documentIndex
          );

          // Should not extract incomplete sources
          expect(dependencies).toHaveLength(0);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.9: Empty or missing spec
   * 
   * For any Application or ApplicationSet with empty or missing spec,
   * no dependencies should be extracted.
   */
  it('should handle empty or missing spec gracefully', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Application' as const, 'ApplicationSet' as const),
        fc.oneof(
          fc.constant({}),
          fc.constant({ destination: { server: 'https://kubernetes.default.svc' } }),
          fc.constant(null),
          fc.constant(undefined)
        ),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.nat({ max: 10 }),
        (kind, spec, manifestPath, documentIndex) => {
          const doc: YAMLDocument = {
            kind: kind as 'Application' | 'ApplicationSet',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'empty-spec', namespace: 'argocd' },
            spec: spec as Record<string, unknown>,
            raw: {},
          };

          let dependencies: HelmDependency[];
          if (kind === 'Application') {
            dependencies = extractor.extractFromApplication(
              doc,
              manifestPath,
              documentIndex
            );
          } else {
            dependencies = extractor.extractFromApplicationSet(
              doc,
              manifestPath,
              documentIndex
            );
          }

          // Should return empty array
          expect(dependencies).toHaveLength(0);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.10: Version path correctness
   * 
   * For any extracted dependency, the version path should correctly
   * point to the targetRevision field in the manifest structure.
   */
  it('should generate correct version paths for all manifest structures', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          arbApplicationSingleSource,
          arbApplicationMultiSource,
          arbApplicationSetSingleSource,
          arbApplicationSetMultiSource
        ),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.nat({ max: 10 }),
        (doc, manifestPath, documentIndex) => {
          let dependencies: HelmDependency[];
          
          if (doc.kind === 'Application') {
            dependencies = extractor.extractFromApplication(
              doc as YAMLDocument,
              manifestPath,
              documentIndex
            );
          } else {
            dependencies = extractor.extractFromApplicationSet(
              doc as YAMLDocument,
              manifestPath,
              documentIndex
            );
          }

          // Verify each dependency has a valid version path
          dependencies.forEach(dep => {
            expect(dep.versionPath).toBeTruthy();
            expect(Array.isArray(dep.versionPath)).toBe(true);
            expect(dep.versionPath.length).toBeGreaterThan(0);
            
            // Last element should always be 'targetRevision'
            expect(dep.versionPath[dep.versionPath.length - 1]).toBe('targetRevision');
            
            // First element should always be 'spec'
            expect(dep.versionPath[0]).toBe('spec');
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.11: OCI chart name extraction
   * 
   * For any OCI source without explicit chart field, the chart name
   * should be correctly extracted from the URL.
   */
  it('should extract chart name from OCI URL when chart field is missing', () => {
    fc.assert(
      fc.property(
        arbOCIRepoURL,
        arbK8sName,
        arbAnyVersion,
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.nat({ max: 10 }),
        (baseURL, chartName, version, manifestPath, documentIndex) => {
          const doc: YAMLDocument = {
            kind: 'Application',
            apiVersion: 'argoproj.io/v1alpha1',
            metadata: { name: 'oci-app', namespace: 'argocd' },
            spec: {
              source: {
                repoURL: `${baseURL}/${chartName}`,
                targetRevision: version,
                // No chart field
              },
            },
            raw: {},
          };

          const dependencies = extractor.extractFromApplication(
            doc,
            manifestPath,
            documentIndex
          );

          expect(dependencies).toHaveLength(1);
          expect(dependencies[0].chartName).toBe(chartName);
          expect(dependencies[0].repoType).toBe('oci');
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 4.12: Extraction consistency
   * 
   * For any manifest, extracting dependencies multiple times should
   * produce identical results (idempotent operation).
   */
  it('should produce consistent results across multiple extractions', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          arbApplicationSingleSource,
          arbApplicationMultiSource,
          arbApplicationSetSingleSource,
          arbApplicationSetMultiSource
        ),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.nat({ max: 10 }),
        (doc, manifestPath, documentIndex) => {
          let dependencies1: HelmDependency[];
          let dependencies2: HelmDependency[];
          
          if (doc.kind === 'Application') {
            dependencies1 = extractor.extractFromApplication(
              doc as YAMLDocument,
              manifestPath,
              documentIndex
            );
            dependencies2 = extractor.extractFromApplication(
              doc as YAMLDocument,
              manifestPath,
              documentIndex
            );
          } else {
            dependencies1 = extractor.extractFromApplicationSet(
              doc as YAMLDocument,
              manifestPath,
              documentIndex
            );
            dependencies2 = extractor.extractFromApplicationSet(
              doc as YAMLDocument,
              manifestPath,
              documentIndex
            );
          }

          // Results should be identical
          expect(dependencies1).toEqual(dependencies2);
        }
      ),
      { numRuns: 10 }
    );
  });
});
