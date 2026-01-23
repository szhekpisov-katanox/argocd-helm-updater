# Contributing to ArgoCD Helm Updater

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Development Setup

### Prerequisites

- Node.js 20 or higher
- npm or yarn
- Git

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/yourusername/argocd-helm-updater.git
   cd argocd-helm-updater
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run type checking
npm run typecheck
```

### Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

### Building

```bash
# Build the action
npm run build
```

The build process uses `@vercel/ncc` to bundle the TypeScript code into a single JavaScript file in the `dist/` directory.

## Testing Guidelines

### Unit Tests

- Write unit tests for all new functions and classes
- Test specific examples that demonstrate correct behavior
- Test important edge cases (empty inputs, boundary values, error conditions)
- Use descriptive test names that explain what is being tested
- Place unit tests in `tests/unit/` directory

Example:
```typescript
describe('DependencyExtractor', () => {
  it('should extract chart name and version from Application manifest', () => {
    // Test implementation
  });
});
```

### Property-Based Tests

- Write property-based tests for universal properties
- Use fast-check library for generating random test inputs
- Run minimum 100 iterations per property test
- Place property tests in `tests/property/` directory

Example:
```typescript
import * as fc from 'fast-check';

describe('Property: Semantic Version Ordering', () => {
  it('should correctly order any two semantic versions', () => {
    fc.assert(
      fc.property(arbSemver(), arbSemver(), (v1, v2) => {
        // Property test implementation
      }),
      { numRuns: 100 }
    );
  });
});
```

### Test Coverage

- Maintain at least 80% code coverage
- Focus on testing core logic and important edge cases
- Don't write tests just to increase coverage numbers

## Code Style

### TypeScript

- Use TypeScript strict mode
- Provide explicit return types for functions
- Avoid `any` types when possible
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Formatting

- Use Prettier for code formatting (configured in `.prettierrc.json`)
- Run `npm run format` before committing
- 100 character line length
- 2 space indentation
- Single quotes for strings

### Linting

- Follow ESLint rules (configured in `.eslintrc.js`)
- Fix all linting errors before submitting PR
- Run `npm run lint:fix` to auto-fix issues

## Commit Messages

Follow conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(scanner): add support for multi-document YAML files

fix(resolver): handle OCI registry authentication correctly

docs(readme): update configuration examples

test(extractor): add property tests for URL parsing
```

## Pull Request Process

1. **Update Tests**: Add or update tests for your changes
2. **Run Tests**: Ensure all tests pass (`npm test`)
3. **Check Coverage**: Verify coverage meets threshold (`npm run test:coverage`)
4. **Lint Code**: Fix all linting issues (`npm run lint:fix`)
5. **Format Code**: Format code (`npm run format`)
6. **Build**: Ensure the action builds successfully (`npm run build`)
7. **Update Documentation**: Update README.md if adding new features
8. **Update CHANGELOG**: Add entry to CHANGELOG.md under "Unreleased"
9. **Create PR**: Submit pull request with clear description

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Property tests added/updated
- [ ] All tests passing
- [ ] Coverage maintained/improved

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] No new warnings generated
```

## Project Structure

```
argocd-helm-updater/
├── src/                    # Source code
│   ├── config/            # Configuration management
│   ├── scanner/           # Manifest scanning
│   ├── extractor/         # Dependency extraction
│   ├── resolver/          # Version resolution
│   ├── updater/           # File updates
│   ├── pr/                # Pull request management
│   ├── types/             # TypeScript types
│   ├── utils/             # Utility functions
│   └── index.ts           # Main entry point
├── tests/                 # Tests
│   ├── unit/             # Unit tests
│   ├── property/         # Property-based tests
│   ├── integration/      # Integration tests
│   └── fixtures/         # Test fixtures
├── dist/                  # Build output (generated)
├── action.yml            # GitHub Action metadata
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── jest.config.js        # Jest config
├── .eslintrc.js          # ESLint config
└── .prettierrc.json      # Prettier config
```

## Architecture Overview

The action follows a pipeline architecture:

1. **Configuration Loading**: Load and validate configuration
2. **Manifest Discovery**: Scan repository for ArgoCD manifests
3. **Dependency Extraction**: Extract Helm chart dependencies
4. **Version Checking**: Query repositories for new versions
5. **File Update**: Update manifest files with new versions
6. **PR Creation**: Create pull requests with changes

Each stage is implemented as a separate component with clear interfaces.

## Getting Help

- Open an issue for bug reports or feature requests
- Start a discussion for questions or ideas
- Review existing issues and PRs before creating new ones

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Assume good intentions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
