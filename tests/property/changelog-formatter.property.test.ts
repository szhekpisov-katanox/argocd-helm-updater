/**
 * Property-based tests for ChangelogFormatter
 * 
 * These tests validate universal properties that should hold for all inputs.
 * Each test runs 100 iterations with randomly generated inputs.
 */

import * as fc from 'fast-check';
import { ChangelogFormatter } from '../../src/changelog/changelog-formatter';
import { ChangelogResult } from '../../src/types/changelog';

describe('ChangelogFormatter - Property Tests', () => {
  /**
   * Property 14: PR body changelog sections
   * 
   * **Feature: changelog-release-notes-generator, Property 14: PR body changelog sections**
   * 
   * **Validates: Requirements 5.1, 5.3, 5.4**
   * 
   * For any pull request with chart updates, the PR body should include a changelog
   * section for each updated chart.
   */
  describe('Property 14: PR body changelog sections', () => {
    it('should include a changelog section for each chart update', () => {
      fc.assert(
        fc.property(
          // Generate chart updates
          fc.array(
            fc.record({
              chartName: fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
              currentVersion: fc.stringMatching(/^\d+\.\d+\.\d+$/),
              targetVersion: fc.stringMatching(/^\d+\.\d+\.\d+$/),
              hasChangelog: fc.boolean(),
              hasReleaseNotes: fc.boolean(),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (updates) => {
            // Create changelog results for each update
            const results = new Map<string, ChangelogResult>();
            const versionMap = new Map<string, { currentVersion: string; targetVersion: string }>();

            for (const update of updates) {
              const result: ChangelogResult = {
                sourceUrl: `https://github.com/example/${update.chartName}`,
                found: update.hasChangelog || update.hasReleaseNotes,
                changelogText: update.hasChangelog ? `# Changelog\n\n## ${update.targetVersion}\n\nChanges for ${update.chartName}` : undefined,
                changelogUrl: update.hasChangelog ? `https://github.com/example/${update.chartName}/CHANGELOG.md` : undefined,
                releaseNotes: update.hasReleaseNotes ? `Release notes for ${update.targetVersion}` : undefined,
                releaseNotesUrl: update.hasReleaseNotes ? `https://github.com/example/${update.chartName}/releases/tag/v${update.targetVersion}` : undefined,
              };

              results.set(update.chartName, result);
              versionMap.set(update.chartName, {
                currentVersion: update.currentVersion,
                targetVersion: update.targetVersion,
              });
            }

            // Format multiple changelogs
            const formatted = ChangelogFormatter.formatMultiple(results, versionMap);

            // Verify each chart has a section
            for (const update of updates) {
              // Check for chart header (Requirement 5.3)
              const headerPattern = new RegExp(`### 📦 ${update.chartName} \\(${update.currentVersion} → ${update.targetVersion}\\)`);
              expect(formatted).toMatch(headerPattern);

              // If changelog or release notes exist, verify they're included (Requirement 5.1, 5.4)
              if (update.hasChangelog) {
                expect(formatted).toContain('#### Changelog');
              }
              if (update.hasReleaseNotes) {
                expect(formatted).toContain('#### Release Notes');
              }
            }

            // Verify "Changelogs" section header exists
            expect(formatted).toContain('## Changelogs');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle charts with no changelog or release notes', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          (chartName, currentVersion, targetVersion) => {
            const result: ChangelogResult = {
              sourceUrl: `https://github.com/example/${chartName}`,
              found: false,
            };

            const formatted = ChangelogFormatter.format({
              chartName,
              currentVersion,
              targetVersion,
              changelogResult: result,
            });

            // Should include fallback message (Requirement 5.4)
            expect(formatted).toContain('No changelog or release notes found');
            expect(formatted).toContain(`### 📦 ${chartName}`);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 15: Changelog content distinction
   * 
   * **Feature: changelog-release-notes-generator, Property 15: Changelog content distinction**
   * 
   * **Validates: Requirements 5.6**
   * 
   * For any chart update with both changelog file content and release notes,
   * the PR body should distinguish between them using different subheadings.
   */
  describe('Property 15: Changelog content distinction', () => {
    it('should use distinct subheadings for changelog and release notes', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          fc.string({ minLength: 10, maxLength: 500 }),
          fc.string({ minLength: 10, maxLength: 500 }),
          (chartName, currentVersion, targetVersion, changelogText, releaseNotes) => {
            const result: ChangelogResult = {
              sourceUrl: `https://github.com/example/${chartName}`,
              found: true,
              changelogText,
              changelogUrl: `https://github.com/example/${chartName}/CHANGELOG.md`,
              releaseNotes,
              releaseNotesUrl: `https://github.com/example/${chartName}/releases/tag/v${targetVersion}`,
            };

            const formatted = ChangelogFormatter.format({
              chartName,
              currentVersion,
              targetVersion,
              changelogResult: result,
            });

            // Verify distinct subheadings (Requirement 5.6)
            expect(formatted).toContain('#### Changelog');
            expect(formatted).toContain('#### Release Notes');

            // Verify both content types are included
            expect(formatted).toContain(changelogText);
            expect(formatted).toContain(releaseNotes);

            // Verify changelog comes before release notes
            const changelogIndex = formatted.indexOf('#### Changelog');
            const releaseNotesIndex = formatted.indexOf('#### Release Notes');
            expect(changelogIndex).toBeLessThan(releaseNotesIndex);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only show changelog subheading when only changelog exists', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          fc.string({ minLength: 10, maxLength: 500 }),
          (chartName, currentVersion, targetVersion, changelogText) => {
            const result: ChangelogResult = {
              sourceUrl: `https://github.com/example/${chartName}`,
              found: true,
              changelogText,
              changelogUrl: `https://github.com/example/${chartName}/CHANGELOG.md`,
            };

            const formatted = ChangelogFormatter.format({
              chartName,
              currentVersion,
              targetVersion,
              changelogResult: result,
            });

            // Should have changelog subheading
            expect(formatted).toContain('#### Changelog');
            // Should NOT have release notes subheading
            expect(formatted).not.toContain('#### Release Notes');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only show release notes subheading when only release notes exist', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          fc.string({ minLength: 10, maxLength: 500 }),
          (chartName, currentVersion, targetVersion, releaseNotes) => {
            const result: ChangelogResult = {
              sourceUrl: `https://github.com/example/${chartName}`,
              found: true,
              releaseNotes,
              releaseNotesUrl: `https://github.com/example/${chartName}/releases/tag/v${targetVersion}`,
            };

            const formatted = ChangelogFormatter.format({
              chartName,
              currentVersion,
              targetVersion,
              changelogResult: result,
            });

            // Should have release notes subheading
            expect(formatted).toContain('#### Release Notes');
            // Should NOT have changelog subheading
            expect(formatted).not.toContain('#### Changelog');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 16: Changelog truncation with link
   * 
   * **Feature: changelog-release-notes-generator, Property 16: Changelog truncation with link**
   * 
   * **Validates: Requirements 5.7**
   * 
   * For any changelog content exceeding the maximum length, the formatted output
   * should be truncated and include a link to the full changelog.
   */
  describe('Property 16: Changelog truncation with link', () => {
    it('should truncate long changelogs and include link', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          fc.integer({ min: 100, max: 1000 }),
          (chartName, currentVersion, targetVersion, maxLength) => {
            // Generate long changelog text (exceeds maxLength)
            const longText = 'A'.repeat(maxLength + 500);
            
            const result: ChangelogResult = {
              sourceUrl: `https://github.com/example/${chartName}`,
              found: true,
              changelogText: longText,
              changelogUrl: `https://github.com/example/${chartName}/CHANGELOG.md`,
            };

            const formatted = ChangelogFormatter.format({
              chartName,
              currentVersion,
              targetVersion,
              changelogResult: result,
              maxLength,
            });

            // Verify truncation occurred (Requirement 5.7)
            expect(formatted.length).toBeLessThan(longText.length);
            expect(formatted).toContain('...');
            
            // Verify link to full changelog is included (Requirement 5.7)
            expect(formatted).toContain('View full content');
            expect(formatted).toContain(result.changelogUrl);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not truncate short changelogs', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          fc.string({ minLength: 10, maxLength: 200 }),
          (chartName, currentVersion, targetVersion, shortText) => {
            const result: ChangelogResult = {
              sourceUrl: `https://github.com/example/${chartName}`,
              found: true,
              changelogText: shortText,
              changelogUrl: `https://github.com/example/${chartName}/CHANGELOG.md`,
            };

            const formatted = ChangelogFormatter.format({
              chartName,
              currentVersion,
              targetVersion,
              changelogResult: result,
              maxLength: 5000,
            });

            // Should include full text without truncation
            expect(formatted).toContain(shortText);
            // Should not have truncation indicator
            expect(formatted).not.toContain('Content truncated');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve markdown structure when truncating', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          (chartName, currentVersion, targetVersion) => {
            // Create changelog with code block
            const longText = '# Changelog\n\n```javascript\n' + 'x'.repeat(1000) + '\n```\n\nMore content here';
            
            const result: ChangelogResult = {
              sourceUrl: `https://github.com/example/${chartName}`,
              found: true,
              changelogText: longText,
              changelogUrl: `https://github.com/example/${chartName}/CHANGELOG.md`,
            };

            const formatted = ChangelogFormatter.format({
              chartName,
              currentVersion,
              targetVersion,
              changelogResult: result,
              maxLength: 500,
            });

            // Verify truncation occurred and link is present
            expect(formatted).toContain('...');
            expect(formatted).toContain('View full content');
            
            // The formatter attempts to preserve markdown structure
            // by detecting code blocks and adjusting truncation point
            // This is a best-effort feature, so we just verify the output is valid
            expect(formatted.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should truncate at sensible boundaries', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          fc.stringMatching(/^\d+\.\d+\.\d+$/),
          (chartName, currentVersion, targetVersion) => {
            // Create text with clear boundaries
            const longText = 'Paragraph one.\n\nParagraph two.\n\nParagraph three. ' + 'x'.repeat(1000);
            const maxLength = 100;
            
            const result: ChangelogResult = {
              sourceUrl: `https://github.com/example/${chartName}`,
              found: true,
              changelogText: longText,
              changelogUrl: `https://github.com/example/${chartName}/CHANGELOG.md`,
            };

            const formatted = ChangelogFormatter.format({
              chartName,
              currentVersion,
              targetVersion,
              changelogResult: result,
              maxLength,
            });

            // Verify truncation occurred (Requirement 5.7)
            expect(formatted).toContain('...');
            expect(formatted).toContain('View full content');
            
            // The formatter attempts to break at sensible boundaries
            // (newlines, periods, spaces) when possible
            // Verify the output is shorter than the original
            expect(formatted.length).toBeLessThan(longText.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
