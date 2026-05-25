import * as core from '@actions/core';
import * as github from '@actions/github';
import type {
  ActionInputs,
  CreateJobRequest,
  CreateJobResponse,
  JobStatusResponse,
  JobMetadata,
  RunhumanJobResult,
} from './types';
import { isTerminalStatus } from './types';
import { mapTerminalStatusToResult } from './job-result-mapper';

// Polling configuration
const POLL_INTERVAL_MS = 10000; // 10 seconds between polls
const DEFAULT_MAX_WAIT_MS = 30 * 60 * 1000; // 30 minutes default
const BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer for claiming + API latency

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is transient and should be retried
 */
function isTransientError(error: Error): boolean {
  const message = error.message;

  // Network-level errors
  const isNetworkError =
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('socket hang up') ||
    message.includes('fetch failed');

  // Transient HTTP errors (5xx, 429)
  const isTransientHttpError =
    message.includes('(503)') ||
    message.includes('(502)') ||
    message.includes('(504)') ||
    message.includes('(500)') ||
    message.includes('(429)');

  return isNetworkError || isTransientHttpError;
}

/**
 * Retry wrapper for transient errors with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (!isTransientError(lastError) || attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      core.warning(
        `Transient error (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}. Retrying in ${delay}ms...`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Build base metadata with GitHub Action context.
 * `inputs.githubRepo` is the repo that triggered the action — used by the
 * backend as the default target for auto-created issues in multi-repo
 * projects. `enableCodeContext`/`commitSha`/`waitForCodeContextOverlay`
 * are only stamped onto metadata when the caller opted in, so a default
 * `false`/empty value doesn't clobber a template/schedule that already
 * resolves the flag (#3320).
 */
function buildBaseMetadata(inputs: ActionInputs): JobMetadata {
  const context = github.context;

  const metadata: JobMetadata = {
    source: 'runhuman-action',
    sourceCreatedAt: new Date().toISOString(),
    sourceRepo: inputs.githubRepo,
    githubAction: {
      actionName: 'runhuman-action',
      runId: context.runId?.toString(),
      workflowName: context.workflow,
      triggerEvent: context.eventName,
      actor: context.actor,
    },
  };

  if (inputs.enableCodeContext) metadata.enableCodeContext = true;
  if (inputs.commitSha !== undefined) metadata.commitSha = inputs.commitSha;
  if (inputs.commitBaseSha !== undefined) metadata.commitBaseSha = inputs.commitBaseSha;
  if (inputs.waitForCodeContextOverlay) metadata.waitForCodeContextOverlay = true;

  return metadata;
}

/**
 * Create a QA test job via the async API
 */
async function createJob(inputs: ActionInputs, request: CreateJobRequest): Promise<string> {
  const endpoint = `${inputs.apiUrl}/api/jobs`;

  core.info(`Creating QA test job for ${request.url}...`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${inputs.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'runhuman-action/1.0.0',
      Connection: 'close',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage: string;

    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
    } catch {
      errorMessage = errorText || '(empty response body)';
    }

    core.error(`Failed to create job:`);
    core.error(`  Status: ${response.status} ${response.statusText}`);
    core.error(`  URL: ${endpoint}`);
    core.error(`  Body: ${errorText || '(empty)'}`);

    if (response.status === 401) {
      throw new Error(
        'Authentication failed: Invalid API key. ' +
          'Make sure your RUNHUMAN_API_KEY secret is set correctly.'
      );
    }

    throw new Error(`Failed to create job (${response.status}): ${errorMessage}`);
  }

  const data = (await response.json()) as CreateJobResponse;

  if (!data.jobId) {
    throw new Error('API did not return a job ID');
  }

  core.info(`Job created: ${data.jobId}`);
  return data.jobId;
}

/**
 * Get the status of a job
 */
async function getJobStatus(inputs: ActionInputs, jobId: string): Promise<JobStatusResponse> {
  const endpoint = `${inputs.apiUrl}/api/jobs/${jobId}/status`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${inputs.apiKey}`,
        'User-Agent': 'runhuman-action/1.0.0',
        Connection: 'close',
      },
    });
  } catch (fetchError) {
    const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
    const errorCause =
      fetchError instanceof Error && fetchError.cause
        ? ` Cause: ${JSON.stringify(fetchError.cause)}`
        : '';
    core.error(`Network error fetching job status:`);
    core.error(`  URL: ${endpoint}`);
    core.error(`  Error: ${errorMessage}${errorCause}`);
    throw new Error(`Network error checking job status: ${errorMessage}${errorCause}`);
  }

  if (!response.ok) {
    const errorText = await response.text();

    if (response.status === 404) {
      throw new Error(`Job ${jobId} not found`);
    }

    core.error(`HTTP error fetching job status:`);
    core.error(`  URL: ${endpoint}`);
    core.error(`  Status: ${response.status} ${response.statusText}`);
    core.error(`  Body: ${errorText || '(empty)'}`);

    throw new Error(
      `Failed to get job status (${response.status}): ${errorText || response.statusText}`
    );
  }

  return (await response.json()) as JobStatusResponse;
}

/**
 * Calculate maximum wait time based on job data (accounts for time extensions)
 */
function calculateMaxWaitMs(
  targetDurationMinutes: number | undefined,
  maxExtensionMinutes: number | undefined,
  responseDeadline: string | undefined
): number {
  // If we have a deadline, use it + buffer
  if (responseDeadline) {
    const deadlineMs = new Date(responseDeadline).getTime();
    const nowMs = Date.now();
    const remainingMs = deadlineMs - nowMs;
    return Math.max(remainingMs + BUFFER_MS, DEFAULT_MAX_WAIT_MS);
  }

  // Calculate based on target + extensions + buffer
  if (targetDurationMinutes !== undefined) {
    const totalMinutes = targetDurationMinutes + (maxExtensionMinutes || 0);
    const totalMs = totalMinutes * 60 * 1000;
    return totalMs + BUFFER_MS;
  }

  return DEFAULT_MAX_WAIT_MS;
}

/**
 * Poll for job completion with dynamic timeout.
 *
 * Returns the instant the job reaches a terminal status (`isTerminalStatus`)
 * — the verdict is latched by the caller and no further status fetches are
 * made. A persistently failing API can never wedge the loop: each poll is
 * bounded by `withRetry` (it throws after its retry budget), so the caller
 * exits on either a terminal status, the wait-budget timeout, or a thrown
 * error.
 */
async function pollForCompletion(
  inputs: ActionInputs,
  jobId: string,
  initialTargetMinutes?: number
): Promise<{ status: JobStatusResponse; timedOut: boolean }> {
  const startTime = Date.now();
  let lastStatus: string | null = null;
  let maxWaitMs = initialTargetMinutes
    ? initialTargetMinutes * 60 * 1000 + BUFFER_MS
    : DEFAULT_MAX_WAIT_MS;

  while (true) {
    const elapsed = Date.now() - startTime;
    const status = await withRetry(() => getJobStatus(inputs, jobId));

    // Dynamically update maxWaitMs based on job data (handles extensions)
    const newMaxWaitMs = calculateMaxWaitMs(
      status.targetDurationMinutes,
      status.maxExtensionMinutes,
      status.responseDeadline
    );
    if (newMaxWaitMs > maxWaitMs) {
      core.info(`Time extension detected, extending timeout to ${Math.round(newMaxWaitMs / 60000)} minutes`);
      maxWaitMs = newMaxWaitMs;
    }

    // Log status changes
    if (status.status !== lastStatus) {
      core.info(`Job ${jobId} status: ${status.status} (${Math.round(elapsed / 1000)}s elapsed)`);
      lastStatus = status.status;
    }

    if (isTerminalStatus(status.status)) {
      return { status, timedOut: false };
    }

    // Check timeout
    if (elapsed > maxWaitMs) {
      core.warning(`Job did not complete within ${Math.round(maxWaitMs / 60000)} minutes`);
      return { status, timedOut: true };
    }

    // Wait before next poll
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Build job request from action inputs
 * Template content or name is sent to API for server-side parsing and merging
 */
function buildJobRequest(inputs: ActionInputs): CreateJobRequest {
  // Validate required fields (unless using template)
  const hasTemplate = !!inputs.template || !!inputs.templateContent;
  if (!inputs.url && !hasTemplate) {
    throw new Error('URL is required - provide via url input or template');
  }
  if (!inputs.description && !hasTemplate) {
    throw new Error('Description is required - provide via description input or template');
  }

  return {
    url: inputs.url,
    description: inputs.description,
    outputSchema: inputs.outputSchema,
    targetDurationMinutes: inputs.targetDurationMinutes,
    githubRepos: inputs.githubRepos,
    autoCreateGithubIssues: inputs.autoCreateGithubIssues,
    autoCreateGithubIssuesRepo: inputs.autoCreateGithubIssuesRepo,
    autoCreateOnlyTesterSurfaced: inputs.autoCreateOnlyTesterSurfaced,
    deviceClass: inputs.deviceClass,
    requiresRunhumanApkInstall: inputs.requiresRunhumanApkInstall,
    metadata: buildBaseMetadata(inputs),
    // Pass template name for server-side resolution
    template: inputs.template,
    // Pass raw template content for server-side parsing
    templateContent: inputs.templateContent,
    // Pass GitHub token for GitHub operations without App installation
    githubToken: inputs.githubToken || undefined,
  };
}

/**
 * Run a QA test with just a description (no issue context)
 */
export async function runTestWithDescription(inputs: ActionInputs): Promise<RunhumanJobResult> {
  // Check if we have enough info to create a job
  const hasDescription = !!inputs.description;
  const hasTemplate = !!inputs.template;
  const hasTemplateContent = !!inputs.templateContent;

  if (!hasDescription && !hasTemplate && !hasTemplateContent) {
    throw new Error('Description is required when no issues are provided. Provide via description input, template, or template-file.');
  }

  if (hasTemplate) {
    core.info(`Creating QA test job using template: ${inputs.template}`);
  } else if (hasTemplateContent) {
    core.info(`Creating QA test job using local template: ${inputs.templateFile}`);
  } else {
    core.info('Creating QA test job with description only');
  }

  try {
    const request = buildJobRequest(inputs);
    const jobId = await withRetry(() => createJob(inputs, request));

    core.info(`Created job ${jobId}`);

    if (!inputs.waitForResult) {
      core.info('Fire-and-forget mode: job created, not waiting for completion');
      return {
        success: true,
        explanation: 'Job created successfully (not waiting for result)',
        costUsd: 0,
        durationSeconds: 0,
        status: 'created',
        jobId,
      };
    }

    // Poll for completion, then latch the terminal verdict
    const { status: finalStatus, timedOut } = await pollForCompletion(
      inputs,
      jobId,
      inputs.targetDurationMinutes
    );

    const result = mapTerminalStatusToResult(finalStatus, timedOut);
    if (result.status === 'completed') {
      result.extractedIssues = finalStatus.extractedIssues;
      result.jobStatus = finalStatus;
    }
    return result;
  } catch (error) {
    core.error(`Failed to run test: ${error}`);
    return {
      success: false,
      explanation: `Error: ${error}`,
      costUsd: 0,
      durationSeconds: 0,
      status: 'error',
    };
  }
}

/**
 * Run a QA test job by passing PR/issue IDs directly to the server.
 * The server handles all GitHub data fetching and test plan generation.
 * This is the thin-client pattern - the action just passes IDs and polls for results.
 */
export async function runJobWithIds(
  inputs: ActionInputs,
  prNumbers: number[],
  issueNumbers: number[]
): Promise<{
  result: RunhumanJobResult;
  jobId: string;
  jobUrl?: string;
}> {
  const testUrl = inputs.url;

  if (!testUrl) {
    return {
      result: {
        success: false,
        explanation: 'No test URL available',
        costUsd: 0,
        durationSeconds: 0,
        status: 'error',
      },
      jobId: '',
    };
  }

  const prSummary = prNumbers.length > 0 ? 'PRs: ' + prNumbers.map((n) => '#' + n).join(', ') : '';
  const issueSummary = issueNumbers.length > 0 ? 'Issues: ' + issueNumbers.map((n) => '#' + n).join(', ') : '';
  const itemSummary = [prSummary, issueSummary].filter(Boolean).join('; ');

  core.info('Creating QA test job for ' + itemSummary + ' (server-side analysis)');
  core.debug('Test URL: ' + testUrl);

  try {
    const jobId = await withRetry(() =>
      createJob(inputs, {
        url: testUrl,
        prNumbers: prNumbers.length > 0 ? prNumbers : undefined,
        issueNumbers: issueNumbers.length > 0 ? issueNumbers : undefined,
        outputSchema: inputs.outputSchema,
        targetDurationMinutes: inputs.targetDurationMinutes,
        githubRepos: inputs.githubRepos,
        autoCreateGithubIssues: inputs.autoCreateGithubIssues,
        autoCreateGithubIssuesRepo: inputs.autoCreateGithubIssuesRepo,
        autoCreateOnlyTesterSurfaced: inputs.autoCreateOnlyTesterSurfaced,
        deviceClass: inputs.deviceClass,
        requiresRunhumanApkInstall: inputs.requiresRunhumanApkInstall,
        metadata: buildBaseMetadata(inputs),
        githubToken: inputs.githubToken || undefined,
        description: inputs.description,
      })
    );

    core.info('Created job ' + jobId + ' for ' + itemSummary);

    if (!inputs.waitForResult) {
      core.info('Fire-and-forget mode: job created, not waiting for completion');
      return {
        result: {
          success: true,
          explanation: 'Job created successfully (not waiting for result)',
          costUsd: 0,
          durationSeconds: 0,
          status: 'created',
          jobId,
        },
        jobId,
      };
    }

    core.info('Waiting for job ' + jobId + ' to complete...');
    const { status: finalStatus, timedOut } = await pollForCompletion(
      inputs,
      jobId,
      inputs.targetDurationMinutes
    );

    // Latch the terminal verdict; jobUrl is carried through for the PR comment / outputs.
    const jobUrl = finalStatus.jobUrl;
    const result: RunhumanJobResult = {
      ...mapTerminalStatusToResult(finalStatus, timedOut),
      jobId,
      jobUrl,
    };

    return { result, jobId, jobUrl };
  } catch (error) {
    core.error('Failed to run test for ' + itemSummary + ': ' + error);
    return {
      result: {
        success: false,
        explanation: 'Error: ' + error,
        costUsd: 0,
        durationSeconds: 0,
        status: 'error',
      },
      jobId: '',
    };
  }
}
