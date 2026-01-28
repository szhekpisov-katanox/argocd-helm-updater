/**
 * Property-based tests for ManifestScanner - Multi-Document YAML Parsing
 * 
 * **Property 2: Multi-Document YAML Parsing**
 * **Validates: Requirements 1.3**
 * 
 * For any YAML file containing multiple documents, each document should be 
 * parsed independently and processed separately.
 */

import * as fc from 'fast-check';
import { ManifestScanner } from '../../src/scanner/manifest-scanner';
import { ActionConfig } from '../../src/types/config';
import * as yaml from 'js-yaml';

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

// Generate semantic version
const arbSemVer = fc.tuple(
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 }),
  fc.nat({ max: 100 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

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
      targetRevision: arbSemVer,
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
          targetRevision: arbSemVer,
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
function manifestToYAML(manifest: unknown): string {
  return yaml.dump(manifest, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
}

describe('Property 2: Multi-Document YAML Parsing', () => {
  let scanner: ManifestScanner;

  beforeEach(() => {
    const config = createTestConfig();
    scanner = new ManifestScanner(config);
  });

  /**
   * Property 2.1: Independent document parsing
   * 
   * For any multi-document YAML file, each document should be parsed 
   * independently without affecting other documents.
   */
  it('should parse each document in a multi-document YAML file independently', () => {
    fc.assert(
      fc.property(
        fc.array(arbApplication, { minLength: 2, maxLength: 10 }),
        (applications) => {
          // Create multi-document YAML
          const yamlContent = applications
            .map(app => manifestToYAML(app))
            .join('---\n');

          // Parse the YAML
          const documents = scanner.parseYAML(yamlContent);

          // Each document should be parsed independently
          expect(documents.length).toBe(applications.length);

          // Verify each document matches the original
          documents.forEach((doc, index) => {
            expect(doc.kind).toBe('Application');
            expect(doc.apiVersion).toBe(applications[index].apiVersion);
            expect(doc.metadata.name).toBe(applications[index].metadata.name);
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 2.2: Mixed resource type parsing
   * 
   * For any multi-document YAML file containing different resource types,
   * each document should be parsed correctly regardless of type.
   */
  it('should parse mixed ArgoCD and non-ArgoCD resources independently', () => {
    fc.assert(
      fc.property(
        fc.array(arbApplication, { minLength: 1, maxLength: 5 }),
        fc.array(arbApplicationSet, { minLength: 1, maxLength: 5 }),
        fc.array(arbNonArgoCDResource, { minLength: 1, maxLength: 5 }),
        (applications, applicationSets, nonArgoCDResources) => {
          // Interleave different resource types
          const allResources = [
            ...applications,
            ...applicationSets,
            ...nonArgoCDResources,
          ];

          // Create multi-document YAML
          const yamlContent = allResources
            .map(resource => manifestToYAML(resource))
            .join('---\n');

          // Parse the YAML
          const documents = scanner.parseYAML(yamlContent);

          // All documents should be parsed
          expect(documents.length).toBe(allResources.length);

          // Count each type
          const appCount = documents.filter(d => d.kind === 'Application').length;
          const appSetCount = documents.filter(d => d.kind === 'ApplicationSet').length;
          const otherCount = documents.filter(d => d.kind === 'Other').length;

          expect(appCount).toBe(applications.length);
          expect(appSetCount).toBe(applicationSets.length);
          expect(otherCount).toBe(nonArgoCDResources.length);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 2.3: Empty document handling
   * 
   * For any multi-document YAML file with empty documents,
   * empty documents should be skipped without affecting valid documents.
   */
  it('should skip empty documents and parse valid ones', () => {
    fc.assert(
      fc.property(
        fc.array(arbApplication, { minLength: 1, maxLength: 5 }),
        fc.nat({ max: 5 }), // Number of empty documents to insert
        (applications, emptyCount) => {
          // Create YAML with empty documents interspersed
          const parts: string[] = [];
          
          applications.forEach((app, index) => {
            parts.push(manifestToYAML(app));
            // Add empty documents after some applications
            if (index < emptyCount) {
              parts.push(''); // Empty document
            }
          });

          const yamlContent = parts.join('---\n');

          // Parse the YAML
          const documents = scanner.parseYAML(yamlContent);

          // Only non-empty documents should be parsed
          expect(documents.length).toBe(applications.length);

          // All parsed documents should be valid Applications
          documents.forEach(doc => {
            expect(doc.kind).toBe('Application');
            expect(doc.apiVersion).toMatch(/^argoproj\.io\//);
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 2.4: Document separator variations
   * 
   * For any multi-document YAML file, different valid separator styles
   * (---, --- with trailing spaces, multiple newlines) should be handled correctly.
   * Note: YAML spec requires --- to start at the beginning of a line.
   */
  it('should handle various document separator styles', () => {
    fc.assert(
      fc.property(
        fc.array(arbApplication, { minLength: 2, maxLength: 5 }),
        fc.constantFrom('\n---\n', '\n---  \n', '\n---\n\n', '---\n'),
        (applications, separator) => {
          // Create multi-document YAML with specified separator
          const yamlContent = applications
            .map(app => manifestToYAML(app))
            .join(separator);

          // Parse the YAML
          const documents = scanner.parseYAML(yamlContent);

          // All documents should be parsed
          expect(documents.length).toBe(applications.length);

          // Verify each document is valid
          documents.forEach(doc => {
            expect(doc.kind).toBe('Application');
            expect(doc.apiVersion).toMatch(/^argoproj\.io\//);
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 2.5: Document order preservation
   * 
   * For any multi-document YAML file, documents should be parsed
   * in the same order they appear in the file.
   */
  it('should preserve document order during parsing', () => {
    fc.assert(
      fc.property(
        fc.array(arbApplication, { minLength: 2, maxLength: 10 }),
        (applications) => {
          // Create multi-document YAML
          const yamlContent = applications
            .map(app => manifestToYAML(app))
            .join('---\n');

          // Parse the YAML
          const documents = scanner.parseYAML(yamlContent);

          // Verify order is preserved by checking names
          documents.forEach((doc, index) => {
            expect(doc.metadata.name).toBe(applications[index].metadata.name);
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 2.6: Large multi-document files
   * 
   * For any multi-document YAML file with many documents,
   * all documents should be parsed correctly.
   */
  it('should handle large multi-document files', () => {
    fc.assert(
      fc.property(
        fc.array(arbApplication, { minLength: 10, maxLength: 50 }),
        (applications) => {
          // Create large multi-document YAML
          const yamlContent = applications
            .map(app => manifestToYAML(app))
            .join('---\n');

          // Parse the YAML
          const documents = scanner.parseYAML(yamlContent);

          // All documents should be parsed
          expect(documents.length).toBe(applications.length);

          // Verify all are valid Applications
          documents.forEach(doc => {
            expect(doc.kind).toBe('Application');
            expect(doc.apiVersion).toMatch(/^argoproj\.io\//);
          });
        }
      ),
      { numRuns: 10 } // Fewer runs for large files
    );
  });

  /**
   * Property 2.7: Partial invalid documents
   * 
   * For any multi-document YAML file where one document is invalid,
   * the entire file should fail to parse (js-yaml behavior).
   */
  it('should fail to parse if any document is invalid YAML', () => {
    fc.assert(
      fc.property(
        fc.array(arbApplication, { minLength: 2, maxLength: 5 }),
        fc.nat({ max: 10 }), // Position to insert invalid YAML
        (applications, invalidPosition) => {
          const position = invalidPosition % (applications.length + 1);
          
          // Create YAML parts
          const parts = applications.map(app => manifestToYAML(app));
          
          // Insert invalid YAML at position
          parts.splice(position, 0, 'invalid: [unclosed bracket');
          
          const yamlContent = parts.join('---\n');

          // Parse the YAML - should return empty array due to invalid YAML
          const documents = scanner.parseYAML(yamlContent);

          // Invalid YAML should result in empty array
          expect(documents).toEqual([]);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 2.8: Comments and whitespace preservation
   * 
   * For any multi-document YAML file with comments and extra whitespace,
   * documents should still be parsed correctly (content is preserved in raw).
   */
  it('should parse documents correctly despite comments and whitespace', () => {
    fc.assert(
      fc.property(
        fc.array(arbApplication, { minLength: 2, maxLength: 5 }),
        (applications) => {
          // Create multi-document YAML with comments and whitespace
          const parts = applications.map((app, index) => {
            const yaml = manifestToYAML(app);
            return `# Comment for document ${index}\n${yaml}\n# End of document ${index}`;
          });
          
          const yamlContent = parts.join('\n---\n\n');

          // Parse the YAML
          const documents = scanner.parseYAML(yamlContent);

          // All documents should be parsed
          expect(documents.length).toBe(applications.length);

          // Verify each document is valid
          documents.forEach((doc, index) => {
            expect(doc.kind).toBe('Application');
            expect(doc.metadata.name).toBe(applications[index].metadata.name);
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 2.9: Single document compatibility
   * 
   * For any single-document YAML file, parsing should work the same
   * as multi-document parsing (returns array with one element).
   */
  it('should handle single-document files as multi-document with one element', () => {
    fc.assert(
      fc.property(
        arbApplication,
        (application) => {
          // Create single-document YAML (no separator)
          const yamlContent = manifestToYAML(application);

          // Parse the YAML
          const documents = scanner.parseYAML(yamlContent);

          // Should return array with one document
          expect(documents.length).toBe(1);
          expect(documents[0].kind).toBe('Application');
          expect(documents[0].metadata.name).toBe(application.metadata.name);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 2.10: Document independence after parsing
   * 
   * For any multi-document YAML file, modifying one parsed document
   * should not affect other parsed documents.
   */
  it('should ensure parsed documents are independent objects', () => {
    fc.assert(
      fc.property(
        fc.array(arbApplication, { minLength: 3, maxLength: 5 }),
        (applications) => {
          // Create multi-document YAML
          const yamlContent = applications
            .map(app => manifestToYAML(app))
            .join('---\n');

          // Parse the YAML
          const documents = scanner.parseYAML(yamlContent);

          // Store original names
          const originalNames = documents.map(d => d.metadata.name);

          // Modify first document
          documents[0].metadata.name = 'modified-name';

          // Verify other documents are unchanged
          for (let i = 1; i < documents.length; i++) {
            expect(documents[i].metadata.name).toBe(originalNames[i]);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});
