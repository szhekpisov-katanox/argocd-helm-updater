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
export declare function parseRepositoryUrl(url: string): RepositoryInfo;
//# sourceMappingURL=repository-parser.d.ts.map