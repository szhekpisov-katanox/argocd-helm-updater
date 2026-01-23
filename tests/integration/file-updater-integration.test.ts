/**
 * Integration tests for FileUpdater
 *
 * These tests verify FileUpdater works with real file operations
 * using temporary files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileUpdater } from '../../src/updater/file-updater';
import { VersionUpdate } from '../../src/types/version';
import { HelmDependency } from '../../src/types/dependency';

describe('FileUpdater Integration Tests', () => {
  let updater: FileUpdater;
  let tempDir: string;

  beforeEach(async () => {
    updater = new FileUpdater();
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-updater-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should update a real Application manifest file', async () => {
    const manifestContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.9.0
    helm:
      releaseName: my-nginx
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
`;

    const filePath = path.join(tempDir, 'application.yaml');
    await fs.writeFile(filePath, manifestContent, 'utf-8');

    const dependency: HelmDependency = {
      manifestPath: filePath,
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
    expect(fileUpdates[0].path).toBe(filePath);
    expect(fileUpdates[0].updatedContent).toContain('targetRevision: 16.0.0');
    expect(fileUpdates[0].updatedContent).toContain('chart: nginx');
    expect(fileUpdates[0].updatedContent).toContain('releaseName: my-nginx');

    // Verify the file can be read back and parsed
    const updatedContent = fileUpdates[0].updatedContent;
    const yaml = require('js-yaml');
    const parsed = yaml.load(updatedContent);
    expect(parsed.spec.source.targetRevision).toBe('16.0.0');
  });

  it('should update multiple charts in a multi-source Application', async () => {
    const manifestContent = `apiVersion: argoproj.io/v1alpha1
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

    const filePath = path.join(tempDir, 'multi-source.yaml');
    await fs.writeFile(filePath, manifestContent, 'utf-8');

    const dep1: HelmDependency = {
      manifestPath: filePath,
      documentIndex: 0,
      chartName: 'nginx',
      repoURL: 'https://charts.bitnami.com/bitnami',
      repoType: 'helm',
      currentVersion: '15.9.0',
      versionPath: ['spec', 'sources', '0', 'targetRevision'],
    };

    const dep2: HelmDependency = {
      manifestPath: filePath,
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

    // Verify both updates were applied correctly
    const yaml = require('js-yaml');
    const parsed = yaml.load(fileUpdates[0].updatedContent);
    expect(parsed.spec.sources[0].targetRevision).toBe('16.0.0');
    expect(parsed.spec.sources[1].targetRevision).toBe('13.0.0');
  });

  it('should preserve comments and formatting in real files', async () => {
    const manifestContent = `# Production nginx deployment
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-app # Main nginx instance
  namespace: argocd
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.9.0 # Stable version
    helm:
      # Custom values for production
      values: |
        replicaCount: 3
        service:
          type: LoadBalancer
  destination:
    server: https://kubernetes.default.svc
    namespace: default # Production namespace
`;

    const filePath = path.join(tempDir, 'with-comments.yaml');
    await fs.writeFile(filePath, manifestContent, 'utf-8');

    const dependency: HelmDependency = {
      manifestPath: filePath,
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

    // Verify comments are preserved
    expect(fileUpdates[0].updatedContent).toContain('# Production nginx deployment');
    expect(fileUpdates[0].updatedContent).toContain('name: nginx-app # Main nginx instance');
    expect(fileUpdates[0].updatedContent).toContain('targetRevision: 16.0.0 # Stable version');
    expect(fileUpdates[0].updatedContent).toContain('# Custom values for production');
    expect(fileUpdates[0].updatedContent).toContain('namespace: default # Production namespace');
  });

  it('should handle multi-document YAML files', async () => {
    const manifestContent = `---
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

    const filePath = path.join(tempDir, 'multi-doc.yaml');
    await fs.writeFile(filePath, manifestContent, 'utf-8');

    const dep1: HelmDependency = {
      manifestPath: filePath,
      documentIndex: 0,
      chartName: 'chart1',
      repoURL: 'https://charts.example.com',
      repoType: 'helm',
      currentVersion: '1.0.0',
      versionPath: ['spec', 'source', 'targetRevision'],
    };

    const dep2: HelmDependency = {
      manifestPath: filePath,
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

    // Verify both documents were updated
    const yaml = require('js-yaml');
    const docs = yaml.loadAll(fileUpdates[0].updatedContent);
    expect(docs).toHaveLength(2);
    expect(docs[0].spec.source.targetRevision).toBe('1.1.0');
    expect(docs[1].spec.source.targetRevision).toBe('2.1.0');
  });

  it('should handle ApplicationSet manifests', async () => {
    const manifestContent = `apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: cluster-appset
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - cluster: prod
            url: https://prod.example.com
          - cluster: staging
            url: https://staging.example.com
  template:
    metadata:
      name: '{{cluster}}-nginx'
    spec:
      project: default
      source:
        repoURL: https://charts.bitnami.com/bitnami
        chart: nginx
        targetRevision: 15.9.0
      destination:
        server: '{{url}}'
        namespace: nginx
`;

    const filePath = path.join(tempDir, 'appset.yaml');
    await fs.writeFile(filePath, manifestContent, 'utf-8');

    const dependency: HelmDependency = {
      manifestPath: filePath,
      documentIndex: 0,
      chartName: 'nginx',
      repoURL: 'https://charts.bitnami.com/bitnami',
      repoType: 'helm',
      currentVersion: '15.9.0',
      versionPath: ['spec', 'template', 'spec', 'source', 'targetRevision'],
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
    expect(fileUpdates[0].updatedContent).toContain('targetRevision: 16.0.0');

    // Verify template variables are preserved
    expect(fileUpdates[0].updatedContent).toContain("name: '{{cluster}}-nginx'");
    expect(fileUpdates[0].updatedContent).toContain("server: '{{url}}'");

    // Verify the structure is correct
    const yaml = require('js-yaml');
    const parsed = yaml.load(fileUpdates[0].updatedContent);
    expect(parsed.spec.template.spec.source.targetRevision).toBe('16.0.0');
  });
});
