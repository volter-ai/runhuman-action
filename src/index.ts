import * as core from '@actions/core';
import * as github from '@actions/github';
import { parseInputs } from './inputs';
import { collectIssues } from './issues';
import { runJobWithIds, runTestWithDescription } from './runner';
import { applyLabelsForOutcome } from './labels';
import type { ActionOutputs, IssueTestResult, TestOutcome } from './types';

async function run(): Promise<void> {
  try {
    // Parse inputs
    const inputs = parseInputs();
    core.info('Inputs parsed successfully');

    // Get GitHub context
    const octokit = github.getOctokit(inputs.githubToken);
    const { owner, repo } = github.context.repo;

    // Collect issue numbers from PRs (if any) and explicit issue numbers
    const issueNumbersFromPrs = await collectIssueNumbers(octokit, owner, repo, inputs.prNumbers);
    const allIssueNumbers = [...new Set([...issueNumbersFromPrs, ...inputs.issueNumbers])];

    // If we have PRs or issues, use the server-side analysis flow
    if (inputs.prNumbers.length > 0 || allIssueNumbers.length > 0) {
      core.info('Using server-side analysis flow (thin-client pattern)');

      // Run job with IDs - server handles all analysis
      const { result, jobId, jobUrl } = await runJobWithIds(inputs, inputs.prNumbers, allIssueNumbers);

      // Map result status to outcome
      let outcome: TestOutcome;
      if (result.status === 'completed') {
        outcome = result.success ? 'success' : 'failure';
      } else if (result.status === 'timeout') {
        outcome = 'timeout';
      } else if (result.status === 'not-testable') {
        outcome = 'not-testable';
      } else {
        outcome = 'error';
      }

      // Apply labels for all tested items
      for (const issueNumber of allIssueNumbers) {
        await applyLabelsForOutcome(octokit, owner, repo, issueNumber, inputs, outcome);
      }

      // Build problem description for failures
      const problemDescription = outcome !== 'success' ? result.explanation : undefined;

      // Build results array
      const results: IssueTestResult[] = allIssueNumbers.map((issueNumber) => ({
        issueNumber,
        outcome,
        explanation: result.explanation,
        problemDescription,
        data: result.data,
        costUsd: result.costUsd / Math.max(allIssueNumbers.length, 1),
        durationSeconds: result.durationSeconds,
      }));

      // Determine output arrays
      const passedIssues = outcome === 'success' ? allIssueNumbers : [];
      const failedIssues = outcome === 'failure' ? allIssueNumbers : [];
      const notTestableIssues = outcome === 'not-testable' ? allIssueNumbers : [];
      const timedOutIssues = outcome === 'timeout' ? allIssueNumbers : [];

      const outputs: ActionOutputs = {
        status: result.status === 'not-testable' ? 'completed' : (result.status === 'timeout' ? 'timeout' : (result.status === 'error' ? 'error' : 'completed')),
        success: result.success,
        problemDescription,
        testedIssues: allIssueNumbers,
        passedIssues,
        failedIssues,
        notTestableIssues,
        timedOutIssues,
        results,
        costUsd: result.costUsd,
        durationSeconds: result.durationSeconds,
        jobIds: jobId ? [jobId] : [],
        jobUrls: jobUrl ? [jobUrl] : [],
      };

      setOutputs(outputs);

      // Summary
      core.info('\n=== Test Summary ===');
      core.info('PRs tested: ' + inputs.prNumbers.length);
      core.info('Issues tested: ' + allIssueNumbers.length);
      core.info('Outcome: ' + outcome);
      core.info('Cost: $' + result.costUsd.toFixed(4));
      core.info('Duration: ' + result.durationSeconds + 's');

      // Handle workflow failure
      if (outcome === 'error' && inputs.failOnError) {
        core.setFailed('Test encountered an error: ' + result.explanation);
      } else if (outcome === 'timeout' && inputs.failOnTimeout) {
        core.setFailed('Test timed out');
      } else if (outcome === 'failure' && inputs.failOnFailure) {
        core.setFailed('Test failed: ' + result.explanation);
      }

      return;
    }

    // No PRs or issues - check for description-only mode
    if (!inputs.description && !inputs.template && !inputs.templateContent) {
      core.info('No PRs, issues, or description provided');
      setOutputs({
        status: 'no-issues',
        success: true,
        testedIssues: [],
        passedIssues: [],
        failedIssues: [],
        notTestableIssues: [],
        timedOutIssues: [],
        results: [],
        costUsd: 0,
        durationSeconds: 0,
        jobIds: [],
        jobUrls: [],
      });
      return;
    }

    // Description-only mode
    core.info('Running test with description only');
    const result = await runTestWithDescription(inputs);

    const success = result.success;
    const mappedStatus =
      result.status === 'abandoned' || result.status === 'not-testable' ? 'error' : result.status;
    const descProblemDescription = !success ? result.explanation : undefined;
    const outputs: ActionOutputs = {
      status: mappedStatus,
      success,
      problemDescription: descProblemDescription,
      testedIssues: [],
      passedIssues: [],
      failedIssues: [],
      notTestableIssues: [],
      timedOutIssues: [],
      results: [],
      costUsd: result.costUsd,
      durationSeconds: result.durationSeconds,
      jobIds: result.jobId ? [result.jobId] : [],
      jobUrls: result.jobUrl ? [result.jobUrl] : [],
    };

    setOutputs(outputs);

    if (!success) {
      if (result.status === 'timeout' && inputs.failOnTimeout) {
        core.setFailed('Test timed out');
      } else if (result.status === 'error' && inputs.failOnError) {
        core.setFailed('Test error: ' + result.explanation);
      } else if (inputs.failOnFailure) {
        core.setFailed('Test failed: ' + result.explanation);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}

/**
 * Collect issue numbers that are linked from PRs
 */
async function collectIssueNumbers(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  prNumbers: number[]
): Promise<number[]> {
  const issueNumbers: number[] = [];

  for (const prNumber of prNumbers) {
    try {
      // Get PR data to find linked issues
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      // Extract issue numbers from PR body (common patterns like "Closes #123", "Fixes #456")
      const body = pr.body || '';
      const issuePattern = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
      let match;
      while ((match = issuePattern.exec(body)) !== null) {
        issueNumbers.push(parseInt(match[1], 10));
      }
    } catch (error) {
      core.warning('Failed to fetch PR #' + prNumber + ': ' + error);
    }
  }

  return [...new Set(issueNumbers)];
}

function setOutputs(outputs: ActionOutputs): void {
  core.setOutput('status', outputs.status);
  core.setOutput('success', String(outputs.success));
  core.setOutput('problem-description', outputs.problemDescription || '');
  core.setOutput('tested-issues', JSON.stringify(outputs.testedIssues));
  core.setOutput('passed-issues', JSON.stringify(outputs.passedIssues));
  core.setOutput('failed-issues', JSON.stringify(outputs.failedIssues));
  core.setOutput('not-testable-issues', JSON.stringify(outputs.notTestableIssues));
  core.setOutput('timed-out-issues', JSON.stringify(outputs.timedOutIssues));
  core.setOutput('results', JSON.stringify(outputs.results));
  core.setOutput('cost-usd', String(outputs.costUsd));
  core.setOutput('duration-seconds', String(outputs.durationSeconds));
  core.setOutput('job-ids', JSON.stringify(outputs.jobIds));
  core.setOutput('job-urls', JSON.stringify(outputs.jobUrls));
}

run();
