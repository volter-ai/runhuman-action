import * as github from '@actions/github';
import type { Issue, PullRequest } from './types';
type Octokit = ReturnType<typeof github.getOctokit>;
/**
 * Extract issue numbers from text using various patterns.
 * Matches: #123, fixes #123, closes #123, resolves #123, refs #123
 */
export declare function extractIssueNumbers(text: string): number[];
/**
 * Get a pull request by number.
 */
export declare function getPullRequest(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<PullRequest | null>;
/**
 * Get an issue by number.
 */
export declare function getIssue(octokit: Octokit, owner: string, repo: string, issueNumber: number): Promise<Issue | null>;
/**
 * Find all linked issues from a pull request.
 */
export declare function findLinkedIssuesFromPR(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<number[]>;
/**
 * Collect all issues from PR numbers and explicit issue numbers, deduplicated.
 */
export declare function collectIssues(octokit: Octokit, owner: string, repo: string, prNumbers: number[], issueNumbers: number[]): Promise<Issue[]>;
export {};
