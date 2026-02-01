import * as core from '@actions/core';
import type { ActionInputs } from './types';

/**
 * Parse a string that could be either JSON array or comma-separated values
 * into an array of numbers.
 */
export function parseNumberList(input: string): number[] {
  if (!input || input.trim() === '') {
    return [];
  }

  const trimmed = input.trim();

  // Try JSON parse first
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(n => {
          const num = typeof n === 'string' ? parseInt(n, 10) : n;
          if (isNaN(num)) {
            throw new Error(`Invalid number in array: ${n}`);
          }
          return num;
        });
      }
    } catch (e) {
      core.warning(`Failed to parse as JSON array, trying comma-separated: ${trimmed}`);
    }
  }

  // Fall back to comma-separated
  return trimmed
    .split(',')
    .map(s => s.trim())
    .filter(s => s !== '')
    .map(s => {
      const num = parseInt(s, 10);
      if (isNaN(num)) {
        throw new Error(`Invalid number: ${s}`);
      }
      return num;
    });
}

/**
 * Parse a string that could be either JSON array or comma-separated values
 * into an array of strings.
 */
export function parseStringList(input: string): string[] {
  if (!input || input.trim() === '') {
    return [];
  }

  const trimmed = input.trim();

  // Try JSON parse first
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(s => String(s));
      }
    } catch (e) {
      core.warning(`Failed to parse as JSON array, trying comma-separated: ${trimmed}`);
    }
  }

  // Fall back to comma-separated
  return trimmed
    .split(',')
    .map(s => s.trim())
    .filter(s => s !== '');
}

/**
 * Parse all action inputs from GitHub Actions context.
 */
export function parseInputs(): ActionInputs {
  const url = core.getInput('url', { required: true });
  const apiKey = core.getInput('api-key', { required: true });

  if (!url) {
    throw new Error('url is required');
  }
  if (!apiKey) {
    throw new Error('api-key is required');
  }

  return {
    url,
    apiKey,

    // Test context sources
    description: core.getInput('description') || undefined,
    prNumbers: parseNumberList(core.getInput('pr-numbers')),
    issueNumbers: parseNumberList(core.getInput('issue-numbers')),

    // Label callbacks
    onSuccessAddLabels: parseStringList(core.getInput('on-success-add-labels')),
    onSuccessRemoveLabels: parseStringList(core.getInput('on-success-remove-labels')),
    onFailureAddLabels: parseStringList(core.getInput('on-failure-add-labels')),
    onFailureRemoveLabels: parseStringList(core.getInput('on-failure-remove-labels')),
    onNotTestableAddLabels: parseStringList(core.getInput('on-not-testable-add-labels')),
    onNotTestableRemoveLabels: parseStringList(core.getInput('on-not-testable-remove-labels')),
    onTimeoutAddLabels: parseStringList(core.getInput('on-timeout-add-labels')),
    onTimeoutRemoveLabels: parseStringList(core.getInput('on-timeout-remove-labels')),

    // Workflow control
    failOnError: core.getBooleanInput('fail-on-error'),
    failOnFailure: core.getBooleanInput('fail-on-failure'),
    failOnTimeout: core.getBooleanInput('fail-on-timeout'),

    // API configuration
    githubToken: core.getInput('github-token') || process.env.GITHUB_TOKEN || '',
    apiUrl: core.getInput('api-url') || 'https://runhuman.com',

    // Test configuration
    targetDurationMinutes: parseInt(core.getInput('target-duration-minutes') || '5', 10),
    screenSize: core.getInput('screen-size') || 'desktop',
  };
}
