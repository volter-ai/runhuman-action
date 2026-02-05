import { vi } from 'vitest';

export function createMockGitHubContext(overrides: Partial<any> = {}) {
  return {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo',
      ...overrides.repo,
    },
    runId: 123456,
    workflow: 'Test Workflow',
    eventName: 'pull_request',
    actor: 'test-user',
    ...overrides,
  };
}

export function createMockOctokit() {
  return {
    rest: {
      issues: {
        get: vi.fn().mockResolvedValue({
          data: {
            number: 1,
            title: 'Test Issue',
            body: 'Test issue body',
            labels: [],
            state: 'open',
          },
        }),
        addLabels: vi.fn().mockResolvedValue({}),
        removeLabel: vi.fn().mockResolvedValue({}),
      },
      pulls: {
        get: vi.fn().mockResolvedValue({
          data: {
            number: 1,
            title: 'Test PR',
            body: 'Test PR body',
            labels: [],
          },
        }),
        listCommits: vi.fn().mockResolvedValue({ data: [] }),
        listFiles: vi.fn().mockResolvedValue({ data: [] }),
      },
    },
  };
}
