import type { GitHub } from '@actions/github/lib/utils';
import type { ActionInputs, AnalyzePrRequest, AnalyzePrResponse, PrCommit, PrFileChange, PullRequest } from './types';
type Octokit = InstanceType<typeof GitHub>;
/**
 * Fetch PR details from GitHub
 */
export declare function getPrDetails(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<PullRequest>;
/**
 * Fetch all PR data needed for analysis
 */
export declare function fetchPrData(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<{
    pr: PullRequest;
    commits: PrCommit[];
    fileChanges: PrFileChange[];
    diffContent: string;
}>;
/**
 * Call the RunHuman API to analyze a PR for testability
 */
export declare function analyzePr(inputs: ActionInputs, request: AnalyzePrRequest): Promise<AnalyzePrResponse>;
export interface AnalyzedPr {
    pr: PullRequest;
    analysis: AnalyzePrResponse;
}
export interface PrTestabilityResults {
    testable: AnalyzedPr[];
    notTestable: Array<{
        pr: PullRequest;
        reason: string;
    }>;
}
/**
 * Analyze PRs for testability using the AI PR analyzer endpoint.
 * Returns testable PRs with their analysis results.
 *
 * Throws an error if analysis fails after retries - we don't silently
 * skip PRs when we can't determine testability.
 */
export declare function analyzePrsForTestability(inputs: ActionInputs, octokit: Octokit, owner: string, repo: string, prNumbers: number[]): Promise<PrTestabilityResults>;
export {};
