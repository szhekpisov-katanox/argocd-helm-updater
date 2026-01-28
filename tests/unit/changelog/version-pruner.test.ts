/**
 * Unit tests for VersionPruner
 */

import { VersionPruner } from '../../../src/changelog/version-pruner';

describe('VersionPruner', () => {
  describe('prune', () => {
    it('should extract version range from Keep a Changelog format', () => {
      const changelog = `# Changelog

## [2.0.0] - 2024-01-20
- Feature: Added new API
- Fix: Fixed critical bug

## [1.5.0] - 2024-01-15
- Feature: Added feature X
- Improvement: Better performance

## [1.0.0] - 2024-01-01
- Initial release
`;

      const result = VersionPruner.prune({
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        changelogText: changelog,
      });

      expect(result.versionsFound).toBe(true);
      expect(result.prunedText).toContain('2.0.0');
      expect(result.prunedText).toContain('1.5.0');
      expect(result.prunedText).toContain('1.0.0');
      expect(result.prunedText).toContain('Added new API');
      expect(result.prunedText).toContain('Added feature X');
    });

    it('should extract version range from markdown header format', () => {
      const changelog = `# Changelog

## 2.0.0
- Feature: Added new API

## 1.5.0
- Feature: Added feature X

## 1.0.0
- Initial release
`;

      const result = VersionPruner.prune({
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        changelogText: changelog,
      });

      expect(result.versionsFound).toBe(true);
      expect(result.prunedText).toContain('2.0.0');
      expect(result.prunedText).toContain('1.0.0');
    });

    it('should handle v-prefixed versions', () => {
      const changelog = `# Changelog

## v2.0.0
- Feature: Added new API

## v1.0.0
- Initial release
`;

      const result = VersionPruner.prune({
        currentVersion: 'v1.0.0',
        targetVersion: 'v2.0.0',
        changelogText: changelog,
      });

      expect(result.versionsFound).toBe(true);
      expect(result.prunedText).toContain('v2.0.0');
      expect(result.prunedText).toContain('v1.0.0');
    });

    it('should handle plain text format with underlines', () => {
      const changelog = `Changelog
=========

2.0.0
-----
- Feature: Added new API

1.0.0
-----
- Initial release
`;

      const result = VersionPruner.prune({
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        changelogText: changelog,
      });

      expect(result.versionsFound).toBe(true);
      expect(result.prunedText).toContain('2.0.0');
      expect(result.prunedText).toContain('1.0.0');
    });

    it('should handle reStructuredText format', () => {
      const changelog = `Changelog
=========

Version 2.0.0
-------------
- Feature: Added new API

Version 1.0.0
-------------
- Initial release
`;

      const result = VersionPruner.prune({
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        changelogText: changelog,
      });

      expect(result.versionsFound).toBe(true);
      expect(result.prunedText).toContain('2.0.0');
      expect(result.prunedText).toContain('1.0.0');
    });

    it('should handle date-based version headers', () => {
      const changelog = `# Changelog

## 2.0.0 - 2024-01-20
- Feature: Added new API

## 1.0.0 - 2024-01-01
- Initial release
`;

      const result = VersionPruner.prune({
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        changelogText: changelog,
      });

      expect(result.versionsFound).toBe(true);
      expect(result.prunedText).toContain('2.0.0');
      expect(result.prunedText).toContain('1.0.0');
    });

    it('should handle semantic version headers', () => {
      const changelog = `# Changelog

## 2.0.0
### Added
- New feature

## 1.5.0
### Fixed
- Bug fix

## 1.0.0
### Added
- Initial release
`;

      const result = VersionPruner.prune({
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        changelogText: changelog,
      });

      expect(result.versionsFound).toBe(true);
      expect(result.prunedText).toContain('2.0.0');
      expect(result.prunedText).toContain('1.5.0');
      expect(result.prunedText).toContain('1.0.0');
    });

    it('should exclude unreleased section', () => {
      const changelog = `# Changelog

## [Unreleased]
- Work in progress

## [2.0.0] - 2024-01-20
- Feature: Added new API

## [1.0.0] - 2024-01-01
- Initial release
`;

      const result = VersionPruner.prune({
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        changelogText: changelog,
      });

      expect(result.versionsFound).toBe(true);
      expect(result.prunedText).not.toContain('Unreleased');
      expect(result.prunedText).not.toContain('Work in progress');
    });

    it('should include unreleased section when explicitly requested', () => {
      const changelog = `# Changelog

## [Unreleased]
- Work in progress

## [1.0.0] - 2024-01-01
- Initial release
`;

      const result = VersionPruner.prune({
        currentVersion: '1.0.0',
        targetVersion: 'unreleased',
        changelogText: changelog,
      });

      expect(result.versionsFound).toBe(true);
      expect(result.prunedText).toContain('Unreleased');
      expect(result.prunedText).toContain('Work in progress');
    });

    it('should return full changelog with warning when versions not found', () => {
      const changelog = `# Changelog

Some text without version headers.
`;

      const result = VersionPruner.prune({
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        changelogText: changelog,
      });

      expect(result.versionsFound).toBe(false);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('Could not find version headers');
      expect(result.prunedText).toBe(changelog);
    });

    it('should preserve markdown formatting', () => {
      const changelog = `# Changelog

## 2.0.0
### Added
- **Bold feature**
- *Italic improvement*
- \`code snippet\`

\`\`\`javascript
const example = true;
\`\`\`

### Fixed
- Bug fix

## 1.0.0
- Initial release
`;

      const result = VersionPruner.prune({
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        changelogText: changelog,
      });

      expect(result.versionsFound).toBe(true);
      expect(result.prunedText).toContain('**Bold feature**');
      expect(result.prunedText).toContain('*Italic improvement*');
      expect(result.prunedText).toContain('`code snippet`');
      expect(result.prunedText).toContain('```javascript');
    });

    it('should handle empty changelog', () => {
      const result = VersionPruner.prune({
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        changelogText: '',
      });

      expect(result.versionsFound).toBe(false);
      expect(result.warning).toBeDefined();
    });

    it('should handle single version', () => {
      const changelog = `# Changelog

## 1.0.0
- Initial release
`;

      const result = VersionPruner.prune({
        currentVersion: '1.0.0',
        targetVersion: '1.0.0',
        changelogText: changelog,
      });

      expect(result.versionsFound).toBe(true);
      expect(result.prunedText).toContain('1.0.0');
      expect(result.prunedText).toContain('Initial release');
    });
  });

  describe('findVersionLine', () => {
    it('should find Keep a Changelog format', () => {
      const lines = ['# Changelog', '', '## [1.0.0] - 2024-01-01', '- Initial release'];
      const lineNumber = VersionPruner.findVersionLine(lines, '1.0.0');
      expect(lineNumber).toBe(2);
    });

    it('should find markdown header format', () => {
      const lines = ['# Changelog', '', '## 1.0.0', '- Initial release'];
      const lineNumber = VersionPruner.findVersionLine(lines, '1.0.0');
      expect(lineNumber).toBe(2);
    });

    it('should find v-prefixed version', () => {
      const lines = ['# Changelog', '', '## v1.0.0', '- Initial release'];
      const lineNumber = VersionPruner.findVersionLine(lines, '1.0.0');
      expect(lineNumber).toBe(2);
    });

    it('should find underlined version', () => {
      const lines = ['# Changelog', '', '1.0.0', '-----', '- Initial release'];
      const lineNumber = VersionPruner.findVersionLine(lines, '1.0.0');
      expect(lineNumber).toBe(2);
    });

    it('should return null when version not found', () => {
      const lines = ['# Changelog', '', '## 2.0.0', '- New release'];
      const lineNumber = VersionPruner.findVersionLine(lines, '1.0.0');
      expect(lineNumber).toBeNull();
    });

    it('should find unreleased section when explicitly searched', () => {
      const lines = ['# Changelog', '', '## [Unreleased]', '- WIP', '', '## [1.0.0]', '- Release'];
      const lineNumber = VersionPruner.findVersionLine(lines, 'unreleased');
      expect(lineNumber).toBe(2);
    });
  });

  describe('extractVersionRange', () => {
    it('should extract lines in range', () => {
      const lines = ['Line 0', 'Line 1', 'Line 2', 'Line 3', 'Line 4'];
      const result = VersionPruner.extractVersionRange(lines, 1, 3);
      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should handle single line range', () => {
      const lines = ['Line 0', 'Line 1', 'Line 2'];
      const result = VersionPruner.extractVersionRange(lines, 1, 1);
      expect(result).toBe('Line 1');
    });

    it('should handle range to end of file', () => {
      const lines = ['Line 0', 'Line 1', 'Line 2'];
      const result = VersionPruner.extractVersionRange(lines, 1, 10);
      expect(result).toBe('Line 1\nLine 2');
    });

    it('should return empty string for invalid start', () => {
      const lines = ['Line 0', 'Line 1', 'Line 2'];
      const result = VersionPruner.extractVersionRange(lines, -1, 2);
      expect(result).toBe('');
    });

    it('should return empty string when start > end', () => {
      const lines = ['Line 0', 'Line 1', 'Line 2'];
      const result = VersionPruner.extractVersionRange(lines, 2, 1);
      expect(result).toBe('');
    });

    it('should trim whitespace', () => {
      const lines = ['  Line 0  ', '  Line 1  ', '  Line 2  '];
      const result = VersionPruner.extractVersionRange(lines, 0, 2);
      expect(result).not.toMatch(/^\s+/);
      expect(result).not.toMatch(/\s+$/);
    });
  });
});
