import type { Issue, ActionInputs, AnalyzeIssueResponse, AnalyzePrResponse, PullRequest, RunhumanJobResult } from './types';
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
/**
 * Retry wrapper for transient errors with exponential backoff
 */
export declare function withRetry<T>(fn: () => Promise<T>, maxRetries?: number, baseDelayMs?: number): Promise<T>;
/**
 * Run a QA test for an issue with AI-generated analysis
 */
export declare function runTestForIssue(inputs: ActionInputs, issue: Issue, analysis: AnalyzeIssueResponse): Promise<RunhumanJobResult>;
/**
 * Run a QA test for a PR with AI-generated analysis
 */
export declare function runTestForPr(inputs: ActionInputs, pr: PullRequest, analysis: AnalyzePrResponse): Promise<RunhumanJobResult>;
/**
 * Run a QA test with just a description (no issue context)
 */
export declare function runTestWithDescription(inputs: ActionInputs): Promise<RunhumanJobResult>;
/**
 * Run a single consolidated QA test for all testable PRs and issues.
 * This creates ONE job that the tester will use to verify all changes.
 */
export declare function runConsolidatedTest(inputs: ActionInputs, prs: AnalyzedPr[], issues: AnalyzedIssue[]): Promise<RunhumanJobResult>;
/**
 * Run a QA test job by passing PR/issue IDs directly to the server.
 * The server handles all GitHub data fetching and test plan generation.
 * This is the thin-client pattern - the action just passes IDs and polls for results.
 */
export declare function runJobWithIds(inputs: ActionInputs, prNumbers: number[], issueNumbers: number[]): Promise<{
    result: RunhumanJobResult;
    jobId: string;
    jobUrl?: string;
}>;
