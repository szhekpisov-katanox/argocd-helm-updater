/**
 * Property-based tests for Error Logging with Context
 * 
 * **Property 27: Error Logging with Context**
 * **Validates: Requirements 9.1, 9.7**
 * 
 * For any error that occurs during execution, the action should log a 
 * descriptive message including relevant context (file path, chart name, 
 * error details).
 */

import * as fc from 'fast-check';
import { Logger } from '../../src/utils/logger';
import * as core from '@actions/core';

// Mock @actions/core
jest.mock('@actions/core');

describe('Property 27: Error Logging with Context', () => {
  let mockError: jest.SpyInstance;
  let mockWarning: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockError = jest.spyOn(core, 'error').mockImplementation();
    mockWarning = jest.spyOn(core, 'warning').mockImplementation();
  });

  /**
   * Custom arbitraries for generating test data
   */

  // Generate file paths
  const arbFilePath = fc.oneof(
    fc.stringMatching(/^[a-z0-9\-_\/]+\.yaml$/),
    fc.stringMatching(/^[a-z0-9\-_\/]+\.yml$/),
    fc.constant('manifests/application.yaml'),
    fc.constant('apps/prod/app.yml'),
    fc.constant('argocd/applicationset.yaml')
  );

  // Generate chart names
  const arbChartName = fc.oneof(
    fc.stringMatching(/^[a-z0-9\-]+$/),
    fc.constant('nginx'),
    fc.constant('postgresql'),
    fc.constant('redis')
  );

  // Generate repository URLs
  const arbRepoURL = fc.oneof(
    fc.webUrl(),
    fc.constant('https://charts.bitnami.com/bitnami'),
    fc.constant('oci://registry-1.docker.io/bitnamicharts'),
    fc.constant('https://charts.example.com')
  );

  // Generate context strings
  const arbContext = fc.oneof(
    fc.constant('fetching repository index'),
    fc.constant('parsing manifest'),
    fc.constant('updating file'),
    fc.constant('creating pull request'),
    fc.constant('resolving versions'),
    fc.stringMatching(/^[a-z\s]+$/)
  );

  // Generate error messages
  const arbErrorMessage = fc.oneof(
    fc.constant('Connection timeout'),
    fc.constant('Invalid YAML syntax'),
    fc.constant('File not found'),
    fc.constant('Network error'),
    fc.constant('Authentication failed'),
    fc.constant('Permission denied'),
    fc.string({ minLength: 5, maxLength: 100 })
  );

  // Generate Error objects or strings
  const arbError = fc.oneof(
    arbErrorMessage.map(msg => new Error(msg)),
    arbErrorMessage
  );

  /**
   * Property 27.1: Parsing errors include file path
   * 
   * For any parsing error, the logged message should include the file path
   * that failed to parse.
   */
  it('should include file path in parsing error messages', () => {
    fc.assert(
      fc.property(
        arbFilePath,
        arbError,
        (filePath, error) => {
          const logger = new Logger('info');

          logger.logParsingError(filePath, error);

          // Should have been called with warning
          expect(mockWarning).toHaveBeenCalledTimes(1);

          // Extract the logged message
          const loggedMessage = mockWarning.mock.calls[0][0];

          // Message should include the file path
          expect(loggedMessage).toContain(filePath);

          // Message should include error details
          const errorMessage = error instanceof Error ? error.message : String(error);
          expect(loggedMessage).toContain(errorMessage);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 27.2: Generic errors include context
   * 
   * For any error with context, the logged message should include both
   * the context and the error details.
   */
  it('should include context in generic error messages', () => {
    fc.assert(
      fc.property(
        arbContext,
        arbError,
        (context, error) => {
          const logger = new Logger('info');

          logger.logErrorWithContext(context, error);

          // Should have been called with error
          expect(mockError).toHaveBeenCalledTimes(1);

          // Extract the logged message
          const loggedMessage = mockError.mock.calls[0][0];

          // Message should include the context
          expect(loggedMessage).toContain(context);

          // Message should include error details
          const errorMessage = error instanceof Error ? error.message : String(error);
          expect(loggedMessage).toContain(errorMessage);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 27.3: Repository errors include URL and chart name
   * 
   * For any repository fetch error, the logged message should include
   * the repository URL and chart name (if provided).
   */
  it('should include repository URL and chart name in repository errors', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        fc.option(arbChartName, { nil: undefined }),
        arbError,
        (repoURL, chartName, error) => {
          const logger = new Logger('info');

          logger.logRepositoryError(repoURL, chartName, error);

          // Should have been called with error
          expect(mockError).toHaveBeenCalledTimes(1);

          // Extract the logged message
          const loggedMessage = mockError.mock.calls[0][0];

          // Message should include the repository URL
          expect(loggedMessage).toContain(repoURL);

          // Message should include chart name if provided
          if (chartName) {
            expect(loggedMessage).toContain(chartName);
          }

          // Message should include error details
          const errorMessage = error instanceof Error ? error.message : String(error);
          expect(loggedMessage).toContain(errorMessage);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 27.4: Authentication errors include registry and guidance
   * 
   * For any authentication error, the logged message should include
   * the registry URL and configuration guidance.
   */
  it('should include registry URL and guidance in authentication errors', () => {
    fc.assert(
      fc.property(
        arbRepoURL,
        arbError,
        (registry, error) => {
          const logger = new Logger('info');

          logger.logAuthenticationError(registry, error);

          // Should have been called with error at least twice (error + guidance)
          expect(mockError).toHaveBeenCalled();
          expect(mockError.mock.calls.length).toBeGreaterThanOrEqual(2);

          // Extract the first logged message (the error)
          const errorMessage = mockError.mock.calls[0][0];

          // Message should include the registry
          expect(errorMessage).toContain(registry);

          // Message should include error details
          const errorDetails = error instanceof Error ? error.message : String(error);
          expect(errorMessage).toContain(errorDetails);

          // Should include guidance in subsequent calls
          const allMessages = mockError.mock.calls.map(call => call[0]).join(' ');
          expect(allMessages).toMatch(/credential|configuration|username|password/i);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 27.5: Error objects and strings are handled consistently
   * 
   * For any error (whether Error object or string), the logged message
   * should extract and include the error details correctly.
   */
  it('should handle both Error objects and string errors consistently', () => {
    fc.assert(
      fc.property(
        arbContext,
        arbErrorMessage,
        (context, errorMessage) => {
          const logger = new Logger('info');

          // Test with Error object
          const errorObj = new Error(errorMessage);
          logger.logErrorWithContext(context, errorObj);

          const loggedWithError = mockError.mock.calls[0][0];
          expect(loggedWithError).toContain(errorMessage);

          jest.clearAllMocks();

          // Test with string
          logger.logErrorWithContext(context, errorMessage);

          const loggedWithString = mockError.mock.calls[0][0];
          expect(loggedWithString).toContain(errorMessage);

          // Both should produce equivalent messages
          expect(loggedWithError).toBe(loggedWithString);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 27.6: Multiple errors with same context are logged separately
   * 
   * For any sequence of errors with the same context, each error should
   * be logged as a separate message.
   */
  it('should log multiple errors with same context separately', () => {
    fc.assert(
      fc.property(
        arbContext,
        fc.array(arbError, { minLength: 2, maxLength: 5 }),
        (context, errors) => {
          const logger = new Logger('info');

          // Log all errors
          errors.forEach(error => {
            logger.logErrorWithContext(context, error);
          });

          // Should have been called once per error
          expect(mockError).toHaveBeenCalledTimes(errors.length);

          // Each call should include the context
          mockError.mock.calls.forEach(call => {
            expect(call[0]).toContain(context);
          });

          jest.clearAllMocks();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 27.7: Error messages are descriptive and actionable
   * 
   * For any error, the logged message should be descriptive enough to
   * understand what went wrong and where.
   */
  it('should produce descriptive error messages with sufficient context', () => {
    fc.assert(
      fc.property(
        arbFilePath,
        arbChartName,
        arbRepoURL,
        arbErrorMessage,
        (filePath, chartName, repoURL, errorMessage) => {
          const logger = new Logger('info');

          // Test parsing error
          logger.logParsingError(filePath, errorMessage);
          const parsingMsg = mockWarning.mock.calls[0][0];
          
          // Should contain both file path and error
          expect(parsingMsg.split(' ').length).toBeGreaterThan(3);
          expect(parsingMsg).toContain(filePath);
          expect(parsingMsg).toContain(errorMessage);

          jest.clearAllMocks();

          // Test repository error
          logger.logRepositoryError(repoURL, chartName, errorMessage);
          const repoMsg = mockError.mock.calls[0][0];
          
          // Should contain URL, chart, and error
          expect(repoMsg.split(' ').length).toBeGreaterThan(3);
          expect(repoMsg).toContain(repoURL);
          expect(repoMsg).toContain(chartName);
          expect(repoMsg).toContain(errorMessage);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 27.8: Empty or whitespace-only errors are handled
   * 
   * For any error with empty or whitespace-only message, the logger
   * should still produce a valid log message with context.
   */
  it('should handle empty or whitespace-only error messages', () => {
    fc.assert(
      fc.property(
        arbContext,
        fc.constantFrom('', '   ', '\t', '\n'),
        (context, emptyError) => {
          const logger = new Logger('info');

          logger.logErrorWithContext(context, emptyError);

          // Should still log something
          expect(mockError).toHaveBeenCalledTimes(1);

          // Message should at least include the context
          const loggedMessage = mockError.mock.calls[0][0];
          expect(loggedMessage).toContain(context);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 27.9: Special characters in context are preserved
   * 
   * For any context string with special characters, the logged message
   * should preserve those characters correctly.
   */
  it('should preserve special characters in context strings', () => {
    const arbSpecialContext = fc.oneof(
      fc.constant('file: /path/to/manifest.yaml'),
      fc.constant('chart: nginx@1.2.3'),
      fc.constant('URL: https://example.com/charts'),
      fc.constant('operation: create/update PR'),
      fc.string({ minLength: 5, maxLength: 50 })
    );

    fc.assert(
      fc.property(
        arbSpecialContext,
        arbError,
        (context, error) => {
          const logger = new Logger('info');

          logger.logErrorWithContext(context, error);

          // Extract the logged message
          const loggedMessage = mockError.mock.calls[0][0];

          // Context should be preserved exactly
          expect(loggedMessage).toContain(context);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 27.10: Error logging respects log level
   * 
   * For any error, the logging should respect the configured log level.
   * Parsing errors use warn level, others use error level.
   */
  it('should respect log level when logging errors', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'debug' | 'info' | 'warn' | 'error'>('debug', 'info', 'warn', 'error'),
        arbFilePath,
        arbContext,
        arbError,
        (logLevel, filePath, context, error) => {
          const logger = new Logger(logLevel);

          // Test parsing error (uses warn level)
          logger.logParsingError(filePath, error);
          
          const logLevels = ['debug', 'info', 'warn', 'error'];
          const configuredIndex = logLevels.indexOf(logLevel);
          const warnIndex = logLevels.indexOf('warn');
          
          if (warnIndex >= configuredIndex) {
            expect(mockWarning).toHaveBeenCalled();
          } else {
            expect(mockWarning).not.toHaveBeenCalled();
          }

          jest.clearAllMocks();

          // Test generic error (uses error level)
          logger.logErrorWithContext(context, error);
          
          const errorIndex = logLevels.indexOf('error');
          
          if (errorIndex >= configuredIndex) {
            expect(mockError).toHaveBeenCalled();
          } else {
            expect(mockError).not.toHaveBeenCalled();
          }

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 27.11: Nested error information is extracted
   * 
   * For any Error object with nested properties (stack, cause, etc.),
   * the logger should extract the message correctly.
   */
  it('should extract message from Error objects with various properties', () => {
    fc.assert(
      fc.property(
        arbContext,
        arbErrorMessage,
        fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined }),
        (context, message, stack) => {
          const logger = new Logger('info');

          // Create Error with optional stack
          const error = new Error(message);
          if (stack) {
            error.stack = stack;
          }

          logger.logErrorWithContext(context, error);

          // Should extract the message, not the stack
          const loggedMessage = mockError.mock.calls[0][0];
          expect(loggedMessage).toContain(message);
          expect(loggedMessage).toContain(context);

          // Should not include the full stack trace in the message
          if (stack && stack.length > message.length) {
            expect(loggedMessage.length).toBeLessThan(context.length + stack.length + 50);
          }

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 27.12: Context and error are clearly separated
   * 
   * For any context and error, the logged message should clearly
   * distinguish between the context and the error details.
   */
  it('should clearly separate context from error details in messages', () => {
    fc.assert(
      fc.property(
        arbContext,
        arbErrorMessage,
        (context, errorMessage) => {
          const logger = new Logger('info');

          logger.logErrorWithContext(context, errorMessage);

          const loggedMessage = mockError.mock.calls[0][0];

          // Should contain both context and error
          expect(loggedMessage).toContain(context);
          expect(loggedMessage).toContain(errorMessage);

          // Should have some separator between them (colon, dash, etc.)
          const contextIndex = loggedMessage.indexOf(context);
          const errorIndex = loggedMessage.indexOf(errorMessage);
          
          // Error should come after context
          expect(errorIndex).toBeGreaterThan(contextIndex);

          // There should be at least one character between them
          expect(errorIndex - (contextIndex + context.length)).toBeGreaterThan(0);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });
});
