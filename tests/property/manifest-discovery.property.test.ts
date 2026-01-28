/**
 * Property-based tests for ManifestScanner - Manifest Discovery
 * 
 * **Property 1: ArgoCD Resource Discovery**
 * **Validates: Requirements 1.1, 1.2, 1.5**
 * 
 * For any repository structure with YAML files, the manifest scanner should 
 * discover all files containing ArgoCD Application or ApplicationSet resources 
 * that match the configured include/exclude patterns.
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ManifestScanner } from '../../src/scanner/manifest-scanner';
import { ActionConfig } from '../../src/types/config';

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
    logLevel: 'error', // Use error level to suppress logs during tests
    githubToken: 'test-token',
    changelog: {
      enabled: true,
      maxLength: 5000,
      cacheTTL: 3600,
    },
    ...overrides,
  };
}

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

// Generate non-ArgoCD API versions
const arbNonArgoCDApiVersion = fc.constantFrom(
  'v1',
  'apps/v1',
  'batch/v1',
  'networking.k8s.io/v1'
);

// Generate ArgoCD Application manifest
const arbApplication = fc.record({
  apiVersion: arbArgoCDApiVersion,
  kind: fc.constant('Application'),
  metadata: fc.record({
    name: arbK8sName,
    namespace: fc.constant('argocd'),
  }),
  spec: fc.record({
    source: fc.record({
      repoURL: fc.webUrl(),
      chart: arbK8sName,
      targetRevision: fc.tuple(
        fc.nat({ max: 20 }),
        fc.nat({ max: 50 }),
        fc.nat({ max: 100 })
      ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`),
    }),
  }),
});

// Generate ArgoCD ApplicationSet manifest
const arbApplicationSet = fc.record({
  apiVersion: arbArgoCDApiVersion,
  kind: fc.constant('ApplicationSet'),
  metadata: fc.record({
    name: arbK8sName,
    namespace: fc.constant('argocd'),
  }),
  spec: fc.record({
    template: fc.record({
      spec: fc.record({
        source: fc.record({
          repoURL: fc.webUrl(),
          chart: arbK8sName,
          targetRevision: fc.tuple(
            fc.nat({ max: 20 }),
            fc.nat({ max: 50 }),
            fc.nat({ max: 100 })
          ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`),
        }),
      }),
    }),
  }),
});

// Generate non-ArgoCD Kubernetes resource
const arbNonArgoCDResource = fc.record({
  apiVersion: arbNonArgoCDApiVersion,
  kind: fc.constantFrom('ConfigMap', 'Secret', 'Service', 'Deployment'),
  metadata: fc.record({
    name: arbK8sName,
    namespace: fc.constant('default'),
  }),
});

// Generate YAML content from manifest object using js-yaml
function manifestToProperYAML(manifest: unknown): string {
  return yaml.dump(manifest, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
}

describe('Property: ArgoCD Resource Discovery', () => {
  let testDir: string;
  
  beforeEach(async () => {
    // Create unique test directory in OS temp directory to avoid glob conflicts
    const os = require('os');
    const tmpDir = os.tmpdir();
    testDir = path.join(tmpDir, 'argocd-test-' + Math.random().toString(36).substring(7));
    await fs.mkdir(testDir, { recursive: true });
  });
  
  afterEach(async () => {
    // Clean up test directory after each test
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  /**
   * Property 1.1: Discovery of ArgoCD Application resources
   * 
   * For any set of YAML files containing ArgoCD Application resources,
   * the scanner should discover all of them.
   */
  it('should discover all ArgoCD Application resources in YAML files', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbApplication, { minLength: 1, maxLength: 5 }),
        async (applications) => {
          // Create unique directory for this iteration
          const iterationDir = path.join(testDir, 'iter-' + Math.random().toString(36).substring(7));
          await fs.mkdir(iterationDir, { recursive: true });
          
          try {
            // Create YAML files with Application resources
            const filePromises = applications.map(async (app, index) => {
              const fileName = `app-${index}.yaml`;
              const filePath = path.join(iterationDir, fileName);
              const yamlContent = manifestToProperYAML(app);
              await fs.writeFile(filePath, yamlContent, 'utf-8');
              return fileName;
            });
            
            await Promise.all(filePromises);
            
            // Scan repository
            const config = createTestConfig({
              includePaths: [path.join(iterationDir, '**/*.yaml')],
              excludePaths: [],
            });
            const scanner = new ManifestScanner(config);
            const manifests = await scanner.scanRepository();
            
            // Verify all Application resources were discovered
            expect(manifests.length).toBe(applications.length);
            
            // Verify each manifest contains an Application
            manifests.forEach(manifest => {
              expect(manifest.documents.length).toBeGreaterThanOrEqual(1);
              expect(manifest.documents[0].kind).toBe('Application');
              expect(manifest.documents[0].apiVersion).toMatch(/^argoproj\.io\//);
            });
          } finally {
            // Clean up iteration directory
            await fs.rm(iterationDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 1.2: Discovery of ArgoCD ApplicationSet resources
   * 
   * For any set of YAML files containing ArgoCD ApplicationSet resources,
   * the scanner should discover all of them.
   */
  it('should discover all ArgoCD ApplicationSet resources in YAML files', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbApplicationSet, { minLength: 1, maxLength: 5 }),
        async (applicationSets) => {
          // Create unique directory for this iteration
          const iterationDir = path.join(testDir, 'iter-' + Math.random().toString(36).substring(7));
          await fs.mkdir(iterationDir, { recursive: true });
          
          try {
            // Create YAML files with ApplicationSet resources
            const filePromises = applicationSets.map(async (appSet, index) => {
              const fileName = `appset-${index}.yaml`;
              const filePath = path.join(iterationDir, fileName);
              const yamlContent = manifestToProperYAML(appSet);
              await fs.writeFile(filePath, yamlContent, 'utf-8');
              return fileName;
            });
            
            await Promise.all(filePromises);
            
            // Scan repository
            const config = createTestConfig({
              includePaths: [path.join(iterationDir, '**/*.yaml')],
              excludePaths: [],
            });
            const scanner = new ManifestScanner(config);
            const manifests = await scanner.scanRepository();
            
            // Verify all ApplicationSet resources were discovered
            expect(manifests.length).toBe(applicationSets.length);
            
            // Verify each manifest contains an ApplicationSet
            manifests.forEach(manifest => {
              expect(manifest.documents.length).toBeGreaterThanOrEqual(1);
              expect(manifest.documents[0].kind).toBe('ApplicationSet');
              expect(manifest.documents[0].apiVersion).toMatch(/^argoproj\.io\//);
            });
          } finally {
            // Clean up iteration directory
            await fs.rm(iterationDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 1.3: Filtering of non-ArgoCD resources
   * 
   * For any set of YAML files containing both ArgoCD and non-ArgoCD resources,
   * the scanner should only discover files with ArgoCD resources.
   */
  it('should filter out files containing only non-ArgoCD resources', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbApplication, { minLength: 1, maxLength: 3 }),
        fc.array(arbNonArgoCDResource, { minLength: 1, maxLength: 3 }),
        async (applications, nonArgoCDResources) => {
          // Create unique directory for this iteration
          const iterationDir = path.join(testDir, 'iter-' + Math.random().toString(36).substring(7));
          await fs.mkdir(iterationDir, { recursive: true });
          
          try {
            // Create YAML files with ArgoCD resources
            const argoCDFilePromises = applications.map(async (app, index) => {
              const fileName = `argocd-${index}.yaml`;
              const filePath = path.join(iterationDir, fileName);
              const yamlContent = manifestToProperYAML(app);
              await fs.writeFile(filePath, yamlContent, 'utf-8');
            });
            
            // Create YAML files with non-ArgoCD resources
            const nonArgoCDFilePromises = nonArgoCDResources.map(async (resource, index) => {
              const fileName = `non-argocd-${index}.yaml`;
              const filePath = path.join(iterationDir, fileName);
              const yamlContent = manifestToProperYAML(resource);
              await fs.writeFile(filePath, yamlContent, 'utf-8');
            });
            
            await Promise.all([...argoCDFilePromises, ...nonArgoCDFilePromises]);
            
            // Scan repository
            const config = createTestConfig({
              includePaths: [path.join(iterationDir, '**/*.yaml')],
              excludePaths: [],
            });
            const scanner = new ManifestScanner(config);
            const manifests = await scanner.scanRepository();
            
            // Verify only ArgoCD resources were discovered
            expect(manifests.length).toBe(applications.length);
            
            // Verify no non-ArgoCD resources in results
            manifests.forEach(manifest => {
              manifest.documents.forEach(doc => {
                expect(['Application', 'ApplicationSet']).toContain(doc.kind);
                expect(doc.apiVersion).toMatch(/^argoproj\.io\//);
              });
            });
          } finally {
            // Clean up iteration directory
            await fs.rm(iterationDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 1.4: Include pattern matching
   * 
   * For any set of YAML files, the scanner should only discover files
   * that match the configured include patterns.
   */
  it('should only discover files matching include patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbApplication, { minLength: 2, maxLength: 4 }),
        async (applications) => {
          // Create unique directory for this iteration
          const iterationDir = path.join(testDir, 'iter-' + Math.random().toString(36).substring(7));
          await fs.mkdir(iterationDir, { recursive: true });
          
          try {
            // Create YAML files in different subdirectories
            const subdir1 = path.join(iterationDir, 'apps');
            const subdir2 = path.join(iterationDir, 'other');
            await fs.mkdir(subdir1, { recursive: true });
            await fs.mkdir(subdir2, { recursive: true });
            
            // Put half in apps/, half in other/
            const midpoint = Math.ceil(applications.length / 2);
            const appsFiles = applications.slice(0, midpoint);
            const otherFiles = applications.slice(midpoint);
            
            await Promise.all([
              ...appsFiles.map(async (app, index) => {
                const filePath = path.join(subdir1, `app-${index}.yaml`);
                await fs.writeFile(filePath, manifestToProperYAML(app), 'utf-8');
              }),
              ...otherFiles.map(async (app, index) => {
                const filePath = path.join(subdir2, `app-${index}.yaml`);
                await fs.writeFile(filePath, manifestToProperYAML(app), 'utf-8');
              }),
            ]);
            
            // Scan with pattern that only matches apps/ directory
            const config = createTestConfig({
              includePaths: [path.join(iterationDir, 'apps', '**/*.yaml')],
              excludePaths: [],
            });
            const scanner = new ManifestScanner(config);
            const manifests = await scanner.scanRepository();
            
            // Verify only files from apps/ directory were discovered
            expect(manifests.length).toBe(appsFiles.length);
            
            // Verify all discovered files are from apps/ directory
            manifests.forEach(manifest => {
              expect(manifest.path).toContain('apps');
              expect(manifest.path).not.toContain('other');
            });
          } finally {
            // Clean up iteration directory
            await fs.rm(iterationDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 1.5: Exclude pattern matching
   * 
   * For any set of YAML files, the scanner should not discover files
   * that match the configured exclude patterns.
   */
  it('should exclude files matching exclude patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbApplication, { minLength: 2, maxLength: 4 }),
        async (applications) => {
          // Create unique directory for this iteration
          const iterationDir = path.join(testDir, 'iter-' + Math.random().toString(36).substring(7));
          await fs.mkdir(iterationDir, { recursive: true });
          
          try {
            // Create YAML files in different subdirectories
            const subdir1 = path.join(iterationDir, 'include');
            const subdir2 = path.join(iterationDir, 'exclude');
            await fs.mkdir(subdir1, { recursive: true });
            await fs.mkdir(subdir2, { recursive: true });
            
            // Put half in include/, half in exclude/
            const midpoint = Math.ceil(applications.length / 2);
            const includeFiles = applications.slice(0, midpoint);
            const excludeFiles = applications.slice(midpoint);
            
            await Promise.all([
              ...includeFiles.map(async (app, index) => {
                const filePath = path.join(subdir1, `app-${index}.yaml`);
                await fs.writeFile(filePath, manifestToProperYAML(app), 'utf-8');
              }),
              ...excludeFiles.map(async (app, index) => {
                const filePath = path.join(subdir2, `app-${index}.yaml`);
                await fs.writeFile(filePath, manifestToProperYAML(app), 'utf-8');
              }),
            ]);
            
            // Scan with exclude pattern for exclude/ directory
            const config = createTestConfig({
              includePaths: [path.join(iterationDir, '**/*.yaml')],
              excludePaths: [path.join(iterationDir, 'exclude', '**')],
            });
            const scanner = new ManifestScanner(config);
            const manifests = await scanner.scanRepository();
            
            // Verify only files from include/ directory were discovered
            expect(manifests.length).toBe(includeFiles.length);
            
            // Verify no files from exclude/ directory
            manifests.forEach(manifest => {
              expect(manifest.path).toContain('include');
              expect(manifest.path).not.toContain('exclude');
            });
          } finally {
            // Clean up iteration directory
            await fs.rm(iterationDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 1.6: Multi-document YAML file handling
   * 
   * For any YAML file containing multiple ArgoCD resources,
   * the scanner should discover the file and extract all ArgoCD resources.
   */
  it('should discover all ArgoCD resources in multi-document YAML files', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbApplication, { minLength: 2, maxLength: 5 }),
        async (applications) => {
          // Create a single multi-document YAML file
          const fileName = 'multi-doc.yaml';
          const filePath = path.join(testDir, fileName);
          const yamlContent = applications
            .map(app => manifestToProperYAML(app))
            .join('\n---\n');
          await fs.writeFile(filePath, yamlContent, 'utf-8');
          
          // Scan repository
          const config = createTestConfig({
            includePaths: [path.join(testDir, '**/*.yaml')],
            excludePaths: [],
          });
          const scanner = new ManifestScanner(config);
          const manifests = await scanner.scanRepository();
          
          // Verify the file was discovered
          expect(manifests.length).toBe(1);
          
          // Verify all Application resources were extracted
          expect(manifests[0].documents.length).toBe(applications.length);
          
          // Verify each document is an Application
          manifests[0].documents.forEach(doc => {
            expect(doc.kind).toBe('Application');
            expect(doc.apiVersion).toMatch(/^argoproj\.io\//);
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 1.7: Mixed ArgoCD resource types
   * 
   * For any YAML file containing both Application and ApplicationSet resources,
   * the scanner should discover and extract both types.
   */
  it('should discover both Application and ApplicationSet resources in the same file', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbApplication, { minLength: 1, maxLength: 3 }),
        fc.array(arbApplicationSet, { minLength: 1, maxLength: 3 }),
        async (applications, applicationSets) => {
          // Create a multi-document YAML file with both types
          const fileName = 'mixed.yaml';
          const filePath = path.join(testDir, fileName);
          const allResources = [...applications, ...applicationSets];
          const yamlContent = allResources
            .map(resource => manifestToProperYAML(resource))
            .join('\n---\n');
          await fs.writeFile(filePath, yamlContent, 'utf-8');
          
          // Scan repository
          const config = createTestConfig({
            includePaths: [path.join(testDir, '**/*.yaml')],
            excludePaths: [],
          });
          const scanner = new ManifestScanner(config);
          const manifests = await scanner.scanRepository();
          
          // Verify the file was discovered
          expect(manifests.length).toBe(1);
          
          // Verify all resources were extracted
          expect(manifests[0].documents.length).toBe(allResources.length);
          
          // Count Applications and ApplicationSets
          const appCount = manifests[0].documents.filter(d => d.kind === 'Application').length;
          const appSetCount = manifests[0].documents.filter(d => d.kind === 'ApplicationSet').length;
          
          expect(appCount).toBe(applications.length);
          expect(appSetCount).toBe(applicationSets.length);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 1.8: Empty directory handling
   * 
   * For any empty directory or directory with no matching files,
   * the scanner should return an empty array without errors.
   */
  it('should return empty array for directories with no matching files', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null), // No input needed
        async () => {
          // Create empty subdirectories
          const subdir = path.join(testDir, 'empty');
          await fs.mkdir(subdir, { recursive: true });
          
          // Scan repository
          const config = createTestConfig({
            includePaths: [path.join(testDir, '**/*.yaml')],
            excludePaths: [],
          });
          const scanner = new ManifestScanner(config);
          const manifests = await scanner.scanRepository();
          
          // Verify empty array is returned
          expect(manifests).toEqual([]);
        }
      ),
      { numRuns: 10 } // Fewer runs since this is a simple case
    );
  });
});
