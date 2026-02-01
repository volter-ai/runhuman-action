import type { Issue, RunhumanJobResult, ActionInputs } from './types';
/**
 * Build test description from issue content and optional additional description.
 */
export declare function buildTestDescription(issue: Issue, additionalDescription?: string): string;
/**
 * Run a QA test for a single issue.
 */
export declare function runTestForIssue(inputs: ActionInputs, issue: Issue): Promise<RunhumanJobResult>;
/**
 * Run a QA test with just a description (no issue context).
 */
export declare function runTestWithDescription(inputs: ActionInputs): Promise<RunhumanJobResult>;
