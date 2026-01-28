/**
 * Property-based tests for Authentication Error Guidance
 * 
 * **Property 30: Authentication Error Guidance**
 * **Validates: Requirements 9.6**
 * 
 * For any authentication failure, the error message should include guidance
 * on how to configure credentials correctly.
 */

import * as fc from 'fast-check';
import { Logger } from '../../src/utils/logger';
import * as core from '@actions/core';

// Mock @actions/core
jest.mock('@actions/core');

describe('Property 30: Authentication Error Guidance', () => {
  let mockError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockError = jest.spyOn(core, 'error').mockImplementation();
  });

  afterEach(() => {
    mockError.mockRestore();
  });

  /**
   * Custom arbitraries for generating test data
   */

  // Generate registry URLs
  const arbRegistryURL = fc.oneof(
    fc.webUrl({ validSchemes: ['https'] }),
    fc.constant('https://charts.bitnami.com/bitnami'),
    fc.constant('https://registry-1.docker.io'),
    fc.constant('https://ghcr.io'),
    fc.constant('https://charts.private.example.com'),
    fc.stringMatching(/^https:\/\/[a-z0-9\-\.]+\.[a-z]{2,}(\/[a-z0-9\-_\/]*)?$/)
  );

  // Generate authentication error messages
  const arbAuthErrorMessage = fc.oneof(
    fc.constant('401 Unauthorized'),
    fc.constant('403 Forbidden'),
    fc.constant('Authentication required'),
    fc.constant('Invalid credentials'),
    fc.constant('Access denied'),
    fc.constant('Token expired'),
    fc.constant('Request failed with status code 401'),
    fc.constant('Request failed with status code 403'),
    fc.string({ minLength: 10, maxLength: 100 })
  );

  // Generate Error objects or strings
  const arbAuthError = fc.oneof(
    arbAuthErrorMessage.map(msg => new Error(msg)),
    arbAuthErrorMessage
  );

  /**
   * Property 30.1: Authentication errors include registry URL
   * 
   * For any authentication error, the logged message should include
   * the registry URL that failed authentication.
   */
  it('should include registry URL in authentication error messages', () => {
    fc.assert(
      fc.property(
        arbRegistryURL,
        arbAuthError,
        (registryURL, error) => {
          const logger = new Logger('info');

          logger.logAuthenticationError(registryURL, error);

          // Should have been called with error at least once
          expect(mockError).toHaveBeenCalled();

          // Extract the first logged message (the error)
          const errorMessage = mockError.mock.calls[0][0];

          // Message should include the registry URL
          expect(errorMessage).toContain(registryURL);

          // Message should include error details
          const errorDetails = error instanceof Error ? error.message : String(error);
          expect(errorMessage).toContain(errorDetails);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 30.2: Authentication errors include configuration guidance
   * 
   * For any authentication error, the logged messages should include
   * guidance on how to configure credentials.
   */
  it('should include configuration guidance in authentication error messages', () => {
    fc.assert(
      fc.property(
        arbRegistryURL,
        arbAuthError,
        (registryURL, error) => {
          const logger = new Logger('info');

          logger.logAuthenticationError(registryURL, error);

          // Should have been called with error multiple times (error + guidance)
          expect(mockError).toHaveBeenCalled();
          expect(mockError.mock.calls.length).toBeGreaterThanOrEqual(2);

          // Combine all error messages
          const allMessages = mockError.mock.calls.map(call => call[0]).join(' ');

          // Should include guidance keywords
          expect(allMessages).toMatch(/credential|configuration/i);
          expect(allMessages).toMatch(/registry/i);

          // Should include configuration example keywords
          expect(allMessages).toMatch(/username|password|auth-type|bearer|basic/i);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 30.3: Guidance includes registry-credentials configuration
   * 
   * For any authentication error, the guidance should mention the
   * registry-credentials configuration option.
   */
  it('should mention registry-credentials in guidance', () => {
    fc.assert(
      fc.property(
        arbRegistryURL,
        arbAuthError,
        (registryURL, error) => {
          const logger = new Logger('info');

          logger.logAuthenticationError(registryURL, error);

          // Combine all error messages
          const allMessages = mockError.mock.calls.map(call => call[0]).join(' ');

          // Should mention registry-credentials
          expect(allMessages).toMatch(/registry-credentials|registry.*credentials/i);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 30.4: Guidance includes authentication types
   * 
   * For any authentication error, the guidance should mention the
   * available authentication types (basic, bearer).
   */
  it('should mention authentication types in guidance', () => {
    fc.assert(
      fc.property(
        arbRegistryURL,
        arbAuthError,
        (registryURL, error) => {
          const logger = new Logger('info');

          logger.logAuthenticationError(registryURL, error);

          // Combine all error messages
          const allMessages = mockError.mock.calls.map(call => call[0]).join(' ');

          // Should mention both basic and bearer auth types
          expect(allMessages).toMatch(/basic/i);
          expect(allMessages).toMatch(/bearer/i);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 30.5: Guidance includes required fields
   * 
   * For any authentication error, the guidance should mention the
   * required configuration fields (registry, username, password).
   */
  it('should mention required configuration fields in guidance', () => {
    fc.assert(
      fc.property(
        arbRegistryURL,
        arbAuthError,
        (registryURL, error) => {
          const logger = new Logger('info');

          logger.logAuthenticationError(registryURL, error);

          // Combine all error messages
          const allMessages = mockError.mock.calls.map(call => call[0]).join(' ');

          // Should mention required fields
          expect(allMessages).toMatch(/registry/i);
          expect(allMessages).toMatch(/username/i);
          expect(allMessages).toMatch(/password/i);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 30.6: Error and guidance are logged separately
   * 
   * For any authentication error, the error message and guidance
   * should be logged as separate calls to allow proper formatting.
   */
  it('should log error and guidance as separate messages', () => {
    fc.assert(
      fc.property(
        arbRegistryURL,
        arbAuthError,
        (registryURL, error) => {
          const logger = new Logger('info');

          logger.logAuthenticationError(registryURL, error);

          // Should have been called at least twice
          expect(mockError.mock.calls.length).toBeGreaterThanOrEqual(2);

          // First call should be the error message
          const firstMessage = mockError.mock.calls[0][0];
          expect(firstMessage).toContain(registryURL);
          const errorDetails = error instanceof Error ? error.message : String(error);
          expect(firstMessage).toContain(errorDetails);

          // Subsequent calls should contain guidance
          const guidanceMessages = mockError.mock.calls.slice(1).map(call => call[0]).join(' ');
          expect(guidanceMessages).toMatch(/credential|configuration/i);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 30.7: Guidance is actionable and specific
   * 
   * For any authentication error, the guidance should provide
   * specific, actionable instructions (not just generic advice).
   */
  it('should provide actionable and specific guidance', () => {
    fc.assert(
      fc.property(
        arbRegistryURL,
        arbAuthError,
        (registryURL, error) => {
          const logger = new Logger('info');

          logger.logAuthenticationError(registryURL, error);

          // Combine all error messages
          const allMessages = mockError.mock.calls.map(call => call[0]).join(' ');

          // Should include specific configuration syntax (YAML-like)
          // Looking for patterns like "registry:", "username:", "password:"
          const hasConfigSyntax = /registry:\s*<|username:\s*<|password:\s*</i.test(allMessages);
          expect(hasConfigSyntax).toBe(true);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 30.8: Guidance respects log level
   * 
   * For any authentication error, both the error and guidance should
   * respect the configured log level (error level).
   */
  it('should respect log level when logging authentication errors', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'debug' | 'info' | 'warn' | 'error'>('debug', 'info', 'warn', 'error'),
        arbRegistryURL,
        arbAuthError,
        (logLevel, registryURL, error) => {
          const logger = new Logger(logLevel);

          logger.logAuthenticationError(registryURL, error);

          const logLevels = ['debug', 'info', 'warn', 'error'];
          const configuredIndex = logLevels.indexOf(logLevel);
          const errorIndex = logLevels.indexOf('error');

          if (errorIndex >= configuredIndex) {
            // Should log when error level is enabled
            expect(mockError).toHaveBeenCalled();
          } else {
            // Should not log when error level is disabled
            expect(mockError).not.toHaveBeenCalled();
          }

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 30.9: Multiple authentication errors are logged separately
   * 
   * For any sequence of authentication errors for different registries,
   * each error should be logged with its own guidance.
   */
  it('should log multiple authentication errors separately with guidance', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(arbRegistryURL, arbAuthError),
          { minLength: 2, maxLength: 4 }
        ),
        (errorPairs) => {
          const logger = new Logger('info');

          // Log all authentication errors
          errorPairs.forEach(([registryURL, error]) => {
            logger.logAuthenticationError(registryURL, error);
          });

          // Should have been called at least twice per error (error + guidance)
          expect(mockError.mock.calls.length).toBeGreaterThanOrEqual(errorPairs.length * 2);

          // Each registry should appear in the logged messages
          const allMessages = mockError.mock.calls.map(call => call[0]).join(' ');
          errorPairs.forEach(([registryURL]) => {
            expect(allMessages).toContain(registryURL);
          });

          jest.clearAllMocks();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 30.10: Error objects and strings are handled consistently
   * 
   * For any authentication error (whether Error object or string),
   * the guidance should be provided consistently.
   */
  it('should provide guidance consistently for Error objects and strings', () => {
    fc.assert(
      fc.property(
        arbRegistryURL,
        arbAuthErrorMessage,
        (registryURL, errorMessage) => {
          const logger = new Logger('info');

          // Test with Error object
          const errorObj = new Error(errorMessage);
          logger.logAuthenticationError(registryURL, errorObj);

          const callsWithError = mockError.mock.calls.length;
          const messagesWithError = mockError.mock.calls.map(call => call[0]).join(' ');

          jest.clearAllMocks();

          // Test with string
          logger.logAuthenticationError(registryURL, errorMessage);

          const callsWithString = mockError.mock.calls.length;
          const messagesWithString = mockError.mock.calls.map(call => call[0]).join(' ');

          // Should have same number of calls
          expect(callsWithError).toBe(callsWithString);

          // Both should include guidance
          expect(messagesWithError).toMatch(/credential|configuration/i);
          expect(messagesWithString).toMatch(/credential|configuration/i);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 30.11: Guidance includes example configuration format
   * 
   * For any authentication error, the guidance should include an
   * example of the configuration format (YAML structure).
   */
  it('should include example configuration format in guidance', () => {
    fc.assert(
      fc.property(
        arbRegistryURL,
        arbAuthError,
        (registryURL, error) => {
          const logger = new Logger('info');

          logger.logAuthenticationError(registryURL, error);

          // Combine all error messages
          const allMessages = mockError.mock.calls.map(call => call[0]).join('\n');

          // Should include YAML-like structure with indentation
          // Looking for patterns like "  - registry:" or "    username:"
          const hasYAMLStructure = /\s{2,}(-\s+)?registry:|username:|password:|auth-type:/i.test(allMessages);
          expect(hasYAMLStructure).toBe(true);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 30.12: Guidance is clear and not truncated
   * 
   * For any authentication error, the guidance message should be
   * complete and not truncated (sufficient length to be useful).
   */
  it('should provide complete and clear guidance messages', () => {
    fc.assert(
      fc.property(
        arbRegistryURL,
        arbAuthError,
        (registryURL, error) => {
          const logger = new Logger('info');

          logger.logAuthenticationError(registryURL, error);

          // Combine all error messages
          const allMessages = mockError.mock.calls.map(call => call[0]).join(' ');

          // Guidance should be substantial (not just a few words)
          expect(allMessages.length).toBeGreaterThan(100);

          // Should include multiple configuration fields
          const fieldCount = [
            /registry/i.test(allMessages),
            /username/i.test(allMessages),
            /password/i.test(allMessages),
            /auth-type/i.test(allMessages),
            /basic/i.test(allMessages),
            /bearer/i.test(allMessages),
          ].filter(Boolean).length;

          expect(fieldCount).toBeGreaterThanOrEqual(4);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });
});
