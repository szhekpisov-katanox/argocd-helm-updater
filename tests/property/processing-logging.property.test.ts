/**
 * Property-based tests for Processing Progress Logging
 * 
 * **Property 28: Processing Progress Logging**
 * **Validates: Requirements 9.2, 9.3**
 * 
 * For any action run, the action should log which files are being scanned 
 * and which updates are detected.
 */

import * as fc from 'fast-check';
import { Logger } from '../../src/utils/logger';
import * as core from '@actions/core';

// Mock @actions/core
jest.mock('@actions/core');

describe('Property 28: Processing Progress Logging', () => {
  let mockDebug: jest.SpyInstance;
  let mockInfo: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDebug = jest.spyOn(core, 'debug').mockImplementation();
    mockInfo = jest.spyOn(core, 'info').mockImplementation();
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
    fc.constant('argocd/applicationset.yaml'),
    fc.constant('k8s/charts/nginx.yaml')
  );

  // Generate chart names
  const arbChartName = fc.oneof(
    fc.stringMatching(/^[a-z0-9\-]+$/),
    fc.constant('nginx'),
    fc.constant('postgresql'),
    fc.constant('redis'),
    fc.constant('prometheus'),
    fc.constant('grafana')
  );

  // Generate semantic versions
  const arbVersion = fc.oneof(
    fc.tuple(fc.nat(20), fc.nat(50), fc.nat(100)).map(([major, minor, patch]) => `${major}.${minor}.${patch}`),
    fc.constant('1.0.0'),
    fc.constant('2.5.3'),
    fc.constant('15.9.0')
  );

  // Generate glob patterns
  const arbGlobPattern = fc.oneof(
    fc.constant('**/*.yaml'),
    fc.constant('**/*.yml'),
    fc.constant('manifests/**/*.yaml'),
    fc.constant('apps/**/application.yaml'),
    fc.stringMatching(/^\*\*\/\*\.[a-z]+$/)
  );

  /**
   * Property 28.1: File scanning should be logged
   * 
   * For any file being scanned, the logger should log the file path
   * at debug level.
   */
  it('should log file scanning progress', () => {
    fc.assert(
      fc.property(
        arbFilePath,
        (filePath) => {
          const logger = new Logger('debug');

          logger.logFileScanning(filePath);

          // Should have been called with debug
          expect(mockDebug).toHaveBeenCalledTimes(1);

          // Extract the logged message
          const loggedMessage = mockDebug.mock.calls[0][0];

          // Message should include the file path
          expect(loggedMessage).toContain(filePath);

          // Message should indicate scanning activity
          expect(loggedMessage.toLowerCase()).toMatch(/scan/);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 28.2: Multiple file scans should be logged separately
   * 
   * For any sequence of files being scanned, each file should be
   * logged as a separate message.
   */
  it('should log each file scan separately', () => {
    fc.assert(
      fc.property(
        fc.array(arbFilePath, { minLength: 1, maxLength: 10 }),
        (filePaths) => {
          const logger = new Logger('debug');

          // Log scanning for each file
          filePaths.forEach(filePath => {
            logger.logFileScanning(filePath);
          });

          // Should have been called once per file
          expect(mockDebug).toHaveBeenCalledTimes(filePaths.length);

          // Each call should include the corresponding file path
          filePaths.forEach((filePath, index) => {
            const loggedMessage = mockDebug.mock.calls[index][0];
            expect(loggedMessage).toContain(filePath);
          });

          jest.clearAllMocks();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 28.3: Files discovered should be logged with count
   * 
   * For any number of files discovered, the logger should log the
   * count at info level.
   */
  it('should log files discovered with count', () => {
    fc.assert(
      fc.property(
        fc.nat(100),
        fc.option(arbGlobPattern, { nil: undefined }),
        (fileCount, pattern) => {
          const logger = new Logger('info');

          logger.logFilesDiscovered(fileCount, pattern);

          // Should have been called with info
          expect(mockInfo).toHaveBeenCalledTimes(1);

          // Extract the logged message
          const loggedMessage = mockInfo.mock.calls[0][0];

          // Message should include the file count
          expect(loggedMessage).toContain(fileCount.toString());

          // Message should include pattern if provided
          if (pattern) {
            expect(loggedMessage).toContain(pattern);
          }

          // Message should indicate discovery
          expect(loggedMessage.toLowerCase()).toMatch(/discover/);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 28.4: Update detection should be logged
   * 
   * For any update detected, the logger should log the chart name,
   * current version, and new version at info level.
   */
  it('should log update detection with chart and version details', () => {
    fc.assert(
      fc.property(
        arbChartName,
        arbVersion,
        arbVersion,
        fc.option(arbFilePath, { nil: undefined }),
        (chartName, currentVersion, newVersion, manifestPath) => {
          // Skip if versions are the same (not a real update)
          if (currentVersion === newVersion) {
            return true;
          }

          const logger = new Logger('info');

          logger.logUpdateDetected(chartName, currentVersion, newVersion, manifestPath);

          // Should have been called with info
          expect(mockInfo).toHaveBeenCalledTimes(1);

          // Extract the logged message
          const loggedMessage = mockInfo.mock.calls[0][0];

          // Message should include chart name
          expect(loggedMessage).toContain(chartName);

          // Message should include current version
          expect(loggedMessage).toContain(currentVersion);

          // Message should include new version
          expect(loggedMessage).toContain(newVersion);

          // Message should include manifest path if provided
          if (manifestPath) {
            expect(loggedMessage).toContain(manifestPath);
          }

          // Message should indicate an update
          expect(loggedMessage.toLowerCase()).toMatch(/update|available/);

          jest.clearAllMocks();
          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 28.5: Multiple updates should be logged separately
   * 
   * For any sequence of updates detected, each update should be
   * logged as a separate message.
   */
  it('should log each update detection separately', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(arbChartName, arbVersion, arbVersion, fc.option(arbFilePath, { nil: undefined })),
          { minLength: 1, maxLength: 10 }
        ),
        (updates) => {
          const logger = new Logger('info');

          // Log each update
          updates.forEach(([chartName, currentVersion, newVersion, manifestPath]) => {
            // Skip if versions are the same
            if (currentVersion !== newVersion) {
              logger.logUpdateDetected(chartName, currentVersion, newVersion, manifestPath);
            }
          });

          // Count valid updates (where versions differ)
          const validUpdates = updates.filter(([, current, newVer]) => current !== newVer);

          // Should have been called once per valid update
          expect(mockInfo).toHaveBeenCalledTimes(validUpdates.length);

          // Each call should include the corresponding chart name
          validUpdates.forEach(([chartName], index) => {
            const loggedMessage = mockInfo.mock.calls[index][0];
            expect(loggedMessage).toContain(chartName);
          });

          jest.clearAllMocks();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 28.6: No updates found should be logged
   * 
   * When no updates are found, the logger should log an appropriate
   * message at info level.
   */
  it('should log when no updates are found', () => {
    fc.assert(
      fc.property(
        fc.constant(undefined),
        () => {
          const logger = new Logger('info');

          logger.logNoUpdatesFound();

          // Should have been called with info
          expect(mockInfo).toHaveBeenCalledTimes(1);

          // Extract the logged message
          const loggedMessage = mockInfo.mock.calls[0][0];

          // Message should indicate no updates
          expect(loggedMessage.toLowerCase()).toMatch(/no update|up to date/);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 28.7: Processing summary should include all statistics
   * 
   * For any processing statistics, the summary should include files
   * scanned, charts found, updates detected, and PRs created.
   */
  it('should log processing summary with all statistics', () => {
    fc.assert(
      fc.property(
        fc.nat(100),
        fc.nat(100),
        fc.nat(50),
        fc.nat(20),
        (filesScanned, chartsFound, updatesDetected, prsCreated) => {
          const logger = new Logger('info');

          const stats = {
            filesScanned,
            chartsFound,
            updatesDetected,
            prsCreated,
          };

          logger.logProcessingSummary(stats);

          // Should have been called multiple times (once per stat line)
          expect(mockInfo).toHaveBeenCalled();
          expect(mockInfo.mock.calls.length).toBeGreaterThan(0);

          // Combine all logged messages
          const allMessages = mockInfo.mock.calls.map(call => call[0]).join(' ');

          // Should include all statistics
          expect(allMessages).toContain(filesScanned.toString());
          expect(allMessages).toContain(chartsFound.toString());
          expect(allMessages).toContain(updatesDetected.toString());
          expect(allMessages).toContain(prsCreated.toString());

          // Should mention the stat categories
          expect(allMessages.toLowerCase()).toMatch(/file|scan/);
          expect(allMessages.toLowerCase()).toMatch(/chart/);
          expect(allMessages.toLowerCase()).toMatch(/update/);
          expect(allMessages.toLowerCase()).toMatch(/pull request|pr/);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 28.8: Stage start should be logged
   * 
   * For any processing stage, the start should be logged at info level.
   */
  it('should log stage start', () => {
    const arbStageName = fc.oneof(
      fc.constant('Discovering ArgoCD manifests'),
      fc.constant('Extracting Helm chart dependencies'),
      fc.constant('Checking for available updates'),
      fc.constant('Updating manifest files'),
      fc.constant('Creating pull requests'),
      fc.string({ minLength: 5, maxLength: 50 })
    );

    fc.assert(
      fc.property(
        arbStageName,
        (stageName) => {
          const logger = new Logger('info');

          logger.logStageStart(stageName);

          // Should have been called with info
          expect(mockInfo).toHaveBeenCalledTimes(1);

          // Extract the logged message
          const loggedMessage = mockInfo.mock.calls[0][0];

          // Message should include the stage name
          expect(loggedMessage).toContain(stageName);

          // Message should indicate starting
          expect(loggedMessage.toLowerCase()).toMatch(/start/);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 28.9: Stage completion should be logged
   * 
   * For any processing stage, the completion should be logged at debug level.
   */
  it('should log stage completion', () => {
    const arbStageName = fc.oneof(
      fc.constant('Discovering ArgoCD manifests'),
      fc.constant('Extracting Helm chart dependencies'),
      fc.constant('Checking for available updates'),
      fc.constant('Updating manifest files'),
      fc.constant('Creating pull requests'),
      fc.string({ minLength: 5, maxLength: 50 })
    );

    fc.assert(
      fc.property(
        arbStageName,
        (stageName) => {
          const logger = new Logger('debug');

          logger.logStageComplete(stageName);

          // Should have been called with debug
          expect(mockDebug).toHaveBeenCalledTimes(1);

          // Extract the logged message
          const loggedMessage = mockDebug.mock.calls[0][0];

          // Message should include the stage name
          expect(loggedMessage).toContain(stageName);

          // Message should indicate completion
          expect(loggedMessage.toLowerCase()).toMatch(/complet/);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 28.10: Processing logging respects log level
   * 
   * For any configured log level, processing logs should respect
   * the log level filtering.
   */
  it('should respect log level for processing logs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'debug' | 'info' | 'warn' | 'error'>('debug', 'info', 'warn', 'error'),
        arbFilePath,
        arbChartName,
        arbVersion,
        arbVersion,
        (logLevel, filePath, chartName, currentVersion, newVersion) => {
          const logger = new Logger(logLevel);

          // Test file scanning (debug level)
          logger.logFileScanning(filePath);
          
          const logLevels = ['debug', 'info', 'warn', 'error'];
          const configuredIndex = logLevels.indexOf(logLevel);
          const debugIndex = logLevels.indexOf('debug');
          
          if (debugIndex >= configuredIndex) {
            expect(mockDebug).toHaveBeenCalled();
          } else {
            expect(mockDebug).not.toHaveBeenCalled();
          }

          jest.clearAllMocks();

          // Test update detection (info level)
          if (currentVersion !== newVersion) {
            logger.logUpdateDetected(chartName, currentVersion, newVersion);
            
            const infoIndex = logLevels.indexOf('info');
            
            if (infoIndex >= configuredIndex) {
              expect(mockInfo).toHaveBeenCalled();
            } else {
              expect(mockInfo).not.toHaveBeenCalled();
            }
          }

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 28.11: File scanning logs are distinct from discovery logs
   * 
   * For any file, the scanning log (per-file) should be distinct from
   * the discovery log (summary with count).
   */
  it('should distinguish between file scanning and discovery logs', () => {
    fc.assert(
      fc.property(
        fc.array(arbFilePath, { minLength: 1, maxLength: 10 }),
        (filePaths) => {
          const logger = new Logger('debug');

          // Log individual file scans
          filePaths.forEach(filePath => {
            logger.logFileScanning(filePath);
          });

          // Log discovery summary
          logger.logFilesDiscovered(filePaths.length);

          // Should have debug calls for each file
          expect(mockDebug).toHaveBeenCalledTimes(filePaths.length);

          // Should have one info call for discovery
          expect(mockInfo).toHaveBeenCalledTimes(1);

          // Debug messages should contain individual file paths
          filePaths.forEach((filePath, index) => {
            const debugMessage = mockDebug.mock.calls[index][0];
            expect(debugMessage).toContain(filePath);
          });

          // Info message should contain the count
          const infoMessage = mockInfo.mock.calls[0][0];
          expect(infoMessage).toContain(filePaths.length.toString());

          jest.clearAllMocks();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 28.12: Update logs include version transition
   * 
   * For any update, the log should clearly show the transition from
   * current version to new version.
   */
  it('should show version transition in update logs', () => {
    fc.assert(
      fc.property(
        arbChartName,
        arbVersion,
        arbVersion,
        (chartName, currentVersion, newVersion) => {
          // Skip if versions are the same
          if (currentVersion === newVersion) {
            return true;
          }

          const logger = new Logger('info');

          logger.logUpdateDetected(chartName, currentVersion, newVersion);

          const loggedMessage = mockInfo.mock.calls[0][0];

          // Should contain both versions
          expect(loggedMessage).toContain(currentVersion);
          expect(loggedMessage).toContain(newVersion);

          // Current version should appear before new version in the message
          const currentIndex = loggedMessage.indexOf(currentVersion);
          const newIndex = loggedMessage.indexOf(newVersion);
          expect(currentIndex).toBeGreaterThan(-1);
          expect(newIndex).toBeGreaterThan(-1);
          expect(newIndex).toBeGreaterThan(currentIndex);

          jest.clearAllMocks();
          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 28.13: Zero counts should be logged correctly
   * 
   * For any processing statistics with zero values, the logger should
   * still log them correctly (not skip or error).
   */
  it('should handle zero counts in processing logs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          { filesScanned: 0, chartsFound: 0, updatesDetected: 0, prsCreated: 0 },
          { filesScanned: 5, chartsFound: 0, updatesDetected: 0, prsCreated: 0 },
          { filesScanned: 5, chartsFound: 3, updatesDetected: 0, prsCreated: 0 },
          { filesScanned: 5, chartsFound: 3, updatesDetected: 2, prsCreated: 0 }
        ),
        (stats) => {
          const logger = new Logger('info');

          // Should not throw
          expect(() => {
            logger.logProcessingSummary(stats);
          }).not.toThrow();

          // Should have logged something
          expect(mockInfo).toHaveBeenCalled();

          // Should include the zero values
          const allMessages = mockInfo.mock.calls.map(call => call[0]).join(' ');
          expect(allMessages).toContain('0');

          jest.clearAllMocks();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 28.14: Large counts should be logged correctly
   * 
   * For any processing statistics with large values, the logger should
   * format them correctly without truncation or overflow.
   */
  it('should handle large counts in processing logs', () => {
    fc.assert(
      fc.property(
        fc.nat(10000),
        fc.nat(10000),
        fc.nat(10000),
        fc.nat(10000),
        (filesScanned, chartsFound, updatesDetected, prsCreated) => {
          const logger = new Logger('info');

          const stats = {
            filesScanned,
            chartsFound,
            updatesDetected,
            prsCreated,
          };

          logger.logProcessingSummary(stats);

          // Should have logged
          expect(mockInfo).toHaveBeenCalled();

          // Combine all messages
          const allMessages = mockInfo.mock.calls.map(call => call[0]).join(' ');

          // Should include all values as strings
          expect(allMessages).toContain(filesScanned.toString());
          expect(allMessages).toContain(chartsFound.toString());
          expect(allMessages).toContain(updatesDetected.toString());
          expect(allMessages).toContain(prsCreated.toString());

          jest.clearAllMocks();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 28.15: Special characters in file paths are preserved
   * 
   * For any file path with special characters, the logged message
   * should preserve those characters correctly.
   */
  it('should preserve special characters in file paths', () => {
    const arbSpecialFilePath = fc.oneof(
      fc.constant('apps/prod-us-east-1/application.yaml'),
      fc.constant('k8s/charts/nginx_ingress.yaml'),
      fc.constant('manifests/app.v2.yaml'),
      fc.constant('argocd/apps/my-app@prod.yml'),
      fc.string({ minLength: 5, maxLength: 50 })
    );

    fc.assert(
      fc.property(
        arbSpecialFilePath,
        (filePath) => {
          const logger = new Logger('debug');

          logger.logFileScanning(filePath);

          const loggedMessage = mockDebug.mock.calls[0][0];

          // File path should be preserved exactly
          expect(loggedMessage).toContain(filePath);

          jest.clearAllMocks();
        }
      ),
      { numRuns: 10 }
    );
  });
});
