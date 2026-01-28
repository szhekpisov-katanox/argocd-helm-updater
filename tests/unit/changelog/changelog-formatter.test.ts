/**
 * Unit tests for ChangelogFormatter
 */

import { ChangelogFormatter } from '../../../src/changelog/changelog-formatter';
import { ChangelogResult } from '../../../src/types/changelog';

describe('ChangelogFormatter', () => {
  describe('format()', () => {
    it('should format changelog section with header', () => {
      const result: ChangelogResult = {
        sourceUrl: 'https://github.com/example/nginx',
        found: true,
        changelogText: '## 1.2.0\n\n- Added feature X\n- Fixed bug Y',
        changelogUrl: 'https://github.com/example/nginx/CHANGELOG.md',
      };

      const formatted = ChangelogFormatter.format({
        chartName: 'nginx',
        currentVersion: '1.1.0',
        targetVersion: '1.2.0',
        changelogResult: result,
      });

      expect(formatted).toContain('### 📦 nginx (1.1.0 → 1.2.0)');
      expect(formatted).toContain('#### Changelog');
      expect(formatted).toContain('- Added feature X');
      expect(formatted).toContain('- Fixed bug Y');
      expect(formatted).toContain('[View full changelog](https://github.com/example/nginx/CHANGELOG.md)');
    });

    it('should format release notes section', () => {
      const result: ChangelogResult = {
        sourceUrl: 'https://github.com/example/nginx',
        found: true,
        releaseNotes: 'This release includes:\n- Feature A\n- Feature B',
        releaseNotesUrl: 'https://github.com/example/nginx/releases/tag/v1.2.0',
      };

      const formatted = ChangelogFormatter.format({
        chartName: 'nginx',
        currentVersion: '1.1.0',
        targetVersion: '1.2.0',
        changelogResult: result,
      });

      expect(formatted).toContain('### 📦 nginx (1.1.0 → 1.2.0)');
      expect(formatted).toContain('#### Release Notes');
      expect(formatted).toContain('This release includes:');
      expect(formatted).toContain('- Feature A');
      expect(formatted).toContain('[View release](https://github.com/example/nginx/releases/tag/v1.2.0)');
    });

    it('should format both changelog and release notes', () => {
      const result: ChangelogResult = {
        sourceUrl: 'https://github.com/example/nginx',
        found: true,
        changelogText: '## 1.2.0\n\n- Changelog entry',
        changelogUrl: 'https://github.com/example/nginx/CHANGELOG.md',
        releaseNotes: 'Release notes content',
        releaseNotesUrl: 'https://github.com/example/nginx/releases/tag/v1.2.0',
      };

      const formatted = ChangelogFormatter.format({
        chartName: 'nginx',
        currentVersion: '1.1.0',
        targetVersion: '1.2.0',
        changelogResult: result,
      });

      expect(formatted).toContain('#### Changelog');
      expect(formatted).toContain('- Changelog entry');
      expect(formatted).toContain('#### Release Notes');
      expect(formatted).toContain('Release notes content');

      // Verify changelog comes before release notes
      const changelogIndex = formatted.indexOf('#### Changelog');
      const releaseNotesIndex = formatted.indexOf('#### Release Notes');
      expect(changelogIndex).toBeLessThan(releaseNotesIndex);
    });

    it('should show fallback message when no changelog found', () => {
      const result: ChangelogResult = {
        sourceUrl: 'https://github.com/example/nginx',
        found: false,
      };

      const formatted = ChangelogFormatter.format({
        chartName: 'nginx',
        currentVersion: '1.1.0',
        targetVersion: '1.2.0',
        changelogResult: result,
      });

      expect(formatted).toContain('### 📦 nginx (1.1.0 → 1.2.0)');
      expect(formatted).toContain('No changelog or release notes found');
      expect(formatted).toContain('[View commit history](https://github.com/example/nginx/commits)');
    });

    it('should use pruned changelog when provided', () => {
      const result: ChangelogResult = {
        sourceUrl: 'https://github.com/example/nginx',
        found: true,
        changelogText: '## 1.0.0\n\nOld content\n\n## 1.1.0\n\nOlder content\n\n## 1.2.0\n\nNew content',
        changelogUrl: 'https://github.com/example/nginx/CHANGELOG.md',
      };

      const prunedChangelog = '## 1.2.0\n\nNew content';

      const formatted = ChangelogFormatter.format({
        chartName: 'nginx',
        currentVersion: '1.1.0',
        targetVersion: '1.2.0',
        changelogResult: result,
        prunedChangelog,
      });

      expect(formatted).toContain('New content');
      expect(formatted).not.toContain('Old content');
      expect(formatted).not.toContain('Older content');
    });

    it('should handle missing URLs gracefully', () => {
      const result: ChangelogResult = {
        sourceUrl: 'https://github.com/example/nginx',
        found: true,
        changelogText: '## 1.2.0\n\n- Changes',
        // No changelogUrl
      };

      const formatted = ChangelogFormatter.format({
        chartName: 'nginx',
        currentVersion: '1.1.0',
        targetVersion: '1.2.0',
        changelogResult: result,
      });

      expect(formatted).toContain('#### Changelog');
      expect(formatted).toContain('- Changes');
      expect(formatted).not.toContain('[View full changelog]');
    });
  });

  describe('truncate()', () => {
    it('should not truncate short text', () => {
      const text = 'Short changelog content';
      const truncated = ChangelogFormatter.truncate(text, 1000);

      expect(truncated).toBe(text);
      expect(truncated).not.toContain('...');
    });

    it('should truncate long text', () => {
      const text = 'A'.repeat(1000);
      const truncated = ChangelogFormatter.truncate(text, 100);

      expect(truncated.length).toBeLessThan(text.length);
      expect(truncated).toContain('...');
    });

    it('should include link when truncating', () => {
      const text = 'A'.repeat(1000);
      const url = 'https://github.com/example/nginx/CHANGELOG.md';
      const truncated = ChangelogFormatter.truncate(text, 100, url);

      expect(truncated).toContain('...');
      expect(truncated).toContain('View full content');
      expect(truncated).toContain(url);
    });

    it('should truncate at newline boundary', () => {
      const text = 'Line 1\n\nLine 2\n\nLine 3\n\n' + 'A'.repeat(1000);
      const truncated = ChangelogFormatter.truncate(text, 50);

      // Should break at a newline if possible
      expect(truncated).toContain('...');
      expect(truncated.length).toBeLessThan(text.length);
    });

    it('should truncate at sentence boundary', () => {
      const text = 'Sentence one. Sentence two. Sentence three. ' + 'A'.repeat(1000);
      const truncated = ChangelogFormatter.truncate(text, 50);

      // Should break at a period if possible
      expect(truncated).toContain('...');
      expect(truncated.length).toBeLessThan(text.length);
    });

    it('should truncate at word boundary', () => {
      const text = 'word1 word2 word3 word4 ' + 'A'.repeat(1000);
      const truncated = ChangelogFormatter.truncate(text, 30);

      // Should break at a space if possible
      expect(truncated).toContain('...');
      expect(truncated.length).toBeLessThan(text.length);
    });

    it('should handle code blocks when truncating', () => {
      const text = '# Changelog\n\n```javascript\nconst x = 1;\n```\n\n' + 'A'.repeat(1000);
      const truncated = ChangelogFormatter.truncate(text, 100);

      expect(truncated).toContain('...');
      expect(truncated.length).toBeLessThan(text.length);
    });
  });

  describe('formatMultiple()', () => {
    it('should format multiple changelog results', () => {
      const results = new Map<string, ChangelogResult>();
      const versionMap = new Map<string, { currentVersion: string; targetVersion: string }>();

      results.set('nginx', {
        sourceUrl: 'https://github.com/example/nginx',
        found: true,
        changelogText: '## 1.2.0\n\n- Nginx changes',
        changelogUrl: 'https://github.com/example/nginx/CHANGELOG.md',
      });

      results.set('redis', {
        sourceUrl: 'https://github.com/example/redis',
        found: true,
        changelogText: '## 2.0.0\n\n- Redis changes',
        changelogUrl: 'https://github.com/example/redis/CHANGELOG.md',
      });

      versionMap.set('nginx', { currentVersion: '1.1.0', targetVersion: '1.2.0' });
      versionMap.set('redis', { currentVersion: '1.9.0', targetVersion: '2.0.0' });

      const formatted = ChangelogFormatter.formatMultiple(results, versionMap);

      expect(formatted).toContain('## Changelogs');
      expect(formatted).toContain('### 📦 nginx (1.1.0 → 1.2.0)');
      expect(formatted).toContain('### 📦 redis (1.9.0 → 2.0.0)');
      expect(formatted).toContain('- Nginx changes');
      expect(formatted).toContain('- Redis changes');
      expect(formatted).toContain('---'); // Separator between charts
    });

    it('should return empty string for empty results', () => {
      const results = new Map<string, ChangelogResult>();
      const versionMap = new Map<string, { currentVersion: string; targetVersion: string }>();

      const formatted = ChangelogFormatter.formatMultiple(results, versionMap);

      expect(formatted).toBe('');
    });

    it('should skip charts without version info', () => {
      const results = new Map<string, ChangelogResult>();
      const versionMap = new Map<string, { currentVersion: string; targetVersion: string }>();

      results.set('nginx', {
        sourceUrl: 'https://github.com/example/nginx',
        found: true,
        changelogText: '## 1.2.0\n\n- Changes',
        changelogUrl: 'https://github.com/example/nginx/CHANGELOG.md',
      });

      // No version info for nginx

      const formatted = ChangelogFormatter.formatMultiple(results, versionMap);

      // Should not include nginx since version info is missing
      expect(formatted).toContain('## Changelogs');
      expect(formatted).not.toContain('nginx');
    });

    it('should handle mix of found and not found changelogs', () => {
      const results = new Map<string, ChangelogResult>();
      const versionMap = new Map<string, { currentVersion: string; targetVersion: string }>();

      results.set('nginx', {
        sourceUrl: 'https://github.com/example/nginx',
        found: true,
        changelogText: '## 1.2.0\n\n- Changes',
        changelogUrl: 'https://github.com/example/nginx/CHANGELOG.md',
      });

      results.set('redis', {
        sourceUrl: 'https://github.com/example/redis',
        found: false,
      });

      versionMap.set('nginx', { currentVersion: '1.1.0', targetVersion: '1.2.0' });
      versionMap.set('redis', { currentVersion: '1.9.0', targetVersion: '2.0.0' });

      const formatted = ChangelogFormatter.formatMultiple(results, versionMap);

      expect(formatted).toContain('### 📦 nginx');
      expect(formatted).toContain('### 📦 redis');
      expect(formatted).toContain('- Changes');
      expect(formatted).toContain('No changelog or release notes found');
    });
  });

  describe('markdown structure preservation', () => {
    it('should preserve markdown headers', () => {
      const result: ChangelogResult = {
        sourceUrl: 'https://github.com/example/nginx',
        found: true,
        changelogText: '## Version 1.2.0\n\n### Features\n\n- Feature A\n\n### Bug Fixes\n\n- Fix B',
        changelogUrl: 'https://github.com/example/nginx/CHANGELOG.md',
      };

      const formatted = ChangelogFormatter.format({
        chartName: 'nginx',
        currentVersion: '1.1.0',
        targetVersion: '1.2.0',
        changelogResult: result,
      });

      expect(formatted).toContain('### Features');
      expect(formatted).toContain('### Bug Fixes');
    });

    it('should preserve markdown lists', () => {
      const result: ChangelogResult = {
        sourceUrl: 'https://github.com/example/nginx',
        found: true,
        changelogText: '## 1.2.0\n\n- Item 1\n- Item 2\n  - Nested item\n- Item 3',
        changelogUrl: 'https://github.com/example/nginx/CHANGELOG.md',
      };

      const formatted = ChangelogFormatter.format({
        chartName: 'nginx',
        currentVersion: '1.1.0',
        targetVersion: '1.2.0',
        changelogResult: result,
      });

      expect(formatted).toContain('- Item 1');
      expect(formatted).toContain('- Item 2');
      expect(formatted).toContain('  - Nested item');
      expect(formatted).toContain('- Item 3');
    });

    it('should preserve markdown code blocks', () => {
      const result: ChangelogResult = {
        sourceUrl: 'https://github.com/example/nginx',
        found: true,
        changelogText: '## 1.2.0\n\n```yaml\nkey: value\n```',
        changelogUrl: 'https://github.com/example/nginx/CHANGELOG.md',
      };

      const formatted = ChangelogFormatter.format({
        chartName: 'nginx',
        currentVersion: '1.1.0',
        targetVersion: '1.2.0',
        changelogResult: result,
      });

      expect(formatted).toContain('```yaml');
      expect(formatted).toContain('key: value');
      expect(formatted).toContain('```');
    });

    it('should preserve markdown links', () => {
      const result: ChangelogResult = {
        sourceUrl: 'https://github.com/example/nginx',
        found: true,
        changelogText: '## 1.2.0\n\nSee [documentation](https://example.com/docs) for details.',
        changelogUrl: 'https://github.com/example/nginx/CHANGELOG.md',
      };

      const formatted = ChangelogFormatter.format({
        chartName: 'nginx',
        currentVersion: '1.1.0',
        targetVersion: '1.2.0',
        changelogResult: result,
      });

      expect(formatted).toContain('[documentation](https://example.com/docs)');
    });
  });
});
