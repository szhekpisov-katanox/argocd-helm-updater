# ArgoCD Helm Updater - Manual Testing Guide

> **Version**: 1.0.0  
> **Last Updated**: 2024  
> **Purpose**: Comprehensive guide for manually testing the ArgoCD Helm Updater action in real repositories

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Testing Checklist](#testing-checklist)
4. [Test Scenarios](#test-scenarios)
5. [Test Manifest Examples](#test-manifest-examples)
6. [Expected Outcomes](#expected-outcomes)
7. [Troubleshooting Guide](#troubleshooting-guide)
8. [Test Report Template](#test-report-template)

---

## Overview

This guide provides a structured approach to manually testing the ArgoCD Helm Updater GitHub Action. It covers:

- **Various ArgoCD manifest structures** (Application, ApplicationSet, multi-source)
- **Different Helm repositories** (Bitnami, Artifact Hub, custom registries)
- **OCI registries** (Docker Hub, GHCR, AWS ECR)
- **Pull request creation and updates** in GitHub UI
- **Edge cases and error handling**

### Testing Philosophy

Manual testing validates that the action works correctly in real-world scenarios that may not be fully covered by automated tests. Focus on:

✅ **Integration points** - GitHub API, Helm repositories, OCI registries  
✅ **User experience** - PR quality, error messages, documentation  
✅ **Edge cases** - Unusual manifest structures, network issues, authentication  
✅ **Performance** - Execution time, API rate limits, resource usage

---

## Prerequisites

### Required Setup


Before starting manual testing, ensure you have:

#### 1. Test Repository

- [ ] GitHub repository with write access
- [ ] Branch protection rules configured (optional, for testing auto-merge)
- [ ] GitHub Actions enabled
- [ ] Sufficient API rate limits (check at https://api.github.com/rate_limit)

#### 2. Authentication Credentials

- [ ] GitHub Personal Access Token with `repo` and `workflow` scopes
- [ ] Helm repository credentials (if testing private registries)
- [ ] OCI registry credentials (Docker Hub, GHCR, etc.)

#### 3. Test Environment

- [ ] Git client installed locally
- [ ] `kubectl` and `argocd` CLI (optional, for validating manifests)
- [ ] `helm` CLI (for manual version verification)
- [ ] Text editor or IDE for reviewing PRs

#### 4. Action Setup

- [ ] Action built and available (either locally or published)
- [ ] Workflow file configured in `.github/workflows/`
- [ ] Secrets configured in repository settings

### Recommended Test Repository Structure

```
test-repo/
├── .github/
│   └── workflows/
│       └── argocd-helm-updater.yml
├── apps/
│   ├── production/
│   │   ├── nginx-app.yaml
│   │   └── postgres-app.yaml
│   ├── staging/
│   │   └── redis-app.yaml
│   └── dev/
│       └── test-app.yaml
├── infrastructure/
│   ├── monitoring/
│   │   └── prometheus-appset.yaml
│   └── ingress/
│       └── nginx-ingress.yaml
└── .argocd-updater.yml (optional)
```

---

## Testing Checklist

Use this checklist to track your testing progress. Check off each item as you complete it.

### Core Functionality

- [ ] **TC-001**: Action discovers ArgoCD Application manifests
- [ ] **TC-002**: Action discovers ArgoCD ApplicationSet manifests
- [ ] **TC-003**: Action parses multi-document YAML files
- [ ] **TC-004**: Action extracts Helm chart dependencies correctly
- [ ] **TC-005**: Action queries Helm repositories for versions
- [ ] **TC-006**: Action queries OCI registries for versions
- [ ] **TC-007**: Action detects available updates
- [ ] **TC-008**: Action creates pull requests with updates
- [ ] **TC-009**: Action updates existing PRs instead of creating duplicates
- [ ] **TC-010**: Action preserves YAML formatting and comments

### Manifest Structures

- [ ] **TC-011**: Single-source Application with Helm chart
- [ ] **TC-012**: Multi-source Application with multiple Helm charts
- [ ] **TC-013**: ApplicationSet with List generator
- [ ] **TC-014**: ApplicationSet with Git generator
- [ ] **TC-015**: ApplicationSet with Matrix generator
- [ ] **TC-016**: Nested ApplicationSets
- [ ] **TC-017**: Applications with inline Helm values

### Repository Types


- [ ] **TC-018**: Bitnami Helm repository (https://charts.bitnami.com/bitnami)
- [ ] **TC-019**: Artifact Hub charts
- [ ] **TC-020**: Custom private Helm repository
- [ ] **TC-021**: OCI registry - Docker Hub (oci://registry-1.docker.io)
- [ ] **TC-022**: OCI registry - GitHub Container Registry (oci://ghcr.io)
- [ ] **TC-023**: OCI registry - AWS ECR
- [ ] **TC-024**: OCI registry - Azure Container Registry
- [ ] **TC-025**: Mixed repository types in single run

### Update Strategies

- [ ] **TC-026**: Update strategy: `all` (allow all updates)
- [ ] **TC-027**: Update strategy: `major` (major versions only)
- [ ] **TC-028**: Update strategy: `minor` (minor and patch)
- [ ] **TC-029**: Update strategy: `patch` (patch only)
- [ ] **TC-030**: Version constraints respected (e.g., `^1.2.0`)

### PR Strategies

- [ ] **TC-031**: PR strategy: `single` (one PR for all updates)
- [ ] **TC-032**: PR strategy: `per-chart` (one PR per chart)
- [ ] **TC-033**: PR strategy: `per-manifest` (one PR per file)
- [ ] **TC-034**: PR labels applied correctly
- [ ] **TC-035**: PR assignees set correctly
- [ ] **TC-036**: PR reviewers requested correctly

### Advanced Features

- [ ] **TC-037**: Dependency grouping works correctly
- [ ] **TC-038**: Ignore rules prevent unwanted updates
- [ ] **TC-039**: Auto-merge enabled for patch updates
- [ ] **TC-040**: Open PR limit enforced
- [ ] **TC-041**: Rebase strategy updates PRs automatically
- [ ] **TC-042**: Commit message conventions followed
- [ ] **TC-043**: External configuration file loaded

### Error Handling

- [ ] **TC-044**: Invalid YAML logged as warning, processing continues
- [ ] **TC-045**: Unreachable repository logged, other charts processed
- [ ] **TC-046**: Authentication failure provides clear error message
- [ ] **TC-047**: Invalid configuration fails with helpful message
- [ ] **TC-048**: Network timeout handled gracefully
- [ ] **TC-049**: Rate limiting handled with backoff

### Performance & Limits

- [ ] **TC-050**: Action completes within 5 minutes for typical repo
- [ ] **TC-051**: Repository index caching reduces API calls
- [ ] **TC-052**: GitHub API rate limits not exceeded
- [ ] **TC-053**: Dry-run mode works without creating PRs

---

## Test Scenarios

### Scenario 1: Basic Application with Bitnami Chart

**Objective**: Verify the action can detect and update a simple ArgoCD Application using a Bitnami Helm chart.

**Setup**:
1. Create an ArgoCD Application manifest referencing an outdated Bitnami chart
2. Configure the action with default settings
3. Run the action

**Steps**:
1. Create `apps/nginx-app.yaml` with nginx chart version `15.0.0`
2. Commit and push to repository
3. Trigger the workflow manually or via schedule
4. Wait for action to complete

**Expected Results**:
- Action discovers the manifest
- Detects nginx chart is outdated
- Creates a PR with the latest version
- PR includes chart name, old version, new version
- PR has correct labels and formatting

**Validation**:
```bash
# Check PR was created
gh pr list --label "argocd,helm"

# Review PR content
gh pr view <PR_NUMBER>

# Verify manifest was updated correctly
gh pr diff <PR_NUMBER>
```

---

### Scenario 2: ApplicationSet with Multiple Environments

**Objective**: Test ApplicationSet support with templated chart versions across multiple environments.

**Setup**:

1. Create an ApplicationSet with List generator for prod/staging/dev
2. Use same chart version in template
3. Run the action

**Steps**:
1. Create `infrastructure/monitoring/prometheus-appset.yaml`
2. Set prometheus chart to an older version
3. Trigger workflow
4. Verify PR updates the template correctly

**Expected Results**:
- ApplicationSet template is updated
- Version change applies to all generated Applications
- YAML structure and generators preserved
- Comments in ApplicationSet maintained

---

### Scenario 3: OCI Registry with GitHub Container Registry

**Objective**: Verify OCI registry support using GHCR.

**Setup**:
1. Create Application using `oci://ghcr.io/` chart reference
2. Configure registry authentication
3. Run the action

**Steps**:
1. Create manifest with OCI chart reference
2. Add GHCR credentials to secrets
3. Configure `registry-credentials` in workflow
4. Run action

**Expected Results**:
- Action authenticates to GHCR successfully
- Fetches available tags from OCI registry
- Detects updates correctly
- Creates PR with OCI chart update

**Validation**:
```bash
# Manually verify OCI tags
helm show chart oci://ghcr.io/owner/chart --version latest

# Compare with PR changes
gh pr diff <PR_NUMBER>
```

---

### Scenario 4: Mixed Repository Types

**Objective**: Test action with multiple chart sources in a single run.

**Setup**:
1. Create manifests using different repository types:
   - Bitnami Helm repo
   - OCI registry (Docker Hub)
   - Custom private registry
2. Run action

**Expected Results**:
- All repository types queried successfully
- Updates detected across all sources
- Single PR created (if using `pr-strategy: single`)
- PR body groups updates by repository type

---

### Scenario 5: Update Strategy - Minor Only

**Objective**: Verify update strategy filtering works correctly.

**Setup**:
1. Create manifests with charts that have major, minor, and patch updates available
2. Configure `update-strategy: minor`
3. Run action

**Expected Results**:
- Major version updates ignored
- Minor and patch updates included
- PR description explains update strategy
- No PRs created for charts with only major updates

**Test Matrix**:

| Current Version | Available Versions | Strategy | Expected Update |
|----------------|-------------------|----------|-----------------|
| 1.0.0 | 1.0.1, 1.1.0, 2.0.0 | minor | 1.1.0 |
| 1.0.0 | 1.0.1, 1.1.0, 2.0.0 | patch | 1.0.1 |
| 1.0.0 | 1.0.1, 1.1.0, 2.0.0 | major | 2.0.0 |
| 1.0.0 | 1.0.1, 1.1.0, 2.0.0 | all | 2.0.0 |

---

### Scenario 6: Dependency Grouping

**Objective**: Test grouping related charts into single PR.

**Setup**:
1. Create multiple manifests with monitoring stack charts (prometheus, grafana, loki)
2. Configure grouping in `.argocd-updater.yml`
3. Run action

**Configuration**:
```yaml
groups:
  monitoring-stack:
    patterns:
      - prometheus
      - grafana
      - loki
    updateTypes:
      - minor
      - patch
```

**Expected Results**:
- All monitoring charts grouped into one PR
- PR title indicates group name
- PR body lists all charts in group
- Other charts not in group get separate PRs

---

### Scenario 7: Ignore Rules

**Objective**: Verify ignore rules prevent unwanted updates.

**Setup**:

1. Create manifests with charts that have updates available
2. Configure ignore rules for specific charts/versions
3. Run action

**Configuration**:
```yaml
ignore:
  - dependencyName: postgresql
    updateTypes: [major]
  - dependencyName: nginx
    versions: ["16.x"]
```

**Expected Results**:
- PostgreSQL major updates not included in PR
- Nginx 16.x versions skipped
- Other updates processed normally
- Action logs explain why updates were ignored

---

### Scenario 8: Auto-Merge for Patch Updates

**Objective**: Test auto-merge functionality for low-risk updates.

**Setup**:
1. Configure branch protection with auto-merge enabled
2. Set `auto-merge-enabled: true` and `auto-merge-update-types: patch`
3. Create manifest with chart needing patch update
4. Run action

**Expected Results**:
- PR created with patch update
- Auto-merge label applied
- PR automatically merges after CI passes (if configured)
- Major/minor updates do not auto-merge

**Prerequisites**:
- Branch protection rules configured
- Required status checks defined
- Auto-merge enabled in repository settings

---

### Scenario 9: PR Update (Not Duplicate)

**Objective**: Verify action updates existing PR instead of creating duplicate.

**Setup**:
1. Run action and create initial PR
2. Make no changes to PR
3. Run action again
4. Verify PR is updated, not duplicated

**Expected Results**:
- No duplicate PR created
- Existing PR branch updated with latest changes
- PR description updated if needed
- PR comments preserved

---

### Scenario 10: Error Handling - Invalid YAML

**Objective**: Test graceful handling of invalid YAML files.

**Setup**:
1. Create valid ArgoCD manifests
2. Add a file with invalid YAML syntax
3. Run action

**Expected Results**:
- Action logs warning about invalid YAML
- Includes file path in warning
- Continues processing other valid files
- Creates PRs for valid manifests
- Action completes successfully (not failed)

---

### Scenario 11: Authentication Failure

**Objective**: Verify clear error messages for authentication issues.

**Setup**:
1. Create manifest with private registry chart
2. Provide invalid credentials
3. Run action

**Expected Results**:
- Action fails with clear error message
- Error indicates authentication failure
- Includes registry URL in error
- Provides guidance on fixing credentials
- Other charts (public repos) still processed

---

### Scenario 12: Dry-Run Mode

**Objective**: Test dry-run mode reports updates without creating PRs.

**Setup**:
1. Configure `dry-run: true`
2. Create manifests with outdated charts
3. Run action

**Expected Results**:
- Action detects all updates
- Logs all changes that would be made
- No branches created
- No PRs created
- Action output includes update summary

---

## Test Manifest Examples

### Example 1: Basic Application (Bitnami)

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.0.0  # Intentionally outdated
    helm:
      releaseName: nginx
      values: |
        replicaCount: 3
        service:
          type: LoadBalancer
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

**Test**: Update to latest nginx version (e.g., 15.14.0)

---

### Example 2: Multi-Source Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: multi-source-app
  namespace: argocd
spec:
  project: default
  sources:
    - repoURL: https://charts.bitnami.com/bitnami
      chart: postgresql
      targetRevision: 12.0.0  # Test update
      helm:
        releaseName: postgres
    - repoURL: https://charts.bitnami.com/bitnami
      chart: redis
      targetRevision: 17.0.0  # Test update
      helm:
        releaseName: redis
  destination:
    server: https://kubernetes.default.svc
    namespace: database
```

**Test**: Both charts should be updated in single PR

---

### Example 3: ApplicationSet with List Generator

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: prometheus-environments
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - cluster: production
            namespace: monitoring
          - cluster: staging
            namespace: monitoring
          - cluster: development
            namespace: monitoring
  template:
    metadata:
      name: '{{cluster}}-prometheus'
    spec:
      project: default
      source:
        repoURL: https://prometheus-community.github.io/helm-charts
        chart: prometheus
        targetRevision: 23.0.0  # Test update
        helm:
          releaseName: prometheus
      destination:
        server: 'https://{{cluster}}.example.com'
        namespace: '{{namespace}}'
      syncPolicy:
        automated:
          prune: true
```

**Test**: Template targetRevision should be updated, affecting all environments

---

### Example 4: OCI Registry - Docker Hub

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: oci-chart-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: oci://registry-1.docker.io/bitnamicharts
    chart: nginx
    targetRevision: 15.0.0  # Test OCI update
    helm:
      releaseName: nginx-oci
  destination:
    server: https://kubernetes.default.svc
    namespace: default
```

**Test**: OCI registry tags should be fetched and update detected

---

### Example 5: OCI Registry - GitHub Container Registry

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ghcr-chart
  namespace: argocd
spec:
  project: default
  source:
    repoURL: oci://ghcr.io/myorg/mycharts
    chart: myapp
    targetRevision: 1.0.0  # Test GHCR update
    helm:
      releaseName: myapp
  destination:
    server: https://kubernetes.default.svc
    namespace: apps
```

**Test**: Requires authentication, tests registry-credentials configuration

---

### Example 6: ApplicationSet with Git Generator

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: cluster-apps
  namespace: argocd
spec:
  generators:
    - git:
        repoURL: https://github.com/myorg/cluster-config
        revision: HEAD
        directories:
          - path: clusters/*
  template:
    metadata:
      name: '{{path.basename}}-monitoring'
    spec:
      project: default
      source:
        repoURL: https://charts.bitnami.com/bitnami
        chart: grafana
        targetRevision: 9.0.0  # Test update
        helm:
          releaseName: grafana
      destination:
        server: '{{path.basename}}'
        namespace: monitoring
```

**Test**: Template chart version updated correctly

---

### Example 7: Multi-Document YAML File

```yaml
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-one
  namespace: argocd
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.0.0
  destination:
    server: https://kubernetes.default.svc
    namespace: app-one

---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-two
  namespace: argocd
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: postgresql
    targetRevision: 12.0.0
  destination:
    server: https://kubernetes.default.svc
    namespace: app-two

---
# This is a comment that should be preserved
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-three
  namespace: argocd
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: redis
    targetRevision: 17.0.0  # Inline comment to preserve
  destination:
    server: https://kubernetes.default.svc
    namespace: app-three
```

**Test**: All three applications updated, comments preserved

---

### Example 8: Application with Inline Helm Values

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: complex-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: postgresql
    targetRevision: 12.0.0  # Test update
    helm:
      releaseName: postgres-prod
      values: |
        # PostgreSQL Configuration
        auth:
          username: admin
          database: myapp
        primary:
          persistence:
            enabled: true
            size: 100Gi
          resources:
            requests:
              memory: 2Gi
              cpu: 1000m
            limits:
              memory: 4Gi
              cpu: 2000m
        metrics:
          enabled: true
          serviceMonitor:
            enabled: true
  destination:
    server: https://kubernetes.default.svc
    namespace: database
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

**Test**: Only targetRevision updated, all Helm values preserved

---

## Expected Outcomes

### Successful Update - Single Chart

**PR Title**:
```
chore(deps): update nginx chart to 15.14.0
```

**PR Body**:
```markdown
## Helm Chart Updates

This PR updates the following Helm charts:

### Updated Charts

| Chart | Repository | Old Version | New Version | Update Type |
|-------|-----------|-------------|-------------|-------------|
| nginx | https://charts.bitnami.com/bitnami | 15.0.0 | 15.14.0 | minor |

### Files Changed

- `apps/production/nginx-app.yaml`

### Release Notes

- [nginx 15.14.0 Release Notes](https://github.com/bitnami/charts/releases/tag/nginx-15.14.0)

---

*This PR was automatically created by [ArgoCD Helm Updater](https://github.com/your-org/argocd-helm-updater)*
```

**Files Changed**:
```diff
--- a/apps/production/nginx-app.yaml
+++ b/apps/production/nginx-app.yaml
@@ -8,7 +8,7 @@ spec:
   source:
     repoURL: https://charts.bitnami.com/bitnami
     chart: nginx
-    targetRevision: 15.0.0
+    targetRevision: 15.14.0
     helm:
       releaseName: nginx
```

---

### Successful Update - Multiple Charts (Grouped)

**PR Title**:
```
chore(deps): update monitoring-stack charts
```

**PR Body**:
```markdown
## Helm Chart Updates - Monitoring Stack

This PR updates multiple charts in the **monitoring-stack** group:

### Updated Charts

| Chart | Repository | Old Version | New Version | Update Type |
|-------|-----------|-------------|-------------|-------------|
| prometheus | https://prometheus-community.github.io/helm-charts | 23.0.0 | 23.4.0 | minor |
| grafana | https://grafana.github.io/helm-charts | 7.0.0 | 7.3.0 | minor |
| loki | https://grafana.github.io/helm-charts | 5.0.0 | 5.2.0 | minor |

### Files Changed

- `infrastructure/monitoring/prometheus-appset.yaml`
- `infrastructure/monitoring/grafana-app.yaml`
- `infrastructure/monitoring/loki-app.yaml`

### Group Configuration

These charts are grouped together based on the `monitoring-stack` configuration.

---

*This PR was automatically created by [ArgoCD Helm Updater](https://github.com/your-org/argocd-helm-updater)*
```

---

### No Updates Available

**Action Output**:
```
✅ All Helm charts are up to date!

Scanned 15 manifest files
Found 23 Helm chart dependencies
No updates available
```

**GitHub Actions Summary**:
```markdown
# 📦 ArgoCD Helm Updater Results

## Summary
- **Manifests Scanned**: 15
- **Charts Found**: 23
- **Updates Available**: 0

✅ All charts are already at their latest versions!
```

---

### Partial Success (Some Repositories Unreachable)

**Action Output**:
```
⚠️  Warning: Failed to fetch versions for some repositories

✅ Successfully processed: 20/23 charts
❌ Failed repositories:
  - https://charts.example.com/private (Connection timeout)
  - oci://registry.internal.com (Authentication failed)

Created 3 pull requests for available updates.
```

**Expected Behavior**:
- PRs created for charts from reachable repositories
- Warnings logged for unreachable repositories
- Action completes with success status
- Summary includes both successes and failures

---

## Troubleshooting Guide

### Issue 1: No Manifests Discovered

**Symptoms**:
- Action completes but reports "0 manifests found"
- No PRs created

**Possible Causes**:
1. Incorrect `include-paths` configuration
2. No ArgoCD manifests in repository
3. Manifests in excluded paths

**Solutions**:

```yaml
# Check your include-paths configuration
include-paths: |
  **/*.yaml
  **/*.yml

# Enable debug logging
log-level: debug

# Verify manifests exist
find . -name "*.yaml" -exec grep -l "kind: Application" {} \;
```

**Validation**:
```bash
# Manually check for ArgoCD resources
grep -r "kind: Application" .
grep -r "kind: ApplicationSet" .
```

---

### Issue 2: Authentication Failures

**Symptoms**:
- Error: "Failed to authenticate to registry"
- 401 Unauthorized errors in logs

**Possible Causes**:
1. Invalid credentials
2. Expired tokens
3. Incorrect registry URL format
4. Missing credentials for private registry

**Solutions**:

```yaml
# Verify credentials format
registry-credentials: |
  [
    {
      "registry": "https://charts.example.com",  # Must match exactly
      "username": "${{ secrets.HELM_USERNAME }}",
      "password": "${{ secrets.HELM_PASSWORD }}"
    }
  ]

# For OCI registries, use oci:// prefix
registry-credentials: |
  [
    {
      "registry": "oci://ghcr.io",
      "username": "${{ github.actor }}",
      "password": "${{ secrets.GITHUB_TOKEN }}"
    }
  ]
```

**Validation**:
```bash
# Test credentials manually
helm repo add test-repo https://charts.example.com \
  --username $USERNAME \
  --password $PASSWORD

# For OCI
echo $PASSWORD | helm registry login ghcr.io --username $USERNAME --password-stdin
```

---

### Issue 3: No Updates Detected

**Symptoms**:
- Action runs successfully
- Reports "No updates available"
- But you know updates exist

**Possible Causes**:
1. Charts already at latest version
2. Update strategy too restrictive
3. Ignore rules blocking updates
4. Version constraints preventing updates

**Solutions**:

```yaml
# Try more permissive update strategy
update-strategy: all  # Instead of 'patch' or 'minor'

# Check ignore rules
ignore: []  # Temporarily disable to test

# Enable debug logging
log-level: debug
```

**Validation**:
```bash
# Manually check for updates
helm search repo bitnami/nginx --versions | head -5

# Compare with current version in manifest
grep targetRevision apps/nginx-app.yaml
```

---

### Issue 4: PRs Not Created

**Symptoms**:
- Updates detected
- No PRs appear in GitHub

**Possible Causes**:
1. Insufficient GitHub token permissions
2. Branch protection preventing PR creation
3. Open PR limit reached
4. Dry-run mode enabled

**Solutions**:

```yaml
# Verify token permissions
permissions:
  contents: write
  pull-requests: write

# Check dry-run setting
dry-run: false

# Check PR limit
open-pull-requests-limit: 10  # Increase if needed
```

**Validation**:
```bash
# Check existing PRs
gh pr list --label "argocd,helm"

# Verify token scopes
gh auth status
```

---

### Issue 5: YAML Formatting Lost

**Symptoms**:
- PRs created successfully
- YAML formatting changed
- Comments removed

**Possible Causes**:
1. Bug in YAML preservation logic
2. Complex YAML structures not handled

**Solutions**:
- Report issue with example manifest
- Check action version for known issues
- Review PR diff carefully before merging

**Workaround**:
```bash
# Manually fix formatting after merge
prettier --write apps/**/*.yaml
```

---

### Issue 6: Rate Limiting

**Symptoms**:
- Error: "API rate limit exceeded"
- 403 Forbidden errors

**Possible Causes**:
1. Too many API calls in short time
2. Shared rate limit with other workflows
3. Large repository with many charts

**Solutions**:

```yaml
# Use authenticated requests (higher rate limit)
github-token: ${{ secrets.GITHUB_TOKEN }}

# Reduce frequency of runs
schedule:
  - cron: '0 0 * * 1'  # Weekly instead of daily

# Enable caching
# (automatically enabled, but verify in logs)
```

**Validation**:
```bash
# Check current rate limit
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/rate_limit
```

---

### Issue 7: OCI Registry Tags Not Found

**Symptoms**:
- Error: "Failed to fetch OCI tags"
- No updates for OCI charts

**Possible Causes**:
1. Incorrect OCI URL format
2. Registry doesn't support OCI Distribution API
3. Authentication required but not provided

**Solutions**:

```yaml
# Verify OCI URL format
repoURL: oci://registry-1.docker.io/bitnamicharts  # Correct
repoURL: oci://registry-1.docker.io/bitnami/nginx  # Wrong (includes chart name)

# Add authentication
registry-credentials: |
  [
    {
      "registry": "oci://registry-1.docker.io",
      "username": "${{ secrets.DOCKER_USERNAME }}",
      "password": "${{ secrets.DOCKER_PASSWORD }}"
    }
  ]
```

**Validation**:
```bash
# Test OCI registry access
helm show chart oci://registry-1.docker.io/bitnamicharts/nginx --version 15.14.0
```

---

### Issue 8: Action Timeout

**Symptoms**:
- Action runs for long time
- Eventually times out
- Incomplete results

**Possible Causes**:
1. Too many charts to process
2. Slow network connections
3. Large repository indexes

**Solutions**:

```yaml
# Increase timeout
timeout-minutes: 30  # Default is usually 10-15

# Reduce scope
include-paths: |
  apps/production/**/*.yaml  # Only production

# Process in batches
# Run separate workflows for different directories
```

---

## Test Report Template

Use this template to document your testing results.

```markdown
# ArgoCD Helm Updater - Manual Test Report

**Date**: YYYY-MM-DD
**Tester**: Your Name
**Action Version**: v1.0.0
**Test Environment**: GitHub Actions / Local

## Test Summary

| Metric | Value |
|--------|-------|
| Total Test Cases | 53 |
| Passed | XX |
| Failed | XX |
| Skipped | XX |
| Pass Rate | XX% |

## Test Environment

- **Repository**: https://github.com/org/test-repo
- **Runner**: ubuntu-latest
- **Node Version**: 20.x
- **Action Reference**: your-org/argocd-helm-updater@v1

## Test Results by Category

### Core Functionality (TC-001 to TC-010)

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC-001: Discover Applications | ✅ Pass | Found 5 Applications |
| TC-002: Discover ApplicationSets | ✅ Pass | Found 2 ApplicationSets |
| TC-003: Multi-document YAML | ✅ Pass | Parsed 3 documents correctly |
| TC-004: Extract dependencies | ✅ Pass | Extracted 12 charts |
| TC-005: Query Helm repos | ✅ Pass | Bitnami repo queried successfully |
| TC-006: Query OCI registries | ✅ Pass | GHCR tags fetched |
| TC-007: Detect updates | ✅ Pass | Found 4 updates |
| TC-008: Create PRs | ✅ Pass | PR #123 created |
| TC-009: Update existing PRs | ✅ Pass | PR #123 updated, no duplicate |
| TC-010: Preserve YAML | ✅ Pass | Comments and formatting preserved |

### Manifest Structures (TC-011 to TC-017)

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC-011: Single-source App | ✅ Pass | |
| TC-012: Multi-source App | ✅ Pass | Both sources updated |
| TC-013: List generator | ✅ Pass | Template updated correctly |
| TC-014: Git generator | ⏭️ Skip | Not applicable to test repo |
| TC-015: Matrix generator | ⏭️ Skip | Not applicable to test repo |
| TC-016: Nested ApplicationSets | ⏭️ Skip | Not tested |
| TC-017: Inline Helm values | ✅ Pass | Values preserved |

### Repository Types (TC-018 to TC-025)

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC-018: Bitnami repo | ✅ Pass | |
| TC-019: Artifact Hub | ⏭️ Skip | No charts from Artifact Hub |
| TC-020: Private repo | ✅ Pass | Authentication worked |
| TC-021: Docker Hub OCI | ✅ Pass | |
| TC-022: GHCR OCI | ✅ Pass | |
| TC-023: AWS ECR | ⏭️ Skip | No AWS access |
| TC-024: Azure ACR | ⏭️ Skip | No Azure access |
| TC-025: Mixed types | ✅ Pass | All types in single run |

### Update Strategies (TC-026 to TC-030)

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC-026: Strategy 'all' | ✅ Pass | |
| TC-027: Strategy 'major' | ✅ Pass | |
| TC-028: Strategy 'minor' | ✅ Pass | |
| TC-029: Strategy 'patch' | ✅ Pass | |
| TC-030: Version constraints | ✅ Pass | Constraints respected |

### PR Strategies (TC-031 to TC-036)

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC-031: Single PR | ✅ Pass | |
| TC-032: Per-chart PR | ✅ Pass | |
| TC-033: Per-manifest PR | ✅ Pass | |
| TC-034: PR labels | ✅ Pass | |
| TC-035: PR assignees | ✅ Pass | |
| TC-036: PR reviewers | ✅ Pass | |

### Advanced Features (TC-037 to TC-043)

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC-037: Grouping | ✅ Pass | |
| TC-038: Ignore rules | ✅ Pass | |
| TC-039: Auto-merge | ⏭️ Skip | Branch protection not configured |
| TC-040: PR limit | ✅ Pass | |
| TC-041: Rebase strategy | ✅ Pass | |
| TC-042: Commit conventions | ✅ Pass | |
| TC-043: External config | ✅ Pass | |

### Error Handling (TC-044 to TC-049)

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC-044: Invalid YAML | ✅ Pass | Warning logged, continued |
| TC-045: Unreachable repo | ✅ Pass | Error logged, continued |
| TC-046: Auth failure | ✅ Pass | Clear error message |
| TC-047: Invalid config | ✅ Pass | Helpful error message |
| TC-048: Network timeout | ⏭️ Skip | Difficult to reproduce |
| TC-049: Rate limiting | ⏭️ Skip | Not encountered |

### Performance (TC-050 to TC-053)

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC-050: Completes < 5 min | ✅ Pass | Completed in 2m 34s |
| TC-051: Caching works | ✅ Pass | Verified in logs |
| TC-052: Rate limits OK | ✅ Pass | No rate limit errors |
| TC-053: Dry-run mode | ✅ Pass | No PRs created |

## Issues Found

### Issue 1: [Brief Description]

**Severity**: Critical / High / Medium / Low
**Test Case**: TC-XXX
**Description**: Detailed description of the issue
**Steps to Reproduce**:
1. Step 1
2. Step 2
3. Step 3

**Expected**: What should happen
**Actual**: What actually happened
**Workaround**: If any
**Status**: Open / Fixed / Won't Fix

### Issue 2: [Brief Description]

...

## Performance Metrics

| Metric | Value |
|--------|-------|
| Total Execution Time | 2m 34s |
| Manifests Scanned | 15 |
| Charts Discovered | 23 |
| Updates Detected | 4 |
| PRs Created | 1 |
| GitHub API Calls | 47 |
| Rate Limit Remaining | 4953/5000 |

## Recommendations

1. **Recommendation 1**: Description and rationale
2. **Recommendation 2**: Description and rationale
3. **Recommendation 3**: Description and rationale

## Conclusion

**Overall Assessment**: Pass / Pass with Issues / Fail

**Summary**: Brief summary of testing results and readiness for release.

**Sign-off**:
- Tester: [Name] - [Date]
- Reviewer: [Name] - [Date]
```

---

## Quick Reference

### Useful Commands

```bash
# Trigger workflow manually
gh workflow run argocd-helm-updater.yml

# Watch workflow run
gh run watch

# List recent runs
gh run list --workflow=argocd-helm-updater.yml

# View run logs
gh run view <RUN_ID> --log

# List PRs created by action
gh pr list --label "argocd,helm"

# View PR details
gh pr view <PR_NUMBER>

# Check PR diff
gh pr diff <PR_NUMBER>

# Merge PR
gh pr merge <PR_NUMBER> --squash

# Check rate limit
gh api rate_limit

# Validate ArgoCD manifest
argocd app validate apps/nginx-app.yaml

# Test Helm repository access
helm repo add bitnami https://charts.bitnami.com/bitnami
helm search repo bitnami/nginx --versions

# Test OCI registry access
helm show chart oci://ghcr.io/owner/chart --version 1.0.0
```

### Configuration Snippets

```yaml
# Minimal configuration
- uses: your-org/argocd-helm-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}

# Production configuration
- uses: your-org/argocd-helm-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    update-strategy: minor
    pr-strategy: per-chart
    pr-labels: dependencies,argocd,helm,automated
    open-pull-requests-limit: 5

# Debug configuration
- uses: your-org/argocd-helm-updater@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    log-level: debug
    dry-run: true
```

---

## Additional Resources

- **Main Documentation**: [README.md](../README.md)
- **Action Reference**: [action.yml](../action.yml)
- **Example Workflows**: [.github/workflows/examples/](.github/workflows/examples/)
- **Contributing Guide**: [CONTRIBUTING.md](../CONTRIBUTING.md)
- **Changelog**: [CHANGELOG.md](../CHANGELOG.md)

---

**Document Version**: 1.0.0  
**Last Updated**: 2024  
**Maintained by**: ArgoCD Helm Updater Team

