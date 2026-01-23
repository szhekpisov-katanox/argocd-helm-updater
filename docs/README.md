# ArgoCD Helm Updater - Documentation

Welcome to the ArgoCD Helm Updater documentation! This directory contains comprehensive guides for testing, using, and understanding the action.

## 📚 Documentation Index

### For Testers

- **[Manual Testing Guide](MANUAL_TESTING_GUIDE.md)** - Comprehensive guide for manual testing
  - Test scenarios with step-by-step instructions
  - Test manifest examples for different ArgoCD structures
  - Expected outcomes and validation steps
  - Troubleshooting guide for common issues
  - Quick reference commands and snippets

- **[Testing Checklist](TESTING_CHECKLIST.md)** - Quick reference checklist
  - 133 test cases organized by category
  - Simple checkbox format for tracking progress
  - Perfect for testing sessions

- **[Test Report Template](TEST_REPORT_TEMPLATE.md)** - Structured test report template
  - Executive summary section
  - Detailed test results tables
  - Issue tracking format
  - Performance analysis
  - Release readiness assessment

### For Users

- **[Main README](../README.md)** - Getting started and basic usage
- **[Example Workflows](../.github/workflows/examples/)** - Real-world workflow examples
- **[Contributing Guide](../CONTRIBUTING.md)** - How to contribute to the project
- **[Changelog](../CHANGELOG.md)** - Version history and changes

## 🚀 Quick Start for Testers

### 1. Prepare Your Test Environment

```bash
# Clone the test repository
git clone https://github.com/your-org/test-repo
cd test-repo

# Create test manifests
mkdir -p apps/production
cat > apps/production/nginx-app.yaml << 'EOF'
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
    targetRevision: 15.0.0
    helm:
      releaseName: nginx
  destination:
    server: https://kubernetes.default.svc
    namespace: production
EOF

# Commit and push
git add .
git commit -m "Add test manifests"
git push
```

### 2. Run the Action

```bash
# Trigger workflow manually
gh workflow run argocd-helm-updater.yml

# Watch the run
gh run watch

# Check results
gh pr list --label "argocd,helm"
```

### 3. Document Your Results

Use the [Test Report Template](TEST_REPORT_TEMPLATE.md) to document your findings.

## 📋 Testing Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    1. Pre-Testing Setup                      │
│  • Create test repository                                    │
│  • Configure secrets and permissions                         │
│  • Prepare test manifests                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  2. Execute Test Scenarios                   │
│  • Follow Manual Testing Guide                               │
│  • Use Testing Checklist to track progress                   │
│  • Test each category systematically                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   3. Verify in GitHub UI                     │
│  • Check PR creation and formatting                          │
│  • Verify file changes are correct                           │
│  • Validate labels, assignees, reviewers                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  4. Document Results                         │
│  • Fill out Test Report Template                             │
│  • Document issues found                                     │
│  • Provide recommendations                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   5. Review and Sign-off                     │
│  • Review test coverage                                      │
│  • Assess release readiness                                  │
│  • Get approval from stakeholders                            │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Test Coverage Overview

The testing documentation covers:

### Core Functionality (10 tests)
- Manifest discovery and parsing
- Dependency extraction
- Version resolution
- Update detection
- PR creation and updates

### Manifest Structures (7 tests)
- Single-source Applications
- Multi-source Applications
- ApplicationSets (List, Git, Matrix generators)
- Nested structures

### Repository Types (8 tests)
- Traditional Helm repositories (Bitnami, Artifact Hub)
- OCI registries (Docker Hub, GHCR, AWS ECR, Azure ACR)
- Private registries with authentication
- Mixed repository types

### Update Strategies (5 tests)
- All, major, minor, patch strategies
- Version constraint handling

### PR Strategies (6 tests)
- Single PR, per-chart, per-manifest
- Labels, assignees, reviewers

### Advanced Features (7 tests)
- Dependency grouping
- Ignore rules
- Auto-merge
- Rate limiting
- Rebase strategy
- Commit conventions
- External configuration

### Error Handling (6 tests)
- Invalid YAML
- Unreachable repositories
- Authentication failures
- Network issues
- Configuration errors

### Performance (4 tests)
- Execution time
- Caching
- API rate limits
- Resource usage

**Total: 53+ test scenarios**

## 🔍 Test Scenario Examples

### Example 1: Basic Update Flow

```yaml
# Test: Single Application with outdated chart
# Expected: PR created with update to latest version

apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-app
spec:
  source:
    repoURL: https://charts.bitnami.com/bitnami
    chart: nginx
    targetRevision: 15.0.0  # Outdated
```

**Expected PR**:
- Title: `chore(deps): update nginx chart to 15.14.0`
- Body: Includes old version (15.0.0), new version (15.14.0), release notes
- Files: Only `targetRevision` field updated
- Formatting: YAML structure and comments preserved

### Example 2: Grouped Updates

```yaml
# Test: Multiple monitoring charts
# Expected: Single PR with all monitoring updates

groups:
  monitoring-stack:
    patterns:
      - prometheus
      - grafana
      - loki
```

**Expected PR**:
- Title: `chore(deps): update monitoring-stack charts`
- Body: Table with all 3 charts and their updates
- Files: All monitoring manifests updated

### Example 3: Ignore Rules

```yaml
# Test: Ignore major PostgreSQL updates
# Expected: Only minor/patch updates included

ignore:
  - dependencyName: postgresql
    updateTypes: [major]
```

**Expected Behavior**:
- PostgreSQL 12.0.0 → 12.5.0 ✅ (minor)
- PostgreSQL 12.0.0 → 13.0.0 ❌ (major, ignored)
- Logs explain why major update was skipped

## 🐛 Common Issues and Solutions

### Issue: No Manifests Found

**Solution**: Check `include-paths` configuration
```yaml
include-paths: |
  **/*.yaml
  **/*.yml
```

### Issue: Authentication Failed

**Solution**: Verify credentials format
```yaml
registry-credentials: |
  [
    {
      "registry": "https://charts.example.com",
      "username": "${{ secrets.HELM_USERNAME }}",
      "password": "${{ secrets.HELM_PASSWORD }}"
    }
  ]
```

### Issue: No Updates Detected

**Solution**: Check update strategy and ignore rules
```yaml
update-strategy: all  # Try more permissive
ignore: []  # Temporarily disable
log-level: debug  # Enable detailed logging
```

## 📊 Test Metrics

Track these metrics during testing:

| Metric | Target | Importance |
|--------|--------|------------|
| Test Pass Rate | > 95% | Critical |
| Execution Time | < 5 min | High |
| API Calls | < 1000 | Medium |
| Rate Limit Remaining | > 1000 | Medium |
| Memory Usage | < 512 MB | Low |

## 🤝 Contributing to Documentation

Found an issue or want to improve the documentation?

1. **Report Issues**: Open an issue describing the problem
2. **Suggest Improvements**: Submit a PR with your changes
3. **Add Examples**: Share your test scenarios
4. **Update Guides**: Keep documentation current with code changes

## 📞 Getting Help

- **Issues**: [GitHub Issues](https://github.com/your-org/argocd-helm-updater/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/argocd-helm-updater/discussions)
- **Documentation**: This directory!

## 📄 License

This documentation is part of the ArgoCD Helm Updater project and is licensed under the same terms. See [LICENSE](../LICENSE) for details.

---

**Documentation Version**: 1.0.0  
**Last Updated**: 2024  
**Maintained by**: ArgoCD Helm Updater Team

