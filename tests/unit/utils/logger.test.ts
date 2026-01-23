/**
 * Unit tests for Logger
 */

import { Logger, createLogger } from '../../../src/utils/logger';
import * as core from '@actions/core';

// Mock @actions/core
jest.mock('@actions/core');

describe('Logger', () => {
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

  describe('createLogger', () => {
    it('should create a logger with default log level', () => {
      const logger = createLogger();
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.getLogLevel()).toBe('info');
    });

    it('should create a logger with specified log level', () => {
      const logger = createLogger('debug');
      expect(logger.getLogLevel()).toBe('debug');
    });
  });

  describe('log level filtering', () => {
    it('should log all levels when log level is debug', () => {
      const logger = new Logger('debug');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(mockDebug).toHaveBeenCalledWith('debug message');
      expect(mockInfo).toHaveBeenCalledWith('info message');
      expect(mockWarning).toHaveBeenCalledWith('warn message');
      expect(mockError).toHaveBeenCalledWith('error message');
    });

    it('should not log debug when log level is info', () => {
      const logger = new Logger('info');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(mockDebug).not.toHaveBeenCalled();
      expect(mockInfo).toHaveBeenCalledWith('info message');
      expect(mockWarning).toHaveBeenCalledWith('warn message');
      expect(mockError).toHaveBeenCalledWith('error message');
    });

    it('should only log warn and error when log level is warn', () => {
      const logger = new Logger('warn');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(mockDebug).not.toHaveBeenCalled();
      expect(mockInfo).not.toHaveBeenCalled();
      expect(mockWarning).toHaveBeenCalledWith('warn message');
      expect(mockError).toHaveBeenCalledWith('error message');
    });

    it('should only log error when log level is error', () => {
      const logger = new Logger('error');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(mockDebug).not.toHaveBeenCalled();
      expect(mockInfo).not.toHaveBeenCalled();
      expect(mockWarning).not.toHaveBeenCalled();
      expect(mockError).toHaveBeenCalledWith('error message');
    });
  });

  describe('setLogLevel', () => {
    it('should change log level dynamically', () => {
      const logger = new Logger('error');

      logger.info('should not log');
      expect(mockInfo).not.toHaveBeenCalled();

      logger.setLogLevel('info');
      logger.info('should log');
      expect(mockInfo).toHaveBeenCalledWith('should log');
    });
  });

  describe('logFileScanning', () => {
    it('should log file scanning at debug level', () => {
      const logger = new Logger('debug');
      logger.logFileScanning('manifests/app.yaml');

      expect(mockDebug).toHaveBeenCalledWith('Scanning file: manifests/app.yaml');
    });

    it('should not log file scanning when log level is info', () => {
      const logger = new Logger('info');
      logger.logFileScanning('manifests/app.yaml');

      expect(mockDebug).not.toHaveBeenCalled();
    });
  });

  describe('logFilesDiscovered', () => {
    it('should log files discovered with pattern', () => {
      const logger = new Logger('info');
      logger.logFilesDiscovered(5, '**/*.yaml');

      expect(mockInfo).toHaveBeenCalledWith('Discovered 5 file(s) matching pattern: **/*.yaml');
    });

    it('should log files discovered without pattern', () => {
      const logger = new Logger('info');
      logger.logFilesDiscovered(3);

      expect(mockInfo).toHaveBeenCalledWith('Discovered 3 file(s)');
    });

    it('should handle zero files', () => {
      const logger = new Logger('info');
      logger.logFilesDiscovered(0);

      expect(mockInfo).toHaveBeenCalledWith('Discovered 0 file(s)');
    });
  });

  describe('logUpdateDetected', () => {
    it('should log update with manifest path', () => {
      const logger = new Logger('info');
      logger.logUpdateDetected('nginx', '1.0.0', '1.1.0', 'manifests/app.yaml');

      expect(mockInfo).toHaveBeenCalledWith(
        'Update available for nginx in manifests/app.yaml: 1.0.0 → 1.1.0'
      );
    });

    it('should log update without manifest path', () => {
      const logger = new Logger('info');
      logger.logUpdateDetected('redis', '6.0.0', '6.2.0');

      expect(mockInfo).toHaveBeenCalledWith('Update available for redis: 6.0.0 → 6.2.0');
    });

    it('should handle version with pre-release tags', () => {
      const logger = new Logger('info');
      logger.logUpdateDetected('postgres', '14.0.0', '14.1.0-alpha.1');

      expect(mockInfo).toHaveBeenCalledWith(
        'Update available for postgres: 14.0.0 → 14.1.0-alpha.1'
      );
    });
  });

  describe('logNoUpdatesFound', () => {
    it('should log when no updates are found', () => {
      const logger = new Logger('info');
      logger.logNoUpdatesFound();

      expect(mockInfo).toHaveBeenCalledWith('No updates found. All charts are up to date.');
    });
  });

  describe('logParsingError', () => {
    it('should log parsing error with Error object', () => {
      const logger = new Logger('info');
      const error = new Error('Invalid YAML syntax');
      logger.logParsingError('manifests/broken.yaml', error);

      expect(mockWarning).toHaveBeenCalledWith(
        'Failed to parse manifests/broken.yaml: Invalid YAML syntax'
      );
    });

    it('should log parsing error with string', () => {
      const logger = new Logger('info');
      logger.logParsingError('manifests/broken.yaml', 'Unexpected token');

      expect(mockWarning).toHaveBeenCalledWith(
        'Failed to parse manifests/broken.yaml: Unexpected token'
      );
    });
  });

  describe('logErrorWithContext', () => {
    it('should log error with context and Error object', () => {
      const logger = new Logger('info');
      const error = new Error('Connection timeout');
      logger.logErrorWithContext('fetching repository index', error);

      expect(mockError).toHaveBeenCalledWith(
        'Error in fetching repository index: Connection timeout'
      );
    });

    it('should log error with context and string', () => {
      const logger = new Logger('info');
      logger.logErrorWithContext('updating manifest', 'File not found');

      expect(mockError).toHaveBeenCalledWith('Error in updating manifest: File not found');
    });
  });

  describe('logAuthenticationError', () => {
    it('should log authentication error with guidance', () => {
      const logger = new Logger('info');
      const error = new Error('401 Unauthorized');
      logger.logAuthenticationError('https://registry.example.com', error);

      expect(mockError).toHaveBeenCalledWith(
        'Authentication failed for https://registry.example.com: 401 Unauthorized'
      );
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('To configure credentials')
      );
      expect(mockError).toHaveBeenCalledWith(expect.stringContaining('registry-credentials'));
    });

    it('should provide configuration guidance', () => {
      const logger = new Logger('info');
      logger.logAuthenticationError('oci://ghcr.io', 'Access denied');

      const calls = mockError.mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1][0]).toContain('registry: <registry-url>');
      expect(calls[1][0]).toContain('username: <username>');
      expect(calls[1][0]).toContain('password: <password>');
      expect(calls[1][0]).toContain('auth-type: basic');
    });
  });

  describe('logRepositoryError', () => {
    it('should log repository error with chart name', () => {
      const logger = new Logger('info');
      const error = new Error('Network timeout');
      logger.logRepositoryError('https://charts.bitnami.com', 'nginx', error);

      expect(mockError).toHaveBeenCalledWith(
        'Failed to fetch versions from https://charts.bitnami.com for chart nginx: Network timeout'
      );
    });

    it('should log repository error without chart name', () => {
      const logger = new Logger('info');
      logger.logRepositoryError('https://charts.example.com', undefined, 'Not found');

      expect(mockError).toHaveBeenCalledWith(
        'Failed to fetch versions from https://charts.example.com: Not found'
      );
    });
  });

  describe('logProcessingSummary', () => {
    it('should log processing summary with all stats', () => {
      const logger = new Logger('info');
      logger.logProcessingSummary({
        filesScanned: 10,
        chartsFound: 15,
        updatesDetected: 3,
        prsCreated: 1,
      });

      expect(mockInfo).toHaveBeenCalledWith('Processing complete:');
      expect(mockInfo).toHaveBeenCalledWith('  Files scanned: 10');
      expect(mockInfo).toHaveBeenCalledWith('  Charts found: 15');
      expect(mockInfo).toHaveBeenCalledWith('  Updates detected: 3');
      expect(mockInfo).toHaveBeenCalledWith('  Pull requests created: 1');
    });

    it('should handle zero values', () => {
      const logger = new Logger('info');
      logger.logProcessingSummary({
        filesScanned: 5,
        chartsFound: 0,
        updatesDetected: 0,
        prsCreated: 0,
      });

      expect(mockInfo).toHaveBeenCalledWith('  Charts found: 0');
      expect(mockInfo).toHaveBeenCalledWith('  Updates detected: 0');
      expect(mockInfo).toHaveBeenCalledWith('  Pull requests created: 0');
    });
  });

  describe('logStageStart', () => {
    it('should log stage start', () => {
      const logger = new Logger('info');
      logger.logStageStart('Scanning manifests');

      expect(mockInfo).toHaveBeenCalledWith('Starting: Scanning manifests');
    });
  });

  describe('logStageComplete', () => {
    it('should log stage completion at debug level', () => {
      const logger = new Logger('debug');
      logger.logStageComplete('Version resolution');

      expect(mockDebug).toHaveBeenCalledWith('Completed: Version resolution');
    });

    it('should not log stage completion when log level is info', () => {
      const logger = new Logger('info');
      logger.logStageComplete('Version resolution');

      expect(mockDebug).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings', () => {
      const logger = new Logger('info');
      logger.info('');
      logger.warn('');
      logger.error('');

      expect(mockInfo).toHaveBeenCalledWith('');
      expect(mockWarning).toHaveBeenCalledWith('');
      expect(mockError).toHaveBeenCalledWith('');
    });

    it('should handle special characters in messages', () => {
      const logger = new Logger('info');
      logger.info('Message with "quotes" and \'apostrophes\'');

      expect(mockInfo).toHaveBeenCalledWith('Message with "quotes" and \'apostrophes\'');
    });

    it('should handle multiline messages', () => {
      const logger = new Logger('info');
      logger.info('Line 1\nLine 2\nLine 3');

      expect(mockInfo).toHaveBeenCalledWith('Line 1\nLine 2\nLine 3');
    });

    it('should handle very long messages', () => {
      const logger = new Logger('info');
      const longMessage = 'a'.repeat(1000);
      logger.info(longMessage);

      expect(mockInfo).toHaveBeenCalledWith(longMessage);
    });
  });
});
