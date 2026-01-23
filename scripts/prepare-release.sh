#!/bin/bash
set -e

# Script to prepare a new release
# Usage: ./scripts/prepare-release.sh <version>
# Example: ./scripts/prepare-release.sh 1.2.0

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 1.2.0"
  exit 1
fi

# Validate version format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$ ]]; then
  echo "Error: Invalid semantic version format: $VERSION"
  echo "Expected format: MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]"
  exit 1
fi

echo "🚀 Preparing release v$VERSION"
echo ""

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "⚠️  Warning: You are not on the main branch (current: $CURRENT_BRANCH)"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo "❌ Error: You have uncommitted changes"
  echo "Please commit or stash your changes before preparing a release"
  exit 1
fi

# Check if CHANGELOG has an entry for this version
if ! grep -q "\[$VERSION\]" CHANGELOG.md; then
  echo "⚠️  Warning: No CHANGELOG entry found for version $VERSION"
  echo ""
  echo "Please add a section to CHANGELOG.md like this:"
  echo ""
  echo "## [$VERSION] - $(date +%Y-%m-%d)"
  echo ""
  echo "### Added"
  echo "- New feature X"
  echo ""
  echo "### Changed"
  echo "- Improved Y"
  echo ""
  echo "### Fixed"
  echo "- Bug fix Z"
  echo ""
  read -p "Open CHANGELOG.md in editor? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    ${EDITOR:-nano} CHANGELOG.md
  else
    echo "Please update CHANGELOG.md manually and run this script again"
    exit 1
  fi
fi

# Run tests
echo "🧪 Running tests..."
if ! npm test; then
  echo "❌ Tests failed"
  echo "Please fix the failing tests before releasing"
  exit 1
fi
echo "✅ Tests passed"
echo ""

# Build the action
echo "🔨 Building action..."
if ! npm run build; then
  echo "❌ Build failed"
  echo "Please fix the build errors before releasing"
  exit 1
fi
echo "✅ Build successful"
echo ""

# Check if dist/ has changes
if ! git diff --quiet dist/; then
  echo "📦 dist/ directory has changes"
  echo "Committing updated build artifacts..."
  git add dist/
  git commit -m "chore: build for release v$VERSION"
  echo "✅ Build artifacts committed"
  echo ""
fi

# Update package.json version (optional, for reference)
echo "📝 Updating package.json version..."
npm version $VERSION --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump version to $VERSION" || echo "No version changes to commit"
echo ""

# Create the tag
echo "🏷️  Creating tag v$VERSION..."
git tag -a "v$VERSION" -m "Release v$VERSION"
echo "✅ Tag created"
echo ""

# Summary
echo "✅ Release v$VERSION is ready!"
echo ""
echo "Next steps:"
echo "  1. Review the changes: git log --oneline -5"
echo "  2. Push the changes: git push origin main"
echo "  3. Push the tag: git push origin v$VERSION"
echo ""
echo "The release workflow will automatically:"
echo "  - Run all tests"
echo "  - Build the action"
echo "  - Create a GitHub release"
echo "  - Update major version tags"
echo "  - Publish to GitHub Marketplace (for stable releases)"
echo ""
echo "Monitor the release at:"
echo "  https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
