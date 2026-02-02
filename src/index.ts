import * as core from '@actions/core';
import * as github from '@actions/github';
import { parseInputs } from './inputs';
import { collectIssues } from './issues';
import { analyzeIssuesForTestability } from './testability';
import { analyzePrsForTestability } from './pr-analyzer';
import { runConsolidatedTest, runTestWithDescription } from './runner';
import type { AnalyzedPr, AnalyzedIssue } from './runner';
import { applyLabelsForOutcome } from './labels';
import type { ActionOutputs, IssueTestResult, TestOutcome, PullRequest, AnalyzePrResponse } from './types';

interface PrTestResult {
  prNumber: number;
  outcome: TestOutcome;
  explanation?: string;
  data?: Record<string, unknown>;
  costUsd?: number;
  durationSeconds?: number;
  analysis?: AnalyzePrResponse;
}

async function run(): Promise<void> {
  try {
    // Parse inputs
    const inputs = parseInputs();
    core.info('Inputs parsed successfully');

    // Get GitHub context
    const octokit = github.getOctokit(inputs.githubToken);
    const { owner, repo } = github.context.repo;

    // Analyze PRs for testability if PR numbers are provided
    let testablePrs: Array<{ pr: PullRequest; analysis: AnalyzePrResponse }> = [];
    let notTestablePrs: Array<{ pr: PullRequest; reason: string }> = [];

    if (inputs.prNumbers.length > 0) {
      core.info(`Analyzing ${inputs.prNumbers.length} PR(s) for testability using PR analyzer...`);
      const prResults = await analyzePrsForTestability(inputs, octokit, owner, repo, inputs.prNumbers);
      testablePrs = prResults.testable;
      notTestablePrs = prResults.notTestable;
      core.info(`PR analysis: ${testablePrs.length} testable, ${notTestablePrs.length} not testable`);
    }

    // Collect issues from PRs and explicit issue numbers
    const issues = await collectIssues(octokit, owner, repo, inputs.prNumbers, inputs.issueNumbers);

    // If no issues, no testable PRs, and no description, output no-issues status
    if (issues.length === 0 && testablePrs.length === 0 && !inputs.description) {
      core.info('No issues found, no testable PRs, and no description provided');
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

    // If no issues and no testable PRs but has description, run a single test
    if (issues.length === 0 && testablePrs.length === 0 && inputs.description) {
      core.info('No issues or testable PRs found, running test with description only');
      const result = await runTestWithDescription(inputs);

      const success = result.success;
      // Map abandoned/not-testable to error for output status
      const mappedStatus =
        result.status === 'abandoned' || result.status === 'not-testable' ? 'error' : result.status;
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

    // Analyze issues for testability using AI (only if there are issues)
    let testable: Array<{ issue: { number: number; title: string; body: string; labels: string[]; state: 'open' | 'closed'; comments?: string[] }; analysis: { isTestable: boolean; reason?: string; testUrl: string | null; testInstructions: string; outputSchema: Record<string, unknown>; confidence: number } }> = [];
    let notTestable: Array<{ issue: { number: number; title: string; body: string; labels: string[]; state: 'open' | 'closed'; comments?: string[] }; reason: string }> = [];

    if (issues.length > 0) {
      core.info(`Analyzing ${issues.length} issue(s) for testability...`);
      const issueResults = await analyzeIssuesForTestability(inputs, issues);
      testable = issueResults.testable;
      notTestable = issueResults.notTestable;
    }

    // Track results
    const results: IssueTestResult[] = [];
    const prResults: PrTestResult[] = [];
    const passedIssues: number[] = [];
    const failedIssues: number[] = [];
    const notTestableIssues: number[] = notTestable.map((nt) => nt.issue.number);
    const timedOutIssues: number[] = [];
    const passedPrs: number[] = [];
    const failedPrs: number[] = [];
    const notTestablePrNumbers: number[] = notTestablePrs.map((nt) => nt.pr.number);
    const timedOutPrs: number[] = [];
    let totalCost = 0;
    let totalDuration = 0;
    let hasError = false;

    // Apply not-testable labels first (these don't get tested)
    for (const { issue, reason } of notTestable) {
      await applyLabelsForOutcome(octokit, owner, repo, issue.number, inputs, 'not-testable');
      results.push({
        issueNumber: issue.number,
        outcome: 'not-testable',
        explanation: reason,
      });
    }

    // Convert to the types expected by runConsolidatedTest
    const analyzedPrs: AnalyzedPr[] = testablePrs.map(({ pr, analysis }) => ({ pr, analysis }));
    const analyzedIssues: AnalyzedIssue[] = testable.map(({ issue, analysis }) => ({ issue, analysis }));

    // Run ONE consolidated test for all testable PRs and issues
    if (analyzedPrs.length > 0 || analyzedIssues.length > 0) {
      const itemSummary = [
        ...(analyzedPrs.length > 0 ? [`${analyzedPrs.length} PR(s)`] : []),
        ...(analyzedIssues.length > 0 ? [`${analyzedIssues.length} issue(s)`] : []),
      ].join(' and ');
      core.info(`\n--- Running consolidated test for ${itemSummary} ---`);

      const result = await runConsolidatedTest(inputs, analyzedPrs, analyzedIssues);
      totalCost = result.costUsd;
      totalDuration = result.durationSeconds;

      // Determine outcome from consolidated result
      let outcome: TestOutcome;
      if (result.status === 'error' || result.status === 'abandoned') {
        outcome = 'error';
        hasError = true;
      } else if (result.status === 'timeout') {
        outcome = 'timeout';
      } else if (result.success) {
        outcome = 'success';
      } else {
        outcome = 'failure';
      }

      // Apply the same outcome to ALL tested PRs
      for (const { pr, analysis } of testablePrs) {
        if (outcome === 'timeout') {
          timedOutPrs.push(pr.number);
        } else if (outcome === 'success') {
          passedPrs.push(pr.number);
        } else if (outcome === 'failure') {
          failedPrs.push(pr.number);
        }

        prResults.push({
          prNumber: pr.number,
          outcome,
          explanation: result.explanation,
          data: result.data,
          costUsd: result.costUsd / (analyzedPrs.length + analyzedIssues.length),
          durationSeconds: result.durationSeconds,
          analysis,
        });

        core.info(`PR #${pr.number} result: ${outcome}`);
      }

      // Apply the same outcome to ALL tested issues
      for (const { issue, analysis } of testable) {
        if (outcome === 'timeout') {
          timedOutIssues.push(issue.number);
        } else if (outcome === 'success') {
          passedIssues.push(issue.number);
        } else if (outcome === 'failure') {
          failedIssues.push(issue.number);
        }

        results.push({
          issueNumber: issue.number,
          outcome,
          explanation: result.explanation,
          data: result.data,
          costUsd: result.costUsd / (analyzedPrs.length + analyzedIssues.length),
          durationSeconds: result.durationSeconds,
          analysis,
        });

        // Apply labels based on outcome
        await applyLabelsForOutcome(octokit, owner, repo, issue.number, inputs, outcome);

        core.info(`Issue #${issue.number} result: ${outcome}`);
      }
    }

    // Determine overall status
    const testedIssues = testable.map((t) => t.issue.number);
    const testedPrs = testablePrs.map((t) => t.pr.number);
    const allIssuesPassed = failedIssues.length === 0 && timedOutIssues.length === 0;
    const allPrsPassed = failedPrs.length === 0 && timedOutPrs.length === 0;
    const allPassed = allIssuesPassed && allPrsPassed && !hasError;

    const outputs: ActionOutputs = {
      status: hasError ? 'error' : (timedOutIssues.length > 0 || timedOutPrs.length > 0) ? 'timeout' : 'completed',
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
    if (inputs.prNumbers.length > 0) {
      core.info(`Total PRs: ${inputs.prNumbers.length}`);
      core.info(`PRs tested: ${testedPrs.length}`);
      core.info(`PRs passed: ${passedPrs.length}`);
      core.info(`PRs failed: ${failedPrs.length}`);
      core.info(`PRs not testable: ${notTestablePrNumbers.length}`);
      core.info(`PRs timed out: ${timedOutPrs.length}`);
    }
    core.info(`Total issues: ${issues.length}`);
    core.info(`Issues tested: ${testedIssues.length}`);
    core.info(`Issues passed: ${passedIssues.length}`);
    core.info(`Issues failed: ${failedIssues.length}`);
    core.info(`Issues not testable: ${notTestableIssues.length}`);
    core.info(`Issues timed out: ${timedOutIssues.length}`);
    core.info(`Total cost: $${totalCost.toFixed(4)}`);
    core.info(`Total duration: ${totalDuration}s`);

    // Handle workflow failure
    if (hasError && inputs.failOnError) {
      core.setFailed('One or more tests encountered errors');
    } else if ((timedOutIssues.length > 0 || timedOutPrs.length > 0) && inputs.failOnTimeout) {
      const timedOutItems = [...timedOutIssues.map(n => `issue #${n}`), ...timedOutPrs.map(n => `PR #${n}`)];
      core.setFailed(`Tests timed out for: ${timedOutItems.join(', ')}`);
    } else if ((failedIssues.length > 0 || failedPrs.length > 0) && inputs.failOnFailure) {
      const failedItems = [...failedIssues.map(n => `issue #${n}`), ...failedPrs.map(n => `PR #${n}`)];
      core.setFailed(`Tests failed for: ${failedItems.join(', ')}`);
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
