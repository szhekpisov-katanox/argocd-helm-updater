# ArgoCD Helm Updater

A GitHub Action that automatically detects and updates Helm chart versions in ArgoCD Application and ApplicationSet manifests.

## Features

- 🔍 **Automatic Discovery**: Scans your repository for ArgoCD manifests
- 📦 **Helm Integration**: Queries Helm repositories and OCI registries for new versions
- 🔄 **Smart Updates**: Supports configurable update strategies (major, minor, patch)
- 🤖 **Pull Request Automation**: Creates PRs with detailed changelogs
- 🎯 **Flexible Configuration**: Extensive configuration options for customization
- 🔐 **Authentication Support**: Works with private Helm repositories and OCI registries

## Quick Start

```yaml
name: Update Helm Charts
on:
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Monday
  workflow_dispatch:

jobs:
  update-charts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Update ArgoCD Helm Charts
        uses: ./  # Replace with actual action reference when published
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          update-strategy: 'minor'
          pr-labels: 'dependencies,argocd,helm'
```

## Versioning

This action follows [Semantic Versioning](https://semver.org/). You can reference the action using:

- **Major version** (recommended): `@v1` - Automatically gets the latest v1.x.x release
- **Specific version**: `@v1.2.3` - Pins to an exact version
- **Commit SHA**: `@abc123` - Pins to a specific commit (for testing)

Example:
```yaml
- uses: yourusername/argocd-helm-updater@v1  # Recommended
```

For release notes and version history, see [CHANGELOG.md](CHANGELOG.md).

## Configuration

### Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `include-paths` | Glob patterns for files to scan | `**/*.yaml,**/*.yml` |
| `exclude-paths` | Glob patterns for files to exclude | `node_modules/**,dist/**,.git/**` |
| `update-strategy` | Update strategy: `major`, `minor`, `patch`, or `all` | `all` |
| `pr-strategy` | PR creation strategy: `single`, `per-chart`, or `per-manifest` | `single` |
| `pr-labels` | Labels to apply to pull requests | `dependencies,argocd,helm` |
| `dry-run` | Run without creating PRs | `false` |
| `log-level` | Log level: `debug`, `info`, `warn`, or `error` | `info` |

See [action.yml](action.yml) for all available inputs.

### Outputs

| Output | Description |
|--------|-------------|
| `updates-found` | Number of chart updates detected |
| `pr-numbers` | Comma-separated list of created/updated PR numbers |
| `pr-urls` | Comma-separated list of created/updated PR URLs |
| `updated-charts` | JSON array of updated charts with versions |

## Advanced Configuration

### External Configuration File

Create a `.argocd-updater.yml` file in your repository:

```yaml
# File scanning
includePaths:
  - 'apps/**/*.yaml'
  - 'infrastructure/**/*.yaml'
excludePaths:
  - 'apps/dev/**'

# Update strategy
updateStrategy: minor

# Grouping
groups:
  production-charts:
    patterns:
      - 'bitnami/*'
      - 'stable/*'
    updateTypes:
      - minor
      - patch

# Ignore rules
ignore:
  - dependencyName: 'nginx'
    versions: ['16.x']
  - dependencyName: 'postgresql'
    updateTypes: ['major']

# PR options
prStrategy: per-chart
prLabels:
  - dependencies
  - argocd
  - automated
```

### Registry Authentication

For private Helm repositories or OCI registries:

```yaml
- name: Update ArgoCD Helm Charts
  uses: ./
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    registry-credentials: |
      [
        {
          "registry": "https://charts.example.com",
          "username": "${{ secrets.HELM_USERNAME }}",
          "password": "${{ secrets.HELM_PASSWORD }}"
        }
      ]
```

## Development

### Prerequisites

- Node.js 20+
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build the action
npm run build

# Lint code
npm run lint

# Format code
npm run format
```

### Testing

The project uses a comprehensive testing approach:

- **Unit Tests**: Test specific examples and edge cases
- **Property-Based Tests**: Verify universal properties with randomized inputs using fast-check
- **Manual Testing**: Comprehensive testing guide for real-world scenarios

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

For manual testing, see the [Manual Testing Guide](docs/MANUAL_TESTING_GUIDE.md).

## Testing

### Manual Testing

For comprehensive manual testing guidance, see the [Manual Testing Guide](docs/MANUAL_TESTING_GUIDE.md). This guide includes:

- 53+ test scenarios covering all features
- Test manifest examples for different ArgoCD structures
- Expected outcomes and validation steps
- Troubleshooting guide for common issues
- Test report template

Quick testing checklist: [Testing Checklist](docs/TESTING_CHECKLIST.md)

### Automated Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Troubleshooting

### Common Issues and Solutions

#### No Updates Found

**Symptoms:**
- Action runs successfully but reports 0 updates found
- No pull requests are created

**Possible Causes & Solutions:**

1. **No ArgoCD manifests in scanned paths**
   - Check that your `include-paths` pattern matches your manifest files
   - Enable debug logging: `log-level: debug` to see which files are being scanned
   - Verify files contain `kind: Application` or `kind: ApplicationSet`

2. **All charts are already up to date**
   - This is normal! The action only creates PRs when updates are available
   - Check the action logs to confirm charts were detected and checked

3. **File paths don't match include patterns**
   ```yaml
   # Example: If your manifests are in apps/ directory
   include-paths: 'apps/**/*.yaml'
   ```

4. **Charts are excluded by ignore rules**
   - Review your `ignore` configuration
   - Check if version constraints are too restrictive

#### Authentication Failures

**Symptoms:**
- Error messages about authentication or authorization
- 401 or 403 HTTP errors in logs

**Solutions:**

1. **GitHub Token Issues**
   ```yaml
   # Ensure token has correct permissions
   permissions:
     contents: write
     pull-requests: write
   ```

2. **Private Helm Repository Authentication**
   ```yaml
   # Verify credentials are set correctly
   registry-credentials: |
     [
       {
         "registry": "https://charts.example.com",
         "username": "${{ secrets.HELM_USERNAME }}",
         "password": "${{ secrets.HELM_PASSWORD }}"
       }
     ]
   ```
   - Verify secrets are defined in repository settings
   - Test credentials manually: `helm repo add test-repo https://charts.example.com --username=... --password=...`

3. **OCI Registry Authentication**
   ```yaml
   # For OCI registries, use the full registry URL
   registry-credentials: |
     [
       {
         "registry": "oci://ghcr.io",
         "username": "${{ github.actor }}",
         "password": "${{ secrets.GITHUB_TOKEN }}"
       }
     ]
   ```

#### YAML Parsing Errors

**Symptoms:**
- Warnings about invalid YAML in logs
- Manifests not being processed

**Solutions:**

1. **Validate YAML syntax**
   ```bash
   # Use yamllint or similar tool
   yamllint apps/**/*.yaml
   ```

2. **Check for multi-document YAML**
   - Ensure documents are separated by `---`
   - Each document should be valid YAML

3. **Verify ArgoCD resource structure**
   ```yaml
   # Required fields for Application
   apiVersion: argoproj.io/v1alpha1
   kind: Application
   spec:
     source:
       repoURL: https://charts.example.com
       chart: my-chart
       targetRevision: 1.0.0
   ```

#### Too Many Pull Requests Created

**Symptoms:**
- Action creates more PRs than desired
- Reviewers are overwhelmed

**Solutions:**

1. **Use PR strategy to group updates**
   ```yaml
   # Create single PR for all updates
   pr-strategy: 'single'
   ```

2. **Set PR limit**
   ```yaml
   # Limit concurrent open PRs
   open-pull-requests-limit: 5
   ```

3. **Use dependency grouping**
   ```yaml
   groups: |
     {
       "monitoring": {
         "patterns": ["prometheus", "grafana", "loki"],
         "updateTypes": ["minor", "patch"]
       }
     }
   ```

4. **Adjust update strategy**
   ```yaml
   # Only allow patch updates
   update-strategy: 'patch'
   ```

#### Pull Requests Not Auto-Merging

**Symptoms:**
- Auto-merge is enabled but PRs remain open
- PRs are not automatically merged after CI passes

**Solutions:**

1. **Configure branch protection rules**
   - Go to repository Settings → Branches
   - Enable "Require status checks to pass before merging"
   - Enable "Allow auto-merge"

2. **Verify auto-merge configuration**
   ```yaml
   auto-merge-enabled: 'true'
   auto-merge-update-types: 'patch'
   auto-merge-require-ci-pass: 'true'
   auto-merge-require-approvals: '1'
   ```

3. **Check CI status**
   - Ensure all required status checks pass
   - Verify CI workflows run on pull requests

4. **Review approval requirements**
   - Ensure approval requirements are met
   - Check if approvals are configured correctly

#### Version Resolution Failures

**Symptoms:**
- Errors about unable to fetch versions
- Timeouts when querying repositories

**Solutions:**

1. **Check repository URL format**
   ```yaml
   # Helm repository
   repoURL: https://charts.bitnami.com/bitnami
   
   # OCI registry
   repoURL: oci://registry-1.docker.io/bitnamicharts
   ```

2. **Verify repository is accessible**
   ```bash
   # Test Helm repository
   curl https://charts.bitnami.com/bitnami/index.yaml
   
   # Test OCI registry
   helm pull oci://registry-1.docker.io/bitnamicharts/nginx --version 15.0.0
   ```

3. **Check for rate limiting**
   - Some registries have rate limits
   - Consider using authentication to increase limits
   - Add delays between requests if needed

#### Action Runs Too Long

**Symptoms:**
- Action takes more than 5-10 minutes to complete
- Timeout errors

**Solutions:**

1. **Reduce scope of scanning**
   ```yaml
   # Scan only specific directories
   include-paths: 'apps/production/**/*.yaml'
   ```

2. **Exclude unnecessary directories**
   ```yaml
   exclude-paths: |
     node_modules/**
     dist/**
     .git/**
     **/test/**
   ```

3. **Check for network issues**
   - Verify Helm repositories are responsive
   - Check for slow or unresponsive registries

### Debug Mode

Enable detailed logging to troubleshoot issues:

```yaml
- name: Update ArgoCD Helm Charts
  uses: ./
  with:
    log-level: 'debug'
```

Debug mode will show:
- Files being scanned
- Dependencies extracted
- Versions being compared
- Update decisions
- API calls being made

### Getting Help

If you're still experiencing issues:

1. **Check existing issues**: Search [GitHub Issues](https://github.com/yourusername/argocd-helm-updater/issues) for similar problems
2. **Enable debug logging**: Run with `log-level: debug` and include logs in your issue
3. **Provide minimal reproduction**: Share a minimal example that reproduces the issue
4. **Include configuration**: Share your workflow file and configuration (remove secrets!)

**When opening an issue, include:**
- Action version
- Workflow configuration
- Relevant log output (with debug enabled)
- Example manifest files (if applicable)
- Expected vs actual behavior

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

For information about creating releases, see [Release Process](.github/workflows/RELEASE.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Inspired by [Renovate](https://docs.renovatebot.com/) and [Dependabot](https://github.com/dependabot/dependabot-core).
