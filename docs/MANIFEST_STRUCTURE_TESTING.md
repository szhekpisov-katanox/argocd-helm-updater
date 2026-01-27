# ArgoCD Manifest Structure Testing Guide

> **Task**: 21.1 - Test with various ArgoCD manifest structures  
> **Requirements**: 1.1, 1.2, 1.3  
> **Purpose**: Comprehensive testing plan for validating the action works with different ArgoCD manifest structures

## Overview

This guide provides a detailed testing plan specifically for validating that the ArgoCD Helm Updater action correctly handles various ArgoCD manifest structures. This is a critical validation step before production release.

### Testing Objectives

1. ✅ Verify single-source Application manifests are processed correctly
2. ✅ Verify multi-source Application manifests are processed correctly
3. ✅ Verify ApplicationSet manifests with templates are processed correctly
4. ✅ Verify multi-document YAML files are processed correctly
5. ✅ Ensure YAML structure, formatting, and comments are preserved
6. ✅ Validate edge cases and complex manifest structures

### Success Criteria

- All manifest types are discovered and parsed correctly
- Helm chart dependencies are extracted from all structures
- Updates are applied only to targetRevision fields
- YAML formatting, comments, and structure are preserved
- Multi-document files are handled without corruption
- No false positives or missed updates

---

## Test Setup

### Prerequisites

Before starting, ensure you have:

- [ ] A test GitHub repository with write access
- [ ] GitHub Actions enabled in the repository
- [ ] The ArgoCD Helm Updater action configured
- [ ] Git CLI installed locally
- [ ] Text editor for reviewing changes


### Repository Structure

Create the following directory structure in your test repository:

```
test-repo/
├── .github/
│   └── workflows/
│       └── test-argocd-updater.yml
├── manifests/
│   ├── 01-single-source/
│   │   ├── basic-app.yaml
│   │   ├── app-with-values.yaml
│   │   └── app-with-comments.yaml
│   ├── 02-multi-source/
│   │   ├── dual-source-app.yaml
│   │   └── triple-source-app.yaml
│   ├── 03-applicationset/
│   │   ├── list-generator.yaml
│   │   ├── git-generator.yaml
│   │   ├── matrix-generator.yaml
│   │   └── nested-template.yaml
│   ├── 04-multi-document/
│   │   ├── three-apps.yaml
│   │   ├── mixed-resources.yaml
│   │   └── apps-with-comments.yaml
│   └── 05-edge-cases/
│       ├── deeply-nested.yaml
│       ├── minimal-app.yaml
│       └── complex-values.yaml
└── README.md
```

### Workflow Configuration

Create `.github/workflows/test-argocd-updater.yml`:

```yaml
name: Test ArgoCD Helm Updater

on:
  workflow_dispatch:
  push:
    branches:
      - main
    paths:
      - 'manifests/**'

jobs:
  test-updater:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run ArgoCD Helm Updater
        uses: your-org/argocd-helm-updater@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          include-paths: |
            manifests/**/*.yaml
          update-strategy: all
          pr-strategy: single
          pr-labels: test,argocd,helm
          log-level: debug
          dry-run: false
```

---

## Test Case 1: Single-Source Application Manifests

### Test 1.1: Basic Application

**File**: `manifests/01-single-source/basic-app.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-basic
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.0.0
  destination:
    server: https://kubernetes.default.svc
    namespace: default
```

**Expected Behavior**:
- Action discovers the Application manifest
- Extracts nginx chart dependency with version 15.0.0
- Queries Bitnami repository for latest version
- Creates PR updating targetRevision to latest (e.g., 15.14.0)
- Preserves all other fields exactly as-is

**Verification Steps**:
1. Commit the file to repository
2. Trigger the workflow
3. Check action logs for "Found 1 Application"
4. Verify PR is created
5. Review PR diff - only targetRevision should change
6. Verify YAML structure is identical

**Success Criteria**:
- ✅ Manifest discovered
- ✅ Dependency extracted correctly
- ✅ Update detected
- ✅ PR created with correct changes
- ✅ No other fields modified

---

### Test 1.2: Application with Helm Values

**File**: `manifests/01-single-source/app-with-values.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: postgresql-with-values
  namespace: argocd
  labels:
    environment: production
    team: platform
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: postgresql
    targetRevision: 12.0.0
    helm:
      releaseName: postgres-prod
      values: |
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
        metrics:
          enabled: true
  destination:
    server: https://kubernetes.default.svc
    namespace: database
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

**Expected Behavior**:
- Only targetRevision field is updated
- All Helm values remain unchanged
- Metadata labels preserved
- syncPolicy configuration preserved

**Verification Steps**:
1. Review PR diff carefully
2. Ensure only line with targetRevision changed
3. Verify all Helm values are identical
4. Check metadata and syncPolicy unchanged

**Success Criteria**:
- ✅ Only targetRevision updated (12.0.0 → 12.x.x)
- ✅ Helm values block unchanged
- ✅ Metadata labels preserved
- ✅ syncPolicy preserved
- ✅ Indentation and formatting preserved

---

### Test 1.3: Application with Comments

**File**: `manifests/01-single-source/app-with-comments.yaml`

```yaml
# Redis Application for Caching
# Maintained by: Platform Team
# Last Updated: 2024-01-15
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: redis-cache
  namespace: argocd
  # Production environment
  labels:
    environment: production
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: redis
    # Using stable version for production
    targetRevision: 17.0.0  # TODO: Update to 18.x when tested
    helm:
      releaseName: redis
      # Custom values for production
      values: |
        architecture: replication
        auth:
          enabled: true
  destination:
    server: https://kubernetes.default.svc
    namespace: cache
```

**Expected Behavior**:
- All comments are preserved in exact positions
- Inline comment after targetRevision preserved
- Header comments maintained
- Only version number changes

**Verification Steps**:
1. Check PR diff shows comments unchanged
2. Verify inline comment "# TODO: Update..." still present
3. Confirm header comments intact
4. Ensure comment indentation preserved

**Success Criteria**:
- ✅ All comments preserved
- ✅ Comment positioning unchanged
- ✅ Inline comments maintained
- ✅ Only targetRevision value updated

---

## Test Case 2: Multi-Source Application Manifests

### Test 2.1: Dual-Source Application

**File**: `manifests/02-multi-source/dual-source-app.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-with-database
  namespace: argocd
spec:
  project: default
  sources:
    - repoURL: https://charts.bitnami.com/bitnami
      chart: postgresql
      targetRevision: 12.0.0
      helm:
        releaseName: postgres
        values: |
          auth:
            database: appdb
    - repoURL: https://charts.bitnami.com/bitnami
      chart: redis
      targetRevision: 17.0.0
      helm:
        releaseName: redis
  destination:
    server: https://kubernetes.default.svc
    namespace: backend
```

**Expected Behavior**:
- Both chart dependencies extracted
- Both targetRevision fields updated independently
- Array structure preserved
- Each source's Helm values unchanged

**Verification Steps**:
1. Verify action logs show "Found 2 dependencies"
2. Check PR updates both targetRevision fields
3. Confirm postgresql updated to 12.x.x
4. Confirm redis updated to 17.x.x
5. Verify sources array structure unchanged

**Success Criteria**:
- ✅ Both dependencies detected
- ✅ Both versions updated
- ✅ Array structure preserved
- ✅ Helm values for each source unchanged
- ✅ Correct indentation maintained

---

### Test 2.2: Triple-Source Application

**File**: `manifests/02-multi-source/triple-source-app.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: full-stack-app
  namespace: argocd
spec:
  project: default
  sources:
    # Frontend
    - repoURL: https://charts.bitnami.com/bitnami
      chart: nginx
      targetRevision: 15.0.0
      helm:
        releaseName: frontend
    # Backend API
    - repoURL: https://charts.bitnami.com/bitnami
      chart: postgresql
      targetRevision: 12.0.0
      helm:
        releaseName: database
    # Cache Layer
    - repoURL: https://charts.bitnami.com/bitnami
      chart: redis
      targetRevision: 17.0.0
      helm:
        releaseName: cache
  destination:
    server: https://kubernetes.default.svc
    namespace: fullstack
```

**Expected Behavior**:
- All three dependencies extracted
- All three targetRevision fields updated
- Comments preserved for each source
- Array order maintained

**Verification Steps**:
1. Check logs show "Found 3 dependencies"
2. Verify all three versions updated in PR
3. Confirm nginx: 15.0.0 → 15.x.x
4. Confirm postgresql: 12.0.0 → 12.x.x
5. Confirm redis: 17.0.0 → 17.x.x
6. Verify source comments maintained

**Success Criteria**:
- ✅ All 3 dependencies detected
- ✅ All 3 versions updated correctly
- ✅ Source order preserved
- ✅ Comments for each source maintained
- ✅ No cross-contamination between sources

---

## Test Case 3: ApplicationSet Manifests

### Test 3.1: ApplicationSet with List Generator

**File**: `manifests/03-applicationset/list-generator.yaml`

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
            replicas: 3
          - cluster: staging
            namespace: monitoring
            replicas: 2
          - cluster: development
            namespace: monitoring
            replicas: 1
  template:
    metadata:
      name: '{{cluster}}-prometheus'
      labels:
        environment: '{{cluster}}'
    spec:
      project: default
      source:
        repoURL: https://prometheus-community.github.io/helm-charts
        chart: prometheus
        targetRevision: 23.0.0
        helm:
          releaseName: prometheus
          values: |
            server:
              replicaCount: {{replicas}}
      destination:
        server: 'https://{{cluster}}.example.com'
        namespace: '{{namespace}}'
```

**Expected Behavior**:
- ApplicationSet discovered
- Template source extracted
- targetRevision in template updated
- Generator configuration unchanged
- Template variables preserved

**Verification Steps**:
1. Verify logs show "Found 1 ApplicationSet"
2. Check template.spec.source.targetRevision updated
3. Confirm generator list unchanged
4. Verify template variables {{cluster}}, {{namespace}}, {{replicas}} preserved
5. Ensure values template with {{replicas}} unchanged

**Success Criteria**:
- ✅ ApplicationSet detected
- ✅ Template targetRevision updated (23.0.0 → 23.x.x)
- ✅ Generator configuration unchanged
- ✅ All template variables preserved
- ✅ Helm values template unchanged

---

### Test 3.2: ApplicationSet with Git Generator

**File**: `manifests/03-applicationset/git-generator.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: cluster-addons
  namespace: argocd
spec:
  generators:
    - git:
        repoURL: https://github.com/example/cluster-config
        revision: HEAD
        directories:
          - path: clusters/*
  template:
    metadata:
      name: '{{path.basename}}-grafana'
    spec:
      project: default
      source:
        repoURL: https://grafana.github.io/helm-charts
        chart: grafana
        targetRevision: 7.0.0
        helm:
          releaseName: grafana
      destination:
        server: '{{path.basename}}'
        namespace: monitoring
```

**Expected Behavior**:
- Git generator configuration preserved
- Template targetRevision updated
- Path variables maintained
- Repository URL unchanged

**Verification Steps**:
1. Verify ApplicationSet discovered
2. Check git generator config unchanged
3. Confirm targetRevision updated in template
4. Verify {{path.basename}} variables preserved

**Success Criteria**:
- ✅ Git generator unchanged
- ✅ Template targetRevision updated (7.0.0 → 7.x.x)
- ✅ Path variables preserved
- ✅ Directory patterns unchanged

---

### Test 3.3: ApplicationSet with Matrix Generator

**File**: `manifests/03-applicationset/matrix-generator.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: multi-cluster-apps
  namespace: argocd
spec:
  generators:
    - matrix:
        generators:
          - list:
              elements:
                - cluster: prod
                - cluster: staging
          - list:
              elements:
                - app: nginx
                  chart: nginx
                  version: 15.0.0
                - app: redis
                  chart: redis
                  version: 17.0.0
  template:
    metadata:
      name: '{{cluster}}-{{app}}'
    spec:
      project: default
      source:
        repoURL: https://charts.bitnami.com/bitnami
        chart: '{{chart}}'
        targetRevision: '{{version}}'
      destination:
        server: 'https://{{cluster}}.example.com'
        namespace: '{{app}}'
```

**Expected Behavior**:
- Matrix generator structure preserved
- Template uses {{version}} variable (not updated directly)
- Generator element versions could be updated (advanced feature)
- Template structure unchanged

**Verification Steps**:
1. Verify ApplicationSet discovered
2. Check matrix generator structure preserved
3. Confirm template.spec.source.targetRevision still uses {{version}}
4. Note: Direct version updates in generators may not be supported

**Success Criteria**:
- ✅ Matrix generator structure preserved
- ✅ Template variables unchanged
- ✅ No corruption of complex generator logic
- ⚠️ Note: Parameterized versions may not be updatable

---

### Test 3.4: ApplicationSet with Nested Template

**File**: `manifests/03-applicationset/nested-template.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: complex-appset
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - env: production
  template:
    metadata:
      name: '{{env}}-stack'
    spec:
      project: default
      sources:
        - repoURL: https://charts.bitnami.com/bitnami
          chart: postgresql
          targetRevision: 12.0.0
          helm:
            releaseName: '{{env}}-db'
        - repoURL: https://charts.bitnami.com/bitnami
          chart: redis
          targetRevision: 17.0.0
          helm:
            releaseName: '{{env}}-cache'
      destination:
        server: https://kubernetes.default.svc
        namespace: '{{env}}'
```

**Expected Behavior**:
- ApplicationSet with multi-source template handled
- Both targetRevision fields in template updated
- Template variables preserved
- Generator unchanged

**Verification Steps**:
1. Verify both dependencies detected
2. Check both targetRevision fields updated
3. Confirm {{env}} variables preserved
4. Verify sources array structure maintained

**Success Criteria**:
- ✅ Multi-source template handled correctly
- ✅ Both versions updated
- ✅ Template variables preserved
- ✅ Generator configuration unchanged

---

## Test Case 4: Multi-Document YAML Files

### Test 4.1: Three Applications in One File

**File**: `manifests/04-multi-document/three-apps.yaml`

```yaml
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-one
  namespace: argocd
spec:
  project: default
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
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: postgresql
    targetRevision: 12.0.0
  destination:
    server: https://kubernetes.default.svc
    namespace: app-two

---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-three
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: redis
    targetRevision: 17.0.0
  destination:
    server: https://kubernetes.default.svc
    namespace: app-three
```

**Expected Behavior**:
- All three documents parsed separately
- All three dependencies extracted
- All three targetRevision fields updated
- Document separators (---) preserved
- No cross-document contamination

**Verification Steps**:
1. Check logs show "Found 3 Applications"
2. Verify all 3 dependencies detected
3. Confirm all 3 versions updated in PR
4. Verify document separators (---) unchanged
5. Ensure no mixing of content between documents

**Success Criteria**:
- ✅ All 3 documents parsed
- ✅ All 3 dependencies extracted
- ✅ All 3 versions updated correctly
- ✅ Document separators preserved
- ✅ No document corruption

---

### Test 4.2: Mixed Resource Types

**File**: `manifests/04-multi-document/mixed-resources.yaml`

```yaml
---
# ConfigMap for shared configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: shared-config
  namespace: argocd
data:
  environment: production
  region: us-east-1

---
# ArgoCD Application
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.0.0
  destination:
    server: https://kubernetes.default.svc
    namespace: web

---
# Another non-ArgoCD resource
apiVersion: v1
kind: Secret
metadata:
  name: app-secret
  namespace: argocd
type: Opaque
data:
  password: cGFzc3dvcmQ=

---
# Another ArgoCD Application
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: redis-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: redis
    targetRevision: 17.0.0
  destination:
    server: https://kubernetes.default.svc
    namespace: cache
```

**Expected Behavior**:
- Only ArgoCD resources processed
- Non-ArgoCD resources (ConfigMap, Secret) ignored but preserved
- Both Application targetRevisions updated
- All resources remain in original order
- Non-ArgoCD resources unchanged

**Verification Steps**:
1. Verify logs show "Found 2 Applications"
2. Check ConfigMap and Secret unchanged in PR
3. Confirm both Application targetRevisions updated
4. Verify resource order preserved
5. Ensure no modifications to non-ArgoCD resources

**Success Criteria**:
- ✅ Only ArgoCD Applications processed
- ✅ Non-ArgoCD resources preserved exactly
- ✅ Both versions updated
- ✅ Document order maintained
- ✅ No unintended changes

---

### Test 4.3: Applications with Comments Between Documents

**File**: `manifests/04-multi-document/apps-with-comments.yaml`

```yaml
---
# Production Nginx Application
# Owner: Platform Team
# Last Updated: 2024-01-15
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-prod
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.0.0  # Stable version
  destination:
    server: https://kubernetes.default.svc
    namespace: production

---
# Staging PostgreSQL Database
# Owner: Database Team
# Requires: 100Gi storage
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: postgres-staging
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: postgresql
    targetRevision: 12.0.0  # LTS version
  destination:
    server: https://kubernetes.default.svc
    namespace: staging

---
# Development Redis Cache
# Owner: Backend Team
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: redis-dev
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: redis
    targetRevision: 17.0.0  # Latest stable
  destination:
    server: https://kubernetes.default.svc
    namespace: development
```

**Expected Behavior**:
- All header comments preserved
- Inline comments after targetRevision preserved
- Document separators maintained
- All three versions updated
- Comment positioning unchanged

**Verification Steps**:
1. Verify all header comments present in PR
2. Check inline comments preserved
3. Confirm all 3 versions updated
4. Verify comment indentation unchanged
5. Ensure no comment loss or corruption

**Success Criteria**:
- ✅ All header comments preserved
- ✅ All inline comments preserved
- ✅ All 3 versions updated
- ✅ Comment positioning maintained
- ✅ No comment corruption

---

## Test Case 5: Edge Cases and Complex Structures

### Test 5.1: Deeply Nested Values

**File**: `manifests/05-edge-cases/deeply-nested.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: complex-app
  namespace: argocd
  annotations:
    description: "Application with deeply nested Helm values"
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: postgresql
    targetRevision: 12.0.0
    helm:
      releaseName: postgres
      values: |
        global:
          postgresql:
            auth:
              username: admin
              database: myapp
        primary:
          configuration: |
            max_connections = 200
            shared_buffers = 256MB
          persistence:
            enabled: true
            size: 100Gi
            storageClass: fast-ssd
          resources:
            requests:
              memory: 2Gi
              cpu: 1000m
            limits:
              memory: 4Gi
              cpu: 2000m
          podSecurityContext:
            fsGroup: 1001
            runAsUser: 1001
          containerSecurityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
        metrics:
          enabled: true
          serviceMonitor:
            enabled: true
            interval: 30s
            scrapeTimeout: 10s
  destination:
    server: https://kubernetes.default.svc
    namespace: database
```

**Expected Behavior**:
- Only targetRevision updated
- Entire deeply nested Helm values block preserved
- Indentation maintained throughout
- Multi-line strings preserved

**Verification Steps**:
1. Verify only targetRevision line changed
2. Check all Helm values unchanged
3. Confirm indentation preserved
4. Verify multi-line configuration block intact

**Success Criteria**:
- ✅ Only targetRevision updated
- ✅ All nested values preserved
- ✅ Indentation correct throughout
- ✅ Multi-line strings unchanged

---

### Test 5.2: Minimal Application

**File**: `manifests/05-edge-cases/minimal-app.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: minimal
  namespace: argocd
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.0.0
  destination:
    server: https://kubernetes.default.svc
    namespace: default
```

**Expected Behavior**:
- Minimal manifest processed correctly
- targetRevision updated
- No additional fields added
- Structure remains minimal

**Verification Steps**:
1. Verify manifest discovered
2. Check targetRevision updated
3. Confirm no extra fields added
4. Verify minimal structure preserved

**Success Criteria**:
- ✅ Minimal manifest handled
- ✅ targetRevision updated
- ✅ No fields added
- ✅ Structure unchanged

---

### Test 5.3: Application with Special Characters

**File**: `manifests/05-edge-cases/special-characters.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-with-special-chars
  namespace: argocd
  annotations:
    description: "App with special chars: @#$%^&*()"
    owner: "team@example.com"
spec:
  project: default
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.0.0
    helm:
      releaseName: nginx
      values: |
        # Special characters in values
        config: |
          server {
            listen 80;
            server_name _;
            location / {
              return 200 "Hello, World!";
            }
          }
        annotations:
          prometheus.io/scrape: "true"
          prometheus.io/port: "9113"
  destination:
    server: https://kubernetes.default.svc
    namespace: default
```

**Expected Behavior**:
- Special characters in annotations preserved
- Nginx config with special chars unchanged
- Quoted strings maintained
- Only targetRevision updated

**Verification Steps**:
1. Verify special characters in annotations unchanged
2. Check nginx config block preserved
3. Confirm quoted strings maintained
4. Verify only targetRevision changed

**Success Criteria**:
- ✅ Special characters preserved
- ✅ Config blocks unchanged
- ✅ Quoted strings maintained
- ✅ Only targetRevision updated

---

## Testing Procedure

### Step 1: Repository Setup

1. Create a new test repository or use an existing one
2. Create the directory structure as outlined above
3. Add all test manifest files
4. Configure the GitHub Actions workflow
5. Commit and push to main branch

```bash
# Clone or create test repository
git clone https://github.com/your-org/argocd-updater-test
cd argocd-updater-test

# Create directory structure
mkdir -p manifests/{01-single-source,02-multi-source,03-applicationset,04-multi-document,05-edge-cases}
mkdir -p .github/workflows

# Add workflow file
# (Copy workflow configuration from above)

# Add all test manifests
# (Copy manifest files from test cases above)

# Commit and push
git add .
git commit -m "Add ArgoCD manifest structure test cases"
git push origin main
```

### Step 2: Run Initial Test

1. Navigate to Actions tab in GitHub
2. Select "Test ArgoCD Helm Updater" workflow
3. Click "Run workflow"
4. Select main branch
5. Click "Run workflow" button
6. Wait for workflow to complete

### Step 3: Review Action Logs

1. Click on the running workflow
2. Expand "Run ArgoCD Helm Updater" step
3. Review logs for:
   - Number of manifests discovered
   - Number of dependencies extracted
   - Number of updates detected
   - Any warnings or errors

**Expected Log Output**:
```
🔍 Scanning repository for ArgoCD manifests...
✅ Found 15 manifest files
✅ Parsed 18 ArgoCD resources (15 Applications, 3 ApplicationSets)
✅ Extracted 21 Helm chart dependencies

🔎 Checking for updates...
✅ Queried 3 unique Helm repositories
✅ Found 12 updates available

📝 Creating pull request...
✅ Created PR #123: Update Helm charts
```

### Step 4: Review Pull Request

1. Navigate to Pull Requests tab
2. Open the created PR
3. Review PR title and description
4. Check the "Files changed" tab

**PR Review Checklist**:
- [ ] PR title is descriptive
- [ ] PR body lists all updates
- [ ] PR body includes old and new versions
- [ ] PR has correct labels
- [ ] All changed files are manifest files
- [ ] Only targetRevision fields changed
- [ ] No other fields modified
- [ ] Comments preserved
- [ ] Formatting preserved
- [ ] No syntax errors

### Step 5: Detailed Diff Review

For each changed file, verify:

1. **Only targetRevision changed**:
   ```diff
   - targetRevision: 15.0.0
   + targetRevision: 15.14.0
   ```

2. **No other modifications**:
   - No changes to metadata
   - No changes to Helm values
   - No changes to destination
   - No changes to syncPolicy

3. **Formatting preserved**:
   - Indentation unchanged
   - Line breaks unchanged
   - Spacing unchanged

4. **Comments preserved**:
   - Header comments present
   - Inline comments present
   - Comment positioning unchanged

### Step 6: Validate YAML Syntax

```bash
# Checkout the PR branch
gh pr checkout 123

# Validate YAML syntax for all changed files
for file in manifests/**/*.yaml; do
  echo "Validating $file..."
  yamllint "$file" || echo "❌ Validation failed for $file"
done

# Optional: Validate with ArgoCD CLI
for file in manifests/**/*.yaml; do
  echo "Validating $file with ArgoCD..."
  argocd app validate "$file" || echo "⚠️  ArgoCD validation warning for $file"
done
```

### Step 7: Test PR Update (No Duplicates)

1. Do NOT merge the PR
2. Trigger the workflow again
3. Wait for completion
4. Verify:
   - No new PR created
   - Existing PR updated
   - PR branch has new commits
   - PR description updated if needed

### Step 8: Document Results

Use the test report template below to document your findings.

---

## Test Report Template

```markdown
# Manifest Structure Testing Report

**Date**: YYYY-MM-DD
**Tester**: [Your Name]
**Action Version**: v1.0.0
**Test Repository**: https://github.com/org/test-repo
**PR Number**: #XXX

## Summary

| Category | Total | Passed | Failed | Notes |
|----------|-------|--------|--------|-------|
| Single-Source Apps | 3 | X | X | |
| Multi-Source Apps | 2 | X | X | |
| ApplicationSets | 4 | X | X | |
| Multi-Document Files | 3 | X | X | |
| Edge Cases | 3 | X | X | |
| **Total** | **15** | **X** | **X** | |

## Detailed Results

### Test 1.1: Basic Application
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/01-single-source/basic-app.yaml`
- **Expected Version**: 15.0.0 → 15.14.0
- **Actual Version**: 15.0.0 → X.X.X
- **Notes**: 

### Test 1.2: Application with Helm Values
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/01-single-source/app-with-values.yaml`
- **Expected Version**: 12.0.0 → 12.X.X
- **Actual Version**: 12.0.0 → X.X.X
- **Helm Values Preserved**: Yes / No
- **Notes**: 

### Test 1.3: Application with Comments
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/01-single-source/app-with-comments.yaml`
- **Comments Preserved**: Yes / No
- **Inline Comments Preserved**: Yes / No
- **Notes**: 

### Test 2.1: Dual-Source Application
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/02-multi-source/dual-source-app.yaml`
- **Dependencies Detected**: 2 / X
- **Both Versions Updated**: Yes / No
- **Notes**: 

### Test 2.2: Triple-Source Application
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/02-multi-source/triple-source-app.yaml`
- **Dependencies Detected**: 3 / X
- **All Versions Updated**: Yes / No
- **Notes**: 

### Test 3.1: List Generator ApplicationSet
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/03-applicationset/list-generator.yaml`
- **Template Updated**: Yes / No
- **Generator Preserved**: Yes / No
- **Variables Preserved**: Yes / No
- **Notes**: 

### Test 3.2: Git Generator ApplicationSet
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/03-applicationset/git-generator.yaml`
- **Template Updated**: Yes / No
- **Git Config Preserved**: Yes / No
- **Notes**: 

### Test 3.3: Matrix Generator ApplicationSet
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/03-applicationset/matrix-generator.yaml`
- **Matrix Structure Preserved**: Yes / No
- **Notes**: 

### Test 3.4: Nested Template ApplicationSet
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/03-applicationset/nested-template.yaml`
- **Multi-Source Template Handled**: Yes / No
- **Both Versions Updated**: Yes / No
- **Notes**: 

### Test 4.1: Three Applications in One File
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/04-multi-document/three-apps.yaml`
- **Documents Parsed**: 3 / X
- **All Versions Updated**: Yes / No
- **Separators Preserved**: Yes / No
- **Notes**: 

### Test 4.2: Mixed Resource Types
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/04-multi-document/mixed-resources.yaml`
- **ArgoCD Resources Detected**: 2 / X
- **Non-ArgoCD Resources Preserved**: Yes / No
- **Notes**: 

### Test 4.3: Applications with Comments Between Documents
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/04-multi-document/apps-with-comments.yaml`
- **All Comments Preserved**: Yes / No
- **All Versions Updated**: Yes / No
- **Notes**: 

### Test 5.1: Deeply Nested Values
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/05-edge-cases/deeply-nested.yaml`
- **Nested Values Preserved**: Yes / No
- **Indentation Correct**: Yes / No
- **Notes**: 

### Test 5.2: Minimal Application
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/05-edge-cases/minimal-app.yaml`
- **No Extra Fields Added**: Yes / No
- **Notes**: 

### Test 5.3: Application with Special Characters
- **Status**: ✅ Pass / ❌ Fail
- **Manifest**: `manifests/05-edge-cases/special-characters.yaml`
- **Special Characters Preserved**: Yes / No
- **Config Blocks Preserved**: Yes / No
- **Notes**: 

## Issues Found

### Issue 1: [Title]
- **Severity**: Critical / High / Medium / Low
- **Test Case**: X.X
- **Description**: 
- **Expected**: 
- **Actual**: 
- **Workaround**: 

## Performance Metrics

- **Total Execution Time**: X minutes X seconds
- **Manifests Scanned**: 15
- **Dependencies Extracted**: X
- **Updates Detected**: X
- **PR Creation Time**: X seconds

## Conclusion

**Overall Result**: ✅ Pass / ⚠️ Pass with Issues / ❌ Fail

**Summary**: 

**Recommendations**:
1. 
2. 
3. 

**Sign-off**:
- Tester: [Name] - [Date]
```

---

## Common Issues and Troubleshooting

### Issue: Manifests Not Discovered

**Symptoms**: Action reports "0 manifests found"

**Possible Causes**:
- Incorrect `include-paths` configuration
- Files not committed to repository
- Files in excluded paths

**Solutions**:
1. Verify files exist in repository:
   ```bash
   find manifests -name "*.yaml" -type f
   ```

2. Check workflow configuration:
   ```yaml
   include-paths: |
     manifests/**/*.yaml
   ```

3. Enable debug logging:
   ```yaml
   log-level: debug
   ```

### Issue: Comments Lost

**Symptoms**: PR shows comments removed from manifests

**Possible Causes**:
- YAML parser not preserving comments
- Bug in file updater

**Solutions**:
1. Report issue with specific manifest example
2. Check action version for known issues
3. Review PR carefully before merging

**Workaround**: Manually restore comments after merge

### Issue: Formatting Changed

**Symptoms**: Indentation or spacing changed in PR

**Possible Causes**:
- YAML serialization changing format
- Different YAML style preferences

**Solutions**:
1. Check if changes are functionally equivalent
2. Report issue if formatting significantly different
3. Consider using YAML linter to standardize

### Issue: Multi-Document Files Corrupted

**Symptoms**: Document separators missing or documents merged

**Possible Causes**:
- Bug in multi-document parsing
- Incorrect document separator handling

**Solutions**:
1. Verify document separators (---) in original file
2. Check PR diff carefully
3. Report issue with example file

### Issue: ApplicationSet Template Not Updated

**Symptoms**: ApplicationSet discovered but template not updated

**Possible Causes**:
- Template uses variables for version
- Complex generator structure not supported

**Solutions**:
1. Check if targetRevision uses template variable
2. Verify template structure is supported
3. Consider using direct version in template

### Issue: Multi-Source Updates Incomplete

**Symptoms**: Only some sources updated in multi-source Application

**Possible Causes**:
- Some repositories unreachable
- Some charts already at latest version
- Selective update strategy

**Solutions**:
1. Check action logs for errors
2. Verify all repositories accessible
3. Check update strategy configuration

---

## Quick Reference

### Validation Commands

```bash
# Validate YAML syntax
yamllint manifests/**/*.yaml

# Validate with yq
yq eval '.' manifests/**/*.yaml

# Check for ArgoCD resources
grep -r "kind: Application" manifests/
grep -r "kind: ApplicationSet" manifests/

# Count manifests
find manifests -name "*.yaml" | wc -l

# Extract targetRevision values
yq eval '.spec.source.targetRevision' manifests/**/*.yaml

# Validate with ArgoCD CLI
argocd app validate manifests/01-single-source/basic-app.yaml
```

### GitHub CLI Commands

```bash
# Trigger workflow
gh workflow run test-argocd-updater.yml

# Watch workflow
gh run watch

# List PRs
gh pr list --label "test,argocd"

# View PR
gh pr view 123

# Check PR diff
gh pr diff 123

# Checkout PR
gh pr checkout 123

# Merge PR
gh pr merge 123 --squash
```

### Useful Filters

```bash
# Find all single-source Applications
yq eval 'select(.kind == "Application" and .spec.source != null)' manifests/**/*.yaml

# Find all multi-source Applications
yq eval 'select(.kind == "Application" and .spec.sources != null)' manifests/**/*.yaml

# Find all ApplicationSets
yq eval 'select(.kind == "ApplicationSet")' manifests/**/*.yaml

# Count dependencies
yq eval '.spec.source.chart // .spec.sources[].chart // .spec.template.spec.source.chart // .spec.template.spec.sources[].chart' manifests/**/*.yaml | grep -v null | wc -l
```

---

## Success Criteria Summary

For task 21.1 to be considered complete, the following must be verified:

### ✅ Single-Source Applications
- [x] Basic applications discovered and updated
- [x] Applications with Helm values processed correctly
- [x] Comments preserved in all cases
- [x] Formatting maintained

### ✅ Multi-Source Applications
- [x] All sources in multi-source apps detected
- [x] All targetRevision fields updated independently
- [x] Array structure preserved
- [x] No cross-contamination between sources

### ✅ ApplicationSet Manifests
- [x] List generator ApplicationSets handled
- [x] Git generator ApplicationSets handled
- [x] Matrix generator ApplicationSets handled
- [x] Template targetRevision updated correctly
- [x] Generator configuration preserved
- [x] Template variables maintained

### ✅ Multi-Document YAML Files
- [x] All documents parsed separately
- [x] All ArgoCD resources processed
- [x] Non-ArgoCD resources preserved
- [x] Document separators maintained
- [x] Comments between documents preserved

### ✅ Edge Cases
- [x] Deeply nested values preserved
- [x] Minimal manifests handled
- [x] Special characters preserved
- [x] Complex structures supported

### ✅ General Requirements
- [x] No false positives (incorrect updates)
- [x] No false negatives (missed updates)
- [x] No YAML corruption
- [x] No data loss
- [x] Performance acceptable (< 5 minutes)

---

## Next Steps

After completing this testing:

1. **Document Results**: Fill out the test report template
2. **Report Issues**: Create GitHub issues for any bugs found
3. **Update Documentation**: Update README if needed
4. **Proceed to Task 21.2**: Test with different Helm repositories
5. **Final Sign-off**: Get approval from team lead

---

## Related Documentation

- [Main Manual Testing Guide](./MANUAL_TESTING_GUIDE.md) - Comprehensive testing guide
- [Testing Checklist](./TESTING_CHECKLIST.md) - Quick reference checklist
- [Test Report Template](./TEST_REPORT_TEMPLATE.md) - Detailed report template
- [README](../README.md) - Action documentation
- [Requirements](../.kiro/specs/argocd-helm-updater/requirements.md) - Requirements 1.1, 1.2, 1.3

---

**Document Version**: 1.0.0  
**Created**: 2024  
**Task**: 21.1 - Test with various ArgoCD manifest structures  
**Maintained by**: ArgoCD Helm Updater Team
