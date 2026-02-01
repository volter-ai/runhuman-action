import * as core from '@actions/core';
import * as github from '@actions/github';
import { parseInputs } from './inputs';
import { collectIssues } from './issues';
import { filterTestableIssues } from './testability';
import { runTestForIssue, runTestWithDescription } from './runner';
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

    // Collect issues from PRs and explicit issue numbers
    const issues = await collectIssues(
      octokit,
      owner,
      repo,
      inputs.prNumbers,
      inputs.issueNumbers
    );

    // If no issues and no description, output no-issues status
    if (issues.length === 0 && !inputs.description) {
      core.info('No issues found and no description provided');
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
      });
      return;
    }

    // If no issues but has description, run a single test
    if (issues.length === 0 && inputs.description) {
      core.info('No issues found, running test with description only');
      const result = await runTestWithDescription(inputs);

      const success = result.success;
      // Map abandoned to error for output status
      const mappedStatus = result.status === 'abandoned' ? 'error' : result.status;
      const outputs: ActionOutputs = {
        status: mappedStatus,
        success,
        testedIssues: [],
        passedIssues: [],
        failedIssues: [],
        notTestableIssues: [],
        timedOutIssues: [],
        results: [],
        costUsd: result.costUsd,
        durationSeconds: result.durationSeconds,
      };

      setOutputs(outputs);

      // Handle workflow failure
      if (!success) {
        if (result.status === 'timeout' && inputs.failOnTimeout) {
          core.setFailed('Test timed out');
        } else if (result.status === 'error' && inputs.failOnError) {
          core.setFailed(`Test error: ${result.explanation}`);
        } else if (inputs.failOnFailure) {
          core.setFailed(`Test failed: ${result.explanation}`);
        }
      }

      return;
    }

    // Filter to testable issues
    const { testable, notTestable } = filterTestableIssues(issues);

    // Track results
    const results: IssueTestResult[] = [];
    const passedIssues: number[] = [];
    const failedIssues: number[] = [];
    const notTestableIssues: number[] = notTestable.map(nt => nt.issue.number);
    const timedOutIssues: number[] = [];
    let totalCost = 0;
    let totalDuration = 0;
    let hasError = false;

    // Apply not-testable labels
    for (const { issue, reason } of notTestable) {
      await applyLabelsForOutcome(octokit, owner, repo, issue.number, inputs, 'not-testable');
      results.push({
        issueNumber: issue.number,
        outcome: 'not-testable',
        explanation: reason,
      });
    }

    // Run tests for testable issues
    for (const issue of testable) {
      core.info(`\n--- Testing issue #${issue.number}: ${issue.title} ---`);

      const result = await runTestForIssue(inputs, issue);
      totalCost += result.costUsd;
      totalDuration += result.durationSeconds;

      // Determine outcome
      let outcome: TestOutcome;
      if (result.status === 'error') {
        outcome = 'error';
        hasError = true;
      } else if (result.status === 'timeout') {
        outcome = 'timeout';
        timedOutIssues.push(issue.number);
      } else if (result.success) {
        outcome = 'success';
        passedIssues.push(issue.number);
      } else {
        outcome = 'failure';
        failedIssues.push(issue.number);
      }

      results.push({
        issueNumber: issue.number,
        outcome,
        explanation: result.explanation,
        data: result.data,
        costUsd: result.costUsd,
        durationSeconds: result.durationSeconds,
      });

      // Apply labels based on outcome
      await applyLabelsForOutcome(octokit, owner, repo, issue.number, inputs, outcome);

      core.info(`Issue #${issue.number} result: ${outcome}`);
    }

    // Determine overall status
    const testedIssues = testable.map(i => i.number);
    const allPassed = failedIssues.length === 0 && timedOutIssues.length === 0 && !hasError;

    const outputs: ActionOutputs = {
      status: hasError ? 'error' : timedOutIssues.length > 0 ? 'timeout' : 'completed',
      success: allPassed,
      testedIssues,
      passedIssues,
      failedIssues,
      notTestableIssues,
      timedOutIssues,
      results,
      costUsd: totalCost,
      durationSeconds: totalDuration,
    };

    setOutputs(outputs);

    // Summary
    core.info('\n=== Test Summary ===');
    core.info(`Total issues: ${issues.length}`);
    core.info(`Tested: ${testedIssues.length}`);
    core.info(`Passed: ${passedIssues.length}`);
    core.info(`Failed: ${failedIssues.length}`);
    core.info(`Not testable: ${notTestableIssues.length}`);
    core.info(`Timed out: ${timedOutIssues.length}`);
    core.info(`Total cost: $${totalCost.toFixed(4)}`);
    core.info(`Total duration: ${totalDuration}s`);

    // Handle workflow failure
    if (hasError && inputs.failOnError) {
      core.setFailed('One or more tests encountered errors');
    } else if (timedOutIssues.length > 0 && inputs.failOnTimeout) {
      core.setFailed(`Tests timed out for issues: ${timedOutIssues.join(', ')}`);
    } else if (failedIssues.length > 0 && inputs.failOnFailure) {
      core.setFailed(`Tests failed for issues: ${failedIssues.join(', ')}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}

function setOutputs(outputs: ActionOutputs): void {
  core.setOutput('status', outputs.status);
  core.setOutput('success', String(outputs.success));
  core.setOutput('tested-issues', JSON.stringify(outputs.testedIssues));
  core.setOutput('passed-issues', JSON.stringify(outputs.passedIssues));
  core.setOutput('failed-issues', JSON.stringify(outputs.failedIssues));
  core.setOutput('not-testable-issues', JSON.stringify(outputs.notTestableIssues));
  core.setOutput('timed-out-issues', JSON.stringify(outputs.timedOutIssues));
  core.setOutput('results', JSON.stringify(outputs.results));
  core.setOutput('cost-usd', String(outputs.costUsd));
  core.setOutput('duration-seconds', String(outputs.durationSeconds));
}

run();
