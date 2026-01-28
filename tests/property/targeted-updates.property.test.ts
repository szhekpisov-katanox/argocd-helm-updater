/**
 * Property-based tests for Targeted Field Updates
 * 
 * **Property 16: Targeted Field Updates**
 * **Validates: Requirements 5.1**
 * 
 * For any manifest file with identified updates, only the targetRevision fields
 * for updated charts should be modified.
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
}).map(({ name, namespace, chartName, repoURL, currentVersion, server, destNamespace }) => `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app: ${name}
    environment: production
  annotations:
    argocd.argoproj.io/sync-wave: "1"
spec:
  project: default
  source:
    repoURL: ${repoURL}
    chart: ${chartName}
    targetRevision: ${currentVersion}
    helm:
      releaseName: ${name}
      parameters:
        - name: replicas
          value: "3"
        - name: image.tag
          value: "latest"
  destination:
    server: ${server}
    namespace: ${destNamespace}
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
`);

// Generate a multi-document YAML manifest
const arbMultiDocumentManifest = fc.tuple(
  arbApplicationManifest,
  arbApplicationManifest
).map(([doc1, doc2]) => `${doc1}---
${doc2}`);

// Note: arbVersionUpdate generator is available but not used in current tests
// It can be used for future test cases that need to generate VersionUpdate objects

describe('Property 16: Targeted Field Updates', () => {
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
   * Property 16.1: Only targetRevision fields are modified
   * 
   * For any manifest with an update, only the targetRevision field should change.
   * All other fields, structure, and content should remain identical.
   */
  it('should only modify targetRevision fields when applying updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbApplicationManifest,
        arbSemVer,
        async (manifestContent, newVersion) => {
          // Parse the manifest to extract the current version
          const parsed = yaml.load(manifestContent) as any;
          const currentVersion = parsed.spec.source.targetRevision;
          const chartName = parsed.spec.source.chart;
          const repoURL = parsed.spec.source.repoURL;

          // Skip if new version is the same as current
          if (newVersion === currentVersion) {
            return true;
          }

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-app.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create a version update
          const dependency: HelmDependency = {
            manifestPath: testFile,
            documentIndex: 0,
            chartName,
            repoURL,
            repoType: repoURL.startsWith('oci://') ? 'oci' : 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };

          const update: VersionUpdate = {
            dependency,
            currentVersion,
            newVersion
          };

          // Apply the update
          const updater = new FileUpdater();
          const fileUpdates = await updater.updateManifests([update]);

          // Should have exactly one file update
          expect(fileUpdates.length).toBe(1);
          expect(fileUpdates[0].path).toBe(testFile);

          const originalContent = fileUpdates[0].originalContent;
          const updatedContent = fileUpdates[0].updatedContent;

          // Parse both versions
          const originalParsed = yaml.load(originalContent) as any;
          const updatedParsed = yaml.load(updatedContent) as any;

          // The targetRevision should be updated
          expect(updatedParsed.spec.source.targetRevision).toBe(newVersion);
          expect(originalParsed.spec.source.targetRevision).toBe(currentVersion);

          // Everything else should be identical
          // Check metadata
          expect(updatedParsed.apiVersion).toBe(originalParsed.apiVersion);
          expect(updatedParsed.kind).toBe(originalParsed.kind);
          expect(updatedParsed.metadata).toEqual(originalParsed.metadata);

          // Check spec fields except targetRevision
          expect(updatedParsed.spec.project).toBe(originalParsed.spec.project);
          expect(updatedParsed.spec.source.repoURL).toBe(originalParsed.spec.source.repoURL);
          expect(updatedParsed.spec.source.chart).toBe(originalParsed.spec.source.chart);
          expect(updatedParsed.spec.source.helm).toEqual(originalParsed.spec.source.helm);
          expect(updatedParsed.spec.destination).toEqual(originalParsed.spec.destination);
          expect(updatedParsed.spec.syncPolicy).toEqual(originalParsed.spec.syncPolicy);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 16.2: Multiple updates in same file
   * 
   * For any manifest with multiple chart dependencies, when multiple updates
   * are applied, only the targetRevision fields for those specific charts
   * should be modified.
   */
  it('should only modify targetRevision fields for updated charts in multi-document files', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbMultiDocumentManifest,
        arbSemVer,
        arbSemVer,
        async (manifestContent, newVersion1, newVersion2) => {
          // Parse the multi-document manifest
          const documents = yaml.loadAll(manifestContent) as any[];
          
          if (documents.length < 2) {
            return true; // Skip if not enough documents
          }

          const doc1 = documents[0];
          const doc2 = documents[1];

          const currentVersion1 = doc1.spec.source.targetRevision;
          const currentVersion2 = doc2.spec.source.targetRevision;

          // Skip if new versions are the same as current
          if (newVersion1 === currentVersion1 && newVersion2 === currentVersion2) {
            return true;
          }

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-multi.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create version updates for both documents
          const updates: VersionUpdate[] = [];

          if (newVersion1 !== currentVersion1) {
            const dependency1: HelmDependency = {
              manifestPath: testFile,
              documentIndex: 0,
              chartName: doc1.spec.source.chart,
              repoURL: doc1.spec.source.repoURL,
              repoType: doc1.spec.source.repoURL.startsWith('oci://') ? 'oci' : 'helm',
              currentVersion: currentVersion1,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            updates.push({
              dependency: dependency1,
              currentVersion: currentVersion1,
              newVersion: newVersion1
            });
          }

          if (newVersion2 !== currentVersion2) {
            const dependency2: HelmDependency = {
              manifestPath: testFile,
              documentIndex: 1,
              chartName: doc2.spec.source.chart,
              repoURL: doc2.spec.source.repoURL,
              repoType: doc2.spec.source.repoURL.startsWith('oci://') ? 'oci' : 'helm',
              currentVersion: currentVersion2,
              versionPath: ['spec', 'source', 'targetRevision']
            };

            updates.push({
              dependency: dependency2,
              currentVersion: currentVersion2,
              newVersion: newVersion2
            });
          }

          if (updates.length === 0) {
            return true; // Nothing to update
          }

          // Apply the updates
          const updater = new FileUpdater();
          const fileUpdates = await updater.updateManifests(updates);

          // Should have exactly one file update
          expect(fileUpdates.length).toBe(1);

          const updatedContent = fileUpdates[0].updatedContent;
          const updatedDocuments = yaml.loadAll(updatedContent) as any[];

          // Verify the correct targetRevision fields were updated
          if (newVersion1 !== currentVersion1) {
            expect(updatedDocuments[0].spec.source.targetRevision).toBe(newVersion1);
          } else {
            expect(updatedDocuments[0].spec.source.targetRevision).toBe(currentVersion1);
          }

          if (newVersion2 !== currentVersion2) {
            expect(updatedDocuments[1].spec.source.targetRevision).toBe(newVersion2);
          } else {
            expect(updatedDocuments[1].spec.source.targetRevision).toBe(currentVersion2);
          }

          // Verify all other fields remain unchanged
          expect(updatedDocuments[0].metadata).toEqual(doc1.metadata);
          expect(updatedDocuments[0].spec.source.chart).toBe(doc1.spec.source.chart);
          expect(updatedDocuments[0].spec.source.repoURL).toBe(doc1.spec.source.repoURL);

          expect(updatedDocuments[1].metadata).toEqual(doc2.metadata);
          expect(updatedDocuments[1].spec.source.chart).toBe(doc2.spec.source.chart);
          expect(updatedDocuments[1].spec.source.repoURL).toBe(doc2.spec.source.repoURL);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 16.3: Non-updated charts remain unchanged
   * 
   * For any manifest with multiple charts, when only some charts are updated,
   * the non-updated charts should remain completely unchanged.
   */
  it('should not modify charts that are not being updated', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbMultiDocumentManifest,
        arbSemVer,
        async (manifestContent, newVersion) => {
          // Parse the multi-document manifest
          const documents = yaml.loadAll(manifestContent) as any[];
          
          if (documents.length < 2) {
            return true; // Skip if not enough documents
          }

          const doc1 = documents[0];
          const doc2 = documents[1];

          const currentVersion1 = doc1.spec.source.targetRevision;

          // Skip if new version is the same as current
          if (newVersion === currentVersion1) {
            return true;
          }

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-partial.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create version update for ONLY the first document
          const dependency1: HelmDependency = {
            manifestPath: testFile,
            documentIndex: 0,
            chartName: doc1.spec.source.chart,
            repoURL: doc1.spec.source.repoURL,
            repoType: doc1.spec.source.repoURL.startsWith('oci://') ? 'oci' : 'helm',
            currentVersion: currentVersion1,
            versionPath: ['spec', 'source', 'targetRevision']
          };

          const update: VersionUpdate = {
            dependency: dependency1,
            currentVersion: currentVersion1,
            newVersion
          };

          // Apply the update
          const updater = new FileUpdater();
          const fileUpdates = await updater.updateManifests([update]);

          // Should have exactly one file update
          expect(fileUpdates.length).toBe(1);

          const updatedContent = fileUpdates[0].updatedContent;
          const updatedDocuments = yaml.loadAll(updatedContent) as any[];

          // First document should be updated
          expect(updatedDocuments[0].spec.source.targetRevision).toBe(newVersion);

          // Second document should be COMPLETELY unchanged
          expect(updatedDocuments[1]).toEqual(doc2);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 16.4: Field path precision
   * 
   * For any manifest, the update should target the exact field path
   * (spec.source.targetRevision) and not affect any other fields with
   * similar names or values.
   */
  it('should target the exact field path without affecting similar fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        arbSemVer,
        async (currentVersion, newVersion) => {
          // Skip if versions are the same
          if (currentVersion === newVersion) {
            return true;
          }

          // Create a manifest with multiple fields that might contain version-like values
          const manifestContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: test-app
  namespace: argocd
  annotations:
    version: ${currentVersion}
    app.version: ${currentVersion}
spec:
  project: default
  source:
    repoURL: https://charts.example.com
    chart: nginx
    targetRevision: ${currentVersion}
    helm:
      releaseName: nginx
      parameters:
        - name: image.tag
          value: ${currentVersion}
        - name: version
          value: ${currentVersion}
  destination:
    server: https://kubernetes.default.svc
    namespace: default
`;

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-precision.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create version update
          const dependency: HelmDependency = {
            manifestPath: testFile,
            documentIndex: 0,
            chartName: 'nginx',
            repoURL: 'https://charts.example.com',
            repoType: 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };

          const update: VersionUpdate = {
            dependency,
            currentVersion,
            newVersion
          };

          // Apply the update
          const updater = new FileUpdater();
          const fileUpdates = await updater.updateManifests([update]);

          expect(fileUpdates.length).toBe(1);

          const updatedContent = fileUpdates[0].updatedContent;
          const updatedParsed = yaml.load(updatedContent) as any;

          // Only spec.source.targetRevision should be updated
          expect(updatedParsed.spec.source.targetRevision).toBe(newVersion);

          // All other fields with the same value should remain unchanged
          expect(updatedParsed.metadata.annotations.version).toBe(currentVersion);
          expect(updatedParsed.metadata.annotations['app.version']).toBe(currentVersion);
          expect(updatedParsed.spec.source.helm.parameters[0].value).toBe(currentVersion);
          expect(updatedParsed.spec.source.helm.parameters[1].value).toBe(currentVersion);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 16.5: Update idempotency
   * 
   * For any manifest and update, applying the same update multiple times
   * should produce the same result (only targetRevision changes).
   */
  it('should produce identical results when applying the same update multiple times', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbApplicationManifest,
        arbSemVer,
        async (manifestContent, newVersion) => {
          // Parse the manifest to extract the current version
          const parsed = yaml.load(manifestContent) as any;
          const currentVersion = parsed.spec.source.targetRevision;
          const chartName = parsed.spec.source.chart;
          const repoURL = parsed.spec.source.repoURL;

          // Skip if new version is the same as current
          if (newVersion === currentVersion) {
            return true;
          }

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-idempotent.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create a version update
          const dependency: HelmDependency = {
            manifestPath: testFile,
            documentIndex: 0,
            chartName,
            repoURL,
            repoType: repoURL.startsWith('oci://') ? 'oci' : 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };

          const update: VersionUpdate = {
            dependency,
            currentVersion,
            newVersion
          };

          // Apply the update three times
          const updater = new FileUpdater();
          const fileUpdates1 = await updater.updateManifests([update]);
          
          // Write the updated content back for the second run
          await fs.writeFile(testFile, fileUpdates1[0].updatedContent, 'utf-8');
          
          // Update the dependency to reflect the new current version
          const dependency2 = { ...dependency, currentVersion: newVersion };
          const update2 = { ...update, dependency: dependency2, currentVersion: newVersion };
          
          const fileUpdates2 = await updater.updateManifests([update2]);
          
          // The second update should produce no changes (already at target version)
          expect(fileUpdates2.length).toBe(0);

          // Parse the final result
          const finalContent = fileUpdates1[0].updatedContent;
          const finalParsed = yaml.load(finalContent) as any;

          // Only targetRevision should have changed from original
          expect(finalParsed.spec.source.targetRevision).toBe(newVersion);
          expect(finalParsed.metadata).toEqual(parsed.metadata);
          expect(finalParsed.spec.source.chart).toBe(parsed.spec.source.chart);
          expect(finalParsed.spec.source.repoURL).toBe(parsed.spec.source.repoURL);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 16.6: No spurious modifications
   * 
   * For any manifest where no updates are needed (current version matches target),
   * no modifications should be made to the file.
   */
  it('should not modify files when no updates are needed', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbApplicationManifest,
        async (manifestContent) => {
          // Parse the manifest to extract the current version
          const parsed = yaml.load(manifestContent) as any;
          const currentVersion = parsed.spec.source.targetRevision;
          const chartName = parsed.spec.source.chart;
          const repoURL = parsed.spec.source.repoURL;

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-no-update.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create a version update with the same version (no actual update)
          const dependency: HelmDependency = {
            manifestPath: testFile,
            documentIndex: 0,
            chartName,
            repoURL,
            repoType: repoURL.startsWith('oci://') ? 'oci' : 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };

          const update: VersionUpdate = {
            dependency,
            currentVersion,
            newVersion: currentVersion // Same as current
          };

          // Apply the "update"
          const updater = new FileUpdater();
          const fileUpdates = await updater.updateManifests([update]);

          // Should produce no file updates since nothing changed
          expect(fileUpdates.length).toBe(0);

          // Verify file content is unchanged
          const fileContent = await fs.readFile(testFile, 'utf-8');
          expect(fileContent).toBe(manifestContent);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 16.7: Structural integrity
   * 
   * For any manifest update, the YAML structure should remain valid and
   * parseable after the update.
   */
  it('should maintain valid YAML structure after updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbApplicationManifest,
        arbSemVer,
        async (manifestContent, newVersion) => {
          // Parse the manifest to extract the current version
          const parsed = yaml.load(manifestContent) as any;
          const currentVersion = parsed.spec.source.targetRevision;
          const chartName = parsed.spec.source.chart;
          const repoURL = parsed.spec.source.repoURL;

          // Skip if new version is the same as current
          if (newVersion === currentVersion) {
            return true;
          }

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-structure.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create a version update
          const dependency: HelmDependency = {
            manifestPath: testFile,
            documentIndex: 0,
            chartName,
            repoURL,
            repoType: repoURL.startsWith('oci://') ? 'oci' : 'helm',
            currentVersion,
            versionPath: ['spec', 'source', 'targetRevision']
          };

          const update: VersionUpdate = {
            dependency,
            currentVersion,
            newVersion
          };

          // Apply the update
          const updater = new FileUpdater();
          const fileUpdates = await updater.updateManifests([update]);

          expect(fileUpdates.length).toBe(1);

          const updatedContent = fileUpdates[0].updatedContent;

          // Should be parseable as valid YAML
          expect(() => yaml.load(updatedContent)).not.toThrow();

          // Should have the same structure
          const updatedParsed = yaml.load(updatedContent) as any;
          expect(updatedParsed.apiVersion).toBeDefined();
          expect(updatedParsed.kind).toBeDefined();
          expect(updatedParsed.metadata).toBeDefined();
          expect(updatedParsed.spec).toBeDefined();
          expect(updatedParsed.spec.source).toBeDefined();
          expect(updatedParsed.spec.source.targetRevision).toBeDefined();

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });
});
