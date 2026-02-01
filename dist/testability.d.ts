import type { Issue } from './types';
export interface TestabilityResult {
    isTestable: boolean;
    reason: string;
}
/**
 * Analyze an issue to determine if it can be tested by a human tester.
 * This uses simple heuristics. For more accurate analysis, the Runhuman API
 * can be used to perform AI-powered testability analysis.
 */
export declare function analyzeTestability(issue: Issue): TestabilityResult;
/**
 * Filter issues to only those that are testable.
 */
export declare function filterTestableIssues(issues: Issue[]): {
    testable: Issue[];
    notTestable: Array<{
        issue: Issue;
        reason: string;
    }>;
};
