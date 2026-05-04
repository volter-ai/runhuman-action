import * as core from '@actions/core';
import * as github from '@actions/github';
import { buildIssueBody, type IssueRenderJob } from '@runhuman/shared';
import { jobStatusToRenderJob } from './job-like-adapter';
import type { ExtractedIssue, RunhumanJobResult, TestOutcome } from './types';

type Octokit = ReturnType<typeof github.getOctokit>;

const OUTCOME_PRESENTATION: Record<TestOutcome, { emoji: string; label: string }> = {
  success: { emoji: '✅', label: 'Passed' },
  failure: { emoji: '❌', label: 'Failed' },
  'not-testable': { emoji: '⚪', label: 'Not testable' },
  timeout: { emoji: '⏱️', label: 'Timed out' },
  error: { emoji: '⚠️', label: 'Error' },
};

const SEVERITY_EMOJI: Record<ExtractedIssue['severity'], string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
};

function fallbackRenderJob(jobId: string | undefined): IssueRenderJob {
  return { id: jobId ?? 'unknown-job', description: '' };
}

export interface DigestRenderMetadata {
  owner: string;
  repo: string;
  commitSha?: string;
  runId: number;
  runNumber: number;
  timestamp: string;
}

export function renderDigestMarkdown(
  result: RunhumanJobResult,
  outcome: TestOutcome,
  metadata: DigestRenderMetadata,
): string {
  const { emoji, label } = OUTCOME_PRESENTATION[outcome];
  const bugs = result.extractedIssues ?? [];
  const narrative = result.explanation?.trim() || '_No tester narrative was returned._';
  const duration = formatDuration(result.durationSeconds);

  const renderJob = result.jobStatus
    ? jobStatusToRenderJob(result.jobStatus)
    : fallbackRenderJob(result.jobId);
  const ctx = { jobUrl: result.jobUrl };

  const bugsSection =
    bugs.length === 0
      ? '**No bugs found**'
      : [
          `**Bugs found (${bugs.length}):**`,
          ...bugs.map((bug) => renderBugDetails(bug, renderJob, ctx)),
        ].join('\n\n');

  const jobLink = result.jobUrl
    ? `[View full session (video, key moments, timeline)](${result.jobUrl})`
    : '_Job link unavailable._';

  return [
    `### Runhuman QA — ${emoji} ${label}`,
    '',
    `> ${narrative.replace(/\n+/g, ' ')}`,
    '',
    bugsSection,
    '',
    `**Duration:** ${duration}`,
    '',
    jobLink,
    '',
    renderMetadataFooter(metadata),
  ].join('\n');
}

function renderMetadataFooter(metadata: DigestRenderMetadata): string {
  const { owner, repo, commitSha, runId, runNumber, timestamp } = metadata;
  const parts: string[] = [];

  if (commitSha) {
    const shortSha = commitSha.slice(0, 7);
    parts.push(`Commit [\`${shortSha}\`](https://github.com/${owner}/${repo}/commit/${commitSha})`);
  }
  parts.push(`[Run #${runNumber}](https://github.com/${owner}/${repo}/actions/runs/${runId})`);
  parts.push(timestamp);

  return `<sub>${parts.join(' • ')}</sub>`;
}

function renderBugDetails(
  bug: ExtractedIssue,
  renderJob: IssueRenderJob,
  ctx: { jobUrl?: string },
): string {
  const summary = `${SEVERITY_EMOJI[bug.severity]} <strong>${bug.severity}</strong> — ${bug.title}`;
  const body = buildIssueBody(bug, renderJob, ctx);
  return `<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

export interface PostPrDigestCommentParams {
  octokit: Octokit;
  owner: string;
  repo: string;
  prNumber: number;
  result: RunhumanJobResult;
  outcome: TestOutcome;
  commitSha?: string;
  runId: number;
  runNumber: number;
}

export async function postPrDigestComment(params: PostPrDigestCommentParams): Promise<void> {
  const { octokit, owner, repo, prNumber, result, outcome, commitSha, runId, runNumber } = params;

  const body = renderDigestMarkdown(result, outcome, {
    owner,
    repo,
    commitSha,
    runId,
    runNumber,
    timestamp: new Date().toISOString(),
  });

  await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
  core.info(`Posted Runhuman QA digest comment on PR #${prNumber} (run #${runNumber})`);
}
