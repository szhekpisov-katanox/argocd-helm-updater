/**
 * Configuration Manager for ArgoCD Helm Updater
 *
 * Loads and validates action configuration from:
 * 1. GitHub Action inputs (via @actions/core)
 * 2. External configuration file (.argocd-updater.yml)
 *
 * Provides sensible defaults for all options.
 */
import { ActionConfig, ValidationResult } from '../types/config';
/**
 * Configuration Manager class
 */
export declare class ConfigurationManager {
    /**
     * Load configuration from action inputs and optional external file
     *
     * @returns Loaded and validated configuration
     * @throws Error if configuration is invalid
     */
    static load(): ActionConfig;
    /**
     * Load configuration from external YAML file
     *
     * @param filePath Path to the configuration file
     * @returns Parsed external configuration
     */
    private static loadExternalConfig;
    /**
     * Merge external configuration with current config
     *
     * @param config Current configuration
     * @param external External configuration from file
     * @returns Merged configuration
     */
    private static mergeExternalConfig;
    /**
     * Load configuration from GitHub Action inputs
     *
     * @param config Current configuration (with defaults and external config)
     * @returns Configuration with action inputs applied
     */
    private static loadFromInputs;
    /**
     * Validate configuration
     *
     * @param config Configuration to validate
     * @returns Validation result with any errors
     */
    static validate(config: ActionConfig): ValidationResult;
    /**
     * Parse comma-separated string into array
     *
     * @param value Comma-separated string
     * @returns Array of trimmed strings
     */
    private static parseCommaSeparated;
    /**
     * Parse string or array into array
     *
     * @param value String or array
     * @returns Array of strings
     */
    private static parseStringOrArray;
    /**
     * Parse update types from string or array
     *
     * @param value String or array of update types
     * @returns Array of update types
     */
    private static parseUpdateTypes;
}
//# sourceMappingURL=configuration-manager.d.ts.map