/**
 * Property-based tests for Batch Update Support
 * 
 * **Property 18: Batch Update Support**
 * **Validates: Requirements 5.4, 5.5, 5.6**
 * 
 * For any set of chart dependencies across one or more manifest files,
 * all identified updates should be applied in a single action run.
 */

import * as fc from 'fast-check';
import * as yaml from 'js-yaml';
import { FileUpdater } from '../../src/updater/file-updater';
import { VersionUpdate } from '../../src/types/version';
import { HelmDependency } from '../../src/types/dependency';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Custom arbitraries for generating test data
 */

// Generate valid semantic versions
const arbSemVer = fc.tuple(
  fc.nat({ max: 10 }),
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// Generate a simple ArgoCD Application manifest as a string
const arbApplicationManifest = fc.record({
  name: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-z0-9-]+$/.test(s)),
  namespace: fc.constantFrom('default', 'argocd', 'production', 'staging'),
  chartName: fc.constantFrom('nginx', 'postgresql', 'redis', 'mongodb', 'mysql'),
  repoURL: fc.constantFrom(
    'https://charts.bitnami.com/bitnami',
    'https://charts.example.com',
    'oci://registry-1.docker.io/bitnamicharts'
  ),
  currentVersion: arbSemVer,
  server: fc.constantFrom('https://kubernetes.default.svc', 'https://prod-cluster'),
  destNamespace: fc.constantFrom('default', 'app', 'production')
}).map(({ name, namespace, chartName, repoURL, currentVersion, server, destNamespace }) => ({
  content: `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  project: default
  source:
    repoURL: ${repoURL}
    chart: ${chartName}
    targetRevision: ${currentVersion}
    helm:
      releaseName: ${name}
  destination:
    server: ${server}
    namespace: ${destNamespace}
`,
  chartName,
  repoURL,
  currentVersion
}));

describe('Property 18: Batch Update Support', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'argocd-updater-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  /**
   * Property 18.1: Multiple updates in single file
   * 
   * For any manifest file with multiple chart dependencies, when updates
   * are identified for multiple charts, all updates should be applied
   * in a single run.
   */
  it('should apply all updates to multiple charts in a single file', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(arbApplicationManifest, arbApplicationManifest),
        fc.tuple(arbSemVer, arbSemVer),
        async ([manifest1, manifest2], [newVersion1, newVersion2]) => {
          // Skip if new versions match current versions
          if (newVersion1 === manifest1.currentVersion && newVersion2 === manifest2.currentVersion) {
            return true;
          }

          // Create a multi-document YAML file
          const manifestContent = `${manifest1.content}---
${manifest2.content}`;

          const testFile = path.join(tempDir, 'multi-chart.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create version updates for both charts
          const updates: VersionUpdate[] = [];

          if (newVersion1 !== manifest1.currentVersion) {
            const dependency1: HelmDependency = {
              manifestPath: testFile,
              documentIndex: 0,
              chartName: manifest1.chartName,
              repoURL: manifest1.repoURL,
              repoType: manifest1.repoURL.startsWith('oci://') ? 'oci' : 'helm',
              currentVersion: manifest1.currentVersion,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            updates.push({
              dependency: dependency1,
              currentVersion: manifest1.currentVersion,
              newVersion: newVersion1
            });
          }

          if (newVersion2 !== manifest2.currentVersion) {
            const dependency2: HelmDependency = {
              manifestPath: testFile,
              documentIndex: 1,
              chartName: manifest2.chartName,
              repoURL: manifest2.repoURL,
              repoType: manifest2.repoURL.startsWith('oci://') ? 'oci' : 'helm',
              currentVersion: manifest2.currentVersion,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            updates.push({
              dependency: dependency2,
              currentVersion: manifest2.currentVersion,
              newVersion: newVersion2
            });
          }

          if (updates.length === 0) {
            return true; // Nothing to update
          }

          // Apply all updates in a single run
          const updater = new FileUpdater();
          const fileUpdates = await updater.updateManifests(updates);

          // Should have exactly one file update
          expect(fileUpdates.length).toBe(1);
          expect(fileUpdates[0].path).toBe(testFile);

          // Verify all updates were applied
          const updatedContent = fileUpdates[0].updatedContent;
          const updatedDocuments = yaml.loadAll(updatedContent) as any[];

          expect(updatedDocuments.length).toBe(2);

          // Check first document
          if (newVersion1 !== manifest1.currentVersion) {
            expect(updatedDocuments[0].spec.source.targetRevision).toBe(newVersion1);
          } else {
            expect(updatedDocuments[0].spec.source.targetRevision).toBe(manifest1.currentVersion);
          }

          // Check second document
          if (newVersion2 !== manifest2.currentVersion) {
            expect(updatedDocuments[1].spec.source.targetRevision).toBe(newVersion2);
          } else {
            expect(updatedDocuments[1].spec.source.targetRevision).toBe(manifest2.currentVersion);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.2: Multiple updates across multiple files
   * 
   * For any set of manifest files with chart dependencies, when updates
   * are identified across multiple files, all updates should be applied
   * in a single run.
   */
  it('should apply all updates across multiple files in a single run', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(arbApplicationManifest, arbApplicationManifest, arbApplicationManifest),
        fc.tuple(arbSemVer, arbSemVer, arbSemVer),
        async ([manifest1, manifest2, manifest3], [newVersion1, newVersion2, newVersion3]) => {
          // Skip if all new versions match current versions
          if (
            newVersion1 === manifest1.currentVersion &&
            newVersion2 === manifest2.currentVersion &&
            newVersion3 === manifest3.currentVersion
          ) {
            return true;
          }

          // Create three separate manifest files
          const testFile1 = path.join(tempDir, 'app1.yaml');
          const testFile2 = path.join(tempDir, 'app2.yaml');
          const testFile3 = path.join(tempDir, 'app3.yaml');

          await fs.writeFile(testFile1, manifest1.content, 'utf-8');
          await fs.writeFile(testFile2, manifest2.content, 'utf-8');
          await fs.writeFile(testFile3, manifest3.content, 'utf-8');

          // Create version updates for all three files
          const updates: VersionUpdate[] = [];

          if (newVersion1 !== manifest1.currentVersion) {
            const dependency1: HelmDependency = {
              manifestPath: testFile1,
              documentIndex: 0,
              chartName: manifest1.chartName,
              repoURL: manifest1.repoURL,
              repoType: manifest1.repoURL.startsWith('oci://') ? 'oci' : 'helm',
              currentVersion: manifest1.currentVersion,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            updates.push({
              dependency: dependency1,
              currentVersion: manifest1.currentVersion,
              newVersion: newVersion1
            });
          }

          if (newVersion2 !== manifest2.currentVersion) {
            const dependency2: HelmDependency = {
              manifestPath: testFile2,
              documentIndex: 0,
              chartName: manifest2.chartName,
              repoURL: manifest2.repoURL,
              repoType: manifest2.repoURL.startsWith('oci://') ? 'oci' : 'helm',
              currentVersion: manifest2.currentVersion,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            updates.push({
              dependency: dependency2,
              currentVersion: manifest2.currentVersion,
              newVersion: newVersion2
            });
          }

          if (newVersion3 !== manifest3.currentVersion) {
            const dependency3: HelmDependency = {
              manifestPath: testFile3,
              documentIndex: 0,
              chartName: manifest3.chartName,
              repoURL: manifest3.repoURL,
              repoType: manifest3.repoURL.startsWith('oci://') ? 'oci' : 'helm',
              currentVersion: manifest3.currentVersion,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            updates.push({
              dependency: dependency3,
              currentVersion: manifest3.currentVersion,
              newVersion: newVersion3
            });
          }

          if (updates.length === 0) {
            return true; // Nothing to update
          }

          // Apply all updates in a single run
          const updater = new FileUpdater();
          const fileUpdates = await updater.updateManifests(updates);

          // Should have one file update per file that had changes
          expect(fileUpdates.length).toBe(updates.length);
          expect(fileUpdates.length).toBeGreaterThan(0);
          expect(fileUpdates.length).toBeLessThanOrEqual(3);

          // Verify all files were updated correctly
          for (const fileUpdate of fileUpdates) {
            const updatedContent = fileUpdate.updatedContent;
            const updatedParsed = yaml.load(updatedContent) as any;

            // Find which manifest this corresponds to
            if (fileUpdate.path === testFile1 && newVersion1 !== manifest1.currentVersion) {
              expect(updatedParsed.spec.source.targetRevision).toBe(newVersion1);
            } else if (fileUpdate.path === testFile2 && newVersion2 !== manifest2.currentVersion) {
              expect(updatedParsed.spec.source.targetRevision).toBe(newVersion2);
            } else if (fileUpdate.path === testFile3 && newVersion3 !== manifest3.currentVersion) {
              expect(updatedParsed.spec.source.targetRevision).toBe(newVersion3);
            }
          }

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 18.3: Batch update completeness
   * 
   * For any set of updates, the number of file updates returned should
   * match the number of unique files that had changes.
   */
  it('should return file updates for all files with changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbApplicationManifest, { minLength: 1, maxLength: 5 }),
        fc.array(arbSemVer, { minLength: 1, maxLength: 5 }),
        async (manifests, newVersions) => {
          // Ensure we have matching arrays
          const count = Math.min(manifests.length, newVersions.length);
          const manifestsToUse = manifests.slice(0, count);
          const versionsToUse = newVersions.slice(0, count);

          // Create separate files for each manifest
          const testFiles: string[] = [];
          const updates: VersionUpdate[] = [];

          for (let i = 0; i < count; i++) {
            const manifest = manifestsToUse[i];
            const newVersion = versionsToUse[i];

            // Skip if version hasn't changed
            if (newVersion === manifest.currentVersion) {
              continue;
            }

            const testFile = path.join(tempDir, `app-${i}.yaml`);
            testFiles.push(testFile);

            await fs.writeFile(testFile, manifest.content, 'utf-8');

            const dependency: HelmDependency = {
              manifestPath: testFile,
              documentIndex: 0,
              chartName: manifest.chartName,
              repoURL: manifest.repoURL,
              repoType: manifest.repoURL.startsWith('oci://') ? 'oci' : 'helm',
              currentVersion: manifest.currentVersion,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            updates.push({
              dependency,
              currentVersion: manifest.currentVersion,
              newVersion
            });
          }

          if (updates.length === 0) {
            return true; // Nothing to update
          }

          // Apply all updates in a single run
          const updater = new FileUpdater();
          const fileUpdates = await updater.updateManifests(updates);

          // Should have one file update per unique file
          const uniqueFiles = new Set(updates.map(u => u.dependency.manifestPath));
          expect(fileUpdates.length).toBe(uniqueFiles.size);

          // All file paths in updates should be present in fileUpdates
          const updatedFilePaths = new Set(fileUpdates.map(fu => fu.path));
          for (const filePath of uniqueFiles) {
            expect(updatedFilePaths.has(filePath)).toBe(true);
          }

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 18.4: Batch update atomicity
   * 
   * For any set of updates, all updates should be processed together,
   * and the FileUpdate objects should contain all updates for each file.
   */
  it('should group all updates for the same file together', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(arbApplicationManifest, arbApplicationManifest),
        fc.tuple(arbSemVer, arbSemVer),
        async ([manifest1, manifest2], [newVersion1, newVersion2]) => {
          // Skip if both versions match current
          if (newVersion1 === manifest1.currentVersion && newVersion2 === manifest2.currentVersion) {
            return true;
          }

          // Create a multi-document file with both manifests
          const manifestContent = `${manifest1.content}---
${manifest2.content}`;

          const testFile = path.join(tempDir, 'multi-app.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create updates for both documents in the same file
          const updates: VersionUpdate[] = [];

          if (newVersion1 !== manifest1.currentVersion) {
            const dependency1: HelmDependency = {
              manifestPath: testFile,
              documentIndex: 0,
              chartName: manifest1.chartName,
              repoURL: manifest1.repoURL,
              repoType: manifest1.repoURL.startsWith('oci://') ? 'oci' : 'helm',
              currentVersion: manifest1.currentVersion,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            updates.push({
              dependency: dependency1,
              currentVersion: manifest1.currentVersion,
              newVersion: newVersion1
            });
          }

          if (newVersion2 !== manifest2.currentVersion) {
            const dependency2: HelmDependency = {
              manifestPath: testFile,
              documentIndex: 1,
              chartName: manifest2.chartName,
              repoURL: manifest2.repoURL,
              repoType: manifest2.repoURL.startsWith('oci://') ? 'oci' : 'helm',
              currentVersion: manifest2.currentVersion,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            updates.push({
              dependency: dependency2,
              currentVersion: manifest2.currentVersion,
              newVersion: newVersion2
            });
          }

          if (updates.length === 0) {
            return true; // Nothing to update
          }

          // Apply all updates
          const updater = new FileUpdater();
          const fileUpdates = await updater.updateManifests(updates);

          // Should have exactly one FileUpdate for the file
          expect(fileUpdates.length).toBe(1);
          expect(fileUpdates[0].path).toBe(testFile);

          // The FileUpdate should contain all the updates for this file
          expect(fileUpdates[0].updates.length).toBe(updates.length);

          // Verify the updates array matches what we passed in
          for (const update of updates) {
            const found = fileUpdates[0].updates.find(
              u => u.dependency.documentIndex === update.dependency.documentIndex
            );
            expect(found).toBeDefined();
            expect(found?.newVersion).toBe(update.newVersion);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18.5: Batch update consistency
   * 
   * For any set of updates, applying them in a single batch should produce
   * the same result as applying them individually (when order doesn't matter).
   */
  it('should produce consistent results whether updates are batched or individual', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(arbApplicationManifest, arbApplicationManifest),
        fc.tuple(arbSemVer, arbSemVer),
        async ([manifest1, manifest2], [newVersion1, newVersion2]) => {
          // Skip if versions match current
          if (newVersion1 === manifest1.currentVersion || newVersion2 === manifest2.currentVersion) {
            return true;
          }

          // Create two separate files
          const testFile1 = path.join(tempDir, 'app1.yaml');
          const testFile2 = path.join(tempDir, 'app2.yaml');

          await fs.writeFile(testFile1, manifest1.content, 'utf-8');
          await fs.writeFile(testFile2, manifest2.content, 'utf-8');

          // Create updates
          const dependency1: HelmDependency = {
            manifestPath: testFile1,
            documentIndex: 0,
            chartName: manifest1.chartName,
            repoURL: manifest1.repoURL,
            repoType: manifest1.repoURL.startsWith('oci://') ? 'oci' : 'helm',
            currentVersion: manifest1.currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };

          const dependency2: HelmDependency = {
            manifestPath: testFile2,
            documentIndex: 0,
            chartName: manifest2.chartName,
            repoURL: manifest2.repoURL,
            repoType: manifest2.repoURL.startsWith('oci://') ? 'oci' : 'helm',
            currentVersion: manifest2.currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };

          const update1: VersionUpdate = {
            dependency: dependency1,
            currentVersion: manifest1.currentVersion,
            newVersion: newVersion1
          };

          const update2: VersionUpdate = {
            dependency: dependency2,
            currentVersion: manifest2.currentVersion,
            newVersion: newVersion2
          };

          // Apply updates in batch
          const updater = new FileUpdater();
          const batchUpdates = await updater.updateManifests([update1, update2]);

          // Apply updates individually
          const individual1 = await updater.updateManifests([update1]);
          const individual2 = await updater.updateManifests([update2]);

          // Results should be consistent
          expect(batchUpdates.length).toBe(2);
          expect(individual1.length).toBe(1);
          expect(individual2.length).toBe(1);

          // Find corresponding updates
          const batchUpdate1 = batchUpdates.find(u => u.path === testFile1);
          const batchUpdate2 = batchUpdates.find(u => u.path === testFile2);

          expect(batchUpdate1).toBeDefined();
          expect(batchUpdate2).toBeDefined();

          // Content should match
          expect(batchUpdate1?.updatedContent).toBe(individual1[0].updatedContent);
          expect(batchUpdate2?.updatedContent).toBe(individual2[0].updatedContent);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 18.6: Empty batch handling
   * 
   * For any empty set of updates, the updater should return an empty
   * array of file updates.
   */
  it('should handle empty update arrays gracefully', async () => {
    const updater = new FileUpdater();
    const fileUpdates = await updater.updateManifests([]);

    expect(fileUpdates).toEqual([]);
  });

  /**
   * Property 18.7: Large batch handling
   * 
   * For any large set of updates (10+ files), all updates should be
   * processed correctly in a single run.
   */
  it('should handle large batches of updates efficiently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbApplicationManifest, { minLength: 10, maxLength: 20 }),
        fc.array(arbSemVer, { minLength: 10, maxLength: 20 }),
        async (manifests, newVersions) => {
          const count = Math.min(manifests.length, newVersions.length);
          const updates: VersionUpdate[] = [];

          // Create files and updates
          for (let i = 0; i < count; i++) {
            const manifest = manifests[i];
            const newVersion = newVersions[i];

            // Skip if version matches
            if (newVersion === manifest.currentVersion) {
              continue;
            }

            const testFile = path.join(tempDir, `large-batch-${i}.yaml`);
            await fs.writeFile(testFile, manifest.content, 'utf-8');

            const dependency: HelmDependency = {
              manifestPath: testFile,
              documentIndex: 0,
              chartName: manifest.chartName,
              repoURL: manifest.repoURL,
              repoType: manifest.repoURL.startsWith('oci://') ? 'oci' : 'helm',
              currentVersion: manifest.currentVersion,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            updates.push({
              dependency,
              currentVersion: manifest.currentVersion,
              newVersion
            });
          }

          if (updates.length === 0) {
            return true; // Nothing to update
          }

          // Apply all updates in a single batch
          const updater = new FileUpdater();
          const fileUpdates = await updater.updateManifests(updates);

          // Should have one file update per file
          expect(fileUpdates.length).toBe(updates.length);

          // Verify all updates were applied
          for (let i = 0; i < fileUpdates.length; i++) {
            const fileUpdate = fileUpdates[i];
            const updatedParsed = yaml.load(fileUpdate.updatedContent) as any;
            
            // Find the corresponding update
            const correspondingUpdate = updates.find(u => u.dependency.manifestPath === fileUpdate.path);
            expect(correspondingUpdate).toBeDefined();
            expect(updatedParsed.spec.source.targetRevision).toBe(correspondingUpdate?.newVersion);
          }

          return true;
        }
      ),
      { numRuns: 10 } // Fewer runs for large batches
    );
  });
});
