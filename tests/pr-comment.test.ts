import { describe, it, expect, vi } from 'vitest';
import { renderDigestMarkdown, upsertPrDigestComment, STICKY_MARKER } from '../src/pr-comment';
import type { ExtractedIssue, JobStatusResponse, RunhumanJobResult } from '../src/types';

const richIssue: ExtractedIssue = {
  title: 'Dashboard stuck on spinner',
  description: 'After login the dashboard shows a spinner forever.\nNetwork tab shows 500 from /api/projects.',
  reproductionSteps: [{ text: 'Sign in' }, { text: 'Wait 10s' }],
  severity: 'high',
  suggestedLabels: ['bug'],
  expectedBehavior: 'Dashboard renders project list within 2 seconds.',
  actualBehavior: 'Spinner persists; /api/projects returns 500.',
  affectedArea: 'Dashboard at /dashboard',
  evidenceCitations: [
    {
      timestamp: '2026-04-27T10:00:12.000Z',
      source: 'network',
      summary: '500 from GET /api/projects',
      videoOffsetSeconds: 12,
    },
  ],
  rootCause: {
    explanation: 'The projects loader unconditionally throws when the org has no projects.',
    confidence: 'high',
  },
  suggestedFix: 'Return an empty list when no projects exist instead of throwing.',
  codeReferences: [{ path: 'packages/api/src/routes/projects.routes.ts', symbol: 'listProjects' }],
};

const minimalIssue: ExtractedIssue = {
  title: 'Console noise on homepage',
  description: 'React warning about missing key prop.',
  reproductionSteps: [{ text: 'Open homepage' }],
  severity: 'low',
  suggestedLabels: [],
  expectedBehavior: 'No console warnings.',
  actualBehavior: 'Warning fires once per render.',
  affectedArea: 'Homepage at /',
  evidenceCitations: [],
};

const baseJobStatus: JobStatusResponse = {
  id: 'job-123',
  status: 'completed',
  url: 'https://example.com/dashboard',
  description: 'Verify the dashboard loads after login.',
  augmentedDescription: 'Sign in, navigate to /dashboard, verify projects list renders.',
  deviceClass: 'desktop',
  testDurationSeconds: 180,
  testerAlias: 'Phoenix',
  jobUrl: 'https://qa-experiment.fly.dev/jobs/job-123',
  testerData: {
    testDurationSeconds: 180,
    consoleMessages: [],
    networkRequests: [],
    errors: [],
    events: [],
    pageStates: [],
    screenshots: [],
  },
  extractedIssues: [richIssue, minimalIssue],
};

const baseResult: RunhumanJobResult = {
  success: false,
  status: 'completed',
  explanation: 'Tester signed in but the dashboard failed to load after clicking Continue.',
  data: {},
  costUsd: 0.42,
  durationSeconds: 180,
  jobId: 'job-123',
  jobUrl: 'https://qa-experiment.fly.dev/jobs/job-123',
  extractedIssues: [richIssue, minimalIssue],
  jobStatus: baseJobStatus,
};

describe('renderDigestMarkdown — digest header (always-on)', () => {
  it('keeps the sticky marker as the first line', () => {
    const md = renderDigestMarkdown(baseResult, 'failure');
    expect(md.split('\n')[0]).toBe(STICKY_MARKER);
  });

  it('surfaces the outcome label prominently', () => {
    expect(renderDigestMarkdown(baseResult, 'success')).toMatch(/passed|success/i);
    expect(renderDigestMarkdown(baseResult, 'failure')).toMatch(/failed|failure/i);
    expect(renderDigestMarkdown(baseResult, 'timeout')).toMatch(/timed out|timeout/i);
    expect(renderDigestMarkdown(baseResult, 'not-testable')).toMatch(/not.?testable/i);
  });

  it('includes the tester narrative and job URL', () => {
    const md = renderDigestMarkdown(baseResult, 'failure');
    expect(md).toContain(baseResult.explanation!);
    expect(md).toContain(baseResult.jobUrl!);
  });

  it('renders "No bugs found" when extractedIssues is empty', () => {
    const md = renderDigestMarkdown(
      { ...baseResult, extractedIssues: [] },
      'success',
    );
    expect(md).toMatch(/no bugs/i);
  });
});

describe('renderDigestMarkdown — collapsed <details> per issue', () => {
  it('wraps each issue in a <details>/<summary> block', () => {
    const md = renderDigestMarkdown(baseResult, 'failure');
    const detailsCount = (md.match(/<details>/g) ?? []).length;
    expect(detailsCount).toBeGreaterThanOrEqual(2);
    expect(md).toContain('<summary>');
    expect(md).toContain('</summary>');
    expect(md).toContain('</details>');
  });

  it('puts the severity emoji + bold severity + title in each <summary>', () => {
    const md = renderDigestMarkdown(baseResult, 'failure');
    expect(md).toMatch(/<summary>[^<]*🟠[^<]*<strong>high<\/strong>[^<]*Dashboard stuck on spinner/);
    expect(md).toMatch(/<summary>[^<]*🔵[^<]*<strong>low<\/strong>[^<]*Console noise on homepage/);
  });

  it('renders the full issue body inside each <details>', () => {
    const md = renderDigestMarkdown(baseResult, 'failure');
    expect(md).toContain('## Description');
    expect(md).toContain('## Expected');
    expect(md).toContain('## Actual');
    expect(md).toContain('## Where');
    expect(md).toContain('## Root Cause');
    expect(md).toContain('## Suggested Fix');
    expect(md).toContain('## Code References');
    expect(md).toContain('## Severity');
    expect(md).toContain('Return an empty list when no projects exist');
    expect(md).toContain('packages/api/src/routes/projects.routes.ts');
  });

  it('omits sections cleanly for issues with no rich fields', () => {
    const md = renderDigestMarkdown(
      { ...baseResult, extractedIssues: [minimalIssue] },
      'failure',
    );
    expect(md).not.toContain('## Root Cause');
    expect(md).not.toContain('## Suggested Fix');
    expect(md).not.toContain('## Code References');
    expect(md).not.toContain('## Evidence');
    expect(md).toContain('## Description');
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
