# ArgoCD Helm Updater - Workflow Examples

This directory contains example GitHub Actions workflows demonstrating different use cases and configurations for the ArgoCD Helm Updater action.

## 📋 Available Examples

### 1. Basic Usage (`basic-usage.yml`)

**Best for**: Getting started quickly, small projects, testing the action

A minimal configuration example that shows the essential setup needed to run the ArgoCD Helm Updater. This example:
- Runs weekly on a schedule
- Uses default settings for most options
- Creates a single PR for all updates
- Includes basic output summary

**Key Features**:
- ✅ Minimal configuration
- ✅ Easy to understand
- ✅ Good starting point for new users
- ✅ Manual trigger support

**Use this when**:
- You're trying the action for the first time
- You have a simple repository structure
- You want to accept all updates by default
- You don't need advanced features

---

### 2. Advanced Configuration (`advanced-configuration.yml`)

**Best for**: Complex projects, fine-grained control, learning all features

A comprehensive example showcasing **all available configuration options**. This example demonstrates:
- Custom file path patterns (include/exclude)
- Dependency grouping for related charts
- Ignore rules for specific charts or versions
- Auto-merge configuration for patch updates
- Registry authentication for private repositories
- Separate PRs per chart
- Conventional commit messages
- Rate limiting and rebase strategy
- Detailed output summaries

**Key Features**:
- ✅ All configuration options documented
- ✅ Inline comments explaining each setting
- ✅ Multiple registry authentication examples
- ✅ Dependency grouping patterns
- ✅ Ignore rules with explanations
- ✅ Post-update actions and notifications

**Use this when**:
- You need fine-grained control over updates
- You have multiple Helm repositories
- You want to group related charts together
- You need to ignore specific versions
- You want to understand all available options

---

### 3. Scheduled Production (`scheduled-production.yml`)

**Best for**: Production environments, enterprise deployments, compliance requirements

A production-ready example with best practices for scheduled runs, security, monitoring, and compliance. This example includes:
- Daily scheduled runs with concurrency control
- Conservative update strategy (minor/patch only)
- Security-focused configuration
- Comprehensive monitoring and alerting
- Audit logging for compliance
- Cleanup and maintenance tasks
- Detailed summary reports
- Integration points for Slack/PagerDuty

**Key Features**:
- ✅ Production-ready configuration
- ✅ Security best practices
- ✅ Monitoring and alerting hooks
- ✅ Audit logging for compliance
- ✅ Rate limiting to prevent PR overload
- ✅ Auto-merge for low-risk updates
- ✅ Cleanup of stale branches
- ✅ Metrics recording

**Use this when**:
- You're deploying to production
- You need compliance and audit trails
- You want monitoring and alerting
- You need to limit the number of open PRs
- You want automated cleanup

---

## 🚀 Getting Started

### Step 1: Choose an Example

Pick the example that best matches your needs:
- **New to the action?** Start with `basic-usage.yml`
- **Need specific features?** Check `advanced-configuration.yml`
- **Production deployment?** Use `scheduled-production.yml`

### Step 2: Copy to Your Repository

Copy the chosen example to your repository's `.github/workflows/` directory:

```bash
# Example: Copy basic usage
cp .github/workflows/examples/basic-usage.yml .github/workflows/argocd-helm-updater.yml
```

### Step 3: Customize

Update the workflow file with your specific configuration:

1. **Replace the action reference**:
   ```yaml
   uses: your-org/argocd-helm-updater@v1
   ```
   Replace `your-org/argocd-helm-updater@v1` with the actual action reference once published.

2. **Adjust file paths**:
   ```yaml
   include-paths: |
     apps/**/*.yaml
     infrastructure/**/*.yaml
   ```
   Update to match your repository structure.

3. **Configure authentication** (if needed):
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
   Add your registry credentials as GitHub secrets.

4. **Set up notifications** (optional):
   - Uncomment and configure Slack/email notifications
   - Add your webhook URLs as secrets

### Step 4: Test

Run the workflow manually first to verify it works:

1. Go to **Actions** tab in your GitHub repository
2. Select your workflow
3. Click **Run workflow**
4. Choose **dry-run** mode if available
5. Review the output and any created PRs

---

## 🔧 Configuration Options

### Common Inputs

| Input | Description | Default | Example |
|-------|-------------|---------|---------|
| `github-token` | GitHub token for API access | `${{ github.token }}` | Required |
| `update-strategy` | Update strategy | `all` | `minor`, `patch` |
| `pr-strategy` | PR creation strategy | `single` | `per-chart`, `per-manifest` |
| `pr-labels` | Labels for PRs | `dependencies,argocd,helm` | Custom labels |
| `dry-run` | Test mode without creating PRs | `false` | `true` |

### Advanced Inputs

See `advanced-configuration.yml` for detailed examples of:
- File path patterns
- Dependency grouping
- Ignore rules
- Auto-merge configuration
- Registry authentication
- Commit message formatting
- Rate limiting
- Rebase strategy

---

## 📚 Additional Resources

### Documentation
- [Main README](../../../README.md) - Full documentation
- [action.yml](../../../action.yml) - Complete input/output reference
- [CONTRIBUTING.md](../../../CONTRIBUTING.md) - Development guide

### External Configuration

Instead of inline configuration, you can use an external file:

```yaml
# In your workflow
- uses: your-org/argocd-helm-updater@v1
  with:
    config-file: '.argocd-updater.yml'
```

```yaml
# .argocd-updater.yml in repository root
updateStrategy: minor
prStrategy: per-chart

groups:
  monitoring:
    patterns:
      - prometheus
      - grafana
    updateTypes:
      - minor
      - patch

ignore:
  - dependencyName: postgresql
    updateTypes: [major]
```

---

## 🔐 Security Best Practices

1. **Use minimal permissions**:
   ```yaml
   permissions:
     contents: write
     pull-requests: write
   ```

2. **Store credentials as secrets**:
   - Never commit credentials in workflow files
   - Use GitHub Secrets for sensitive data
   - Rotate credentials regularly

3. **Enable branch protection**:
   - Require PR reviews
   - Require status checks to pass
   - Enable auto-merge only for trusted updates

4. **Review auto-merge settings**:
   - Only enable for patch updates
   - Require CI to pass
   - Require at least one approval

---

## 🐛 Troubleshooting

### No updates found

**Possible causes**:
- No ArgoCD manifests in scanned paths
- All charts are already up to date
- File paths don't match include patterns

**Solutions**:
- Check `include-paths` and `exclude-paths`
- Enable debug logging: `log-level: debug`
- Run in dry-run mode to see what's detected

### Authentication failures

**Possible causes**:
- Invalid credentials
- Expired tokens
- Wrong registry URL

**Solutions**:
- Verify secrets are set correctly
- Check registry URL format
- Test credentials manually with `helm repo add`

### Too many PRs created

**Solutions**:
- Use `open-pull-requests-limit` to cap the number
- Use `pr-strategy: single` to combine updates
- Use dependency grouping to batch related charts

### PRs not auto-merging

**Possible causes**:
- Branch protection rules not configured
- CI checks not passing
- Approval requirements not met

**Solutions**:
- Configure branch protection rules
- Ensure CI workflows run on PRs
- Adjust `auto-merge-require-approvals`

---

## 💡 Tips and Best Practices

### Scheduling

- **Daily**: Good for active projects with frequent updates
- **Weekly**: Balanced approach for most projects
- **Monthly**: Conservative approach for stable projects

### Update Strategy

- **Production**: Use `minor` or `patch` for safety
- **Staging**: Use `all` to test new versions
- **Development**: Use `all` to stay current

### PR Strategy

- **Single PR**: Less noise, easier for small teams
- **Per-chart**: Better for large teams, easier rollback
- **Per-manifest**: Useful for environment-specific updates

### Grouping

Group related charts to:
- Test them together
- Reduce review overhead
- Maintain consistency (e.g., monitoring stack)

### Ignore Rules

Use ignore rules to:
- Skip known problematic versions
- Prevent major updates for critical services
- Maintain compatibility with other systems

---

## 🤝 Contributing

Found an issue with these examples or have a suggestion for a new example?

1. Open an issue describing the problem or use case
2. Submit a PR with your proposed changes
3. Include comments explaining the configuration

---

## 📄 License

These examples are provided under the same license as the ArgoCD Helm Updater action. See [LICENSE](../../../LICENSE) for details.
