/**
 * Repository URL parser for extracting platform, owner, and repo information
 */

import { RepositoryInfo } from '../types/changelog';

/**
 * Parses a repository URL and extracts platform, owner, and repo information
 * 
 * Supports:
 * - GitHub: https://github.com/owner/repo, git@github.com:owner/repo.git
 * - GitLab: https://gitlab.com/owner/repo, git@gitlab.com:owner/repo.git
 * - Bitbucket: https://bitbucket.org/owner/repo, git@bitbucket.org:owner/repo.git
 * 
 * @param url - Repository URL (HTTPS or SSH format)
 * @returns RepositoryInfo object with parsed information
 */
export function parseRepositoryUrl(url: string): RepositoryInfo {
  // Normalize the URL by trimming whitespace
  const normalizedUrl = url.trim();

  // Try to parse as HTTPS URL
  const httpsMatch = normalizedUrl.match(
    /^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/([^\/]+)\/([^\/\s#?]+)/i
  );

  if (httpsMatch) {
    const [, domain, owner, repo] = httpsMatch;
    const platform = getPlatformFromDomain(domain);
    const cleanRepo = cleanRepoName(repo);
    
    return {
      platform,
      owner,
      repo: cleanRepo,
      url: normalizedUrl,
    };
  }

  // Try to parse as SSH URL (git@domain:owner/repo.git)
  const sshMatch = normalizedUrl.match(
    /^git@(github\.com|gitlab\.com|bitbucket\.org):([^\/]+)\/(.+?)(?:\.git)?$/i
  );

  if (sshMatch) {
    const [, domain, owner, repo] = sshMatch;
    const platform = getPlatformFromDomain(domain);
    const cleanRepo = cleanRepoName(repo);
    
    return {
      platform,
      owner,
      repo: cleanRepo,
      url: normalizedUrl,
    };
  }

  // If no pattern matches, return unknown platform
  return {
    platform: 'unknown',
    owner: '',
    repo: '',
    url: normalizedUrl,
  };
}

/**
 * Determines the platform from a domain name
 * 
 * @param domain - Domain name (e.g., 'github.com', 'gitlab.com')
 * @returns Platform identifier
 */
function getPlatformFromDomain(domain: string): 'github' | 'gitlab' | 'bitbucket' | 'unknown' {
  const lowerDomain = domain.toLowerCase();
  
  if (lowerDomain.includes('github')) {
    return 'github';
  }
  if (lowerDomain.includes('gitlab')) {
    return 'gitlab';
  }
  if (lowerDomain.includes('bitbucket')) {
    return 'bitbucket';
  }
  
  return 'unknown';
}

/**
 * Cleans repository name by removing .git suffix and trailing slashes
 * 
 * @param repo - Raw repository name
 * @returns Cleaned repository name
 */
function cleanRepoName(repo: string): string {
  return repo
    .replace(/\.git$/i, '')  // Remove .git suffix
    .replace(/\/+$/, '')      // Remove trailing slashes
    .trim();
}
