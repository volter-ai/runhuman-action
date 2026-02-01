import * as core from '@actions/core';
import * as github from '@actions/github';
import type { TestOutcome, ActionInputs } from './types';

type Octokit = ReturnType<typeof github.getOctokit>;

/**
 * Add labels to an issue.
 */
export async function addLabels(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  labels: string[]
): Promise<void> {
  if (labels.length === 0) return;

  try {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels,
    });
    core.info(`Added labels to issue #${issueNumber}: ${labels.join(', ')}`);
  } catch (error) {
    core.warning(`Failed to add labels to issue #${issueNumber}: ${error}`);
  }
}

/**
 * Remove labels from an issue.
 */
export async function removeLabels(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  labels: string[]
): Promise<void> {
  if (labels.length === 0) return;

  for (const label of labels) {
    try {
      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: label,
      });
      core.info(`Removed label from issue #${issueNumber}: ${label}`);
    } catch (error) {
      // Label might not exist on the issue, which is fine
      core.debug(`Failed to remove label ${label} from issue #${issueNumber}: ${error}`);
    }
  }
}

/**
 * Get the labels to add and remove based on the test outcome.
 */
export function getLabelsForOutcome(
  inputs: ActionInputs,
  outcome: TestOutcome
): { addLabels: string[]; removeLabels: string[] } {
  switch (outcome) {
    case 'success':
      return {
        addLabels: inputs.onSuccessAddLabels,
        removeLabels: inputs.onSuccessRemoveLabels,
      };
    case 'failure':
      return {
        addLabels: inputs.onFailureAddLabels,
        removeLabels: inputs.onFailureRemoveLabels,
      };
    case 'not-testable':
      return {
        addLabels: inputs.onNotTestableAddLabels,
        removeLabels: inputs.onNotTestableRemoveLabels,
      };
    case 'timeout':
      return {
        addLabels: inputs.onTimeoutAddLabels,
        removeLabels: inputs.onTimeoutRemoveLabels,
      };
    case 'error':
      // On error, we don't change labels by default
      return {
        addLabels: [],
        removeLabels: [],
      };
    default:
      return {
        addLabels: [],
        removeLabels: [],
      };
  }
}

/**
 * Apply label changes to an issue based on test outcome.
 */
export async function applyLabelsForOutcome(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  inputs: ActionInputs,
  outcome: TestOutcome
): Promise<void> {
  const { addLabels: labelsToAdd, removeLabels: labelsToRemove } = getLabelsForOutcome(inputs, outcome);

  core.info(`Applying labels for issue #${issueNumber} with outcome: ${outcome}`);

  // Remove labels first
  await removeLabels(octokit, owner, repo, issueNumber, labelsToRemove);

  // Then add labels
  await addLabels(octokit, owner, repo, issueNumber, labelsToAdd);
}
