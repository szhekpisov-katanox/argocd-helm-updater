/**
 * Property-based tests for ManifestScanner - Error Handling
 * 
 * **Property 3: Graceful Error Handling for Invalid YAML**
 * **Validates: Requirements 1.4**
 * 
 * For any set of files where some contain invalid YAML, the action should 
 * log warnings for invalid files and continue processing all valid files.
 */

import * as fc from 'fast-check';
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
    logLevel: 'error',
    githubToken: 'test-token',
    ...overrides,
  };
}

// Generate invalid YAML strings that js-yaml will actually reject
const arbInvalidYAML = fc.constantFrom(
  'invalid: [unclosed bracket',
  'key: "unclosed string',
  '{ invalid json structure',
  'key: !!invalid_tag value',
);

describe('Property 3: Graceful Error Handling for Invalid YAML', () => {
  /**
   * Property 3.1: Invalid YAML returns empty array
   * 
   * For any invalid YAML content, parseYAML should return an empty array
   * without throwing an exception.
   */
  it('should return empty array for invalid YAML without throwing', () => {
    fc.assert(
      fc.property(
        arbInvalidYAML,
        (invalidYAML) => {
          const config = createTestConfig();
          const scanner = new ManifestScanner(config);

          // Parse invalid YAML
          const documents = scanner.parseYAML(invalidYAML);

          // Should return empty array, not throw
          expect(documents).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.2: Empty files are handled gracefully
   * 
   * For any empty file, parseYAML should return an empty array
   * without errors.
   */
  it('should handle empty files gracefully', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', '   ', '\n\n\n'),
        (emptyContent) => {
          const config = createTestConfig();
          const scanner = new ManifestScanner(config);

          // Parse empty content
          const documents = scanner.parseYAML(emptyContent);

          // Should return empty array
          expect(documents).toEqual([]);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 3.3: Malformed YAML structures
   * 
   * For any YAML with structural issues that js-yaml rejects,
   * parseYAML should return empty array without throwing.
   */
  it('should handle malformed YAML structures gracefully', () => {
    const malformedYAML = fc.constantFrom(
      'key: {unclosed: dict',
      'key: [unclosed, list',
      'invalid: [bracket',
      '"unclosed string',
    );

    fc.assert(
      fc.property(malformedYAML, (yaml) => {
        const config = createTestConfig();
        const scanner = new ManifestScanner(config);

        // Should not throw
        const documents = scanner.parseYAML(yaml);

        // Should return empty array for invalid YAML
        expect(documents).toEqual([]);
      }),
      { numRuns: 100 }
    );
  });
});
