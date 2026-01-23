/**
 * Logger utility for the ArgoCD Helm Updater
 *
 * Provides structured logging with configurable log levels and
 * specialized methods for common logging scenarios.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.5, 9.6, 9.7
 */
/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Logger class for structured logging
 */
export declare class Logger {
    private logLevel;
    constructor(logLevel?: LogLevel);
    /**
     * Log a debug message
     */
    debug(message: string): void;
    /**
     * Log an info message
     */
    info(message: string): void;
    /**
     * Log a warning message
     */
    warn(message: string): void;
    /**
     * Log an error message
     */
    error(message: string): void;
    /**
     * Log file scanning progress
     *
     * Requirements: 9.2
     *
     * @param filePath - Path to the file being scanned
     */
    logFileScanning(filePath: string): void;
    /**
     * Log files discovered during scanning
     *
     * Requirements: 9.2
     *
     * @param fileCount - Number of files discovered
     * @param pattern - Glob pattern used
     */
    logFilesDiscovered(fileCount: number, pattern?: string): void;
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
    logUpdateDetected(chartName: string, currentVersion: string, newVersion: string, manifestPath?: string): void;
    /**
     * Log when no updates are found
     *
     * Requirements: 9.3
     */
    logNoUpdatesFound(): void;
    /**
     * Log parsing error with file context
     *
     * Requirements: 9.1, 9.7
     *
     * @param filePath - Path to the file that failed to parse
     * @param error - The error that occurred
     */
    logParsingError(filePath: string, error: Error | string): void;
    /**
     * Log error with context (file path, chart name, etc.)
     *
     * Requirements: 9.1, 9.7
     *
     * @param context - Context information (e.g., file path, chart name)
     * @param error - The error that occurred
     */
    logErrorWithContext(context: string, error: Error | string): void;
    /**
     * Log authentication error with guidance
     *
     * Requirements: 9.6
     *
     * @param registry - Registry URL that failed authentication
     * @param error - The error that occurred
     */
    logAuthenticationError(registry: string, error: Error | string): void;
    /**
     * Log repository fetch error
     *
     * Requirements: 9.1
     *
     * @param repoURL - Repository URL that failed
     * @param chartName - Chart name (optional)
     * @param error - The error that occurred
     */
    logRepositoryError(repoURL: string, chartName: string | undefined, error: Error | string): void;
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
    }): void;
    /**
     * Log start of a processing stage
     *
     * Requirements: 9.2
     *
     * @param stage - Name of the processing stage
     */
    logStageStart(stage: string): void;
    /**
     * Log completion of a processing stage
     *
     * Requirements: 9.2
     *
     * @param stage - Name of the processing stage
     */
    logStageComplete(stage: string): void;
    /**
     * Check if a message should be logged based on the current log level
     */
    private shouldLog;
    /**
     * Get the current log level
     */
    getLogLevel(): LogLevel;
    /**
     * Set the log level
     */
    setLogLevel(level: LogLevel): void;
}
/**
 * Create a logger instance
 */
export declare function createLogger(logLevel?: LogLevel): Logger;
//# sourceMappingURL=logger.d.ts.map