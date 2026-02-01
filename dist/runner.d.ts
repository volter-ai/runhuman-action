import type { Issue, ActionInputs, AnalyzeIssueResponse, AnalyzePrResponse, PullRequest, RunhumanJobResult } from './types';
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
