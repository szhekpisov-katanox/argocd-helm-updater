/**
 * Unit tests for ManifestScanner
 *
 * Tests cover:
 * - File discovery with glob patterns
 * - YAML parsing (single and multi-document)
 * - ArgoCD resource filtering
 * - Error handling for invalid YAML
 * - Include/exclude pattern handling
 */

import { ManifestScanner } from '../../../src/scanner/manifest-scanner';
import { ActionConfig } from '../../../src/types/config';
import { YAMLDocument } from '../../../src/types/manifest';

// Helper function to create a minimal ActionConfig for testing
function createTestConfig(
  overrides: Partial<ActionConfig> = {}
): ActionConfig {
  return {
    includePaths: ['**/*.yaml', '**/*.yml'],
    excludePaths: ['node_modules/**', '.git/**'],
    updateStrategy: 'all',
    registryCredentials: [],
    prStrategy: 'single',
    prLabels: [],
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
    dryRun: false,
    logLevel: 'info',
    githubToken: 'test-token',
    changelog: {
      enabled: true,
      maxLength: 5000,
      cacheTTL: 3600,
    },
    ...overrides,
  };
}

describe('ManifestScanner', () => {
  describe('constructor', () => {
    it('should create a ManifestScanner instance with config', () => {
      const config = createTestConfig();
      const scanner = new ManifestScanner(config);
      expect(scanner).toBeInstanceOf(ManifestScanner);
    });
  });

  describe('parseYAML', () => {
    let scanner: ManifestScanner;

    beforeEach(() => {
      const config = createTestConfig();
      scanner = new ManifestScanner(config);
    });

    it('should parse a single ArgoCD Application document', () => {
      const yaml = `
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: test-app
  namespace: argocd
spec:
  source:
    repoURL: https://charts.example.com
    chart: nginx
    targetRevision: 1.0.0
`;
      const documents = scanner.parseYAML(yaml);

      expect(documents).toHaveLength(1);
      expect(documents[0].kind).toBe('Application');
      expect(documents[0].apiVersion).toBe('argoproj.io/v1alpha1');
      expect(documents[0].metadata.name).toBe('test-app');
      expect((documents[0].spec.source as Record<string, unknown>).chart).toBe('nginx');
    });

    it('should parse a single ArgoCD ApplicationSet document', () => {
      const yaml = `
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: test-appset
  namespace: argocd
spec:
  template:
    spec:
      source:
        repoURL: https://charts.example.com
        chart: my-chart
        targetRevision: 2.0.0
`;
      const documents = scanner.parseYAML(yaml);

      expect(documents).toHaveLength(1);
      expect(documents[0].kind).toBe('ApplicationSet');
      expect(documents[0].apiVersion).toBe('argoproj.io/v1alpha1');
      expect(documents[0].metadata.name).toBe('test-appset');
    });

    it('should parse multi-document YAML files', () => {
      const yaml = `
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-one
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-two
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: config
`;
      const documents = scanner.parseYAML(yaml);

      expect(documents).toHaveLength(3);
      expect(documents[0].kind).toBe('Application');
      expect(documents[0].metadata.name).toBe('app-one');
      expect(documents[1].kind).toBe('Application');
      expect(documents[1].metadata.name).toBe('app-two');
      expect(documents[2].kind).toBe('Other');
      expect(documents[2].metadata.name).toBe('config');
    });

    it('should handle empty YAML documents in multi-document files', () => {
      const yaml = `
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-one
---
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-two
`;
      const documents = scanner.parseYAML(yaml);

      // Empty documents should be skipped
      expect(documents).toHaveLength(2);
      expect(documents[0].metadata.name).toBe('app-one');
      expect(documents[1].metadata.name).toBe('app-two');
    });

    it('should return empty array for invalid YAML', () => {
      const invalidYaml = `
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: broken
  invalid: [unclosed
`;
      const documents = scanner.parseYAML(invalidYaml);

      expect(documents).toHaveLength(0);
    });

    it('should return empty array for empty content', () => {
      const documents = scanner.parseYAML('');
      expect(documents).toHaveLength(0);
    });

    it('should return empty array for only comments', () => {
      const yaml = `
# This is a comment
# Another comment
`;
      const documents = scanner.parseYAML(yaml);
      expect(documents).toHaveLength(0);
    });

    it('should handle documents with missing fields gracefully', () => {
      const yaml = `
kind: Application
metadata:
  name: minimal-app
`;
      const documents = scanner.parseYAML(yaml);

      expect(documents).toHaveLength(1);
      expect(documents[0].kind).toBe('Application');
      expect(documents[0].apiVersion).toBe('');
      expect(documents[0].spec).toEqual({});
    });
  });

  describe('isArgoCDResource', () => {
    let scanner: ManifestScanner;

    beforeEach(() => {
      const config = createTestConfig();
      scanner = new ManifestScanner(config);
    });

    it('should return true for ArgoCD Application with v1alpha1 API', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: {},
        spec: {},
        raw: {},
      };
      expect(scanner.isArgoCDResource(doc)).toBe(true);
    });

    it('should return true for ArgoCD ApplicationSet with v1alpha1 API', () => {
      const doc: YAMLDocument = {
        kind: 'ApplicationSet',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: {},
        spec: {},
        raw: {},
      };
      expect(scanner.isArgoCDResource(doc)).toBe(true);
    });

    it('should return true for ArgoCD resources with other argoproj.io API versions', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'argoproj.io/v1beta1',
        metadata: {},
        spec: {},
        raw: {},
      };
      expect(scanner.isArgoCDResource(doc)).toBe(true);
    });

    it('should return false for non-ArgoCD resources', () => {
      const doc: YAMLDocument = {
        kind: 'Other',
        apiVersion: 'v1',
        metadata: {},
        spec: {},
        raw: {},
      };
      expect(scanner.isArgoCDResource(doc)).toBe(false);
    });

    it('should return false for ArgoCD kind with wrong API version', () => {
      const doc: YAMLDocument = {
        kind: 'Application',
        apiVersion: 'v1',
        metadata: {},
        spec: {},
        raw: {},
      };
      expect(scanner.isArgoCDResource(doc)).toBe(false);
    });

    it('should return false for correct API version with wrong kind', () => {
      const doc: YAMLDocument = {
        kind: 'Other',
        apiVersion: 'argoproj.io/v1alpha1',
        metadata: {},
        spec: {},
        raw: {},
      };
      expect(scanner.isArgoCDResource(doc)).toBe(false);
    });
  });

  describe('scanRepository', () => {
    let scanner: ManifestScanner;

    beforeEach(() => {
      // Use test fixtures directory
      const config = createTestConfig({
        includePaths: ['tests/fixtures/manifests/**/*.yaml'],
        excludePaths: [],
      });
      scanner = new ManifestScanner(config);
    });

    it('should discover and parse ArgoCD Application files', async () => {
      const manifests = await scanner.scanRepository();

      // Find the application-single.yaml file
      const appManifest = manifests.find((m) =>
        m.path.includes('application-single.yaml')
      );

      expect(appManifest).toBeDefined();
      expect(appManifest!.documents).toHaveLength(1);
      expect(appManifest!.documents[0].kind).toBe('Application');
      expect(appManifest!.documents[0].metadata.name).toBe('nginx-app');
    });

    it('should discover and parse ArgoCD ApplicationSet files', async () => {
      const manifests = await scanner.scanRepository();

      // Find the applicationset-single.yaml file
      const appSetManifest = manifests.find((m) =>
        m.path.includes('applicationset-single.yaml')
      );

      expect(appSetManifest).toBeDefined();
      expect(appSetManifest!.documents).toHaveLength(1);
      expect(appSetManifest!.documents[0].kind).toBe('ApplicationSet');
      expect(appSetManifest!.documents[0].metadata.name).toBe('my-appset');
    });

    it('should parse multi-document YAML files and filter ArgoCD resources', async () => {
      const manifests = await scanner.scanRepository();

      // Find the multi-document.yaml file
      const multiDocManifest = manifests.find((m) =>
        m.path.includes('multi-document.yaml')
      );

      expect(multiDocManifest).toBeDefined();
      // Should only include the 2 Application documents, not the ConfigMap
      expect(multiDocManifest!.documents).toHaveLength(2);
      expect(multiDocManifest!.documents[0].kind).toBe('Application');
      expect(multiDocManifest!.documents[0].metadata.name).toBe('app-one');
      expect(multiDocManifest!.documents[1].kind).toBe('Application');
      expect(multiDocManifest!.documents[1].metadata.name).toBe('app-two');
    });

    it('should skip files with invalid YAML and continue processing', async () => {
      // Suppress console.warn for this test
      const originalWarn = console.warn;
      const warnMock = jest.fn();
      console.warn = warnMock;

      const manifests = await scanner.scanRepository();

      // Should still find valid manifests despite invalid-yaml.yaml
      expect(manifests.length).toBeGreaterThan(0);

      // The invalid YAML file should not be in the results
      const invalidManifest = manifests.find((m) =>
        m.path.includes('invalid-yaml.yaml')
      );
      expect(invalidManifest).toBeUndefined();

      // Restore console.warn
      console.warn = originalWarn;
    });

    it('should not include files without ArgoCD resources', async () => {
      const manifests = await scanner.scanRepository();

      // non-argocd.yaml should not be in the results
      const nonArgoCDManifest = manifests.find((m) =>
        m.path.includes('non-argocd.yaml')
      );

      expect(nonArgoCDManifest).toBeUndefined();
    });

    it('should not include empty files', async () => {
      const manifests = await scanner.scanRepository();

      // empty.yaml should not be in the results
      const emptyManifest = manifests.find((m) => m.path.includes('empty.yaml'));

      expect(emptyManifest).toBeUndefined();
    });

    it('should handle exclude patterns', async () => {
      const config = createTestConfig({
        includePaths: ['tests/fixtures/manifests/**/*.yaml'],
        excludePaths: ['**/application-single.yaml'],
      });
      const scannerWithExclude = new ManifestScanner(config);

      const manifests = await scannerWithExclude.scanRepository();

      // application-single.yaml should be excluded
      const excludedManifest = manifests.find((m) =>
        m.path.includes('application-single.yaml')
      );

      expect(excludedManifest).toBeUndefined();

      // But other files should still be found
      expect(manifests.length).toBeGreaterThan(0);
    });

    it('should return empty array when no YAML files match patterns', async () => {
      const config = createTestConfig({
        includePaths: ['nonexistent/**/*.yaml'],
        excludePaths: [],
      });
      const scannerNoMatch = new ManifestScanner(config);

      const manifests = await scannerNoMatch.scanRepository();

      expect(manifests).toHaveLength(0);
    });

    it('should preserve original file content', async () => {
      const manifests = await scanner.scanRepository();

      const appManifest = manifests.find((m) =>
        m.path.includes('application-single.yaml')
      );

      expect(appManifest).toBeDefined();
      expect(appManifest!.content).toContain('apiVersion: argoproj.io/v1alpha1');
      expect(appManifest!.content).toContain('kind: Application');
      expect(appManifest!.content).toContain('name: nginx-app');
    });
  });

  describe('edge cases', () => {
    it('should handle YAML with only whitespace', () => {
      const config = createTestConfig();
      const scanner = new ManifestScanner(config);

      const documents = scanner.parseYAML('   \n\n   \t\t   \n');

      expect(documents).toHaveLength(0);
    });

    it('should handle YAML with special characters in strings', () => {
      const config = createTestConfig();
      const scanner = new ManifestScanner(config);

      const yaml = `
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: "app-with-special-chars: @#$%"
  annotations:
    description: "This has: colons, and, commas"
spec:
  source:
    repoURL: https://charts.example.com
    chart: nginx
    targetRevision: 1.0.0
`;
      const documents = scanner.parseYAML(yaml);

      expect(documents).toHaveLength(1);
      expect(documents[0].metadata.name).toBe('app-with-special-chars: @#$%');
    });

    it('should handle deeply nested YAML structures', () => {
      const config = createTestConfig();
      const scanner = new ManifestScanner(config);

      const yaml = `
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: deep-app
spec:
  source:
    helm:
      parameters:
        - name: level1
          value:
            level2:
              level3:
                level4: deep-value
`;
      const documents = scanner.parseYAML(yaml);

      expect(documents).toHaveLength(1);
      const helm = (documents[0].spec.source as Record<string, unknown>).helm as Record<string, unknown>;
      const parameters = helm.parameters as Array<Record<string, unknown>>;
      expect(parameters[0].name).toBe('level1');
    });
  });
});
