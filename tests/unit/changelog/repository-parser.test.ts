/**
 * Unit tests for repository URL parser
 */

import { parseRepositoryUrl } from '../../../src/changelog/repository-parser';
import { RepositoryInfo } from '../../../src/types/changelog';

describe('parseRepositoryUrl', () => {
  describe('GitHub URLs', () => {
    it('should parse HTTPS GitHub URL', () => {
      const result = parseRepositoryUrl('https://github.com/owner/repo');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'github',
        owner: 'owner',
        repo: 'repo',
        url: 'https://github.com/owner/repo',
      });
    });

    it('should parse HTTPS GitHub URL with .git suffix', () => {
      const result = parseRepositoryUrl('https://github.com/owner/repo.git');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'github',
        owner: 'owner',
        repo: 'repo',
        url: 'https://github.com/owner/repo.git',
      });
    });

    it('should parse SSH GitHub URL', () => {
      const result = parseRepositoryUrl('git@github.com:owner/repo.git');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'github',
        owner: 'owner',
        repo: 'repo',
        url: 'git@github.com:owner/repo.git',
      });
    });

    it('should parse SSH GitHub URL without .git suffix', () => {
      const result = parseRepositoryUrl('git@github.com:owner/repo');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'github',
        owner: 'owner',
        repo: 'repo',
        url: 'git@github.com:owner/repo',
      });
    });

    it('should handle GitHub URL with trailing slash', () => {
      const result = parseRepositoryUrl('https://github.com/owner/repo/');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'github',
        owner: 'owner',
        repo: 'repo',
        url: 'https://github.com/owner/repo/',
      });
    });
  });

  describe('GitLab URLs', () => {
    it('should parse HTTPS GitLab URL', () => {
      const result = parseRepositoryUrl('https://gitlab.com/owner/repo');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'gitlab',
        owner: 'owner',
        repo: 'repo',
        url: 'https://gitlab.com/owner/repo',
      });
    });

    it('should parse HTTPS GitLab URL with .git suffix', () => {
      const result = parseRepositoryUrl('https://gitlab.com/owner/repo.git');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'gitlab',
        owner: 'owner',
        repo: 'repo',
        url: 'https://gitlab.com/owner/repo.git',
      });
    });

    it('should parse SSH GitLab URL', () => {
      const result = parseRepositoryUrl('git@gitlab.com:owner/repo.git');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'gitlab',
        owner: 'owner',
        repo: 'repo',
        url: 'git@gitlab.com:owner/repo.git',
      });
    });

    it('should parse SSH GitLab URL without .git suffix', () => {
      const result = parseRepositoryUrl('git@gitlab.com:owner/repo');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'gitlab',
        owner: 'owner',
        repo: 'repo',
        url: 'git@gitlab.com:owner/repo',
      });
    });
  });

  describe('Bitbucket URLs', () => {
    it('should parse HTTPS Bitbucket URL', () => {
      const result = parseRepositoryUrl('https://bitbucket.org/owner/repo');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'bitbucket',
        owner: 'owner',
        repo: 'repo',
        url: 'https://bitbucket.org/owner/repo',
      });
    });

    it('should parse HTTPS Bitbucket URL with .git suffix', () => {
      const result = parseRepositoryUrl('https://bitbucket.org/owner/repo.git');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'bitbucket',
        owner: 'owner',
        repo: 'repo',
        url: 'https://bitbucket.org/owner/repo.git',
      });
    });

    it('should parse SSH Bitbucket URL', () => {
      const result = parseRepositoryUrl('git@bitbucket.org:owner/repo.git');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'bitbucket',
        owner: 'owner',
        repo: 'repo',
        url: 'git@bitbucket.org:owner/repo.git',
      });
    });

    it('should parse SSH Bitbucket URL without .git suffix', () => {
      const result = parseRepositoryUrl('git@bitbucket.org:owner/repo');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'bitbucket',
        owner: 'owner',
        repo: 'repo',
        url: 'git@bitbucket.org:owner/repo',
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle URLs with whitespace', () => {
      const result = parseRepositoryUrl('  https://github.com/owner/repo  ');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'github',
        owner: 'owner',
        repo: 'repo',
        url: 'https://github.com/owner/repo',
      });
    });

    it('should handle case-insensitive domain matching', () => {
      const result = parseRepositoryUrl('https://GitHub.com/owner/repo');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'github',
        owner: 'owner',
        repo: 'repo',
        url: 'https://GitHub.com/owner/repo',
      });
    });

    it('should handle HTTP URLs (not just HTTPS)', () => {
      const result = parseRepositoryUrl('http://github.com/owner/repo');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'github',
        owner: 'owner',
        repo: 'repo',
        url: 'http://github.com/owner/repo',
      });
    });

    it('should return unknown platform for unrecognized URLs', () => {
      const result = parseRepositoryUrl('https://example.com/owner/repo');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'unknown',
        owner: '',
        repo: '',
        url: 'https://example.com/owner/repo',
      });
    });

    it('should return unknown platform for invalid URLs', () => {
      const result = parseRepositoryUrl('not-a-valid-url');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'unknown',
        owner: '',
        repo: '',
        url: 'not-a-valid-url',
      });
    });

    it('should handle repository names with hyphens and underscores', () => {
      const result = parseRepositoryUrl('https://github.com/my-org/my_repo-name');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'github',
        owner: 'my-org',
        repo: 'my_repo-name',
        url: 'https://github.com/my-org/my_repo-name',
      });
    });

    it('should handle owner names with hyphens and underscores', () => {
      const result = parseRepositoryUrl('https://github.com/my_org-name/repo');
      
      expect(result).toEqual<RepositoryInfo>({
        platform: 'github',
        owner: 'my_org-name',
        repo: 'repo',
        url: 'https://github.com/my_org-name/repo',
      });
    });
  });
});
