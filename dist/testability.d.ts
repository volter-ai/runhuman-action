import type { Issue, ActionInputs, AnalyzeIssueResponse } from './types';
/**
 * Call the Runhuman API to analyze a GitHub issue for testability.
 * Uses AI to determine if the issue can be tested and generates test instructions.
 */
export declare function analyzeIssue(inputs: ActionInputs, issue: Issue): Promise<AnalyzeIssueResponse>;
export interface AnalyzedIssue {
    issue: Issue;
    analysis: AnalyzeIssueResponse;
}
export interface TestabilityResults {
    testable: AnalyzedIssue[];
    notTestable: Array<{
        issue: Issue;
        reason: string;
    }>;
}
/**
 * Analyze all issues for testability using the AI analysis endpoint.
 * Returns testable issues with their analysis results.
 *
 * Throws an error if analysis fails after retries - we don't silently
 * skip issues when we can't determine testability.
 */
export declare function analyzeIssuesForTestability(inputs: ActionInputs, issues: Issue[]): Promise<TestabilityResults>;
