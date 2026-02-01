import type { Issue, ActionInputs, AnalyzeIssueResponse, RunhumanJobResult } from './types';
/**
 * Run a QA test for an issue with AI-generated analysis
 */
export declare function runTestForIssue(inputs: ActionInputs, issue: Issue, analysis: AnalyzeIssueResponse): Promise<RunhumanJobResult>;
/**
 * Run a QA test with just a description (no issue context)
 */
export declare function runTestWithDescription(inputs: ActionInputs): Promise<RunhumanJobResult>;
