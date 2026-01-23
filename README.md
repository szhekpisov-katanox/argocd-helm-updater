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

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

For information about creating releases, see [Release Process](.github/workflows/RELEASE.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Inspired by [Renovate](https://docs.renovatebot.com/) and [Dependabot](https://github.com/dependabot/dependabot-core).
