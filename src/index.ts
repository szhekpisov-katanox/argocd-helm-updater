/**
 * ArgoCD Helm Updater - Main Entry Point
 *
 * This GitHub Action automatically detects and updates Helm chart versions
 * in ArgoCD Application and ApplicationSet manifests.
 */

import * as core from '@actions/core';
import { ArgoCDHelmUpdater } from './orchestrator';

/**
 * Main entry point for the GitHub Action
 */
async function run(): Promise<void> {
  try {
    // Create and run the orchestrator
    const updater = new ArgoCDHelmUpdater();
    await updater.run();
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}`);
    } else {
      core.setFailed('Action failed with unknown error');
    }
  }
}

// Execute the action
void run();
