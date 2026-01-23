/**
 * Integration tests for DependencyExtractor with ManifestScanner
 *
 * These tests verify that the DependencyExtractor correctly processes
 * real manifest files discovered by the ManifestScanner.
 */

import { ManifestScanner } from '../../src/scanner/manifest-scanner';
import { DependencyExtractor } from '../../src/extractor/dependency-extractor';
import { ActionConfig } from '../../src/types/config';

// Helper function to create a minimal ActionConfig for testing
function createTestConfig(
  overrides: Partial<ActionConfig> = {}
): ActionConfig {
  return {
    includePaths: ['tests/fixtures/manifests/**/*.yaml'],
    excludePaths: [],
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
    ...overrides,
  };
}

describe('DependencyExtractor Integration', () => {
  let scanner: ManifestScanner;
  let extractor: DependencyExtractor;

  beforeEach(() => {
    const config = createTestConfig();
    scanner = new ManifestScanner(config);
    extractor = new DependencyExtractor();
  });

  it('should extract dependencies from all discovered manifests', async () => {
    const manifests = await scanner.scanRepository();
    
    // Extract dependencies from all manifests
    const allDependencies = manifests.flatMap((manifest) =>
      manifest.documents.flatMap((doc, index) => {
        if (doc.kind === 'Application') {
          return extractor.extractFromApplication(doc, manifest.path, index);
        } else if (doc.kind === 'ApplicationSet') {
          return extractor.extractFromApplicationSet(doc, manifest.path, index);
        }
        return [];
      })
    );

    // Should find dependencies from multiple files
    expect(allDependencies.length).toBeGreaterThan(0);

    // Verify we found the nginx chart from application-single.yaml
    const nginxDep = allDependencies.find(
      (dep) => dep.chartName === 'nginx' && dep.manifestPath.includes('application-single.yaml')
    );
    expect(nginxDep).toBeDefined();
    expect(nginxDep!.repoURL).toBe('https://charts.bitnami.com/bitnami');
    expect(nginxDep!.currentVersion).toBe('15.9.0');
    expect(nginxDep!.repoType).toBe('helm');

    // Verify we found the chart from applicationset-single.yaml
    const appsetDep = allDependencies.find(
      (dep) => dep.chartName === 'my-chart' && dep.manifestPath.includes('applicationset-single.yaml')
    );
    expect(appsetDep).toBeDefined();
    expect(appsetDep!.repoURL).toBe('https://charts.example.com');
    expect(appsetDep!.currentVersion).toBe('1.2.3');
  });

  it('should extract multiple dependencies from multi-document files', async () => {
    const manifests = await scanner.scanRepository();
    
    // Find the multi-document manifest
    const multiDocManifest = manifests.find((m) =>
      m.path.includes('multi-document.yaml')
    );
    
    expect(multiDocManifest).toBeDefined();

    // Extract dependencies from all documents
    const dependencies = multiDocManifest!.documents.flatMap((doc, index) =>
      extractor.extractFromApplication(doc, multiDocManifest!.path, index)
    );

    // Should find 2 dependencies (postgresql and redis)
    expect(dependencies).toHaveLength(2);

    const postgresqlDep = dependencies.find((dep) => dep.chartName === 'postgresql');
    expect(postgresqlDep).toBeDefined();
    expect(postgresqlDep!.currentVersion).toBe('12.5.0');
    expect(postgresqlDep!.documentIndex).toBe(0);

    const redisDep = dependencies.find((dep) => dep.chartName === 'redis');
    expect(redisDep).toBeDefined();
    expect(redisDep!.currentVersion).toBe('17.11.0');
    expect(redisDep!.documentIndex).toBe(1);
  });

  it('should extract dependencies from multi-source applications', async () => {
    const manifests = await scanner.scanRepository();
    
    // Find the multi-source application manifest
    const multiSourceManifest = manifests.find((m) =>
      m.path.includes('application-multi-source.yaml')
    );
    
    expect(multiSourceManifest).toBeDefined();

    // Extract dependencies
    const dependencies = multiSourceManifest!.documents.flatMap((doc, index) =>
      extractor.extractFromApplication(doc, multiSourceManifest!.path, index)
    );

    // Should find 2 dependencies (nginx and postgresql)
    expect(dependencies).toHaveLength(2);

    expect(dependencies[0].chartName).toBe('nginx');
    expect(dependencies[0].versionPath).toEqual(['spec', 'sources', '0', 'targetRevision']);

    expect(dependencies[1].chartName).toBe('postgresql');
    expect(dependencies[1].versionPath).toEqual(['spec', 'sources', '1', 'targetRevision']);
  });

  it('should extract dependencies from OCI registry sources', async () => {
    const manifests = await scanner.scanRepository();
    
    // Find the OCI application manifest
    const ociManifest = manifests.find((m) =>
      m.path.includes('application-oci.yaml')
    );
    
    expect(ociManifest).toBeDefined();

    // Extract dependencies
    const dependencies = ociManifest!.documents.flatMap((doc, index) =>
      extractor.extractFromApplication(doc, ociManifest!.path, index)
    );

    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].repoType).toBe('oci');
    expect(dependencies[0].repoURL).toBe('oci://ghcr.io/myorg/charts');
    expect(dependencies[0].chartName).toBe('my-chart');
  });

  it('should extract dependencies from ApplicationSet with multi-source', async () => {
    const manifests = await scanner.scanRepository();
    
    // Find the multi-source ApplicationSet manifest
    const multiSourceAppSetManifest = manifests.find((m) =>
      m.path.includes('applicationset-multi-source.yaml')
    );
    
    expect(multiSourceAppSetManifest).toBeDefined();

    // Extract dependencies
    const dependencies = multiSourceAppSetManifest!.documents.flatMap((doc, index) =>
      extractor.extractFromApplicationSet(doc, multiSourceAppSetManifest!.path, index)
    );

    // Should find 2 dependencies (frontend and backend)
    expect(dependencies).toHaveLength(2);

    expect(dependencies[0].chartName).toBe('frontend');
    expect(dependencies[0].currentVersion).toBe('3.0.0');
    expect(dependencies[0].versionPath).toEqual([
      'spec',
      'template',
      'spec',
      'sources',
      '0',
      'targetRevision',
    ]);

    expect(dependencies[1].chartName).toBe('backend');
    expect(dependencies[1].currentVersion).toBe('2.5.0');
    expect(dependencies[1].versionPath).toEqual([
      'spec',
      'template',
      'spec',
      'sources',
      '1',
      'targetRevision',
    ]);
  });

  it('should not extract dependencies from Git sources', async () => {
    const manifests = await scanner.scanRepository();
    
    // Find the Git source application manifest
    const gitManifest = manifests.find((m) =>
      m.path.includes('application-git-source.yaml')
    );
    
    expect(gitManifest).toBeDefined();

    // Extract dependencies
    const dependencies = gitManifest!.documents.flatMap((doc, index) =>
      extractor.extractFromApplication(doc, gitManifest!.path, index)
    );

    // Should not find any dependencies (Git source, not Helm)
    expect(dependencies).toHaveLength(0);
  });

  it('should preserve manifest path and document index for all dependencies', async () => {
    const manifests = await scanner.scanRepository();
    
    const allDependencies = manifests.flatMap((manifest) =>
      manifest.documents.flatMap((doc, index) => {
        if (doc.kind === 'Application') {
          return extractor.extractFromApplication(doc, manifest.path, index);
        } else if (doc.kind === 'ApplicationSet') {
          return extractor.extractFromApplicationSet(doc, manifest.path, index);
        }
        return [];
      })
    );

    // All dependencies should have valid manifest paths and document indices
    allDependencies.forEach((dep) => {
      expect(dep.manifestPath).toBeTruthy();
      expect(dep.manifestPath).toContain('.yaml');
      expect(dep.documentIndex).toBeGreaterThanOrEqual(0);
    });
  });

  it('should generate unique version paths for each dependency', async () => {
    const manifests = await scanner.scanRepository();
    
    const allDependencies = manifests.flatMap((manifest) =>
      manifest.documents.flatMap((doc, index) => {
        if (doc.kind === 'Application') {
          return extractor.extractFromApplication(doc, manifest.path, index);
        } else if (doc.kind === 'ApplicationSet') {
          return extractor.extractFromApplicationSet(doc, manifest.path, index);
        }
        return [];
      })
    );

    // All dependencies should have valid version paths
    allDependencies.forEach((dep) => {
      expect(dep.versionPath).toBeDefined();
      expect(dep.versionPath.length).toBeGreaterThan(0);
      expect(dep.versionPath[dep.versionPath.length - 1]).toBe('targetRevision');
    });

    // Version paths should be unique within the same manifest
    const pathsByManifest = new Map<string, Set<string>>();
    allDependencies.forEach((dep) => {
      const key = `${dep.manifestPath}:${dep.documentIndex}`;
      if (!pathsByManifest.has(key)) {
        pathsByManifest.set(key, new Set());
      }
      const pathStr = JSON.stringify(dep.versionPath);
      pathsByManifest.get(key)!.add(pathStr);
    });

    // For manifests with multiple sources, paths should be different
    pathsByManifest.forEach((paths) => {
      const pathArray = Array.from(paths);
      // If there are multiple paths, they should be unique
      if (pathArray.length > 1) {
        expect(new Set(pathArray).size).toBe(pathArray.length);
      }
    });
  });
});
