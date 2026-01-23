/**
 * Unit tests for FileUpdater
 *
 * Tests cover:
 * - Updating single source Application manifests
 * - Updating multi-source Application manifests
 * - Updating ApplicationSet manifests
 * - Preserving YAML formatting (indentation, spacing)
 * - Preserving comments in YAML
 * - Handling multi-document YAML files
 * - Grouping updates by file path
 * - Validating updated YAML is parseable
 * - Error handling for invalid paths
 * - Edge cases (quoted values, array indices, nested structures)
 */

import * as fs from 'fs/promises';
import { FileUpdater } from '../../../src/updater/file-updater';
import { VersionUpdate } from '../../../src/types/version';
import { HelmDependency } from '../../../src/types/dependency';

// Mock fs module
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('FileUpdater', () => {
  let updater: FileUpdater;
  const testFilePath = 'test-manifests/application.yaml';

  beforeEach(() => {
    updater = new FileUpdater();
    jest.clearAllMocks();
  });

  describe('updateManifests', () => {
    it('should update single source Application manifest', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-app
  namespace: argocd
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.9.0
  destination:
    server: https://kubernetes.default.svc
    namespace: default
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '15.9.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '15.9.0',
          newVersion: '16.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      expect(fileUpdates).toHaveLength(1);
      expect(fileUpdates[0].path).toBe(testFilePath);
      expect(fileUpdates[0].originalContent).toBe(originalContent);
      expect(fileUpdates[0].updatedContent).toContain('targetRevision: 16.0.0');
      expect(fileUpdates[0].updates).toEqual(updates);
    });

    it('should preserve YAML formatting and indentation', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-app
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.9.0
    helm:
      releaseName: my-nginx
      values: |
        replicaCount: 3
        service:
          type: LoadBalancer
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '15.9.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '15.9.0',
          newVersion: '16.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Check that formatting is preserved
      const updatedLines = fileUpdates[0].updatedContent.split('\n');
      const originalLines = originalContent.split('\n');

      // Same number of lines
      expect(updatedLines.length).toBe(originalLines.length);

      // Indentation preserved for non-updated lines
      expect(updatedLines[0]).toBe(originalLines[0]); // apiVersion line
      expect(updatedLines[2]).toBe(originalLines[2]); // metadata line
      expect(updatedLines[5]).toBe(originalLines[5]); // source line

      // Updated line has correct indentation
      expect(updatedLines[8]).toMatch(/^\s{4}targetRevision: 16\.0\.0$/);
    });

    it('should preserve comments in YAML', async () => {
      const originalContent = `# ArgoCD Application for nginx
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-app # Production nginx
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.9.0 # Current stable version
  destination:
    server: https://kubernetes.default.svc
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '15.9.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '15.9.0',
          newVersion: '16.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Check that comments are preserved
      expect(fileUpdates[0].updatedContent).toContain(
        '# ArgoCD Application for nginx'
      );
      expect(fileUpdates[0].updatedContent).toContain(
        'name: nginx-app # Production nginx'
      );
      expect(fileUpdates[0].updatedContent).toContain(
        'targetRevision: 16.0.0 # Current stable version'
      );
    });

    it('should update multi-source Application manifest', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: multi-app
spec:
  sources:
    - repoURL: https://charts.bitnami.com/bitnami
      chart: nginx
      targetRevision: 15.9.0
    - repoURL: https://charts.bitnami.com/bitnami
      chart: postgresql
      targetRevision: 12.5.0
  destination:
    server: https://kubernetes.default.svc
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dep1: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '15.9.0',
        versionPath: ['spec', 'sources', '0', 'targetRevision'],
      };

      const dep2: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'postgresql',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '12.5.0',
        versionPath: ['spec', 'sources', '1', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency: dep1,
          currentVersion: '15.9.0',
          newVersion: '16.0.0',
        },
        {
          dependency: dep2,
          currentVersion: '12.5.0',
          newVersion: '13.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      expect(fileUpdates).toHaveLength(1);
      expect(fileUpdates[0].updatedContent).toContain('targetRevision: 16.0.0');
      expect(fileUpdates[0].updatedContent).toContain('targetRevision: 13.0.0');
    });

    it('should update ApplicationSet manifest', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: my-appset
spec:
  generators:
    - list:
        elements:
          - cluster: prod
          - cluster: staging
  template:
    metadata:
      name: '{{cluster}}-app'
    spec:
      source:
        repoURL: https://charts.example.com
        chart: my-chart
        targetRevision: 1.2.3
      destination:
        server: '{{cluster}}'
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'my-chart',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.2.3',
        versionPath: ['spec', 'template', 'spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '1.2.3',
          newVersion: '2.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      expect(fileUpdates).toHaveLength(1);
      expect(fileUpdates[0].updatedContent).toContain('targetRevision: 2.0.0');
      // Ensure template variables are preserved
      expect(fileUpdates[0].updatedContent).toContain("name: '{{cluster}}-app'");
      expect(fileUpdates[0].updatedContent).toContain("server: '{{cluster}}'");
    });

    it('should handle multi-document YAML files', async () => {
      const originalContent = `---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app1
spec:
  source:
    repoURL: https://charts.example.com
    chart: chart1
    targetRevision: 1.0.0
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app2
spec:
  source:
    repoURL: https://charts.example.com
    chart: chart2
    targetRevision: 2.0.0
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dep1: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'chart1',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const dep2: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 1,
        chartName: 'chart2',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '2.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency: dep1,
          currentVersion: '1.0.0',
          newVersion: '1.1.0',
        },
        {
          dependency: dep2,
          currentVersion: '2.0.0',
          newVersion: '2.1.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      expect(fileUpdates).toHaveLength(1);
      
      // Check both documents were updated
      const lines = fileUpdates[0].updatedContent.split('\n');
      const firstTargetLine = lines.findIndex((l) =>
        l.includes('targetRevision: 1.1.0')
      );
      const secondTargetLine = lines.findIndex((l) =>
        l.includes('targetRevision: 2.1.0')
      );

      expect(firstTargetLine).toBeGreaterThan(-1);
      expect(secondTargetLine).toBeGreaterThan(-1);
      expect(secondTargetLine).toBeGreaterThan(firstTargetLine);
    });

    it('should group updates by file path', async () => {
      const content1 = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app1
spec:
  source:
    repoURL: https://charts.example.com
    chart: chart1
    targetRevision: 1.0.0
`;

      const content2 = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app2
spec:
  source:
    repoURL: https://charts.example.com
    chart: chart2
    targetRevision: 2.0.0
`;

      mockFs.readFile.mockImplementation(async (filePath) => {
        const path = filePath.toString();
        if (path === 'file1.yaml') return content1;
        if (path === 'file2.yaml') return content2;
        throw new Error('File not found');
      });

      const dep1: HelmDependency = {
        manifestPath: 'file1.yaml',
        documentIndex: 0,
        chartName: 'chart1',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const dep2: HelmDependency = {
        manifestPath: 'file2.yaml',
        documentIndex: 0,
        chartName: 'chart2',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '2.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency: dep1,
          currentVersion: '1.0.0',
          newVersion: '1.1.0',
        },
        {
          dependency: dep2,
          currentVersion: '2.0.0',
          newVersion: '2.1.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Should have 2 file updates (one per file)
      expect(fileUpdates).toHaveLength(2);
      expect(fileUpdates.map((f) => f.path).sort()).toEqual([
        'file1.yaml',
        'file2.yaml',
      ]);

      // Each file should be read only once
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });

    it('should not include files with no changes', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app
spec:
  source:
    repoURL: https://charts.example.com
    chart: chart1
    targetRevision: 1.0.0
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'chart1',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      // Update to the same version (no actual change)
      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '1.0.0',
          newVersion: '1.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Should not include the file since content didn't change
      expect(fileUpdates).toHaveLength(0);
    });

    it('should handle quoted values', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app
spec:
  source:
    repoURL: https://charts.example.com
    chart: chart1
    targetRevision: "1.0.0"
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'chart1',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '1.0.0',
          newVersion: '2.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Should preserve quotes
      expect(fileUpdates[0].updatedContent).toContain('targetRevision: "2.0.0"');
    });

    it('should handle single-quoted values', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app
spec:
  source:
    repoURL: https://charts.example.com
    chart: chart1
    targetRevision: '1.0.0'
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'chart1',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '1.0.0',
          newVersion: '2.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Should preserve single quotes
      expect(fileUpdates[0].updatedContent).toContain("targetRevision: '2.0.0'");
    });

    it('should validate updated YAML is parseable', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app
spec:
  source:
    repoURL: https://charts.example.com
    chart: chart1
    targetRevision: 1.0.0
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'chart1',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '1.0.0',
          newVersion: '2.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // The updated content should be valid YAML
      expect(() => {
        const yaml = require('js-yaml');
        yaml.loadAll(fileUpdates[0].updatedContent);
      }).not.toThrow();
    });

    it('should handle errors gracefully and continue processing', async () => {
      const content2 = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app2
spec:
  source:
    repoURL: https://charts.example.com
    chart: chart2
    targetRevision: 2.0.0
`;

      mockFs.readFile.mockImplementation(async (filePath) => {
        const path = filePath.toString();
        if (path === 'file1.yaml') throw new Error('File read error');
        if (path === 'file2.yaml') return content2;
        throw new Error('File not found');
      });

      const dep1: HelmDependency = {
        manifestPath: 'file1.yaml',
        documentIndex: 0,
        chartName: 'chart1',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const dep2: HelmDependency = {
        manifestPath: 'file2.yaml',
        documentIndex: 0,
        chartName: 'chart2',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '2.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency: dep1,
          currentVersion: '1.0.0',
          newVersion: '1.1.0',
        },
        {
          dependency: dep2,
          currentVersion: '2.0.0',
          newVersion: '2.1.0',
        },
      ];

      // Should not throw, but continue processing file2
      const fileUpdates = await updater.updateManifests(updates);

      // Should only have file2 (file1 failed)
      expect(fileUpdates).toHaveLength(1);
      expect(fileUpdates[0].path).toBe('file2.yaml');
    });

    it('should handle nested array indices correctly', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: appset
spec:
  template:
    spec:
      sources:
        - repoURL: https://charts.example.com
          chart: chart1
          targetRevision: 1.0.0
        - repoURL: https://charts.example.com
          chart: chart2
          targetRevision: 2.0.0
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'chart2',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '2.0.0',
        versionPath: ['spec', 'template', 'spec', 'sources', '1', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '2.0.0',
          newVersion: '3.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      expect(fileUpdates).toHaveLength(1);
      
      // Check that only the second chart was updated
      const lines = fileUpdates[0].updatedContent.split('\n');
      expect(lines.some((l) => l.includes('targetRevision: 1.0.0'))).toBe(true);
      expect(lines.some((l) => l.includes('targetRevision: 3.0.0'))).toBe(true);
      expect(lines.some((l) => l.includes('targetRevision: 2.0.0'))).toBe(false);
    });

    it('should preserve blank lines and spacing', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application

metadata:
  name: app

spec:
  source:
    repoURL: https://charts.example.com
    chart: chart1
    targetRevision: 1.0.0

  destination:
    server: https://kubernetes.default.svc
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'chart1',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '1.0.0',
          newVersion: '2.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Count blank lines in original and updated
      const originalBlankLines = originalContent.split('\n').filter((l) => l.trim() === '').length;
      const updatedBlankLines = fileUpdates[0].updatedContent.split('\n').filter((l) => l.trim() === '').length;

      expect(updatedBlankLines).toBe(originalBlankLines);
    });

    it('should handle version with pre-release tags', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app
spec:
  source:
    repoURL: https://charts.example.com
    chart: chart1
    targetRevision: 1.0.0-alpha.1
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'chart1',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0-alpha.1',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '1.0.0-alpha.1',
          newVersion: '1.0.0-beta.1',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      expect(fileUpdates[0].updatedContent).toContain('targetRevision: 1.0.0-beta.1');
    });

    it('should handle version with build metadata', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app
spec:
  source:
    repoURL: https://charts.example.com
    chart: chart1
    targetRevision: 1.0.0+build.123
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'chart1',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0+build.123',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '1.0.0+build.123',
          newVersion: '1.0.0+build.456',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      expect(fileUpdates[0].updatedContent).toContain('targetRevision: 1.0.0+build.456');
    });
  });

  describe('batch update support', () => {
    it('should update multiple charts in the same file (same document)', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: multi-source-app
spec:
  sources:
    - repoURL: https://charts.bitnami.com/bitnami
      chart: nginx
      targetRevision: 15.9.0
    - repoURL: https://charts.bitnami.com/bitnami
      chart: postgresql
      targetRevision: 12.5.0
    - repoURL: https://charts.bitnami.com/bitnami
      chart: redis
      targetRevision: 17.0.0
  destination:
    server: https://kubernetes.default.svc
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dep1: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '15.9.0',
        versionPath: ['spec', 'sources', '0', 'targetRevision'],
      };

      const dep2: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'postgresql',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '12.5.0',
        versionPath: ['spec', 'sources', '1', 'targetRevision'],
      };

      const dep3: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'redis',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '17.0.0',
        versionPath: ['spec', 'sources', '2', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency: dep1,
          currentVersion: '15.9.0',
          newVersion: '16.0.0',
        },
        {
          dependency: dep2,
          currentVersion: '12.5.0',
          newVersion: '13.0.0',
        },
        {
          dependency: dep3,
          currentVersion: '17.0.0',
          newVersion: '18.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Should have 1 file update with all 3 charts updated
      expect(fileUpdates).toHaveLength(1);
      expect(fileUpdates[0].path).toBe(testFilePath);
      expect(fileUpdates[0].updates).toHaveLength(3);

      // All three versions should be updated
      expect(fileUpdates[0].updatedContent).toContain('targetRevision: 16.0.0');
      expect(fileUpdates[0].updatedContent).toContain('targetRevision: 13.0.0');
      expect(fileUpdates[0].updatedContent).toContain('targetRevision: 18.0.0');

      // Old versions should not be present
      expect(fileUpdates[0].updatedContent).not.toContain('targetRevision: 15.9.0');
      expect(fileUpdates[0].updatedContent).not.toContain('targetRevision: 12.5.0');
      expect(fileUpdates[0].updatedContent).not.toContain('targetRevision: 17.0.0');

      // File should be read only once
      expect(mockFs.readFile).toHaveBeenCalledTimes(1);
    });

    it('should update multiple charts across different files', async () => {
      const content1 = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-app
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.9.0
  destination:
    server: https://kubernetes.default.svc
`;

      const content2 = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: postgresql-app
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: postgresql
    targetRevision: 12.5.0
  destination:
    server: https://kubernetes.default.svc
`;

      const content3 = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: redis-app
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: redis
    targetRevision: 17.0.0
  destination:
    server: https://kubernetes.default.svc
`;

      mockFs.readFile.mockImplementation(async (filePath) => {
        const path = filePath.toString();
        if (path === 'apps/nginx.yaml') return content1;
        if (path === 'apps/postgresql.yaml') return content2;
        if (path === 'apps/redis.yaml') return content3;
        throw new Error('File not found');
      });

      const dep1: HelmDependency = {
        manifestPath: 'apps/nginx.yaml',
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '15.9.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const dep2: HelmDependency = {
        manifestPath: 'apps/postgresql.yaml',
        documentIndex: 0,
        chartName: 'postgresql',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '12.5.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const dep3: HelmDependency = {
        manifestPath: 'apps/redis.yaml',
        documentIndex: 0,
        chartName: 'redis',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '17.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency: dep1,
          currentVersion: '15.9.0',
          newVersion: '16.0.0',
        },
        {
          dependency: dep2,
          currentVersion: '12.5.0',
          newVersion: '13.0.0',
        },
        {
          dependency: dep3,
          currentVersion: '17.0.0',
          newVersion: '18.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Should have 3 file updates (one per file)
      expect(fileUpdates).toHaveLength(3);
      expect(fileUpdates.map((f) => f.path).sort()).toEqual([
        'apps/nginx.yaml',
        'apps/postgresql.yaml',
        'apps/redis.yaml',
      ]);

      // Each file should have its respective update
      const nginxUpdate = fileUpdates.find((f) => f.path === 'apps/nginx.yaml');
      const postgresUpdate = fileUpdates.find((f) => f.path === 'apps/postgresql.yaml');
      const redisUpdate = fileUpdates.find((f) => f.path === 'apps/redis.yaml');

      expect(nginxUpdate?.updatedContent).toContain('targetRevision: 16.0.0');
      expect(postgresUpdate?.updatedContent).toContain('targetRevision: 13.0.0');
      expect(redisUpdate?.updatedContent).toContain('targetRevision: 18.0.0');

      // Each file should be read only once
      expect(mockFs.readFile).toHaveBeenCalledTimes(3);
    });

    it('should update multiple documents in multi-document YAML file', async () => {
      const originalContent = `---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-app
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.9.0
  destination:
    server: https://kubernetes.default.svc
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: postgresql-app
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: postgresql
    targetRevision: 12.5.0
  destination:
    server: https://kubernetes.default.svc
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: redis-app
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: redis
    targetRevision: 17.0.0
  destination:
    server: https://kubernetes.default.svc
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dep1: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'nginx',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '15.9.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const dep2: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 1,
        chartName: 'postgresql',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '12.5.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const dep3: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 2,
        chartName: 'redis',
        repoURL: 'https://charts.bitnami.com/bitnami',
        repoType: 'helm',
        currentVersion: '17.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency: dep1,
          currentVersion: '15.9.0',
          newVersion: '16.0.0',
        },
        {
          dependency: dep2,
          currentVersion: '12.5.0',
          newVersion: '13.0.0',
        },
        {
          dependency: dep3,
          currentVersion: '17.0.0',
          newVersion: '18.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Should have 1 file update with all 3 documents updated
      expect(fileUpdates).toHaveLength(1);
      expect(fileUpdates[0].path).toBe(testFilePath);
      expect(fileUpdates[0].updates).toHaveLength(3);

      // All three versions should be updated
      const lines = fileUpdates[0].updatedContent.split('\n');
      const nginxLine = lines.findIndex((l) => l.includes('targetRevision: 16.0.0'));
      const postgresLine = lines.findIndex((l) => l.includes('targetRevision: 13.0.0'));
      const redisLine = lines.findIndex((l) => l.includes('targetRevision: 18.0.0'));

      expect(nginxLine).toBeGreaterThan(-1);
      expect(postgresLine).toBeGreaterThan(-1);
      expect(redisLine).toBeGreaterThan(-1);

      // Verify they're in the correct order
      expect(postgresLine).toBeGreaterThan(nginxLine);
      expect(redisLine).toBeGreaterThan(postgresLine);

      // Old versions should not be present
      expect(fileUpdates[0].updatedContent).not.toContain('targetRevision: 15.9.0');
      expect(fileUpdates[0].updatedContent).not.toContain('targetRevision: 12.5.0');
      expect(fileUpdates[0].updatedContent).not.toContain('targetRevision: 17.0.0');

      // Document separators should be preserved
      const separators = fileUpdates[0].updatedContent.split('\n').filter((l) => l.trim() === '---');
      expect(separators.length).toBe(3);

      // File should be read only once
      expect(mockFs.readFile).toHaveBeenCalledTimes(1);
    });

    it('should handle mixed scenario: multiple files with multiple documents each', async () => {
      const content1 = `---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-app
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.9.0
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: postgresql-app
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: postgresql
    targetRevision: 12.5.0
`;

      const content2 = `---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: redis-app
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: redis
    targetRevision: 17.0.0
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: mongodb-app
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: mongodb
    targetRevision: 13.0.0
`;

      mockFs.readFile.mockImplementation(async (filePath) => {
        const path = filePath.toString();
        if (path === 'apps/file1.yaml') return content1;
        if (path === 'apps/file2.yaml') return content2;
        throw new Error('File not found');
      });

      const updates: VersionUpdate[] = [
        {
          dependency: {
            manifestPath: 'apps/file1.yaml',
            documentIndex: 0,
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm',
            currentVersion: '15.9.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '15.9.0',
          newVersion: '16.0.0',
        },
        {
          dependency: {
            manifestPath: 'apps/file1.yaml',
            documentIndex: 1,
            chartName: 'postgresql',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm',
            currentVersion: '12.5.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '12.5.0',
          newVersion: '13.0.0',
        },
        {
          dependency: {
            manifestPath: 'apps/file2.yaml',
            documentIndex: 0,
            chartName: 'redis',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm',
            currentVersion: '17.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '17.0.0',
          newVersion: '18.0.0',
        },
        {
          dependency: {
            manifestPath: 'apps/file2.yaml',
            documentIndex: 1,
            chartName: 'mongodb',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm',
            currentVersion: '13.0.0',
            versionPath: ['spec', 'source', 'targetRevision'],
          },
          currentVersion: '13.0.0',
          newVersion: '14.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Should have 2 file updates
      expect(fileUpdates).toHaveLength(2);
      expect(fileUpdates.map((f) => f.path).sort()).toEqual([
        'apps/file1.yaml',
        'apps/file2.yaml',
      ]);

      // File 1 should have 2 updates
      const file1Update = fileUpdates.find((f) => f.path === 'apps/file1.yaml');
      expect(file1Update?.updates).toHaveLength(2);
      expect(file1Update?.updatedContent).toContain('targetRevision: 16.0.0');
      expect(file1Update?.updatedContent).toContain('targetRevision: 13.0.0');

      // File 2 should have 2 updates
      const file2Update = fileUpdates.find((f) => f.path === 'apps/file2.yaml');
      expect(file2Update?.updates).toHaveLength(2);
      expect(file2Update?.updatedContent).toContain('targetRevision: 18.0.0');
      expect(file2Update?.updatedContent).toContain('targetRevision: 14.0.0');

      // Each file should be read only once
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });

    it('should handle partial updates when some charts are already at latest version', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: multi-source-app
spec:
  sources:
    - repoURL: https://charts.bitnami.com/bitnami
      chart: nginx
      targetRevision: 15.9.0
    - repoURL: https://charts.bitnami.com/bitnami
      chart: postgresql
      targetRevision: 12.5.0
    - repoURL: https://charts.bitnami.com/bitnami
      chart: redis
      targetRevision: 17.0.0
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const updates: VersionUpdate[] = [
        {
          dependency: {
            manifestPath: testFilePath,
            documentIndex: 0,
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm',
            currentVersion: '15.9.0',
            versionPath: ['spec', 'sources', '0', 'targetRevision'],
          },
          currentVersion: '15.9.0',
          newVersion: '16.0.0',
        },
        {
          dependency: {
            manifestPath: testFilePath,
            documentIndex: 0,
            chartName: 'postgresql',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm',
            currentVersion: '12.5.0',
            versionPath: ['spec', 'sources', '1', 'targetRevision'],
          },
          currentVersion: '12.5.0',
          newVersion: '12.5.0', // No change
        },
        {
          dependency: {
            manifestPath: testFilePath,
            documentIndex: 0,
            chartName: 'redis',
            repoURL: 'https://charts.bitnami.com/bitnami',
            repoType: 'helm',
            currentVersion: '17.0.0',
            versionPath: ['spec', 'sources', '2', 'targetRevision'],
          },
          currentVersion: '17.0.0',
          newVersion: '18.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Should have 1 file update (even though one chart didn't change)
      expect(fileUpdates).toHaveLength(1);

      // nginx and redis should be updated
      expect(fileUpdates[0].updatedContent).toContain('targetRevision: 16.0.0');
      expect(fileUpdates[0].updatedContent).toContain('targetRevision: 18.0.0');

      // postgresql should remain unchanged
      expect(fileUpdates[0].updatedContent).toContain('targetRevision: 12.5.0');
    });

    it('should efficiently batch updates by reading each file only once', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: multi-source-app
spec:
  sources:
    - repoURL: https://charts.bitnami.com/bitnami
      chart: chart1
      targetRevision: 1.0.0
    - repoURL: https://charts.bitnami.com/bitnami
      chart: chart2
      targetRevision: 2.0.0
    - repoURL: https://charts.bitnami.com/bitnami
      chart: chart3
      targetRevision: 3.0.0
    - repoURL: https://charts.bitnami.com/bitnami
      chart: chart4
      targetRevision: 4.0.0
    - repoURL: https://charts.bitnami.com/bitnami
      chart: chart5
      targetRevision: 5.0.0
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      // Create 5 updates for the same file
      const updates: VersionUpdate[] = Array.from({ length: 5 }, (_, i) => ({
        dependency: {
          manifestPath: testFilePath,
          documentIndex: 0,
          chartName: `chart${i + 1}`,
          repoURL: 'https://charts.bitnami.com/bitnami',
          repoType: 'helm' as const,
          currentVersion: `${i + 1}.0.0`,
          versionPath: ['spec', 'sources', String(i), 'targetRevision'],
        },
        currentVersion: `${i + 1}.0.0`,
        newVersion: `${i + 1}.1.0`,
      }));

      const fileUpdates = await updater.updateManifests(updates);

      // Should have 1 file update with all 5 charts updated
      expect(fileUpdates).toHaveLength(1);
      expect(fileUpdates[0].updates).toHaveLength(5);

      // File should be read only once despite 5 updates
      expect(mockFs.readFile).toHaveBeenCalledTimes(1);
      expect(mockFs.readFile).toHaveBeenCalledWith(testFilePath, 'utf-8');

      // All versions should be updated
      for (let i = 1; i <= 5; i++) {
        expect(fileUpdates[0].updatedContent).toContain(`targetRevision: ${i}.1.0`);
        expect(fileUpdates[0].updatedContent).not.toContain(`targetRevision: ${i}.0.0`);
      }
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid document index', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app
spec:
  source:
    repoURL: https://charts.example.com
    chart: chart1
    targetRevision: 1.0.0
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 5, // Invalid index
        chartName: 'chart1',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'source', 'targetRevision'],
      };

      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '1.0.0',
          newVersion: '2.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Should handle error gracefully and return empty array
      expect(fileUpdates).toHaveLength(0);
    });

    it('should throw error for non-existent path', async () => {
      const originalContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app
spec:
  source:
    repoURL: https://charts.example.com
    chart: chart1
    targetRevision: 1.0.0
`;

      mockFs.readFile.mockResolvedValue(originalContent);

      const dependency: HelmDependency = {
        manifestPath: testFilePath,
        documentIndex: 0,
        chartName: 'chart1',
        repoURL: 'https://charts.example.com',
        repoType: 'helm',
        currentVersion: '1.0.0',
        versionPath: ['spec', 'nonexistent', 'targetRevision'], // Invalid path
      };

      const updates: VersionUpdate[] = [
        {
          dependency,
          currentVersion: '1.0.0',
          newVersion: '2.0.0',
        },
      ];

      const fileUpdates = await updater.updateManifests(updates);

      // Should handle error gracefully and return empty array
      expect(fileUpdates).toHaveLength(0);
    });
  });
});
