/**
 * Types for the unified Runhuman GitHub Action
 */
export type JobStatus = 'pending' | 'preparing' | 'waiting' | 'working' | 'creating_issues' | 'completed' | 'incomplete' | 'abandoned' | 'rejected' | 'untestable' | 'error';
export type TerminalJobStatus = 'completed' | 'incomplete' | 'abandoned' | 'rejected' | 'error' | 'untestable';
export declare function isTerminalStatus(status: JobStatus): status is TerminalJobStatus;
export type ScreenSizeConfig = 'desktop' | 'laptop' | 'tablet' | 'mobile' | {
    width: number;
    height: number;
};
/**
 * Parsed inputs from the action
 */
export interface ActionInputs {
    url: string;
    apiKey: string;
    githubToken: string;
    template?: string;
    templateFile?: string;
    templateContent?: string;
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
    apiUrl: string;
    targetDurationMinutes: number;
    screenSize: ScreenSizeConfig;
    outputSchema?: Record<string, unknown>;
    canCreateGithubIssues: boolean;
    githubRepo: string;
}
/**
 * GitHub issue data
 */
export interface Issue {
    number: number;
    title: string;
    body: string;
    labels: string[];
    state: 'open' | 'closed';
    comments?: string[];
}
/**
 * Pull request data
 */
export interface PullRequest {
    number: number;
    title: string;
    body: string;
    labels: string[];
}
/**
 * Request to analyze a GitHub issue for testability
 */
export interface AnalyzeIssueRequest {
    issueTitle: string;
    issueBody: string;
    issueLabels: string[];
    presetTestUrl?: string;
    githubRepo?: string;
    issueComments?: string[];
    onlyMissingMedia?: boolean;
}
/**
 * Response from AI issue analysis
 */
export interface AnalyzeIssueResponse {
    isTestable: boolean;
    reason?: string;
    testUrl: string | null;
    testInstructions: string;
    outputSchema: Record<string, unknown>;
    confidence: number;
}
/**
 * Extracted test result
 * Schema-defined fields (including 'success') are in `data`
 */
export interface ExtractedResult {
    explanation: string;
    data: Record<string, unknown>;
}
/**
 * Extract the success value from an ExtractedResult
 * Success must be in data.success (schema-defined field)
 * Throws if success is not found or not a boolean
 */
export declare function extractSuccessFromResult(result: ExtractedResult): boolean;
/**
 * Request to create a test job
 */
export interface CreateJobRequest {
    url?: string;
    description?: string;
    outputSchema?: Record<string, unknown>;
    targetDurationMinutes?: number;
    additionalValidationInstructions?: string;
    githubRepo?: string;
    screenSize?: ScreenSizeConfig;
    metadata?: JobMetadata;
    canCreateGithubIssues?: boolean;
    repoName?: string;
    /** Template name for server-side resolution */
    template?: string;
    /** Raw template content (markdown with frontmatter) for server-side parsing */
    templateContent?: string;
    /** GitHub token from GitHub Actions (enables GitHub operations without App installation) */
    githubToken?: string;
    /** PR numbers to test (triggers server-side analysis) */
    prNumbers?: number[];
    /** Issue numbers to test (triggers server-side analysis) */
    issueNumbers?: number[];
}
/**
 * PR commit information for PR analysis
 */
export interface PrCommit {
    sha: string;
    message: string;
    author: string;
    timestamp?: string;
}
/**
 * PR file change information for PR analysis
 */
export interface PrFileChange {
    filename: string;
    status?: 'added' | 'modified' | 'removed' | 'renamed';
    additions: number;
    deletions: number;
    previousFilename?: string;
}
/**
 * Request to analyze a PR for testability
 */
export interface AnalyzePrRequest {
    commits: PrCommit[];
    fileChanges: PrFileChange[];
    diffContent: string;
    repoContext?: string;
    githubRepo?: string;
    testUrl: string;
    prTitle?: string;
    prBody?: string;
}
/**
 * Response from the PR analyzer
 */
export interface AnalyzePrResponse {
    isTestable: boolean;
    reason?: string;
    summary: string;
    testInstructions: string;
    outputSchema: Record<string, unknown>;
    confidence: number;
    affectedAreas: string[];
}
/**
 * Metadata for tracking job source
 */
export interface JobMetadata {
    source: string;
    sourceCreatedAt: string;
    githubAction?: {
        actionName: string;
        runId?: string;
        workflowName?: string;
        triggerEvent?: string;
        actor?: string;
    };
    githubIssue?: {
        repo: string;
        issueNumber: number;
        issueUrl: string;
    };
    githubPR?: {
        repo: string;
        prNumber: number;
        prUrl: string;
    };
}
/**
 * Response from job creation
 */
export interface CreateJobResponse {
    jobId: string;
    message?: string;
}
/**
 * Response from job status endpoint
 */
export interface JobStatusResponse {
    id: string;
    status: JobStatus;
    result?: ExtractedResult;
    error?: string;
    reason?: string;
    costUsd?: number;
    testDurationSeconds?: number;
    testerData?: unknown;
    testerResponse?: string;
    testerAlias?: string;
    testerAvatarUrl?: string;
    testerColor?: string;
    jobUrl?: string;
    targetDurationMinutes?: number;
    totalExtensionMinutes?: number;
    responseDeadline?: string;
}
/**
 * Result of running a test for an issue
 */
export interface RunhumanJobResult {
    success: boolean;
    explanation?: string;
    data?: Record<string, unknown>;
    costUsd: number;
    durationSeconds: number;
    status: 'completed' | 'timeout' | 'error' | 'abandoned' | 'not-testable';
    analysis?: AnalyzeIssueResponse;
    jobId?: string;
    jobUrl?: string;
}
export type TestOutcome = 'success' | 'failure' | 'not-testable' | 'timeout' | 'error';
export interface IssueTestResult {
    issueNumber: number;
    outcome: TestOutcome;
    explanation?: string;
    /** Detailed description of the problem that was faced (only populated when outcome is not 'success') */
    problemDescription?: string;
    data?: Record<string, unknown>;
    costUsd?: number;
    durationSeconds?: number;
    analysis?: AnalyzeIssueResponse;
}
export interface ActionOutputs {
    status: 'completed' | 'error' | 'timeout' | 'no-issues';
    success: boolean;
    /** Detailed description of the problem that was faced (only populated when success is false) */
    problemDescription?: string;
    testedIssues: number[];
    passedIssues: number[];
    failedIssues: number[];
    notTestableIssues: number[];
    timedOutIssues: number[];
    results: IssueTestResult[];
    costUsd: number;
    durationSeconds: number;
    jobIds: string[];
    jobUrls: (string | undefined)[];
}
