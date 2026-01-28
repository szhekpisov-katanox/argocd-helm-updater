/**
 * Property-based tests for VersionPruner
 * 
 * **Property 10: Version range extraction**
 * **Property 11: Version header recognition**
 * **Property 12: Markdown formatting preservation**
 * **Property 13: Version header inclusion**
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.6**
 */

import * as fc from 'fast-check';
import { VersionPruner } from '../../src/changelog/version-pruner';

/**
 * Generate semantic version strings
 */
const arbVersion = fc.tuple(
  fc.nat({ max: 20 }),
  fc.nat({ max: 50 }),
  fc.nat({ max: 100 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/**
 * Generate changelog with version headers
 */
const generateChangelog = (versions: string[], format: string): string => {
  const sections: string[] = [];

  for (const version of versions) {
    let header: string;
    switch (format) {
      case 'keep-a-changelog':
        header = `## [${version}] - 2024-01-15`;
        break;
      case 'markdown':
        header = `## ${version}`;
        break;
      case 'markdown-v':
        header = `## v${version}`;
        break;
      case 'plain':
        header = version;
        break;
      case 'underline':
        header = `${version}\n${'='.repeat(version.length)}`;
        break;
      default:
        header = `## ${version}`;
    }

    sections.push(`${header}\n\n- Feature: Added new functionality\n- Fix: Fixed bug\n`);
  }

  return sections.join('\n');
};

describe('Property 10: Version range extraction', () => {
  /**
   * Property 10.1: Extracts content between current and target versions
   */
  it('should extract content between current and target versions', () => {
    fc.assert(
      fc.property(
        arbVersion,
        arbVersion,
        arbVersion,
        (v1, v2, v3) => {
          // Ensure versions are different
          if (v1 === v2 || v2 === v3 || v1 === v3) {
            return;
          }

          const versions = [v1, v2, v3].sort((a, b) => {
            const [aMaj, aMin, aPat] = a.split('.').map(Number);
            const [bMaj, bMin, bPat] = b.split('.').map(Number);
            if (aMaj !== bMaj) return bMaj - aMaj;
            if (aMin !== bMin) return bMin - aMin;
            return bPat - aPat;
          });

          const changelog = generateChangelog(versions, 'markdown');
          const result = VersionPruner.prune({
            currentVersion: versions[2], // oldest
            targetVersion: versions[0],  // newest
            changelogText: changelog,
          });

          // CRITICAL: Should find versions and extract range
          expect(result.versionsFound).toBe(true);
          expect(result.prunedText).toContain(versions[0]);
          expect(result.prunedText).toContain(versions[1]);
          expect(result.prunedText).toContain(versions[2]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.2: Returns full changelog when versions not found
   */
  it('should return full changelog with warning when versions not found', () => {
    fc.assert(
      fc.property(
        arbVersion,
        arbVersion,
        (currentVersion, targetVersion) => {
          const changelog = '# Changelog\n\nNo version headers here';

          const result = VersionPruner.prune({
            currentVersion,
            targetVersion,
            changelogText: changelog,
          });

          // CRITICAL: Should return full changelog with warning
          expect(result.versionsFound).toBe(false);
          expect(result.warning).toBeDefined();
          expect(result.prunedText).toBe(changelog);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 11: Version header recognition', () => {
  /**
   * Property 11.1: Recognizes Keep a Changelog format
   */
  it('should recognize Keep a Changelog format', () => {
    fc.assert(
      fc.property(
        arbVersion,
        arbVersion,
        (v1, v2) => {
          if (v1 === v2) return;

          const versions = [v1, v2].sort().reverse();
          const changelog = generateChangelog(versions, 'keep-a-changelog');

          const result = VersionPruner.prune({
            currentVersion: versions[1],
            targetVersion: versions[0],
            changelogText: changelog,
          });

          // CRITICAL: Should recognize format
          expect(result.versionsFound).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.2: Recognizes markdown headers
   */
  it('should recognize markdown header format', () => {
    fc.assert(
      fc.property(
        arbVersion,
        arbVersion,
        (v1, v2) => {
          if (v1 === v2) return;

          const versions = [v1, v2].sort().reverse();
          const changelog = generateChangelog(versions, 'markdown');

          const result = VersionPruner.prune({
            currentVersion: versions[1],
            targetVersion: versions[0],
            changelogText: changelog,
          });

          // CRITICAL: Should recognize format
          expect(result.versionsFound).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.3: Recognizes v-prefixed versions
   */
  it('should recognize v-prefixed version headers', () => {
    fc.assert(
      fc.property(
        arbVersion,
        arbVersion,
        (v1, v2) => {
          if (v1 === v2) return;

          const versions = [v1, v2].sort().reverse();
          const changelog = generateChangelog(versions, 'markdown-v');

          const result = VersionPruner.prune({
            currentVersion: versions[1],
            targetVersion: versions[0],
            changelogText: changelog,
          });

          // CRITICAL: Should recognize v-prefixed format
          expect(result.versionsFound).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.4: Recognizes underlined headers
   */
  it('should recognize underlined version headers', () => {
    fc.assert(
      fc.property(
        arbVersion,
        arbVersion,
        (v1, v2) => {
          if (v1 === v2) return;

          const versions = [v1, v2].sort().reverse();
          const changelog = generateChangelog(versions, 'underline');

          const result = VersionPruner.prune({
            currentVersion: versions[1],
            targetVersion: versions[0],
            changelogText: changelog,
          });

          // CRITICAL: Should recognize underlined format
          expect(result.versionsFound).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 12: Markdown formatting preservation', () => {
  /**
   * Property 12.1: Preserves markdown formatting in extracted sections
   */
  it('should preserve markdown formatting', () => {
    fc.assert(
      fc.property(
        arbVersion,
        arbVersion,
        (v1, v2) => {
          if (v1 === v2) return;

          const versions = [v1, v2].sort().reverse();
          const changelog = `## ${versions[0]}\n\n**Bold text**\n\n- List item\n- Another item\n\n\`\`\`code\nblock\n\`\`\`\n\n## ${versions[1]}\n\nOlder content`;

          const result = VersionPruner.prune({
            currentVersion: versions[1],
            targetVersion: versions[0],
            changelogText: changelog,
          });

          // CRITICAL: Should preserve markdown
          expect(result.prunedText).toContain('**Bold text**');
          expect(result.prunedText).toContain('- List item');
          expect(result.prunedText).toContain('```code');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12.2: Preserves line breaks and spacing
   */
  it('should preserve line breaks and spacing', () => {
    fc.assert(
      fc.property(
        arbVersion,
        (version) => {
          const changelog = `## ${version}\n\nFirst paragraph\n\nSecond paragraph\n\n\nThird paragraph`;

          const result = VersionPruner.prune({
            currentVersion: version,
            targetVersion: version,
            changelogText: changelog,
          });

          // CRITICAL: Should preserve spacing
          expect(result.prunedText).toContain('\n\n');
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 13: Version header inclusion', () => {
  /**
   * Property 13.1: Includes version headers in extracted output
   */
  it('should include version headers in output', () => {
    fc.assert(
      fc.property(
        arbVersion,
        arbVersion,
        (v1, v2) => {
          if (v1 === v2) return;

          const versions = [v1, v2].sort().reverse();
          const changelog = generateChangelog(versions, 'markdown');

          const result = VersionPruner.prune({
            currentVersion: versions[1],
            targetVersion: versions[0],
            changelogText: changelog,
          });

          // CRITICAL: Should include headers
          expect(result.prunedText).toContain(versions[0]);
          expect(result.prunedText).toContain(versions[1]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.2: Includes all intermediate version headers
   */
  it('should include all intermediate version headers', () => {
    fc.assert(
      fc.property(
        arbVersion,
        arbVersion,
        arbVersion,
        (v1, v2, v3) => {
          if (v1 === v2 || v2 === v3 || v1 === v3) return;

          const versions = [v1, v2, v3].sort((a, b) => {
            const [aMaj, aMin, aPat] = a.split('.').map(Number);
            const [bMaj, bMin, bPat] = b.split('.').map(Number);
            if (aMaj !== bMaj) return bMaj - aMaj;
            if (aMin !== bMin) return bMin - aMin;
            return bPat - aPat;
          });

          const changelog = generateChangelog(versions, 'markdown');

          const result = VersionPruner.prune({
            currentVersion: versions[2],
            targetVersion: versions[0],
            changelogText: changelog,
          });

          // CRITICAL: Should include all headers in range
          expect(result.prunedText).toContain(versions[0]);
          expect(result.prunedText).toContain(versions[1]);
          expect(result.prunedText).toContain(versions[2]);
        }
      ),
      { numRuns: 100 }
    );
  });
});
