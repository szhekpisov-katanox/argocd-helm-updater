/**
 * Property-based tests for Log Level Filtering
 * 
 * **Property 29: Log Level Filtering**
 * **Validates: Requirements 9.5**
 * 
 * For any configured log level, only messages at that level or higher 
 * severity should be output.
 */

import * as fc from 'fast-check';
import { Logger, LogLevel } from '../../src/utils/logger';
import * as core from '@actions/core';

// Mock @actions/core
jest.mock('@actions/core');

describe('Property: Log Level Filtering', () => {
  let mockDebug: jest.SpyInstance;
  let mockInfo: jest.SpyInstance;
  let mockWarning: jest.SpyInstance;
  let mockError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDebug = jest.spyOn(core, 'debug').mockImplementation();
    mockInfo = jest.spyOn(core, 'info').mockImplementation();
    mockWarning = jest.spyOn(core, 'warning').mockImplementation();
    mockError = jest.spyOn(core, 'error').mockImplementation();
  });

  /**
   * Define the log level hierarchy
   */
  const logLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  const logLevelIndex = (level: LogLevel): number => logLevels.indexOf(level);

  /**
   * Arbitrary for generating log levels
   */
  const arbLogLevel = fc.constantFrom<LogLevel>('debug', 'info', 'warn', 'error');

  /**
   * Arbitrary for generating log messages
   */
  const arbLogMessage = fc.string({ minLength: 1, maxLength: 200 });

  /**
   * Helper to get the mock function for a log level
   */
  const getMockForLevel = (level: LogLevel): jest.SpyInstance => {
    switch (level) {
      case 'debug': return mockDebug;
      case 'info': return mockInfo;
      case 'warn': return mockWarning;
      case 'error': return mockError;
    }
  };

  /**
   * Helper to log a message at a specific level
   */
  const logAtLevel = (logger: Logger, level: LogLevel, message: string): void => {
    switch (level) {
      case 'debug': logger.debug(message); break;
      case 'info': logger.info(message); break;
      case 'warn': logger.warn(message); break;
      case 'error': logger.error(message); break;
    }
  };

  /**
   * Property 29: Messages at or above configured log level should be logged
   * 
   * For any configured log level and any message level at or above it,
   * the message should be logged.
   */
  it('should log messages at or above the configured log level', () => {
    fc.assert(
      fc.property(
        arbLogLevel,
        arbLogLevel,
        arbLogMessage,
        (configuredLevel, messageLevel, message) => {
          const logger = new Logger(configuredLevel);
          const mock = getMockForLevel(messageLevel);

          logAtLevel(logger, messageLevel, message);

          const shouldLog = logLevelIndex(messageLevel) >= logLevelIndex(configuredLevel);

          if (shouldLog) {
            expect(mock).toHaveBeenCalledWith(message);
          } else {
            expect(mock).not.toHaveBeenCalled();
          }

          // Clean up for next iteration
          jest.clearAllMocks();
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Property: Messages below configured log level should not be logged
   * 
   * For any configured log level and any message level below it,
   * the message should not be logged.
   */
  it('should not log messages below the configured log level', () => {
    fc.assert(
      fc.property(
        arbLogLevel,
        arbLogMessage,
        (configuredLevel, message) => {
          const logger = new Logger(configuredLevel);

          // Try logging at all levels below the configured level
          const configuredIndex = logLevelIndex(configuredLevel);
          const lowerLevels = logLevels.slice(0, configuredIndex);

          lowerLevels.forEach(lowerLevel => {
            const mock = getMockForLevel(lowerLevel);
            logAtLevel(logger, lowerLevel, message);
            expect(mock).not.toHaveBeenCalled();
          });

          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Debug level should log all messages
   * 
   * When log level is set to debug, all message levels should be logged.
   */
  it('should log all message levels when configured to debug', () => {
    fc.assert(
      fc.property(
        arbLogMessage,
        arbLogMessage,
        arbLogMessage,
        arbLogMessage,
        (debugMsg, infoMsg, warnMsg, errorMsg) => {
          const logger = new Logger('debug');

          logger.debug(debugMsg);
          logger.info(infoMsg);
          logger.warn(warnMsg);
          logger.error(errorMsg);

          expect(mockDebug).toHaveBeenCalledWith(debugMsg);
          expect(mockInfo).toHaveBeenCalledWith(infoMsg);
          expect(mockWarning).toHaveBeenCalledWith(warnMsg);
          expect(mockError).toHaveBeenCalledWith(errorMsg);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Error level should only log error messages
   * 
   * When log level is set to error, only error messages should be logged.
   */
  it('should only log error messages when configured to error', () => {
    fc.assert(
      fc.property(
        arbLogMessage,
        arbLogMessage,
        arbLogMessage,
        arbLogMessage,
        (debugMsg, infoMsg, warnMsg, errorMsg) => {
          const logger = new Logger('error');

          logger.debug(debugMsg);
          logger.info(infoMsg);
          logger.warn(warnMsg);
          logger.error(errorMsg);

          expect(mockDebug).not.toHaveBeenCalled();
          expect(mockInfo).not.toHaveBeenCalled();
          expect(mockWarning).not.toHaveBeenCalled();
          expect(mockError).toHaveBeenCalledWith(errorMsg);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Log level changes should affect subsequent messages
   * 
   * When log level is changed dynamically, subsequent messages should
   * respect the new log level.
   */
  it('should respect log level changes for subsequent messages', () => {
    fc.assert(
      fc.property(
        arbLogLevel,
        arbLogLevel,
        arbLogLevel,
        arbLogMessage,
        (initialLevel, messageLevel, newLevel, message) => {
          const logger = new Logger(initialLevel);

          // Log with initial level
          logAtLevel(logger, messageLevel, message);
          const shouldLogInitial = logLevelIndex(messageLevel) >= logLevelIndex(initialLevel);
          const mock = getMockForLevel(messageLevel);

          if (shouldLogInitial) {
            expect(mock).toHaveBeenCalledWith(message);
          } else {
            expect(mock).not.toHaveBeenCalled();
          }

          jest.clearAllMocks();

          // Change log level
          logger.setLogLevel(newLevel);

          // Log with new level
          logAtLevel(logger, messageLevel, message);
          const shouldLogNew = logLevelIndex(messageLevel) >= logLevelIndex(newLevel);

          if (shouldLogNew) {
            expect(mock).toHaveBeenCalledWith(message);
          } else {
            expect(mock).not.toHaveBeenCalled();
          }

          jest.clearAllMocks();
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Property: Multiple messages at different levels should be filtered correctly
   * 
   * When logging multiple messages at different levels, each should be
   * filtered according to the configured log level.
   */
  it('should filter multiple messages at different levels correctly', () => {
    fc.assert(
      fc.property(
        arbLogLevel,
        fc.array(fc.tuple(arbLogLevel, arbLogMessage), { minLength: 1, maxLength: 10 }),
        (configuredLevel, messages) => {
          const logger = new Logger(configuredLevel);

          messages.forEach(([level, message]) => {
            logAtLevel(logger, level, message);
          });

          // Verify each message was logged or not based on level
          messages.forEach(([level, message]) => {
            const mock = getMockForLevel(level);
            const shouldLog = logLevelIndex(level) >= logLevelIndex(configuredLevel);

            if (shouldLog) {
              expect(mock).toHaveBeenCalledWith(message);
            }
          });

          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Specialized logging methods should respect log level
   * 
   * Specialized logging methods (logFileScanning, logUpdateDetected, etc.)
   * should respect the configured log level.
   */
  it('should respect log level for specialized logging methods', () => {
    fc.assert(
      fc.property(
        arbLogLevel,
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (configuredLevel, filePath, chartName, version) => {
          const logger = new Logger(configuredLevel);

          // logFileScanning uses debug level
          logger.logFileScanning(filePath);
          if (logLevelIndex('debug') >= logLevelIndex(configuredLevel)) {
            expect(mockDebug).toHaveBeenCalled();
          } else {
            expect(mockDebug).not.toHaveBeenCalled();
          }

          jest.clearAllMocks();

          // logUpdateDetected uses info level
          logger.logUpdateDetected(chartName, version, version);
          if (logLevelIndex('info') >= logLevelIndex(configuredLevel)) {
            expect(mockInfo).toHaveBeenCalled();
          } else {
            expect(mockInfo).not.toHaveBeenCalled();
          }

          jest.clearAllMocks();

          // logParsingError uses warn level
          logger.logParsingError(filePath, 'error');
          if (logLevelIndex('warn') >= logLevelIndex(configuredLevel)) {
            expect(mockWarning).toHaveBeenCalled();
          } else {
            expect(mockWarning).not.toHaveBeenCalled();
          }

          jest.clearAllMocks();

          // logErrorWithContext uses error level
          logger.logErrorWithContext('context', 'error');
          if (logLevelIndex('error') >= logLevelIndex(configuredLevel)) {
            expect(mockError).toHaveBeenCalled();
          } else {
            expect(mockError).not.toHaveBeenCalled();
          }

          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty messages should still respect log level filtering
   * 
   * Even empty messages should be filtered according to log level.
   */
  it('should filter empty messages according to log level', () => {
    fc.assert(
      fc.property(
        arbLogLevel,
        arbLogLevel,
        (configuredLevel, messageLevel) => {
          const logger = new Logger(configuredLevel);
          const mock = getMockForLevel(messageLevel);

          logAtLevel(logger, messageLevel, '');

          const shouldLog = logLevelIndex(messageLevel) >= logLevelIndex(configuredLevel);

          if (shouldLog) {
            expect(mock).toHaveBeenCalledWith('');
          } else {
            expect(mock).not.toHaveBeenCalled();
          }

          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Log level hierarchy should be transitive
   * 
   * If level A allows level B, and level B allows level C,
   * then level A should allow level C.
   */
  it('should maintain transitive log level hierarchy', () => {
    fc.assert(
      fc.property(
        arbLogMessage,
        (message) => {
          // Test transitivity: debug allows all
          const debugLogger = new Logger('debug');
          logLevels.forEach(level => {
            const mock = getMockForLevel(level);
            logAtLevel(debugLogger, level, message);
            expect(mock).toHaveBeenCalledWith(message);
            jest.clearAllMocks();
          });

          // Test transitivity: info allows info, warn, error
          const infoLogger = new Logger('info');
          ['info', 'warn', 'error'].forEach(level => {
            const mock = getMockForLevel(level as LogLevel);
            logAtLevel(infoLogger, level as LogLevel, message);
            expect(mock).toHaveBeenCalledWith(message);
            jest.clearAllMocks();
          });

          // Test transitivity: warn allows warn, error
          const warnLogger = new Logger('warn');
          ['warn', 'error'].forEach(level => {
            const mock = getMockForLevel(level as LogLevel);
            logAtLevel(warnLogger, level as LogLevel, message);
            expect(mock).toHaveBeenCalledWith(message);
            jest.clearAllMocks();
          });

          // Test transitivity: error allows only error
          const errorLogger = new Logger('error');
          const errorMock = getMockForLevel('error');
          logAtLevel(errorLogger, 'error', message);
          expect(errorMock).toHaveBeenCalledWith(message);
          jest.clearAllMocks();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Log level should not affect message content
   * 
   * The configured log level should only affect whether a message is logged,
   * not the content of the message itself.
   */
  it('should not modify message content based on log level', () => {
    fc.assert(
      fc.property(
        arbLogLevel,
        arbLogLevel,
        arbLogMessage,
        (configuredLevel, messageLevel, message) => {
          const logger = new Logger(configuredLevel);
          const mock = getMockForLevel(messageLevel);

          logAtLevel(logger, messageLevel, message);

          const shouldLog = logLevelIndex(messageLevel) >= logLevelIndex(configuredLevel);

          if (shouldLog) {
            // Message should be logged exactly as provided
            expect(mock).toHaveBeenCalledWith(message);
            expect(mock).toHaveBeenCalledTimes(1);
            
            // Verify the exact message was passed
            const calledWith = mock.mock.calls[0][0];
            expect(calledWith).toBe(message);
          }

          jest.clearAllMocks();
        }
      ),
      { numRuns: 200 }
    );
  });
});
