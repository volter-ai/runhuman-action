import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import type { ActionInputs, DeviceClass } from './types';

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
        return parsed.map((n) => {
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
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((s) => {
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
        return parsed.map((s) => String(s));
      }
    } catch (e) {
      core.warning(`Failed to parse as JSON array, trying comma-separated: ${trimmed}`);
    }
  }

  // Fall back to comma-separated
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/**
 * Parse device-class input — must be 'desktop' or 'mobile'
 */
function parseDeviceClass(input: string): DeviceClass {
  const trimmed = input.trim() as DeviceClass;
  if (trimmed === 'desktop' || trimmed === 'mobile') {
    return trimmed;
  }
  core.warning(`Invalid device-class "${input}", using default 'desktop'`);
  return 'desktop';
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

  // Get github repo from context — the repo that triggered this action run
  const { owner, repo } = github.context.repo;
  const githubRepo = `${owner}/${repo}`;

  // Optional override for where auto-created issues land.
  // Defaults to the triggering repo so that multi-repo projects don't
  // fall back to githubRepos[0] (which is arbitrary).
  const autoCreateGithubIssuesRepo =
    core.getInput('auto-create-github-issues-repo') || githubRepo;

  // Parse template inputs
  const template = core.getInput('template') || undefined;
  const templateFile = core.getInput('template-file') || undefined;

  // Load template content from local file if specified (raw content, not parsed)
  let templateContent: string | undefined;
  if (templateFile) {
    try {
      if (!fs.existsSync(templateFile)) {
        throw new Error(`Template file not found: ${templateFile}`);
      }
      templateContent = fs.readFileSync(templateFile, 'utf-8');
      core.info(`Loaded template content from file: ${templateFile}`);
    } catch (error) {
      throw new Error(`Failed to load template file "${templateFile}": ${error}`);
    }
  }

  // Validate: can't use both template and template-file
  if (template && templateFile) {
    core.warning('Both "template" and "template-file" specified. Using "template-file" (local takes precedence).');
  }

  return {
    url,
    apiKey,
    githubToken: core.getInput('github-token') || process.env.GITHUB_TOKEN || '',

    // Template configuration
    template: templateFile ? undefined : template, // Only use server-side template if no local file
    templateFile,
    templateContent,

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
    waitForResult: core.getBooleanInput('wait-for-result'),

    // API configuration - always use production
    apiUrl: 'https://qa-experiment.fly.dev',

    // Test configuration
    targetDurationMinutes: parseInt(core.getInput('target-duration-minutes') || '30', 10),
    deviceClass: parseDeviceClass(core.getInput('device-class') || 'desktop'),
    outputSchema: parseOutputSchema(core.getInput('output-schema')),
    requiresRunhumanApkInstall: core.getBooleanInput('requires-runhuman-apk-install'),

    // Repository context
    githubRepo,
    githubRepos: [githubRepo],
    autoCreateGithubIssuesRepo,
  };
}

/**
 * Parse output-schema JSON input
 */
function parseOutputSchema(input: string): Record<string, unknown> | undefined {
  if (!input || input.trim() === '') {
    return undefined;
  }

  try {
    return JSON.parse(input.trim());
  } catch (e) {
    core.warning(`Failed to parse output-schema as JSON: ${input}`);
    return undefined;
  }
}
