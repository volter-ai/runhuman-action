import type { ActionInputs, Issue } from '../../src/types';

export function createMockInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    url: 'https://example.com',
    apiKey: 'test-api-key',
    githubToken: 'test-github-token',
    description: undefined,
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
    failOnError: true,
    failOnFailure: true,
    failOnTimeout: false,
    apiUrl: 'https://api.test.com',
    targetDurationMinutes: 5,
    screenSize: 'desktop',
    outputSchema: undefined,
    canCreateGithubIssues: false,
    githubRepo: 'test-owner/test-repo',
    ...overrides,
  };
}

export function createMockIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 1,
    title: 'Test Issue',
    body: 'Test issue body',
    labels: [],
    state: 'open',
    ...overrides,
  };
}

export function createMockPullRequest(overrides: Partial<any> = {}) {
  return {
    number: 1,
    title: 'Test PR',
    body: 'Test PR body',
    labels: [],
    ...overrides,
  };
}
