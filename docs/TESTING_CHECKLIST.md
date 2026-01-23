# ArgoCD Helm Updater - Testing Checklist

> **Quick Reference**: Use this checklist during manual testing sessions

## Pre-Testing Setup

- [ ] Test repository created with write access
- [ ] GitHub Actions enabled
- [ ] Secrets configured (GITHUB_TOKEN, registry credentials)
- [ ] Action workflow file created in `.github/workflows/`
- [ ] Test manifests prepared
- [ ] Git and GitHub CLI installed locally

---

## Core Functionality Tests

### Manifest Discovery
- [ ] TC-001: Discovers ArgoCD Application manifests
- [ ] TC-002: Discovers ArgoCD ApplicationSet manifests
- [ ] TC-003: Parses multi-document YAML files correctly
- [ ] TC-004: Handles invalid YAML gracefully (warning, continues)

### Dependency Extraction
- [ ] TC-005: Extracts chart name and version from Application
- [ ] TC-006: Extracts from ApplicationSet templates
- [ ] TC-007: Handles multi-source Applications
- [ ] TC-008: Parses OCI registry URLs correctly
- [ ] TC-009: Parses traditional Helm repo URLs correctly

### Version Resolution
- [ ] TC-010: Queries Bitnami Helm repository
- [ ] TC-011: Queries OCI registry (Docker Hub)
- [ ] TC-012: Queries OCI registry (GHCR)
- [ ] TC-013: Handles private registry authentication
- [ ] TC-014: Caches repository indexes (check logs)
- [ ] TC-015: Handles unreachable repositories gracefully

### Update Detection
- [ ] TC-016: Detects when updates are available
- [ ] TC-017: Respects update strategy (major/minor/patch)
- [ ] TC-018: No updates when already at latest version
- [ ] TC-019: Respects version constraints (^, ~, etc.)

### File Updates
- [ ] TC-020: Updates targetRevision field correctly
- [ ] TC-021: Preserves YAML formatting
- [ ] TC-022: Preserves comments in YAML
- [ ] TC-023: Updates multiple charts in single file
- [ ] TC-024: Updates charts across multiple files

### Pull Request Creation
- [ ] TC-025: Creates PR with correct title
- [ ] TC-026: PR body includes chart details (old/new versions)
- [ ] TC-027: PR body includes release notes links
- [ ] TC-028: Applies configured labels
- [ ] TC-029: Sets assignees correctly
- [ ] TC-030: Requests reviewers correctly
- [ ] TC-031: Updates existing PR instead of creating duplicate
- [ ] TC-032: Branch naming follows convention

---

## Manifest Structure Tests

- [ ] TC-033: Single-source Application
- [ ] TC-034: Multi-source Application (multiple charts)
- [ ] TC-035: ApplicationSet with List generator
- [ ] TC-036: ApplicationSet with Git generator
- [ ] TC-037: ApplicationSet with Matrix generator
- [ ] TC-038: Application with inline Helm values (preserved)
- [ ] TC-039: Nested ApplicationSets

---

## Repository Type Tests

- [ ] TC-040: Bitnami Helm repository
- [ ] TC-041: Artifact Hub charts
- [ ] TC-042: Custom private Helm repository
- [ ] TC-043: OCI - Docker Hub (oci://registry-1.docker.io)
- [ ] TC-044: OCI - GHCR (oci://ghcr.io)
- [ ] TC-045: OCI - AWS ECR
- [ ] TC-046: OCI - Azure ACR
- [ ] TC-047: Mixed repository types in single run

---

## Update Strategy Tests

- [ ] TC-048: Strategy `all` - allows all updates
- [ ] TC-049: Strategy `major` - allows major updates
- [ ] TC-050: Strategy `minor` - allows minor and patch only
- [ ] TC-051: Strategy `patch` - allows patch only
- [ ] TC-052: Version constraints respected

---

## PR Strategy Tests

- [ ] TC-053: Strategy `single` - one PR for all updates
- [ ] TC-054: Strategy `per-chart` - one PR per chart
- [ ] TC-055: Strategy `per-manifest` - one PR per file

---

## Advanced Features

### Dependency Grouping
- [ ] TC-056: Charts grouped by pattern
- [ ] TC-057: Group name in PR title
- [ ] TC-058: All grouped charts in single PR
- [ ] TC-059: Non-grouped charts get separate PRs

### Ignore Rules
- [ ] TC-060: Specific chart ignored completely
- [ ] TC-061: Specific versions ignored
- [ ] TC-062: Update types ignored (e.g., major only)
- [ ] TC-063: Logs explain why updates ignored

### Auto-Merge
- [ ] TC-064: Auto-merge enabled for patch updates
- [ ] TC-065: Auto-merge label applied to PR
- [ ] TC-066: Major/minor updates not auto-merged
- [ ] TC-067: Requires CI pass (if configured)

### Rate Limiting
- [ ] TC-068: Open PR limit enforced
- [ ] TC-069: Logs when limit reached
- [ ] TC-070: Skipped updates logged

### Rebase Strategy
- [ ] TC-071: Existing PRs rebased when base changes
- [ ] TC-072: Rebase strategy can be disabled

### Commit Messages
- [ ] TC-073: Conventional commit format used
- [ ] TC-074: Prefix configurable (chore, feat, etc.)
- [ ] TC-075: Scope included when configured

### External Configuration
- [ ] TC-076: Loads `.argocd-updater.yml` file
- [ ] TC-077: External config overrides workflow inputs
- [ ] TC-078: Invalid config file fails with clear error

---

## Error Handling Tests

- [ ] TC-079: Invalid YAML - warning logged, continues
- [ ] TC-080: Unreachable repository - error logged, continues
- [ ] TC-081: Authentication failure - clear error message
- [ ] TC-082: Invalid configuration - fails with helpful message
- [ ] TC-083: Network timeout - handled gracefully
- [ ] TC-084: Rate limiting - backoff and retry
- [ ] TC-085: Missing required fields - clear error
- [ ] TC-086: Invalid glob patterns - fails with syntax error

---

## Performance Tests

- [ ] TC-087: Completes within 5 minutes (typical repo)
- [ ] TC-088: Repository index caching reduces API calls
- [ ] TC-089: GitHub API rate limits not exceeded
- [ ] TC-090: Memory usage reasonable (< 512 MB)

---

## Dry-Run Mode

- [ ] TC-091: Detects all updates
- [ ] TC-092: Logs all changes that would be made
- [ ] TC-093: No branches created
- [ ] TC-094: No PRs created
- [ ] TC-095: Output includes update summary

---

## GitHub UI Verification

- [ ] TC-096: PR appears in GitHub UI
- [ ] TC-097: PR title is descriptive
- [ ] TC-098: PR body is well-formatted
- [ ] TC-099: Labels applied correctly
- [ ] TC-100: Assignees and reviewers set
- [ ] TC-101: Files changed tab shows correct diffs
- [ ] TC-102: Commits tab shows commit message
- [ ] TC-103: Checks tab shows workflow status (if applicable)

---

## Integration Tests

- [ ] TC-104: Works with branch protection rules
- [ ] TC-105: Works with required status checks
- [ ] TC-106: Works with CODEOWNERS
- [ ] TC-107: Works with GitHub Actions workflows on PR
- [ ] TC-108: Works with scheduled workflows
- [ ] TC-109: Works with workflow_dispatch (manual trigger)

---

## Edge Cases

- [ ] TC-110: Empty repository (no manifests)
- [ ] TC-111: All charts already up to date
- [ ] TC-112: Chart not found in repository
- [ ] TC-113: Invalid chart version in manifest
- [ ] TC-114: Very large repository (100+ manifests)
- [ ] TC-115: Very large manifest file (> 1 MB)
- [ ] TC-116: Manifest with complex YAML anchors/aliases
- [ ] TC-117: Chart with pre-release version (1.0.0-alpha)
- [ ] TC-118: Chart with build metadata (1.0.0+build.123)

---

## Security Tests

- [ ] TC-119: Credentials not logged in output
- [ ] TC-120: Credentials not exposed in PR
- [ ] TC-121: Token permissions minimal (contents, pull-requests)
- [ ] TC-122: Private repository access works
- [ ] TC-123: No arbitrary code execution

---

## Compatibility Tests

- [ ] TC-124: Works on ubuntu-latest runner
- [ ] TC-125: Works on macos-latest runner (optional)
- [ ] TC-126: Works on windows-latest runner (optional)
- [ ] TC-127: Works with Node.js 20.x
- [ ] TC-128: Works with different ArgoCD versions

---

## Documentation Verification

- [ ] TC-129: README examples work as documented
- [ ] TC-130: action.yml inputs match documentation
- [ ] TC-131: Example workflows run successfully
- [ ] TC-132: Troubleshooting guide is accurate
- [ ] TC-133: Error messages match documentation

---

## Post-Testing Cleanup

- [ ] Test PRs closed or merged
- [ ] Test branches deleted
- [ ] Test repository cleaned up (optional)
- [ ] Test report completed
- [ ] Issues filed for bugs found
- [ ] Feedback provided to development team

---

## Quick Status Legend

- ✅ Pass - Test passed successfully
- ❌ Fail - Test failed, issue found
- ⏭️ Skip - Test skipped (not applicable or blocked)
- ⚠️ Warning - Test passed with minor issues
- 🔄 Retest - Test needs to be re-run

---

## Notes Section

Use this space for quick notes during testing:

```
[Date] [Time] - [Note]
Example: 2024-01-15 10:30 - TC-025 failed, PR title missing chart name

```

---

**Checklist Version**: 1.0.0  
**Last Updated**: 2024  
**Total Test Cases**: 133

