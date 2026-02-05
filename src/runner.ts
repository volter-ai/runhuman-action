import * as core from '@actions/core';
import * as github from '@actions/github';
import type {
  Issue,
  ActionInputs,
  AnalyzeIssueResponse,
  AnalyzePrResponse,
  CreateJobRequest,
  CreateJobResponse,
  JobStatusResponse,
  JobMetadata,
  PullRequest,
  RunhumanJobResult,
} from './types';
import { isTerminalStatus } from './types';

/**
 * Analyzed PR with its analysis response
 */
export interface AnalyzedPr {
  pr: PullRequest;
  analysis: AnalyzePrResponse;
}

/**
 * Analyzed Issue with its analysis response
 */
export interface AnalyzedIssue {
  issue: Issue;
  analysis: AnalyzeIssueResponse;
}

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
 * Build base metadata with GitHub Action context
 */
function buildBaseMetadata(): JobMetadata {
  const context = github.context;

  return {
    source: 'runhuman-action',
    sourceCreatedAt: new Date().toISOString(),
    githubAction: {
      actionName: 'runhuman-action',
      runId: context.runId?.toString(),
      workflowName: context.workflow,
      triggerEvent: context.eventName,
      actor: context.actor,
    },
  };
}

/**
 * Build metadata for issue testing
 */
function buildIssueTestMetadata(issue: Issue, githubRepo: string): JobMetadata {
  const metadata = buildBaseMetadata();

  metadata.githubIssue = {
    repo: githubRepo,
    issueNumber: issue.number,
    issueUrl: `https://github.com/${githubRepo}/issues/${issue.number}`,
  };

  return metadata;
}

/**
 * Build metadata for PR testing
 */
function buildPrTestMetadata(pr: PullRequest, githubRepo: string): JobMetadata {
  const metadata = buildBaseMetadata();

  metadata.githubPR = {
    repo: githubRepo,
    prNumber: pr.number,
    prUrl: `https://github.com/${githubRepo}/pull/${pr.number}`,
  };

  return metadata;
}

// Character limits for context formatting
const ISSUE_BODY_LIMIT = 2000;
const PR_BODY_LIMIT = 2000;

/**
 * Truncate text to a maximum length
 */
function truncateText(text: string, limit: number): string {
  if (!text) return '';
  if (text.length <= limit) return text;
  return text.substring(0, limit) + '... (truncated)';
}

/**
 * Format issue context for validation instructions
 */
function formatIssueContext(issue: Issue): string {
  const labels = issue.labels.join(', ') || 'None';
  const body = truncateText(issue.body, ISSUE_BODY_LIMIT);

  return `=== Original Issue Context ===
Title: ${issue.title}
Labels: ${labels}

Issue Description:
${body}

When validating the test results, consider whether the tester's findings align with the expectations described in the original issue above. The test should be marked as passing only if the issue appears to be properly resolved or the feature works as described.`;
}

/**
 * Format PR context for validation instructions
 */
function formatPrContext(pr: PullRequest, analysis: AnalyzePrResponse): string {
  const body = truncateText(pr.body, PR_BODY_LIMIT);

  return `=== Pull Request Context ===
Title: ${pr.title}

PR Description:
${body}

=== AI Analysis Summary ===
${analysis.summary}

Affected Areas: ${analysis.affectedAreas.join(', ')}

When validating the test results, consider whether the tester's findings align with the expected behavior of the PR changes described above. The test should verify that the changes work as intended.`;
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
  totalExtensionMinutes: number | undefined,
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
    const totalMinutes = targetDurationMinutes + (totalExtensionMinutes || 0);
    const totalMs = totalMinutes * 60 * 1000;
    return totalMs + BUFFER_MS;
  }

  return DEFAULT_MAX_WAIT_MS;
}

/**
 * Poll for job completion with dynamic timeout
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
      status.totalExtensionMinutes,
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
 * Run a QA test for an issue with AI-generated analysis
 */
export async function runTestForIssue(
  inputs: ActionInputs,
  issue: Issue,
  analysis: AnalyzeIssueResponse
): Promise<RunhumanJobResult> {
  const testUrl = analysis.testUrl || inputs.url;

  if (!testUrl) {
    return {
      success: false,
      explanation: 'No test URL available',
      costUsd: 0,
      durationSeconds: 0,
      status: 'error',
      analysis,
    };
  }

  core.info(`Creating QA test job for issue #${issue.number}`);
  core.debug(`Test URL: ${testUrl}`);
  core.debug(`Instructions: ${analysis.testInstructions.substring(0, 200)}...`);

  try {
    const jobId = await withRetry(() =>
      createJob(inputs, {
        url: testUrl,
        description: analysis.testInstructions,
        outputSchema: analysis.outputSchema,
        targetDurationMinutes: inputs.targetDurationMinutes,
        additionalValidationInstructions: formatIssueContext(issue),
        githubRepo: inputs.githubRepo,
        screenSize: inputs.screenSize,
        metadata: buildIssueTestMetadata(issue, inputs.githubRepo),
        githubToken: inputs.githubToken || undefined,
      })
    );

    core.info(`Created job ${jobId} for issue #${issue.number}`);

    // Poll for completion
    core.info(`Waiting for job ${jobId} to complete...`);
    const { status: finalStatus, timedOut } = await pollForCompletion(
      inputs,
      jobId,
      inputs.targetDurationMinutes
    );

    const jobUrl = finalStatus.jobUrl;

    // Map status to result
    if (timedOut) {
      return {
        success: false,
        explanation: 'Test timed out waiting for tester response',
        costUsd: finalStatus.costUsd ?? 0,
        durationSeconds: finalStatus.testDurationSeconds ?? 0,
        status: 'timeout',
        analysis,
        jobId,
        jobUrl,
      };
    }

    if (finalStatus.status === 'completed' && finalStatus.result) {
      return {
        success: finalStatus.result.success,
        explanation: finalStatus.result.explanation,
        data: finalStatus.result.data,
        costUsd: finalStatus.costUsd ?? 0,
        durationSeconds: finalStatus.testDurationSeconds ?? 0,
        status: 'completed',
        analysis,
        jobId,
        jobUrl,
      };
    }

    if (finalStatus.status === 'abandoned') {
      return {
        success: false,
        explanation: finalStatus.reason || 'Test was abandoned',
        costUsd: finalStatus.costUsd ?? 0,
        durationSeconds: finalStatus.testDurationSeconds ?? 0,
        status: 'abandoned',
        analysis,
        jobId,
        jobUrl,
      };
    }

    // Error or other terminal state
    return {
      success: false,
      explanation: finalStatus.error || finalStatus.reason || `Job ended with status: ${finalStatus.status}`,
      costUsd: finalStatus.costUsd ?? 0,
      durationSeconds: finalStatus.testDurationSeconds ?? 0,
      status: 'error',
      analysis,
      jobId,
      jobUrl,
    };
  } catch (error) {
    core.error(`Failed to run test for issue #${issue.number}: ${error}`);
    return {
      success: false,
      explanation: `Error: ${error}`,
      costUsd: 0,
      durationSeconds: 0,
      status: 'error',
      analysis,
    };
  }
}

/**
 * Run a QA test for a PR with AI-generated analysis
 */
export async function runTestForPr(
  inputs: ActionInputs,
  pr: PullRequest,
  analysis: AnalyzePrResponse
): Promise<RunhumanJobResult> {
  const testUrl = inputs.url;

  if (!testUrl) {
    return {
      success: false,
      explanation: 'No test URL available',
      costUsd: 0,
      durationSeconds: 0,
      status: 'error',
    };
  }

  core.info(`Creating QA test job for PR #${pr.number}`);
  core.debug(`Test URL: ${testUrl}`);
  core.debug(`Instructions: ${analysis.testInstructions.substring(0, 200)}...`);

  try {
    const jobId = await withRetry(() =>
      createJob(inputs, {
        url: testUrl,
        description: analysis.testInstructions,
        outputSchema: analysis.outputSchema,
        targetDurationMinutes: inputs.targetDurationMinutes,
        additionalValidationInstructions: formatPrContext(pr, analysis),
        githubRepo: inputs.githubRepo,
        screenSize: inputs.screenSize,
        metadata: buildPrTestMetadata(pr, inputs.githubRepo),
        githubToken: inputs.githubToken || undefined,
      })
    );

    core.info(`Created job ${jobId} for PR #${pr.number}`);

    // Poll for completion
    core.info(`Waiting for job ${jobId} to complete...`);
    const { status: finalStatus, timedOut } = await pollForCompletion(
      inputs,
      jobId,
      inputs.targetDurationMinutes
    );

    const jobUrl = finalStatus.jobUrl;

    // Map status to result
    if (timedOut) {
      return {
        success: false,
        explanation: 'Test timed out waiting for tester response',
        costUsd: finalStatus.costUsd ?? 0,
        durationSeconds: finalStatus.testDurationSeconds ?? 0,
        status: 'timeout',
        jobId,
        jobUrl,
      };
    }

    if (finalStatus.status === 'completed' && finalStatus.result) {
      return {
        success: finalStatus.result.success,
        explanation: finalStatus.result.explanation,
        data: finalStatus.result.data,
        costUsd: finalStatus.costUsd ?? 0,
        durationSeconds: finalStatus.testDurationSeconds ?? 0,
        status: 'completed',
        jobId,
        jobUrl,
      };
    }

    if (finalStatus.status === 'abandoned') {
      return {
        success: false,
        explanation: finalStatus.reason || 'Test was abandoned',
        costUsd: finalStatus.costUsd ?? 0,
        durationSeconds: finalStatus.testDurationSeconds ?? 0,
        status: 'abandoned',
        jobId,
        jobUrl,
      };
    }

    // Error or other terminal state
    return {
      success: false,
      explanation: finalStatus.error || finalStatus.reason || `Job ended with status: ${finalStatus.status}`,
      costUsd: finalStatus.costUsd ?? 0,
      durationSeconds: finalStatus.testDurationSeconds ?? 0,
      status: 'error',
      jobId,
      jobUrl,
    };
  } catch (error) {
    core.error(`Failed to run test for PR #${pr.number}: ${error}`);
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
    githubRepo: inputs.githubRepo,
    screenSize: inputs.screenSize,
    metadata: buildBaseMetadata(),
    canCreateGithubIssues: inputs.canCreateGithubIssues,
    repoName: inputs.canCreateGithubIssues ? inputs.githubRepo : undefined,
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

    // Poll for completion
    const { status: finalStatus, timedOut } = await pollForCompletion(
      inputs,
      jobId,
      inputs.targetDurationMinutes
    );

    const jobUrl = finalStatus.jobUrl;

    if (timedOut) {
      return {
        success: false,
        explanation: 'Test timed out waiting for tester response',
        costUsd: finalStatus.costUsd ?? 0,
        durationSeconds: finalStatus.testDurationSeconds ?? 0,
        status: 'timeout',
        jobId,
        jobUrl,
      };
    }

    if (finalStatus.status === 'completed' && finalStatus.result) {
      return {
        success: finalStatus.result.success,
        explanation: finalStatus.result.explanation,
        data: finalStatus.result.data,
        costUsd: finalStatus.costUsd ?? 0,
        durationSeconds: finalStatus.testDurationSeconds ?? 0,
        status: 'completed',
        jobId,
        jobUrl,
      };
    }

    if (finalStatus.status === 'abandoned') {
      return {
        success: false,
        explanation: finalStatus.reason || 'Test was abandoned',
        costUsd: finalStatus.costUsd ?? 0,
        durationSeconds: finalStatus.testDurationSeconds ?? 0,
        status: 'abandoned',
        jobId,
        jobUrl,
      };
    }

    return {
      success: false,
      explanation: finalStatus.error || finalStatus.reason || `Job ended with status: ${finalStatus.status}`,
      costUsd: finalStatus.costUsd ?? 0,
      durationSeconds: finalStatus.testDurationSeconds ?? 0,
      status: 'error',
      jobId,
      jobUrl,
    };
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
 * Build metadata for a consolidated test that covers multiple PRs and/or issues
 */
function buildConsolidatedMetadata(
  prs: AnalyzedPr[],
  issues: AnalyzedIssue[],
  githubRepo: string
): JobMetadata {
  const metadata = buildBaseMetadata();

  // Add PR references
  if (prs.length === 1) {
    metadata.githubPR = {
      repo: githubRepo,
      prNumber: prs[0].pr.number,
      prUrl: `https://github.com/${githubRepo}/pull/${prs[0].pr.number}`,
    };
  } else if (prs.length > 1) {
    // For multiple PRs, store in a custom field
    (metadata as unknown as Record<string, unknown>).githubPRs = prs.map((p) => ({
      repo: githubRepo,
      prNumber: p.pr.number,
      prUrl: `https://github.com/${githubRepo}/pull/${p.pr.number}`,
    }));
  }

  // Add issue references
  if (issues.length === 1) {
    metadata.githubIssue = {
      repo: githubRepo,
      issueNumber: issues[0].issue.number,
      issueUrl: `https://github.com/${githubRepo}/issues/${issues[0].issue.number}`,
    };
  } else if (issues.length > 1) {
    // For multiple issues, store in a custom field
    (metadata as unknown as Record<string, unknown>).githubIssues = issues.map((i) => ({
      repo: githubRepo,
      issueNumber: i.issue.number,
      issueUrl: `https://github.com/${githubRepo}/issues/${i.issue.number}`,
    }));
  }

  return metadata;
}

/**
 * Build a combined description from all testable PRs and issues
 */
function buildConsolidatedDescription(prs: AnalyzedPr[], issues: AnalyzedIssue[]): string {
  const sections: string[] = [];

  // Add PR test instructions
  for (const { pr, analysis } of prs) {
    sections.push(`## PR #${pr.number}: ${pr.title}\n\n${analysis.testInstructions}`);
  }

  // Add issue test instructions
  for (const { issue, analysis } of issues) {
    sections.push(`## Issue #${issue.number}: ${issue.title}\n\n${analysis.testInstructions}`);
  }

  if (sections.length === 1) {
    // Only one item, no need for headers
    return prs.length > 0 ? prs[0].analysis.testInstructions : issues[0].analysis.testInstructions;
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Build combined validation instructions from all PRs and issues
 */
function buildConsolidatedValidationInstructions(
  prs: AnalyzedPr[],
  issues: AnalyzedIssue[]
): string {
  const sections: string[] = [];

  // Add PR contexts
  for (const { pr, analysis } of prs) {
    sections.push(formatPrContext(pr, analysis));
  }

  // Add issue contexts
  for (const { issue } of issues) {
    sections.push(formatIssueContext(issue));
  }

  if (sections.length === 1) {
    return sections[0];
  }

  return sections.join('\n\n===\n\n');
}

/**
 * Run a single consolidated QA test for all testable PRs and issues.
 * This creates ONE job that the tester will use to verify all changes.
 */
export async function runConsolidatedTest(
  inputs: ActionInputs,
  prs: AnalyzedPr[],
  issues: AnalyzedIssue[]
): Promise<RunhumanJobResult> {
  const testUrl = inputs.url;

  if (!testUrl) {
    return {
      success: false,
      explanation: 'No test URL available',
      costUsd: 0,
      durationSeconds: 0,
      status: 'error',
    };
  }

  const prNumbers = prs.map((p) => p.pr.number);
  const issueNumbers = issues.map((i) => i.issue.number);
  const itemSummary = [
    ...(prNumbers.length > 0 ? [`PRs: ${prNumbers.map((n) => `#${n}`).join(', ')}`] : []),
    ...(issueNumbers.length > 0 ? [`Issues: ${issueNumbers.map((n) => `#${n}`).join(', ')}`] : []),
  ].join('; ');

  core.info(`Creating consolidated QA test job for ${itemSummary}`);
  core.debug(`Test URL: ${testUrl}`);

  try {
    const description = buildConsolidatedDescription(prs, issues);
    const validationInstructions = buildConsolidatedValidationInstructions(prs, issues);
    const metadata = buildConsolidatedMetadata(prs, issues, inputs.githubRepo);

    // Use the first available output schema, or null if none
    const outputSchema = prs[0]?.analysis.outputSchema || issues[0]?.analysis.outputSchema || undefined;

    const jobId = await withRetry(() =>
      createJob(inputs, {
        url: testUrl,
        description,
        outputSchema,
        targetDurationMinutes: inputs.targetDurationMinutes,
        additionalValidationInstructions: validationInstructions,
        githubRepo: inputs.githubRepo,
        screenSize: inputs.screenSize,
        metadata,
        githubToken: inputs.githubToken || undefined,
      })
    );

    core.info(`Created consolidated job ${jobId} for ${itemSummary}`);

    // Poll for completion
    core.info(`Waiting for job ${jobId} to complete...`);
    const { status: finalStatus, timedOut } = await pollForCompletion(
      inputs,
      jobId,
      inputs.targetDurationMinutes
    );

    const jobUrl = finalStatus.jobUrl;

    // Map status to result
    if (timedOut) {
      return {
        success: false,
        explanation: 'Test timed out waiting for tester response',
        costUsd: finalStatus.costUsd ?? 0,
        durationSeconds: finalStatus.testDurationSeconds ?? 0,
        status: 'timeout',
        jobId,
        jobUrl,
      };
    }

    if (finalStatus.status === 'completed' && finalStatus.result) {
      return {
        success: finalStatus.result.success,
        explanation: finalStatus.result.explanation,
        data: finalStatus.result.data,
        costUsd: finalStatus.costUsd ?? 0,
        durationSeconds: finalStatus.testDurationSeconds ?? 0,
        status: 'completed',
        jobId,
        jobUrl,
      };
    }

    if (finalStatus.status === 'abandoned') {
      return {
        success: false,
        explanation: finalStatus.reason || 'Test was abandoned',
        costUsd: finalStatus.costUsd ?? 0,
        durationSeconds: finalStatus.testDurationSeconds ?? 0,
        status: 'abandoned',
        jobId,
        jobUrl,
      };
    }

    // Error or other terminal state
    return {
      success: false,
      explanation: finalStatus.error || finalStatus.reason || `Job ended with status: ${finalStatus.status}`,
      costUsd: finalStatus.costUsd ?? 0,
      durationSeconds: finalStatus.testDurationSeconds ?? 0,
      status: 'error',
      jobId,
      jobUrl,
    };
  } catch (error) {
    core.error(`Failed to run consolidated test for ${itemSummary}: ${error}`);
    return {
      success: false,
      explanation: `Error: ${error}`,
      costUsd: 0,
      durationSeconds: 0,
      status: 'error',
    };
  }
}
