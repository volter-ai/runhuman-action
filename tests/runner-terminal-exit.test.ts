import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ActionInputs } from '../src/types';

// The action's polling loop logs through @actions/core and reads run context
// from @actions/github — stub both so the test exercises pure control flow.
vi.mock('@actions/core', () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@actions/github', () => ({
  context: {
    runId: 1,
    runNumber: 1,
    workflow: 'qa',
    eventName: 'pull_request',
    actor: 'tester',
    repo: { owner: 'volter-ai', repo: 'runhuman' },
  },
}));

import { runJobWithIds } from '../src/runner';

const baseInputs = {
  url: 'https://example.com',
  apiUrl: 'https://qa-experiment.fly.dev',
  apiKey: 'test-key',
  githubToken: '',
  githubRepo: 'volter-ai/runhuman',
  githubRepos: ['volter-ai/runhuman'],
  targetDurationMinutes: 10,
  deviceClass: 'desktop',
  waitForResult: true,
  postPrComment: false,
  failOnError: true,
  failOnFailure: true,
  failOnTimeout: false,
  requiresRunhumanApkInstall: false,
  autoCreateOnlyTesterSurfaced: false,
  enableCodeContext: false,
  waitForCodeContextOverlay: false,
  prNumbers: [],
  issueNumbers: [],
  onSuccessAddLabels: [],
  onSuccessRemoveLabels: [],
  onFailureAddLabels: [],
  onFailureRemoveLabels: [],
  onNotTestableAddLabels: [],
  onNotTestableRemoveLabels: [],
  onTimeoutAddLabels: [],
  onTimeoutRemoveLabels: [],
} as unknown as ActionInputs;

const JOB_ID = 'job-test-1';

interface FetchStubState {
  statusGetCount: number;
}

/**
 * Wire `global.fetch` so the first job-status poll returns a terminal `failed`
 * verdict and every subsequent poll 503s — exactly the production scenario from
 * #4573 (terminal status observed, then the API goes under pressure).
 */
function installFetchStub(state: FetchStubState): void {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (method === 'POST' && url.endsWith('/api/jobs')) {
      return new MockResponse(true, 200, 'OK', { jobId: JOB_ID });
    }

    if (method === 'GET' && url.endsWith(`/api/jobs/${JOB_ID}/status`)) {
      state.statusGetCount += 1;
      if (state.statusGetCount === 1) {
        return new MockResponse(true, 200, 'OK', {
          id: JOB_ID,
          status: 'failed',
          error: 'tester reported failure',
        });
      }
      // Any poll after the terminal verdict must never happen — if it does, it
      // 503s, which (pre-fix) is what wedged the loop into GitHub's timeout.
      return new MockResponse(false, 503, 'Service Unavailable', 'upstream 503');
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as unknown as typeof fetch;
}

class MockResponse {
  constructor(
    public readonly ok: boolean,
    public readonly status: number,
    public readonly statusText: string,
    private readonly payload: unknown,
  ) {}

  async json(): Promise<unknown> {
    return this.payload;
  }

  async text(): Promise<string> {
    return typeof this.payload === 'string' ? this.payload : JSON.stringify(this.payload);
  }
}

describe('runJobWithIds — terminal status latching (#4573)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it(
    'latches a terminal `failed` verdict and exits without polling into the 503 window',
    async () => {
      const state: FetchStubState = { statusGetCount: 0 };
      installFetchStub(state);

      // Resolves on microtasks alone — no `vi.advanceTimersByTime`. A regression
      // that re-enters the 10s poll sleep would hang here until the test timeout.
      const { result } = await runJobWithIds(baseInputs, [1], []);

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(result.explanation).toContain('tester reported failure');
      // Exactly one status poll: the verdict was latched, polling stopped, and
      // the 503-on-every-subsequent-call branch was never reached.
      expect(state.statusGetCount).toBe(1);
    },
    { timeout: 1000 },
  );
});
