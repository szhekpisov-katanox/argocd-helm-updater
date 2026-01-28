/**
 * Property-based tests for YAML Content Preservation
 * 
 * **Property 17: YAML Content Preservation (Round-Trip)**
 * **Validates: Requirements 5.2, 5.3**
 * 
 * For any manifest file, after updating chart versions, all non-updated YAML content
 * (structure, other fields, formatting, comments) should remain unchanged.
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

// Generate YAML comments
const arbComment = fc.constantFrom(
  '# This is a comment',
  '# TODO: Update this',
  '# Production configuration',
  '# DO NOT MODIFY',
  '# Managed by GitOps'
);

// Generate a manifest with comments and specific formatting
const arbManifestWithComments = fc.record({
  name: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-z0-9-]+$/.test(s)),
  namespace: fc.constantFrom('default', 'argocd', 'production'),
  chartName: fc.constantFrom('nginx', 'postgresql', 'redis'),
  repoURL: fc.constantFrom(
    'https://charts.bitnami.com/bitnami',
    'https://charts.example.com'
  ),
  currentVersion: arbSemVer,
  comment1: arbComment,
  comment2: arbComment,
  comment3: arbComment
}).map(({ name, namespace, chartName, repoURL, currentVersion, comment1, comment2, comment3 }) => `${comment1}
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ${name}
  namespace: ${namespace}
  ${comment2}
  labels:
    app: ${name}
    environment: production
spec:
  project: default
  source:
    repoURL: ${repoURL}
    chart: ${chartName}
    ${comment3}
    targetRevision: ${currentVersion}
    helm:
      releaseName: ${name}
  destination:
    server: https://kubernetes.default.svc
    namespace: default
`);

// Generate a manifest with specific indentation and formatting
const arbManifestWithFormatting = fc.record({
  name: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-z0-9-]+$/.test(s)),
  chartName: fc.constantFrom('nginx', 'postgresql'),
  repoURL: fc.constantFrom('https://charts.bitnami.com/bitnami'),
  currentVersion: arbSemVer,
  spaces: fc.constantFrom(2, 4) // Different indentation levels
}).map(({ name, chartName, repoURL, currentVersion, spaces }) => {
  const indent1 = ' '.repeat(spaces);
  const indent2 = ' '.repeat(spaces * 2);
  const indent3 = ' '.repeat(spaces * 3);
  const indent4 = ' '.repeat(spaces * 4);
  
  return `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
${indent1}name: ${name}
${indent1}namespace: argocd
spec:
${indent1}project: default
${indent1}source:
${indent2}repoURL: ${repoURL}
${indent2}chart: ${chartName}
${indent2}targetRevision: ${currentVersion}
${indent2}helm:
${indent3}releaseName: ${name}
${indent3}parameters:
${indent4}- name: replicas
${indent4}  value: "3"
${indent1}destination:
${indent2}server: https://kubernetes.default.svc
${indent2}namespace: default
`;
});

describe('Property 17: YAML Content Preservation (Round-Trip)', () => {
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
   * Property 17.1: Comment preservation
   * 
   * For any manifest with comments, after updating the targetRevision,
   * all comments should be preserved in their original positions.
   */
  it('should preserve all comments when updating targetRevision', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbManifestWithComments,
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

          // Extract all comments from the original
          const originalComments = manifestContent
            .split('\n')
            .filter(line => line.trim().startsWith('#'));

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-comments.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create a version update
          const dependency: HelmDependency = {
            manifestPath: testFile,
            documentIndex: 0,
            chartName,
            repoURL,
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

          // Extract all comments from the updated content
          const updatedComments = updatedContent
            .split('\n')
            .filter(line => line.trim().startsWith('#'));

          // All comments should be preserved
          expect(updatedComments.length).toBe(originalComments.length);
          expect(updatedComments).toEqual(originalComments);

          // Verify the version was actually updated
          const updatedParsed = yaml.load(updatedContent) as any;
          expect(updatedParsed.spec.source.targetRevision).toBe(newVersion);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 17.2: Indentation preservation
   * 
   * For any manifest with specific indentation, after updating the targetRevision,
   * the indentation style should be preserved throughout the file.
   */
  it('should preserve indentation style when updating targetRevision', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbManifestWithFormatting,
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

          // Analyze indentation in original
          const originalLines = manifestContent.split('\n');
          const originalIndents = originalLines
            .filter(line => line.trim().length > 0 && !line.trim().startsWith('#'))
            .map(line => line.match(/^(\s*)/)?.[1].length || 0);

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-indent.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create a version update
          const dependency: HelmDependency = {
            manifestPath: testFile,
            documentIndex: 0,
            chartName,
            repoURL,
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

          // Analyze indentation in updated content
          const updatedLines = updatedContent.split('\n');
          const updatedIndents = updatedLines
            .filter(line => line.trim().length > 0 && !line.trim().startsWith('#'))
            .map(line => line.match(/^(\s*)/)?.[1].length || 0);

          // Indentation pattern should be preserved (same number of lines with same indents)
          expect(updatedIndents.length).toBe(originalIndents.length);
          
          // Check that indentation levels are preserved for all lines except the updated one
          for (let i = 0; i < originalLines.length; i++) {
            const originalLine = originalLines[i];
            const updatedLine = updatedLines[i];
            
            // Skip empty lines and the line that was updated
            if (originalLine.trim().length === 0 || updatedLine.trim().length === 0) {
              continue;
            }
            
            // If this line contains targetRevision, it might have changed
            if (originalLine.includes('targetRevision')) {
              // But indentation should still match
              const originalIndent = originalLine.match(/^(\s*)/)?.[1].length || 0;
              const updatedIndent = updatedLine.match(/^(\s*)/)?.[1].length || 0;
              expect(updatedIndent).toBe(originalIndent);
            } else {
              // For all other lines, indentation should be identical
              const originalIndent = originalLine.match(/^(\s*)/)?.[1].length || 0;
              const updatedIndent = updatedLine.match(/^(\s*)/)?.[1].length || 0;
              expect(updatedIndent).toBe(originalIndent);
            }
          }

          // Verify the version was actually updated
          const updatedParsed = yaml.load(updatedContent) as any;
          expect(updatedParsed.spec.source.targetRevision).toBe(newVersion);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 17.3: Line count preservation
   * 
   * For any manifest, after updating the targetRevision, the number of lines
   * should remain the same (no lines added or removed).
   */
  it('should preserve line count when updating targetRevision', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbManifestWithComments,
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

          const originalLineCount = manifestContent.split('\n').length;

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-linecount.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create a version update
          const dependency: HelmDependency = {
            manifestPath: testFile,
            documentIndex: 0,
            chartName,
            repoURL,
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
          const updatedLineCount = updatedContent.split('\n').length;

          // Line count should be preserved
          expect(updatedLineCount).toBe(originalLineCount);

          // Verify the version was actually updated
          const updatedParsed = yaml.load(updatedContent) as any;
          expect(updatedParsed.spec.source.targetRevision).toBe(newVersion);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 17.4: Non-targetRevision field preservation
   * 
   * For any manifest, after updating the targetRevision, all other fields
   * should remain byte-for-byte identical in the file.
   */
  it('should preserve all non-targetRevision lines exactly', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbManifestWithComments,
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

          const originalLines = manifestContent.split('\n');

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-preservation.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create a version update
          const dependency: HelmDependency = {
            manifestPath: testFile,
            documentIndex: 0,
            chartName,
            repoURL,
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
          const updatedLines = updatedContent.split('\n');

          // Find the line with targetRevision
          let targetRevisionLineIndex = -1;
          for (let i = 0; i < originalLines.length; i++) {
            if (originalLines[i].includes('targetRevision')) {
              targetRevisionLineIndex = i;
              break;
            }
          }

          expect(targetRevisionLineIndex).toBeGreaterThan(-1);

          // All lines except the targetRevision line should be identical
          for (let i = 0; i < originalLines.length; i++) {
            if (i === targetRevisionLineIndex) {
              // This line should have changed
              expect(updatedLines[i]).not.toBe(originalLines[i]);
              expect(updatedLines[i]).toContain(newVersion);
            } else {
              // All other lines should be identical
              expect(updatedLines[i]).toBe(originalLines[i]);
            }
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 17.5: Quote style preservation
   * 
   * For any manifest with quoted values, after updating the targetRevision,
   * the quote style (single, double, or none) should be preserved.
   */
  it('should preserve quote style when updating targetRevision', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('none', 'single', 'double'),
        arbSemVer,
        arbSemVer,
        async (quoteStyle, currentVersion, newVersion) => {
          // Skip if versions are the same
          if (currentVersion === newVersion) {
            return true;
          }

          // Create manifest with specific quote style
          let versionValue: string;
          switch (quoteStyle) {
            case 'single':
              versionValue = `'${currentVersion}'`;
              break;
            case 'double':
              versionValue = `"${currentVersion}"`;
              break;
            default:
              versionValue = currentVersion;
          }

          const manifestContent = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: test-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: ${versionValue}
    helm:
      releaseName: nginx
  destination:
    server: https://kubernetes.default.svc
    namespace: default
`;

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-quotes.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create a version update
          const dependency: HelmDependency = {
            manifestPath: testFile,
            documentIndex: 0,
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
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

          // Find the targetRevision line
          const updatedLines = updatedContent.split('\n');
          const targetRevisionLine = updatedLines.find(line => line.includes('targetRevision'));
          
          expect(targetRevisionLine).toBeDefined();

          // Check that the quote style is preserved
          switch (quoteStyle) {
            case 'single':
              expect(targetRevisionLine).toContain(`'${newVersion}'`);
              break;
            case 'double':
              expect(targetRevisionLine).toContain(`"${newVersion}"`);
              break;
            default:
              // No quotes - should not have quotes around the version
              expect(targetRevisionLine).toMatch(new RegExp(`targetRevision:\\s+${newVersion.replace(/\./g, '\\.')}`));
              expect(targetRevisionLine).not.toContain(`'${newVersion}'`);
              expect(targetRevisionLine).not.toContain(`"${newVersion}"`);
          }

          // Verify the version was actually updated
          const updatedParsed = yaml.load(updatedContent) as any;
          expect(updatedParsed.spec.source.targetRevision).toBe(newVersion);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 17.6: Whitespace preservation
   * 
   * For any manifest, after updating the targetRevision, trailing whitespace
   * and blank lines should be preserved.
   */
  it('should preserve whitespace and blank lines when updating targetRevision', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemVer,
        arbSemVer,
        async (currentVersion, newVersion) => {
          // Skip if versions are the same
          if (currentVersion === newVersion) {
            return true;
          }

          // Create manifest with specific whitespace patterns
          const manifestContent = `apiVersion: argoproj.io/v1alpha1
kind: Application

metadata:
  name: test-app  
  namespace: argocd

spec:
  project: default
  
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: ${currentVersion}
    
    helm:
      releaseName: nginx
      
  destination:
    server: https://kubernetes.default.svc
    namespace: default

`;

          const originalLines = manifestContent.split('\n');
          const originalBlankLines = originalLines.filter(line => line.trim() === '').length;

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-whitespace.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create a version update
          const dependency: HelmDependency = {
            manifestPath: testFile,
            documentIndex: 0,
            chartName: 'nginx',
            repoURL: 'https://charts.bitnami.com/bitnami',
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
          const updatedLines = updatedContent.split('\n');

          // Blank lines should be preserved
          const updatedBlankLines = updatedLines.filter(line => line.trim() === '').length;
          expect(updatedBlankLines).toBe(originalBlankLines);

          // Check that non-targetRevision lines with trailing spaces are preserved
          for (let i = 0; i < originalLines.length; i++) {
            if (!originalLines[i].includes('targetRevision')) {
              expect(updatedLines[i]).toBe(originalLines[i]);
            }
          }

          // Verify the version was actually updated
          const updatedParsed = yaml.load(updatedContent) as any;
          expect(updatedParsed.spec.source.targetRevision).toBe(newVersion);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 17.7: Round-trip consistency
   * 
   * For any manifest, after updating and then parsing the YAML, the parsed
   * structure should be identical except for the targetRevision field.
   */
  it('should maintain semantic equivalence after round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbManifestWithComments,
        arbSemVer,
        async (manifestContent, newVersion) => {
          // Parse the manifest to extract the current version
          const originalParsed = yaml.load(manifestContent) as any;
          const currentVersion = originalParsed.spec.source.targetRevision;
          const chartName = originalParsed.spec.source.chart;
          const repoURL = originalParsed.spec.source.repoURL;

          // Skip if new version is the same as current
          if (newVersion === currentVersion) {
            return true;
          }

          // Write manifest to temp file
          const testFile = path.join(tempDir, 'test-roundtrip.yaml');
          await fs.writeFile(testFile, manifestContent, 'utf-8');

          // Create a version update
          const dependency: HelmDependency = {
            manifestPath: testFile,
            documentIndex: 0,
            chartName,
            repoURL,
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

          // Create expected structure by manually updating the original
          const expectedParsed = JSON.parse(JSON.stringify(originalParsed));
          expectedParsed.spec.source.targetRevision = newVersion;

          // The parsed structures should be identical
          expect(updatedParsed).toEqual(expectedParsed);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });
});
