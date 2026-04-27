/**
 * Types for the unified Runhuman GitHub Action
 */

// Job status types (from @runhuman/shared)
export type JobStatus =
  | 'pending'
  | 'preparing' // Job is being analyzed (server-side)
  | 'waiting'
  | 'working'
  | 'completed'
  | 'incomplete'
  | 'abandoned'
  | 'rejected'
  | 'untestable' // Job determined to be not testable
  | 'error';

export type TerminalJobStatus = 'completed' | 'incomplete' | 'abandoned' | 'rejected' | 'error' | 'untestable';

// Helper to check terminal status
export function isTerminalStatus(status: JobStatus): status is TerminalJobStatus {
  return ['completed', 'incomplete', 'abandoned', 'rejected', 'error', 'untestable'].includes(status);
}

// Device class configuration
export type DeviceClass = 'desktop' | 'mobile';

/**
 * Parsed inputs from the action
 */
export interface ActionInputs {
  // Required
  url: string;
  apiKey: string;
  githubToken: string;

  // Template configuration
  template?: string;          // Template name for server-side resolution
  templateFile?: string;      // Local template file path
  templateContent?: string;   // Raw template content (markdown with frontmatter) from template-file

  // Test context sources
  description?: string;
  prNumbers: number[];
  issueNumbers: number[];

  // Label callbacks
  onSuccessAddLabels: string[];
  onSuccessRemoveLabels: string[];
  onFailureAddLabels: string[];
  onFailureRemoveLabels: string[];
  onNotTestableAddLabels: string[];
  onNotTestableRemoveLabels: string[];
  onTimeoutAddLabels: string[];
  onTimeoutRemoveLabels: string[];

  // Workflow control
  failOnError: boolean;
  failOnFailure: boolean;
  failOnTimeout: boolean;
  waitForResult: boolean;
  postPrComment: boolean;

  // API configuration
  apiUrl: string;

  // Test configuration
  targetDurationMinutes: number;
  deviceClass: DeviceClass;
  outputSchema?: Record<string, unknown>;
  /** Internal-only flag: request Runhuman's dual-device self-test flow (APK-install tester capability). Backend rejects non-@volter.ai callers with 403. */
  requiresRunhumanApkInstall: boolean;

  // Repository context
  /** Repo that triggered the action (format: "owner/repo") — always `github.context.repo`. */
  githubRepo: string;
  /** Repo list sent to the backend on job creation. Currently always `[githubRepo]` — will broaden if the action ever targets multiple repos in one run. */
  githubRepos: string[];
  /** Enable/disable server-side auto-creation of GitHub issues from extracted findings. Only set when the caller explicitly provides `auto-create-github-issues`; otherwise omitted so the project/template default applies. */
  autoCreateGithubIssues?: boolean;
  /** Target repo for auto-created issues. Only set when the caller explicitly provides `auto-create-github-issues-repo`; otherwise omitted so the server does not reject the request. */
  autoCreateGithubIssuesRepo?: string;
  /** When auto-creation is enabled and this is true, skip auto-filing telemetry-only issues (testerSurfaced=false). See runhuman#3160. */
  autoCreateOnlyTesterSurfaced: boolean;

  // === Code-context (#3320) ===
  /** Opt this job into the code-context preview feature. Bug reports include file/symbol references when the org is on the allowlist. */
  enableCodeContext: boolean;
  /** Commit SHA the deployed app corresponds to. Threaded onto job metadata so code references reflect this commit's code. */
  commitSha?: string;
  /** Block scoring until per-commit code-context is ready (up to 90s server-side). Default false preserves the old fall-back-to-base semantics. */
  waitForCodeContextOverlay: boolean;
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
 * Extract the success value from an ExtractedResult.
 * If the user's output schema includes a boolean 'success' field, its value is used.
 * Otherwise, defaults to true (completed test = passed).
 *
 * This means `fail-on-failure` only triggers when the user explicitly defines a
 * `success` boolean in their output schema and the tester marks it as false.
 * Without a `success` field, completed tests are always considered successful.
 */
export function extractSuccessFromResult(result: ExtractedResult): boolean {
  if (typeof result.data?.success === 'boolean') {
    return result.data.success;
  }

  return true;
}

/**
 * Request to create a test job
 */
export interface CreateJobRequest {
  url?: string;
  description?: string;
  outputSchema?: Record<string, unknown>;
  targetDurationMinutes?: number;
  additionalValidationInstructions?: string;
  /** GitHub repositories linked to this job (format: "owner/repo"). */
  githubRepos?: string[];
  /** Enable server-side auto-creation of GitHub issues from extracted findings. Overrides the project/template default when set. */
  autoCreateGithubIssues?: boolean;
  /** Target repository for auto-created GitHub issues — must be one of githubRepos. */
  autoCreateGithubIssuesRepo?: string;
  /** Skip auto-filing telemetry-only issues when true. See runhuman#3160. */
  autoCreateOnlyTesterSurfaced?: boolean;
  deviceClass?: DeviceClass;
  metadata?: JobMetadata;
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
  /** Internal-only: request Runhuman's dual-device self-test flow. Backend rejects non-@volter.ai callers with 403. */
  requiresRunhumanApkInstall?: boolean;
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
  /** Repository that triggered this job — used as the default target for auto-created issues. */
  sourceRepo?: string;
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

  // === Code-context (#3320) ===
  /** Opt-in to the code-context preview feature. */
  enableCodeContext?: boolean;
  /** Commit SHA the test ran against — used to scope per-commit code references. */
  commitSha?: string;
  /** Block scoring until per-commit code-context is ready (up to 90s). */
  waitForCodeContextOverlay?: boolean;
}

/**
 * Response from job creation
 */
export interface CreateJobResponse {
  jobId: string;
  message?: string;
}

/** Info about a related existing GitHub issue (from duplicate/related issue detection) */
export interface RelatedIssueInfo {
  issueNumber: number;
  title: string;
  state: 'open' | 'closed';
  relation: 'duplicate' | 'related';
  confidence: number;
  reason: string;
}

/** Issue extracted by AI from test results, optionally enriched with related issue info */
export interface ExtractedIssue {
  title: string;
  description: string;
  reproductionSteps: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestedLabels: string[];
  relatedIssues?: RelatedIssueInfo[];
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
  extractedIssues?: ExtractedIssue[];
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
  status: 'completed' | 'timeout' | 'error' | 'abandoned' | 'not-testable' | 'created';
  analysis?: AnalyzeIssueResponse;
  jobId?: string;
  jobUrl?: string;
  extractedIssues?: ExtractedIssue[];
}

export type TestOutcome = 'success' | 'failure' | 'not-testable' | 'timeout' | 'error';

export interface IssueTestResult {
  issueNumber: number;
  outcome: TestOutcome;
  explanation?: string;
  data?: Record<string, unknown>;
  costUsd?: number;
  durationSeconds?: number;
  analysis?: AnalyzeIssueResponse;
}

export interface ActionOutputs {
  status: 'completed' | 'error' | 'timeout' | 'no-issues' | 'created';
  success: boolean;
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
  extractedIssues: ExtractedIssue[];
}
