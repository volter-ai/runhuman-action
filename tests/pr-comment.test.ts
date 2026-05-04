import { describe, it, expect, vi } from 'vitest';
import { renderDigestMarkdown, postPrDigestComment } from '../src/pr-comment';
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

const baseMetadata = {
  owner: 'volter-ai',
  repo: 'runhuman',
  commitSha: 'abc1234567890abcdef1234567890abcdef12345',
  runId: 9876543210,
  runNumber: 42,
  timestamp: '2026-05-04T12:34:56.000Z',
};

describe('renderDigestMarkdown — digest header', () => {
  it('does not embed any hidden HTML marker', () => {
    const md = renderDigestMarkdown(baseResult, 'failure', baseMetadata);
    expect(md).not.toContain('<!--');
    expect(md).not.toMatch(/runhuman-qa-digest/);
  });

  it('surfaces the outcome label prominently', () => {
    expect(renderDigestMarkdown(baseResult, 'success', baseMetadata)).toMatch(/passed|success/i);
    expect(renderDigestMarkdown(baseResult, 'failure', baseMetadata)).toMatch(/failed|failure/i);
    expect(renderDigestMarkdown(baseResult, 'timeout', baseMetadata)).toMatch(/timed out|timeout/i);
    expect(renderDigestMarkdown(baseResult, 'not-testable', baseMetadata)).toMatch(/not.?testable/i);
  });

  it('includes the tester narrative and job URL', () => {
    const md = renderDigestMarkdown(baseResult, 'failure', baseMetadata);
    expect(md).toContain(baseResult.explanation!);
    expect(md).toContain(baseResult.jobUrl!);
  });

  it('renders "No bugs found" when extractedIssues is empty', () => {
    const md = renderDigestMarkdown(
      { ...baseResult, extractedIssues: [] },
      'success',
      baseMetadata,
    );
    expect(md).toMatch(/no bugs/i);
  });
});

describe('renderDigestMarkdown — collapsed <details> per issue', () => {
  it('wraps each issue in a <details>/<summary> block', () => {
    const md = renderDigestMarkdown(baseResult, 'failure', baseMetadata);
    const detailsCount = (md.match(/<details>/g) ?? []).length;
    expect(detailsCount).toBeGreaterThanOrEqual(2);
    expect(md).toContain('<summary>');
    expect(md).toContain('</summary>');
    expect(md).toContain('</details>');
  });

  it('puts the severity emoji + bold severity + title in each <summary>', () => {
    const md = renderDigestMarkdown(baseResult, 'failure', baseMetadata);
    expect(md).toMatch(/<summary>[^<]*🟠[^<]*<strong>high<\/strong>[^<]*Dashboard stuck on spinner/);
    expect(md).toMatch(/<summary>[^<]*🔵[^<]*<strong>low<\/strong>[^<]*Console noise on homepage/);
  });

  it('renders the full issue body inside each <details>', () => {
    const md = renderDigestMarkdown(baseResult, 'failure', baseMetadata);
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
      baseMetadata,
    );
    expect(md).not.toContain('## Root Cause');
    expect(md).not.toContain('## Suggested Fix');
    expect(md).not.toContain('## Code References');
    expect(md).not.toContain('## Evidence');
    expect(md).toContain('## Description');
  });
});

describe('renderDigestMarkdown — run metadata footer', () => {
  it('includes a short commit SHA linked to the commit page', () => {
    const md = renderDigestMarkdown(baseResult, 'failure', baseMetadata);
    expect(md).toContain('`abc1234`');
    expect(md).toContain(`https://github.com/volter-ai/runhuman/commit/${baseMetadata.commitSha}`);
  });

  it('includes a workflow run link with the run number', () => {
    const md = renderDigestMarkdown(baseResult, 'failure', baseMetadata);
    expect(md).toContain('Run #42');
    expect(md).toContain('https://github.com/volter-ai/runhuman/actions/runs/9876543210');
  });

  it('includes the timestamp passed in', () => {
    const md = renderDigestMarkdown(baseResult, 'failure', baseMetadata);
    expect(md).toContain('2026-05-04T12:34:56.000Z');
  });

  it('omits the commit section when no commitSha is provided', () => {
    const md = renderDigestMarkdown(baseResult, 'failure', { ...baseMetadata, commitSha: undefined });
    expect(md).not.toContain('/commit/');
    expect(md).toContain('Run #42');
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

describe('postPrDigestComment', () => {
  const commonParams = {
    owner: 'volter-ai',
    repo: 'runhuman',
    prNumber: 42,
    commitSha: 'abc1234567890abcdef1234567890abcdef12345',
    runId: 9876543210,
    runNumber: 42,
  };

  it('always creates a new comment, even when a prior digest comment exists on the PR', async () => {
    const octokit = makeOctokit([
      { id: 1, body: 'unrelated' },
      { id: 77, body: '### Runhuman QA — ❌ Failed\nold content' },
    ]);
    await postPrDigestComment({
      // @ts-expect-error — mock is structurally compatible with Octokit surface we use
      octokit,
      ...commonParams,
      result: baseResult,
      outcome: 'failure',
    });
    expect(octokit._spies.createComment).toHaveBeenCalledOnce();
    expect(octokit._spies.updateComment).not.toHaveBeenCalled();
    expect(octokit._spies.listComments).not.toHaveBeenCalled();
  });

  it('writes a body containing the run metadata footer', async () => {
    const octokit = makeOctokit([]);
    await postPrDigestComment({
      // @ts-expect-error — mock is structurally compatible with Octokit surface we use
      octokit,
      ...commonParams,
      result: baseResult,
      outcome: 'failure',
    });
    const body = octokit._spies.createComment.mock.calls[0][0].body as string;
    expect(body).toContain('`abc1234`');
    expect(body).toContain('Run #42');
    expect(body).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
