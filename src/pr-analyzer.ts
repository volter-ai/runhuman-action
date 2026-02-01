import * as core from '@actions/core';
import type { GitHub } from '@actions/github/lib/utils';
import type {
  ActionInputs,
  AnalyzePrRequest,
  AnalyzePrResponse,
  PrCommit,
  PrFileChange,
  PullRequest,
} from './types';
import { withRetry } from './runner';

type Octokit = InstanceType<typeof GitHub>;

/**
 * Fetch PR diff content from GitHub
 */
async function getPrDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const { data: diff } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: {
      format: 'diff',
    },
  });

  // The diff is returned as a string when mediaType.format is 'diff'
  return diff as unknown as string;
}

/**
 * Fetch PR commits from GitHub
 */
async function getPrCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PrCommit[]> {
  const { data: commits } = await octokit.rest.pulls.listCommits({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  return commits.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.commit.author?.name || commit.author?.login || 'unknown',
    timestamp: commit.commit.author?.date,
  }));
}

/**
 * Fetch PR file changes from GitHub
 */
async function getPrFileChanges(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PrFileChange[]> {
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  return files.map((file) => ({
    filename: file.filename,
    status: file.status as PrFileChange['status'],
    additions: file.additions,
    deletions: file.deletions,
    previousFilename: file.previous_filename,
  }));
}

/**
 * Fetch PR details from GitHub
 */
export async function getPrDetails(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequest> {
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body || '',
    labels: pr.labels.map((label) => (typeof label === 'string' ? label : label.name || '')),
  };
}

/**
 * Fetch all PR data needed for analysis
 */
export async function fetchPrData(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<{
  pr: PullRequest;
  commits: PrCommit[];
  fileChanges: PrFileChange[];
  diffContent: string;
}> {
  core.debug(`Fetching PR #${prNumber} data from ${owner}/${repo}`);

  const [pr, commits, fileChanges, diffContent] = await Promise.all([
    getPrDetails(octokit, owner, repo, prNumber),
    getPrCommits(octokit, owner, repo, prNumber),
    getPrFileChanges(octokit, owner, repo, prNumber),
    getPrDiff(octokit, owner, repo, prNumber),
  ]);

  core.debug(`PR #${prNumber}: ${commits.length} commits, ${fileChanges.length} files`);

  return { pr, commits, fileChanges, diffContent };
}

/**
 * Call the RunHuman API to analyze a PR for testability
 */
export async function analyzePr(
  inputs: ActionInputs,
  request: AnalyzePrRequest
): Promise<AnalyzePrResponse> {
  const endpoint = `${inputs.apiUrl}/api/pr-analyzer`;

  core.debug(`Analyzing PR with ${request.commits.length} commits, ${request.fileChanges.length} files`);
  core.debug(`Using test URL: ${request.testUrl}`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${inputs.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'runhuman-action/1.0.0',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60000), // 1 minute timeout for analysis
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage: string;

    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error || errorData.message || errorText;
    } catch {
      errorMessage = errorText;
    }

    if (response.status === 401) {
      throw new Error(
        'Authentication failed: Invalid API key. ' +
          'Make sure your RUNHUMAN_API_KEY secret is set correctly.'
      );
    }

    throw new Error(`PR analysis failed (${response.status}): ${errorMessage}`);
  }

  const data = (await response.json()) as AnalyzePrResponse;

  core.debug(`PR analysis complete: isTestable=${data.isTestable}, confidence=${data.confidence}`);

  return data;
}

export interface AnalyzedPr {
  pr: PullRequest;
  analysis: AnalyzePrResponse;
}

export interface PrTestabilityResults {
  testable: AnalyzedPr[];
  notTestable: Array<{ pr: PullRequest; reason: string }>;
}

/**
 * Analyze PRs for testability using the AI PR analyzer endpoint.
 * Returns testable PRs with their analysis results.
 *
 * Throws an error if analysis fails after retries - we don't silently
 * skip PRs when we can't determine testability.
 */
export async function analyzePrsForTestability(
  inputs: ActionInputs,
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumbers: number[]
): Promise<PrTestabilityResults> {
  const testable: AnalyzedPr[] = [];
  const notTestable: Array<{ pr: PullRequest; reason: string }> = [];

  for (const prNumber of prNumbers) {
    core.info(`Analyzing PR #${prNumber}...`);

    // Fetch PR data from GitHub
    const { pr, commits, fileChanges, diffContent } = await fetchPrData(
      octokit,
      owner,
      repo,
      prNumber
    );

    // Call the PR analyzer API with retry for transient errors
    // If this fails after retries, the error propagates and fails the action
    const analysis = await withRetry(() =>
      analyzePr(inputs, {
        commits,
        fileChanges,
        diffContent,
        githubRepo: `${owner}/${repo}`,
        testUrl: inputs.url,
        prTitle: pr.title,
        prBody: pr.body,
      })
    );

    if (analysis.isTestable) {
      core.info(`PR #${prNumber} is testable (confidence: ${analysis.confidence})`);
      testable.push({ pr, analysis });
    } else {
      const reason = analysis.reason || 'AI determined PR changes are not testable';
      core.info(`PR #${prNumber} is NOT testable: ${reason}`);
      notTestable.push({ pr, reason });
    }
  }

  return { testable, notTestable };
}
