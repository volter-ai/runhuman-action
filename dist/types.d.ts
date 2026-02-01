export interface ActionInputs {
    url: string;
    apiKey: string;
    description?: string;
    prNumbers: number[];
    issueNumbers: number[];
    onSuccessAddLabels: string[];
    onSuccessRemoveLabels: string[];
    onFailureAddLabels: string[];
    onFailureRemoveLabels: string[];
    onNotTestableAddLabels: string[];
    onNotTestableRemoveLabels: string[];
    onTimeoutAddLabels: string[];
    onTimeoutRemoveLabels: string[];
    failOnError: boolean;
    failOnFailure: boolean;
    failOnTimeout: boolean;
    githubToken: string;
    apiUrl: string;
    targetDurationMinutes: number;
    screenSize: string;
}
export type TestOutcome = 'success' | 'failure' | 'not-testable' | 'timeout' | 'error';
export interface IssueTestResult {
    issueNumber: number;
    outcome: TestOutcome;
    explanation?: string;
    data?: Record<string, unknown>;
    costUsd?: number;
    durationSeconds?: number;
}
export interface ActionOutputs {
    status: 'completed' | 'error' | 'timeout' | 'no-issues';
    success: boolean;
    testedIssues: number[];
    passedIssues: number[];
    failedIssues: number[];
    notTestableIssues: number[];
    timedOutIssues: number[];
    results: IssueTestResult[];
    costUsd: number;
    durationSeconds: number;
}
export interface Issue {
    number: number;
    title: string;
    body: string;
    labels: string[];
    state: 'open' | 'closed';
}
export interface PullRequest {
    number: number;
    title: string;
    body: string;
    labels: string[];
}
export interface RunhumanJobResult {
    success: boolean;
    explanation?: string;
    data?: Record<string, unknown>;
    costUsd: number;
    durationSeconds: number;
    status: 'completed' | 'timeout' | 'error' | 'abandoned';
}
