# Release Process

This document describes how to create a new release of the ArgoCD Helm Updater action.

## Overview

The release process is fully automated through the `.github/workflows/release.yml` workflow. When you push a semantic version tag, the workflow will:

1. ✅ Validate the release tag and version format
2. 🧪 Run all tests (unit, integration, property-based)
3. 🔨 Build and bundle the action
4. 📝 Generate release notes from CHANGELOG.md
5. 🚀 Create a GitHub release
6. 🏷️ Update major version tags (v1, v2, etc.)
7. 📦 Publish to GitHub Marketplace
8. ✔️ Validate the release

## Prerequisites

Before creating a release, ensure:

1. **All tests pass**: Run `npm test` locally
2. **Code is built**: Run `npm run build` and commit the `dist/` directory
3. **CHANGELOG is updated**: Add an entry for the new version in `CHANGELOG.md`
4. **Version is bumped**: Update `version` in `package.json` (optional, for reference)
5. **All changes are merged**: Merge all PRs into the main branch

## Release Steps

### 1. Update CHANGELOG.md

Add a new section for your release version:

```markdown
## [1.2.0] - 2024-01-15

### Added
- New feature X
- New feature Y

### Changed
- Improved performance of Z

### Fixed
- Bug fix for issue #123

[1.2.0]: https://github.com/yourusername/argocd-helm-updater/compare/v1.1.0...v1.2.0
```

**Important**: The release workflow extracts release notes from this section, so it must exist!

### 2. Commit and Push Changes

```bash
git add CHANGELOG.md
git commit -m "chore: prepare release v1.2.0"
git push origin main
```

### 3. Create and Push the Release Tag

```bash
# Create an annotated tag
git tag -a v1.2.0 -m "Release v1.2.0"

# Push the tag to trigger the release workflow
git push origin v1.2.0
```

**Tag Format**: Must follow semantic versioning: `vMAJOR.MINOR.PATCH`
- Example: `v1.0.0`, `v1.2.3`, `v2.0.0`
- Pre-releases: `v1.0.0-alpha.1`, `v1.0.0-beta.2`, `v1.0.0-rc.1`

### 4. Monitor the Release Workflow

1. Go to the **Actions** tab in your GitHub repository
2. Find the "Release" workflow run
3. Monitor the progress of all jobs
4. If any job fails, check the logs and fix the issue

### 5. Verify the Release

After the workflow completes successfully:

1. **Check the Release Page**: Visit `https://github.com/yourusername/argocd-helm-updater/releases`
   - Verify the release notes are correct
   - Verify the version tag is correct
   - Check that assets are attached

2. **Check Major Version Tag**: Verify the major version tag was updated
   ```bash
   git fetch --tags
   git tag -l "v1"
   git show v1  # Should point to your new release
   ```

3. **Test the Action**: Create a test workflow using the new version
   ```yaml
   - uses: yourusername/argocd-helm-updater@v1.2.0
   ```

4. **Check GitHub Marketplace**: Visit the Marketplace tab in your repository
   - Verify the action is published (for stable releases)
   - Check that the description and branding are correct

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (v2.0.0): Breaking changes, incompatible API changes
- **MINOR** (v1.1.0): New features, backwards-compatible
- **PATCH** (v1.0.1): Bug fixes, backwards-compatible

### When to Bump Each Version

**Major Version (Breaking Changes)**:
- Removing or renaming action inputs
- Changing default behavior in incompatible ways
- Removing support for older Node.js versions
- Major architectural changes

**Minor Version (New Features)**:
- Adding new action inputs (with defaults)
- Adding new features that don't break existing usage
- Adding new outputs
- Performance improvements

**Patch Version (Bug Fixes)**:
- Fixing bugs
- Security patches
- Documentation updates
- Dependency updates (non-breaking)

## Pre-Release Versions

For testing before a stable release:

```bash
# Alpha release (early testing)
git tag -a v1.2.0-alpha.1 -m "Release v1.2.0-alpha.1"
git push origin v1.2.0-alpha.1

# Beta release (feature complete, testing)
git tag -a v1.2.0-beta.1 -m "Release v1.2.0-beta.1"
git push origin v1.2.0-beta.1

# Release candidate (final testing)
git tag -a v1.2.0-rc.1 -m "Release v1.2.0-rc.1"
git push origin v1.2.0-rc.1
```

**Note**: Pre-releases:
- Are marked as "Pre-release" on GitHub
- Do NOT update major version tags
- Are NOT published to GitHub Marketplace
- Are useful for testing with early adopters

## Major Version Tags

The release workflow automatically maintains major version tags (v1, v2, etc.) for easy consumption.

### How It Works

When you release `v1.2.3`:
1. The workflow creates a GitHub release for `v1.2.3`
2. The workflow updates the `v1` tag to point to `v1.2.3`
3. Users referencing `@v1` automatically get `v1.2.3`

### Benefits

Users can choose their update strategy:

```yaml
# Always get the latest v1.x.x (recommended)
- uses: yourusername/argocd-helm-updater@v1

# Pin to a specific version
- uses: yourusername/argocd-helm-updater@v1.2.3

# Use a specific commit (for testing)
- uses: yourusername/argocd-helm-updater@abc123
```

## Troubleshooting

### Release Workflow Failed

**Problem**: The release workflow failed at the validation step.

**Solutions**:
- Check that CHANGELOG.md has an entry for the version
- Verify the tag format is correct (vMAJOR.MINOR.PATCH)
- Ensure all tests pass locally

**Problem**: Tests failed during release.

**Solutions**:
- Run `npm test` locally to reproduce
- Fix the failing tests
- Delete the tag: `git tag -d v1.2.0 && git push origin :refs/tags/v1.2.0`
- Create a new tag after fixing

**Problem**: Build failed during release.

**Solutions**:
- Run `npm run build` locally to reproduce
- Fix any TypeScript errors
- Commit the updated `dist/` directory
- Delete and recreate the tag

### Fixing a Bad Release

If you released a version with issues:

1. **For minor issues** (documentation, etc.):
   - Create a patch release (e.g., v1.2.1)
   - Update CHANGELOG with the fix

2. **For major issues** (broken functionality):
   - Delete the release on GitHub
   - Delete the tag: `git tag -d v1.2.0 && git push origin :refs/tags/v1.2.0`
   - Fix the issue
   - Create a new release with the same or incremented version

3. **For security issues**:
   - Create an immediate patch release
   - Mark the vulnerable version in CHANGELOG
   - Consider yanking the release (mark as pre-release)

### Major Version Tag Not Updated

**Problem**: The v1 tag doesn't point to the latest v1.x.x release.

**Solutions**:
- Check if the release was marked as pre-release (major tags only update for stable releases)
- Manually update the tag:
  ```bash
  git tag -fa v1 -m "Update v1 to v1.2.3"
  git push origin v1 --force
  ```

### Marketplace Publication Issues

**Problem**: Action not appearing in GitHub Marketplace.

**Solutions**:
- Ensure the repository is public
- Check that `action.yml` has all required fields (name, description, branding)
- Visit the Marketplace tab in your repository and manually publish
- Wait a few minutes for GitHub to process the release

## Best Practices

1. **Test Before Releasing**: Always run the full test suite locally
2. **Update CHANGELOG First**: Don't forget to document changes
3. **Use Pre-Releases**: Test with alpha/beta versions before stable releases
4. **Semantic Versioning**: Follow semver strictly for predictable updates
5. **Commit dist/**: Always commit the built `dist/` directory before tagging
6. **Announce Releases**: Notify users of major releases and breaking changes
7. **Security Patches**: Release security fixes as patch versions immediately
8. **Deprecation Warnings**: Add warnings before removing features in major versions

## Release Checklist

Use this checklist for each release:

- [ ] All tests pass locally (`npm test`)
- [ ] Code is built (`npm run build`)
- [ ] `dist/` directory is committed
- [ ] CHANGELOG.md is updated with version entry
- [ ] Version follows semantic versioning
- [ ] All PRs are merged to main
- [ ] Tag is created and pushed
- [ ] Release workflow completes successfully
- [ ] GitHub release is created
- [ ] Major version tag is updated (for stable releases)
- [ ] Action is published to Marketplace (for stable releases)
- [ ] Release is tested with a sample workflow
- [ ] Release is announced (if major/minor)

## Automation Details

The release workflow (`.github/workflows/release.yml`) includes:

### Job 1: Validate
- Extracts version from tag
- Validates semantic version format
- Checks for CHANGELOG entry
- Determines if pre-release

### Job 2: Test
- Runs type checking
- Runs linting
- Runs all tests with coverage
- Uploads coverage reports

### Job 3: Build
- Installs dependencies
- Builds TypeScript to JavaScript
- Bundles with ncc
- Verifies build artifacts

### Job 4: Release Notes
- Extracts CHANGELOG section for version
- Adds installation instructions
- Adds documentation links
- Generates full release notes

### Job 5: Release
- Creates GitHub release
- Attaches release notes
- Marks as pre-release if applicable
- Uploads build artifacts

### Job 6: Update Major Tag
- Updates major version tag (v1, v2, etc.)
- Only for stable releases (not pre-releases)
- Force pushes the tag

### Job 7: Marketplace
- Validates action.yml for marketplace
- Provides publication instructions
- Only for stable releases

### Job 8: Validate Release
- Verifies release tag exists
- Checks major version tag points to release
- Tests action can be referenced

### Job 9-10: Notifications
- Success: Provides release summary
- Failure: Provides debugging information

## Support

If you encounter issues with the release process:

1. Check the workflow logs in the Actions tab
2. Review this documentation
3. Check existing GitHub issues
4. Create a new issue with details about the problem

## References

- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [GitHub Actions: Publishing Actions](https://docs.github.com/en/actions/creating-actions/publishing-actions-in-github-marketplace)
- [GitHub Actions: Versioning](https://docs.github.com/en/actions/creating-actions/about-custom-actions#using-release-management-for-actions)
