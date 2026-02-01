import * as core from '@actions/core';
import type { Issue, ActionInputs, AnalyzeIssueRequest, AnalyzeIssueResponse } from './types';
import { withRetry } from './runner';

/**
 * Call the Runhuman API to analyze a GitHub issue for testability.
 * Uses AI to determine if the issue can be tested and generates test instructions.
 */
export async function analyzeIssue(
  inputs: ActionInputs,
  issue: Issue
): Promise<AnalyzeIssueResponse> {
  const endpoint = `${inputs.apiUrl}/api/analyze-issue`;

  core.debug(`Analyzing issue #${issue.number}: "${issue.title}"`);
  core.debug(`Using preset test URL: ${inputs.url}`);

  const requestBody: AnalyzeIssueRequest = {
    issueTitle: issue.title,
    issueBody: issue.body,
    issueLabels: issue.labels,
    presetTestUrl: inputs.url,
    githubRepo: inputs.githubRepo,
    issueComments: issue.comments,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${inputs.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'runhuman-action/1.0.0',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(60000), // 1 minute timeout for analysis
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage: string;

    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error || errorData.message || errorText;
    } catch {
      errorMessage = errorText;
    }

    if (response.status === 401) {
      throw new Error(
        'Authentication failed: Invalid API key. ' +
          'Make sure your RUNHUMAN_API_KEY secret is set correctly.'
      );
    }

    throw new Error(`Issue analysis failed (${response.status}): ${errorMessage}`);
  }

  const data = (await response.json()) as AnalyzeIssueResponse;

  core.debug(`Analysis complete: isTestable=${data.isTestable}, confidence=${data.confidence}`);

  return data;
}

export interface AnalyzedIssue {
  issue: Issue;
  analysis: AnalyzeIssueResponse;
}

export interface TestabilityResults {
  testable: AnalyzedIssue[];
  notTestable: Array<{ issue: Issue; reason: string }>;
}

/**
 * Analyze all issues for testability using the AI analysis endpoint.
 * Returns testable issues with their analysis results.
 *
 * Throws an error if analysis fails after retries - we don't silently
 * skip issues when we can't determine testability.
 */
export async function analyzeIssuesForTestability(
  inputs: ActionInputs,
  issues: Issue[]
): Promise<TestabilityResults> {
  const testable: AnalyzedIssue[] = [];
  const notTestable: Array<{ issue: Issue; reason: string }> = [];

  for (const issue of issues) {
    core.info(`Analyzing issue #${issue.number}...`);

    // Wrap with retry for transient errors (503, 429, network errors, etc.)
    // If this fails after retries, the error propagates and fails the action
    const analysis = await withRetry(() => analyzeIssue(inputs, issue));

    if (analysis.isTestable) {
      core.info(`Issue #${issue.number} is testable (confidence: ${analysis.confidence})`);
      testable.push({ issue, analysis });
    } else {
      const reason = analysis.reason || 'AI determined issue is not testable';
      core.info(`Issue #${issue.number} is NOT testable: ${reason}`);
      notTestable.push({ issue, reason });
    }
  }

  return { testable, notTestable };
}
