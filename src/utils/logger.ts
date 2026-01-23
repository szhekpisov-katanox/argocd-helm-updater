/**
 * Logger utility for the ArgoCD Helm Updater
 *
 * Provides structured logging with configurable log levels and
 * specialized methods for common logging scenarios.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.5, 9.6, 9.7
 */

import * as core from '@actions/core';

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger class for structured logging
 */
export class Logger {
  private logLevel: LogLevel;

  constructor(logLevel: LogLevel = 'info') {
    this.logLevel = logLevel;
  }

  /**
   * Log a debug message
   */
  debug(message: string): void {
    if (this.shouldLog('debug')) {
      core.debug(message);
    }
  }

  /**
   * Log an info message
   */
  info(message: string): void {
    if (this.shouldLog('info')) {
      core.info(message);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string): void {
    if (this.shouldLog('warn')) {
      core.warning(message);
    }
  }

  /**
   * Log an error message
   */
  error(message: string): void {
    if (this.shouldLog('error')) {
      core.error(message);
    }
  }

  /**
   * Log file scanning progress
   *
   * Requirements: 9.2
   *
   * @param filePath - Path to the file being scanned
   */
  logFileScanning(filePath: string): void {
    this.debug(`Scanning file: ${filePath}`);
  }

  /**
   * Log files discovered during scanning
   *
   * Requirements: 9.2
   *
   * @param fileCount - Number of files discovered
   * @param pattern - Glob pattern used
   */
  logFilesDiscovered(fileCount: number, pattern?: string): void {
    if (pattern) {
      this.info(`Discovered ${fileCount} file(s) matching pattern: ${pattern}`);
    } else {
      this.info(`Discovered ${fileCount} file(s)`);
    }
  }

  /**
   * Log update detection
   *
   * Requirements: 9.3
   *
   * @param chartName - Name of the chart
   * @param currentVersion - Current version
   * @param newVersion - New version available
   * @param manifestPath - Path to the manifest file (optional)
   */
  logUpdateDetected(
    chartName: string,
    currentVersion: string,
    newVersion: string,
    manifestPath?: string
  ): void {
    const location = manifestPath ? ` in ${manifestPath}` : '';
    this.info(
      `Update available for ${chartName}${location}: ${currentVersion} → ${newVersion}`
    );
  }

  /**
   * Log when no updates are found
   *
   * Requirements: 9.3
   */
  logNoUpdatesFound(): void {
    this.info('No updates found. All charts are up to date.');
  }

  /**
   * Log parsing error with file context
   *
   * Requirements: 9.1, 9.7
   *
   * @param filePath - Path to the file that failed to parse
   * @param error - The error that occurred
   */
  logParsingError(filePath: string, error: Error | string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.warn(`Failed to parse ${filePath}: ${errorMessage}`);
  }

  /**
   * Log error with context (file path, chart name, etc.)
   *
   * Requirements: 9.1, 9.7
   *
   * @param context - Context information (e.g., file path, chart name)
   * @param error - The error that occurred
   */
  logErrorWithContext(context: string, error: Error | string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.error(`Error in ${context}: ${errorMessage}`);
  }

  /**
   * Log authentication error with guidance
   *
   * Requirements: 9.6
   *
   * @param registry - Registry URL that failed authentication
   * @param error - The error that occurred
   */
  logAuthenticationError(registry: string, error: Error | string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.error(`Authentication failed for ${registry}: ${errorMessage}`);
    this.error(
      'To configure credentials, add them to the action configuration:\n' +
        '  registry-credentials: |\n' +
        '    - registry: <registry-url>\n' +
        '      username: <username>\n' +
        '      password: <password>\n' +
        '      auth-type: basic  # or "bearer"'
    );
  }

  /**
   * Log repository fetch error
   *
   * Requirements: 9.1
   *
   * @param repoURL - Repository URL that failed
   * @param chartName - Chart name (optional)
   * @param error - The error that occurred
   */
  logRepositoryError(repoURL: string, chartName: string | undefined, error: Error | string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const chart = chartName ? ` for chart ${chartName}` : '';
    this.error(`Failed to fetch versions from ${repoURL}${chart}: ${errorMessage}`);
  }

  /**
   * Log summary of processing results
   *
   * Requirements: 9.3
   *
   * @param stats - Processing statistics
   */
  logProcessingSummary(stats: {
    filesScanned: number;
    chartsFound: number;
    updatesDetected: number;
    prsCreated: number;
  }): void {
    this.info('Processing complete:');
    this.info(`  Files scanned: ${stats.filesScanned}`);
    this.info(`  Charts found: ${stats.chartsFound}`);
    this.info(`  Updates detected: ${stats.updatesDetected}`);
    this.info(`  Pull requests created: ${stats.prsCreated}`);
  }

  /**
   * Log start of a processing stage
   *
   * Requirements: 9.2
   *
   * @param stage - Name of the processing stage
   */
  logStageStart(stage: string): void {
    this.info(`Starting: ${stage}`);
  }

  /**
   * Log completion of a processing stage
   *
   * Requirements: 9.2
   *
   * @param stage - Name of the processing stage
   */
  logStageComplete(stage: string): void {
    this.debug(`Completed: ${stage}`);
  }

  /**
   * Check if a message should be logged based on the current log level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Get the current log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Set the log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}

/**
 * Create a logger instance
 */
export function createLogger(logLevel: LogLevel = 'info'): Logger {
  return new Logger(logLevel);
}
