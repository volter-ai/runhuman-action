import type { ActionInputs, RunhumanJobResult } from './types';
/**
 * Retry wrapper for transient errors with exponential backoff
 */
export declare function withRetry<T>(fn: () => Promise<T>, maxRetries?: number, baseDelayMs?: number): Promise<T>;
/**
 * Run a QA test with just a description (no issue context)
 */
export declare function runTestWithDescription(inputs: ActionInputs): Promise<RunhumanJobResult>;
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
