import * as core from '@actions/core';
import type { Issue, RunhumanJobResult, ActionInputs } from './types';

interface CreateJobRequest {
  url: string;
  description: string;
  targetDurationMinutes: number;
  screenSize: string;
  outputSchema?: Record<string, unknown>;
}

interface CreateJobResponse {
  jobId: string;
}

interface JobStatus {
  status: 'pending' | 'claimed' | 'in_progress' | 'completed' | 'timeout' | 'error' | 'abandoned';
  success?: boolean;
  explanation?: string;
  data?: Record<string, unknown>;
  costUsd?: number;
  durationSeconds?: number;
}

/**
 * Build test description from issue content and optional additional description.
 */
export function buildTestDescription(issue: Issue, additionalDescription?: string): string {
  const parts: string[] = [];

  parts.push(`## Test Issue #${issue.number}: ${issue.title}`);
  parts.push('');

  if (issue.body) {
    parts.push('### Issue Description');
    parts.push(issue.body);
    parts.push('');
  }

  parts.push('### Test Instructions');
  parts.push('Please verify that the issue described above has been resolved.');
  parts.push('Test the functionality mentioned and confirm it works as expected.');
  parts.push('');

  if (additionalDescription) {
    parts.push('### Additional Instructions');
    parts.push(additionalDescription);
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Create a QA test job via the Runhuman API.
 */
async function createJob(
  apiUrl: string,
  apiKey: string,
  request: CreateJobRequest
): Promise<string> {
  const response = await fetch(`${apiUrl}/api/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create job: ${response.status} ${errorText}`);
  }

  const data = await response.json() as CreateJobResponse;
  return data.jobId;
}

/**
 * Get the status of a job.
 */
async function getJobStatus(
  apiUrl: string,
  apiKey: string,
  jobId: string
): Promise<JobStatus> {
  const response = await fetch(`${apiUrl}/api/jobs/${jobId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get job status: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<JobStatus>;
}

/**
 * Wait for a job to complete, polling at regular intervals.
 */
async function waitForJob(
  apiUrl: string,
  apiKey: string,
  jobId: string,
  timeoutMs: number = 600000 // 10 minutes default
): Promise<JobStatus> {
  const startTime = Date.now();
  const pollIntervalMs = 10000; // 10 seconds

  while (Date.now() - startTime < timeoutMs) {
    const status = await getJobStatus(apiUrl, apiKey, jobId);

    if (['completed', 'timeout', 'error', 'abandoned'].includes(status.status)) {
      return status;
    }

    core.info(`Job ${jobId} status: ${status.status}, waiting...`);
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  return {
    status: 'timeout',
    success: false,
    explanation: 'Job timed out waiting for tester response',
  };
}

/**
 * Run a QA test for a single issue.
 */
export async function runTestForIssue(
  inputs: ActionInputs,
  issue: Issue
): Promise<RunhumanJobResult> {
  const description = buildTestDescription(issue, inputs.description);

  core.info(`Creating QA test job for issue #${issue.number}`);
  core.debug(`Test URL: ${inputs.url}`);
  core.debug(`Description: ${description.substring(0, 200)}...`);

  try {
    const jobId = await createJob(inputs.apiUrl, inputs.apiKey, {
      url: inputs.url,
      description,
      targetDurationMinutes: inputs.targetDurationMinutes,
      screenSize: inputs.screenSize,
    });

    core.info(`Created job ${jobId} for issue #${issue.number}`);

    // Wait for the job to complete (timeout is target duration + buffer)
    const timeoutMs = (inputs.targetDurationMinutes + 5) * 60 * 1000;
    const status = await waitForJob(inputs.apiUrl, inputs.apiKey, jobId, timeoutMs);

    return {
      success: status.success ?? false,
      explanation: status.explanation,
      data: status.data,
      costUsd: status.costUsd ?? 0,
      durationSeconds: status.durationSeconds ?? 0,
      status: status.status as 'completed' | 'timeout' | 'error' | 'abandoned',
    };
  } catch (error) {
    core.error(`Failed to run test for issue #${issue.number}: ${error}`);
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
 * Run a QA test with just a description (no issue context).
 */
export async function runTestWithDescription(
  inputs: ActionInputs
): Promise<RunhumanJobResult> {
  if (!inputs.description) {
    throw new Error('Description is required when no issues are provided');
  }

  core.info('Creating QA test job with description only');

  try {
    const jobId = await createJob(inputs.apiUrl, inputs.apiKey, {
      url: inputs.url,
      description: inputs.description,
      targetDurationMinutes: inputs.targetDurationMinutes,
      screenSize: inputs.screenSize,
    });

    core.info(`Created job ${jobId}`);

    const timeoutMs = (inputs.targetDurationMinutes + 5) * 60 * 1000;
    const status = await waitForJob(inputs.apiUrl, inputs.apiKey, jobId, timeoutMs);

    return {
      success: status.success ?? false,
      explanation: status.explanation,
      data: status.data,
      costUsd: status.costUsd ?? 0,
      durationSeconds: status.durationSeconds ?? 0,
      status: status.status as 'completed' | 'timeout' | 'error' | 'abandoned',
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
