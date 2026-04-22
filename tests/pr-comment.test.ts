import { describe, it, expect, vi } from 'vitest';
import { renderDigestMarkdown, upsertPrDigestComment, STICKY_MARKER } from '../src/pr-comment';
import type { RunhumanJobResult } from '../src/types';

const baseResult: RunhumanJobResult = {
  success: false,
  status: 'completed',
  explanation: 'Tester signed in but the dashboard failed to load after clicking Continue.',
  data: {},
  costUsd: 0.42,
  durationSeconds: 180,
  jobId: 'job-123',
  jobUrl: 'https://qa-experiment.fly.dev/jobs/job-123',
  extractedIssues: [
    {
      title: 'Dashboard stuck on spinner',
      description: 'After login the dashboard shows a spinner forever.\nNetwork tab shows 500 from /api/projects.',
      reproductionSteps: ['Sign in', 'Wait 10s'],
      severity: 'high',
      suggestedLabels: ['bug'],
    },
    {
      title: 'Console noise on homepage',
      description: 'React warning about missing key prop.',
      reproductionSteps: ['Open homepage'],
      severity: 'low',
      suggestedLabels: [],
    },
  ],
};

describe('renderDigestMarkdown', () => {
  it('includes the sticky marker as the first line', () => {
    const md = renderDigestMarkdown(baseResult, 'failure');
    expect(md.split('\n')[0]).toBe(STICKY_MARKER);
  });

  it('includes tester narrative, bug titles, severities, and job URL', () => {
    const md = renderDigestMarkdown(baseResult, 'failure');
    expect(md).toContain(baseResult.explanation!);
    expect(md).toContain('Dashboard stuck on spinner');
    expect(md).toContain('Console noise on homepage');
    expect(md).toContain('high');
    expect(md).toContain('low');
    expect(md).toContain(baseResult.jobUrl!);
  });

  it('renders a "No bugs found" line when extractedIssues is empty', () => {
    const md = renderDigestMarkdown({ ...baseResult, extractedIssues: [] }, 'success');
    expect(md).toMatch(/no bugs/i);
  });

  it('surfaces the outcome prominently', () => {
    expect(renderDigestMarkdown(baseResult, 'success')).toMatch(/success|passed/i);
    expect(renderDigestMarkdown(baseResult, 'failure')).toMatch(/failure|failed/i);
    expect(renderDigestMarkdown(baseResult, 'timeout')).toMatch(/timeout|timed out/i);
    expect(renderDigestMarkdown(baseResult, 'not-testable')).toMatch(/not.?testable/i);
  });
});

function makeOctokit(existing: { id: number; body: string }[]) {
  const listComments = vi.fn().mockResolvedValue({ data: existing });
  const createComment = vi.fn().mockResolvedValue({ data: { id: 999 } });
  const updateComment = vi.fn().mockResolvedValue({ data: { id: 999 } });
  return {
    rest: { issues: { listComments, createComment, updateComment } },
    _spies: { listComments, createComment, updateComment },
  };
}

describe('upsertPrDigestComment', () => {
  const commonParams = { owner: 'volter-ai', repo: 'runhuman', prNumber: 42 };

  it('creates a new comment when no sticky comment exists', async () => {
    const octokit = makeOctokit([{ id: 1, body: 'some other comment' }]);
    await upsertPrDigestComment({
      // @ts-expect-error — mock is structurally compatible with Octokit surface we use
      octokit,
      ...commonParams,
      result: baseResult,
      outcome: 'failure',
    });
    expect(octokit._spies.createComment).toHaveBeenCalledOnce();
    expect(octokit._spies.updateComment).not.toHaveBeenCalled();
    const body = octokit._spies.createComment.mock.calls[0][0].body as string;
    expect(body.startsWith(STICKY_MARKER)).toBe(true);
  });

  it('updates the existing comment when a sticky comment is found', async () => {
    const octokit = makeOctokit([
      { id: 1, body: 'unrelated' },
      { id: 77, body: `${STICKY_MARKER}\nold content` },
    ]);
    await upsertPrDigestComment({
      // @ts-expect-error — mock is structurally compatible with Octokit surface we use
      octokit,
      ...commonParams,
      result: baseResult,
      outcome: 'failure',
    });
    expect(octokit._spies.updateComment).toHaveBeenCalledOnce();
    expect(octokit._spies.createComment).not.toHaveBeenCalled();
    expect(octokit._spies.updateComment.mock.calls[0][0].comment_id).toBe(77);
  });
});
