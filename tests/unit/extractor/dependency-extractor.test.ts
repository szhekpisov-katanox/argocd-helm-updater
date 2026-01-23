/**
 * Unit tests for DependencyExtractor
 *
 * Tests cover:
 * - Extracting dependencies from Application manifests (single source)
 * - Extracting dependencies from Application manifests (multi-source)
 * - Extracting dependencies from ApplicationSet manifests
 * - Detecting repository types (Helm vs OCI)
 * - Handling Git sources (should not extract)
 * - Storing correct JSON paths for version fields
 * - Edge cases and error handling
 */

import { DependencyExtractor } from '../../../src/extractor/dependency-extractor';
import { YAMLDocument } from '../../../src/types/manifest';

describe('DependencyExtractor', () => {
  let extractor: DependencyExtractor;

  beforeEach(() => {
    extractor = new DependencyExtractor();
  });

  describe('extractFromApplication', () => {
    it('should extract dependency from Application with single Helm source', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'test-app' },
        spec: {
          source: {
            repoURL: 'https://charts.bitnami.com/bitnami',
            chart: 'nginx',
            targetRevision: '15.9.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(
        doc,
        'test.yaml',
        0
      );

      expect(dependencies).toHaveLength(1);
      expect(dependencies[0]).toEqual({
        manifestPath: 'test.yaml',
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '15.9.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      });
    });

    it('should extract dependencies from Application with multi-source', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'multi-app' },
        spec: {
          sources: [
            {
              repoURL: 'https://charts.bitnami.com/bitnami',
              chart: 'nginx',
              targetRevision: '15.9.0',
            },
            {
              repoURL: 'https://charts.bitnami.com/bitnami',
              chart: 'postgresql',
              targetRevision: '12.5.0',
            },
          ],
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(
        doc,
        'multi.yaml',
        0
      );

      expect(dependencies).toHaveLength(2);
      
      expect(dependencies[0]).toEqual({
        manifestPath: 'multi.yaml',
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '15.9.0',
        versionPath: ['spec', 'sources', '0', 'targetRevision'],
      });

      expect(dependencies[1]).toEqual({
        manifestPath: 'multi.yaml',
        documentIndex: 0,
        chartName: 'postgresql',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '12.5.0',
        versionPath: ['spec', 'sources', '1', 'targetRevision'],
      });
    });

    it('should extract dependency from Application with OCI source', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'oci-app' },
        spec: {
          source: {
            repoURL: 'oci://ghcr.io/myorg/charts',
            chart: 'my-chart',
            targetRevision: '2.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(
        doc,
        'oci.yaml',
        0
      );

      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].repoType).toBe('oci');
      expect(dependencies[0].chartName).toBe('my-chart');
      expect(dependencies[0].repoURL).toBe('oci://ghcr.io/myorg/charts');
    });

    it('should not extract Git sources (no chart field)', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'git-app' },
        spec: {
          source: {
            repoURL: 'https://github.com/myorg/myrepo',
            path: 'manifests',
            targetRevision: 'main',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(
        doc,
        'git.yaml',
        0
      );

      expect(dependencies).toHaveLength(0);
    });

    it('should return empty array when spec is missing', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'no-spec' },
        spec: {},
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(
        doc,
        'test.yaml',
        0
      );

      expect(dependencies).toHaveLength(0);
    });

    it('should return empty array when source is missing', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'no-source' },
        spec: {
          destination: {
            server: 'https://kubernetes.default.svc',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(
        doc,
        'test.yaml',
        0
      );

      expect(dependencies).toHaveLength(0);
    });

    it('should skip sources without targetRevision', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'no-version' },
        spec: {
          source: {
            repoURL: 'https://charts.bitnami.com/bitnami',
            chart: 'nginx',
            // Missing targetRevision
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(
        doc,
        'test.yaml',
        0
      );

      expect(dependencies).toHaveLength(0);
    });

    it('should skip sources without repoURL', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'no-repo' },
        spec: {
          source: {
            chart: 'nginx',
            targetRevision: '15.9.0',
            // Missing repoURL
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(
        doc,
        'test.yaml',
        0
      );

      expect(dependencies).toHaveLength(0);
    });

    it('should handle mixed Helm and Git sources in multi-source', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'mixed-app' },
        spec: {
          sources: [
            {
              repoURL: 'https://charts.bitnami.com/bitnami',
              chart: 'nginx',
              targetRevision: '15.9.0',
            },
            {
              repoURL: 'https://github.com/myorg/myrepo',
              path: 'manifests',
              targetRevision: 'main',
            },
          ],
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(
        doc,
        'mixed.yaml',
        0
      );

      // Should only extract the Helm source
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].chartName).toBe('nginx');
    });
  });

  describe('extractFromApplicationSet', () => {
    it('should extract dependency from ApplicationSet with single Helm source', () => {
      const doc: YAMLDocument = {
        kind: 'ApplicationSet',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'test-appset' },
        spec: {
          template: {
            spec: {
              source: {
                repoURL: 'https://charts.example.com',
                chart: 'my-chart',
                targetRevision: '1.2.3',
              },
            },
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplicationSet(
        doc,
        'appset.yaml',
        0
      );

      expect(dependencies).toHaveLength(1);
      expect(dependencies[0]).toEqual({
        manifestPath: 'appset.yaml',
        documentIndex: 0,
        chartName: 'my-chart',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.2.3',
        versionPath: ['spec', 'template', 'spec', 'source', 'targetRevision'],
      });
    });

    it('should extract dependencies from ApplicationSet with multi-source', () => {
      const doc: YAMLDocument = {
        kind: 'ApplicationSet',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'multi-appset' },
        spec: {
          template: {
            spec: {
              sources: [
                {
                  repoURL: 'https://charts.example.com',
                  chart: 'frontend',
                  targetRevision: '3.0.0',
                },
                {
                  repoURL: 'https://charts.example.com',
                  chart: 'backend',
                  targetRevision: '2.5.0',
                },
              ],
            },
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplicationSet(
        doc,
        'multi-appset.yaml',
        0
      );

      expect(dependencies).toHaveLength(2);
      
      expect(dependencies[0]).toEqual({
        manifestPath: 'multi-appset.yaml',
        documentIndex: 0,
        chartName: 'frontend',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '3.0.0',
        versionPath: ['spec', 'template', 'spec', 'sources', '0', 'targetRevision'],
      });

      expect(dependencies[1]).toEqual({
        manifestPath: 'multi-appset.yaml',
        documentIndex: 0,
        chartName: 'backend',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '2.5.0',
        versionPath: ['spec', 'template', 'spec', 'sources', '1', 'targetRevision'],
      });
    });

    it('should return empty array when spec is missing', () => {
      const doc: YAMLDocument = {
        kind: 'ApplicationSet',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'no-spec' },
        spec: {},
        raw: {},
      };

      const dependencies = extractor.extractFromApplicationSet(
        doc,
        'test.yaml',
        0
      );

      expect(dependencies).toHaveLength(0);
    });

    it('should return empty array when template is missing', () => {
      const doc: YAMLDocument = {
        kind: 'ApplicationSet',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'no-template' },
        spec: {
          generators: [],
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplicationSet(
        doc,
        'test.yaml',
        0
      );

      expect(dependencies).toHaveLength(0);
    });

    it('should return empty array when template.spec is missing', () => {
      const doc: YAMLDocument = {
        kind: 'ApplicationSet',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'no-template-spec' },
        spec: {
          template: {
            metadata: { name: 'app' },
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplicationSet(
        doc,
        'test.yaml',
        0
      );

      expect(dependencies).toHaveLength(0);
    });
  });

  describe('repository type detection', () => {
    it('should detect OCI registry with oci:// prefix', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'oci-app' },
        spec: {
          source: {
            repoURL: 'oci://registry.example.com/charts',
            chart: 'my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      expect(dependencies[0].repoType).toBe('oci');
    });

    it('should detect Docker Hub as OCI registry', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'docker-app' },
        spec: {
          source: {
            repoURL: 'registry-1.docker.io/bitnamicharts',
            chart: 'nginx',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      expect(dependencies[0].repoType).toBe('oci');
    });

    it('should detect GitHub Container Registry as OCI', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'ghcr-app' },
        spec: {
          source: {
            repoURL: 'ghcr.io/myorg/charts',
            chart: 'my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      expect(dependencies[0].repoType).toBe('oci');
    });

    it('should detect Google Container Registry as OCI', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'gcr-app' },
        spec: {
          source: {
            repoURL: 'gcr.io/myproject/charts',
            chart: 'my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      expect(dependencies[0].repoType).toBe('oci');
    });

    it('should detect Quay.io as OCI registry', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'quay-app' },
        spec: {
          source: {
            repoURL: 'quay.io/myorg/charts',
            chart: 'my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      expect(dependencies[0].repoType).toBe('oci');
    });

    it('should detect AWS ECR as OCI registry', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'ecr-app' },
        spec: {
          source: {
            repoURL: 'public.ecr.aws/myorg/charts',
            chart: 'my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      expect(dependencies[0].repoType).toBe('oci');
    });

    it('should detect Azure Container Registry as OCI', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'acr-app' },
        spec: {
          source: {
            repoURL: 'myregistry.azurecr.io/charts',
            chart: 'my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      expect(dependencies[0].repoType).toBe('oci');
    });

    it('should detect traditional Helm repository', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'helm-app' },
        spec: {
          source: {
            repoURL: 'https://charts.bitnami.com/bitnami',
            chart: 'nginx',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      expect(dependencies[0].repoType).toBe('helm');
    });

    it('should handle case-insensitive registry detection', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'case-app' },
        spec: {
          source: {
            repoURL: 'GHCR.IO/myorg/charts',
            chart: 'my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      expect(dependencies[0].repoType).toBe('oci');
    });
  });

  describe('OCI chart name extraction', () => {
    it('should extract chart name from OCI URL without explicit chart field', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'oci-app' },
        spec: {
          source: {
            repoURL: 'oci://ghcr.io/myorg/my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].chartName).toBe('my-chart');
    });

    it('should extract chart name from nested OCI path', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'oci-app' },
        spec: {
          source: {
            repoURL: 'oci://registry.example.com/path/to/my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].chartName).toBe('my-chart');
    });

    it('should prefer explicit chart field over URL extraction', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'oci-app' },
        spec: {
          source: {
            repoURL: 'oci://ghcr.io/myorg/charts',
            chart: 'explicit-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].chartName).toBe('explicit-chart');
    });

    it('should handle OCI URLs with query parameters', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'oci-app' },
        spec: {
          source: {
            repoURL: 'oci://registry.example.com/my-chart?param=value',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].chartName).toBe('my-chart');
    });

    it('should handle OCI URLs with fragments', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'oci-app' },
        spec: {
          source: {
            repoURL: 'oci://registry.example.com/my-chart#fragment',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].chartName).toBe('my-chart');
    });
  });

  describe('version path tracking', () => {
    it('should track correct path for single source Application', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: {
          source: {
            repoURL: 'https://charts.example.com',
            chart: 'my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies[0].versionPath).toEqual([
        'spec',
        'source',
        'targetRevision',
      ]);
    });

    it('should track correct paths for multi-source Application', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: {
          sources: [
            {
              repoURL: 'https://charts.example.com',
              chart: 'chart1',
              targetRevision: '1.0.0',
            },
            {
              repoURL: 'https://charts.example.com',
              chart: 'chart2',
              targetRevision: '2.0.0',
            },
          ],
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies[0].versionPath).toEqual([
        'spec',
        'sources',
        '0',
        'targetRevision',
      ]);
      
      expect(dependencies[1].versionPath).toEqual([
        'spec',
        'sources',
        '1',
        'targetRevision',
      ]);
    });

    it('should track correct path for ApplicationSet', () => {
      const doc: YAMLDocument = {
        kind: 'ApplicationSet',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'appset' },
        spec: {
          template: {
            spec: {
              source: {
                repoURL: 'https://charts.example.com',
                chart: 'my-chart',
                targetRevision: '1.0.0',
              },
            },
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplicationSet(doc, 'test.yaml', 0);
      
      expect(dependencies[0].versionPath).toEqual([
        'spec',
        'template',
        'spec',
        'source',
        'targetRevision',
      ]);
    });
  });

  describe('document index tracking', () => {
    it('should track document index correctly', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: {
          source: {
            repoURL: 'https://charts.example.com',
            chart: 'my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 5);
      
      expect(dependencies[0].documentIndex).toBe(5);
      expect(dependencies[0].manifestPath).toBe('test.yaml');
    });
  });

  describe('edge cases', () => {
    it('should handle empty sources array', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: {
          sources: [],
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      expect(dependencies).toHaveLength(0);
    });

    it('should handle OCI URL without oci:// prefix but with registry domain', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: {
          source: {
            repoURL: 'https://ghcr.io/myorg/my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].repoType).toBe('oci');
      expect(dependencies[0].chartName).toBe('my-chart');
    });

    it('should handle OCI URL with docker.io (short form)', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: {
          source: {
            repoURL: 'docker.io/library/nginx',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].repoType).toBe('oci');
      expect(dependencies[0].chartName).toBe('nginx');
    });

    it('should handle GitLab Container Registry as OCI', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: {
          source: {
            repoURL: 'registry.gitlab.com/mygroup/myproject/charts',
            chart: 'my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].repoType).toBe('oci');
    });

    it('should handle traditional Helm repo with http protocol', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: {
          source: {
            repoURL: 'http://charts.example.com/stable',
            chart: 'my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].repoType).toBe('helm');
      expect(dependencies[0].chartName).toBe('my-chart');
    });

    it('should handle OCI URL with multiple path segments', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: {
          source: {
            repoURL: 'oci://registry.example.com/org/team/project/my-chart',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].chartName).toBe('my-chart');
    });

    it('should handle OCI URL with both query params and fragments', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: {
          source: {
            repoURL: 'oci://registry.example.com/my-chart?tag=latest#section',
            targetRevision: '1.0.0',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].chartName).toBe('my-chart');
    });

    it('should handle null spec', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: null as unknown as Record<string, unknown>,
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      expect(dependencies).toHaveLength(0);
    });

    it('should handle undefined spec', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: undefined as unknown as Record<string, unknown>,
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      expect(dependencies).toHaveLength(0);
    });

    it('should handle source with additional Helm configuration', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: {
          source: {
            repoURL: 'https://charts.example.com',
            chart: 'my-chart',
            targetRevision: '1.0.0',
            helm: {
              releaseName: 'my-release',
              values: 'key: value',
              parameters: [
                { name: 'param1', value: 'value1' },
              ],
            },
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].chartName).toBe('my-chart');
    });

    it('should handle version with pre-release tags', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: {
          source: {
            repoURL: 'https://charts.example.com',
            chart: 'my-chart',
            targetRevision: '1.0.0-alpha.1',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].currentVersion).toBe('1.0.0-alpha.1');
    });

    it('should handle version with build metadata', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: { name: 'app' },
        spec: {
          source: {
            repoURL: 'https://charts.example.com',
            chart: 'my-chart',
            targetRevision: '1.0.0+build.123',
          },
        },
        raw: {},
      };

      const dependencies = extractor.extractFromApplication(doc, 'test.yaml', 0);
      
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].currentVersion).toBe('1.0.0+build.123');
    });
  });
});
