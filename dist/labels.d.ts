import * as github from '@actions/github';
import type { TestOutcome, ActionInputs } from './types';
type Octokit = ReturnType<typeof github.getOctokit>;
/**
 * Add labels to an issue.
 */
export declare function addLabels(octokit: Octokit, owner: string, repo: string, issueNumber: number, labels: string[]): Promise<void>;
/**
 * Remove labels from an issue.
 */
export declare function removeLabels(octokit: Octokit, owner: string, repo: string, issueNumber: number, labels: string[]): Promise<void>;
/**
 * Get the labels to add and remove based on the test outcome.
 */
export declare function getLabelsForOutcome(inputs: ActionInputs, outcome: TestOutcome): {
    addLabels: string[];
    removeLabels: string[];
};
/**
 * Apply label changes to an issue based on test outcome.
 */
export declare function applyLabelsForOutcome(octokit: Octokit, owner: string, repo: string, issueNumber: number, inputs: ActionInputs, outcome: TestOutcome): Promise<void>;
export {};
