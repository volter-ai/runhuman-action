import * as core from '@actions/core';
import * as github from '@actions/github';
import type { ExtractedIssue, RunhumanJobResult, TestOutcome } from './types';

type Octokit = ReturnType<typeof github.getOctokit>;

/**
 * Hidden HTML marker used as the sticky key for the digest comment.
 * Kept per-PR (not per-job) so re-runs update in place.
 */
export const STICKY_MARKER = '<!-- runhuman-qa-digest -->';

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

export function renderDigestMarkdown(result: RunhumanJobResult, outcome: TestOutcome): string {
  const { emoji, label } = OUTCOME_PRESENTATION[outcome];
  const bugs = result.extractedIssues ?? [];
  const narrative = result.explanation?.trim() || '_No tester narrative was returned._';
  const duration = formatDuration(result.durationSeconds);
  const cost = `$${result.costUsd.toFixed(2)}`;

  const bugsSection =
    bugs.length === 0
      ? '**No bugs found** 🎉'
      : [`**Bugs found (${bugs.length}):**`, ...bugs.map(renderBugLine)].join('\n');

  const jobLink = result.jobUrl
    ? `[View full session (video, key moments, timeline)](${result.jobUrl})`
    : '_Job link unavailable._';

  return [
    STICKY_MARKER,
    `### 🧪 Runhuman QA — ${emoji} ${label}`,
    '',
    `> ${narrative.replace(/\n+/g, ' ')}`,
    '',
    bugsSection,
    '',
    `**Duration:** ${duration}  •  **Cost:** ${cost}`,
    '',
    jobLink,
  ].join('\n');
}

function renderBugLine(bug: ExtractedIssue): string {
  const firstLine = bug.description.split('\n')[0].trim();
  return `- ${SEVERITY_EMOJI[bug.severity]} **${bug.severity}** — ${bug.title}\n  ${firstLine}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

export interface UpsertPrDigestCommentParams {
  octokit: Octokit;
  owner: string;
  repo: string;
  prNumber: number;
  result: RunhumanJobResult;
  outcome: TestOutcome;
}

export async function upsertPrDigestComment(params: UpsertPrDigestCommentParams): Promise<void> {
  const { octokit, owner, repo, prNumber, result, outcome } = params;

  const existing = await findStickyComment(octokit, owner, repo, prNumber);
  const body = renderDigestMarkdown(result, outcome);

  if (existing) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    core.info(`Updated Runhuman QA digest comment on PR #${prNumber} (comment ${existing.id})`);
    return;
  }

  await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
  core.info(`Posted Runhuman QA digest comment on PR #${prNumber}`);
}

async function findStickyComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<{ id: number } | null> {
  const perPage = 100;
  for (let page = 1; ; page++) {
    const { data } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: perPage,
      page,
    });
    const match = data.find((c) => typeof c.body === 'string' && c.body.includes(STICKY_MARKER));
    if (match) return { id: match.id };
    if (data.length < perPage) return null;
  }
}
