import { describe, it, expect, vi } from 'vitest';
import * as github from '@actions/github';
import { collectPrLinkedIssueNumbers } from '../src/issues';

type Octokit = ReturnType<typeof github.getOctokit>;

/**
 * Gating coverage for the `include-linked-issues` toggle (#5823). When off, the
 * action tests the PR alone — it must not scrape "Closes #N" from the PR body
 * nor call GitHub at all.
 */
function stubOctokit(body: string): { octokit: Octokit; get: ReturnType<typeof vi.fn> } {
  const get = vi.fn().mockResolvedValue({ data: { body } });
  const octokit = { rest: { pulls: { get } } } as unknown as Octokit;
  return { octokit, get };
}

describe('collectPrLinkedIssueNumbers (#5823 include-linked-issues gate)', () => {
  it('derives linked issues from the PR body when includeLinkedIssues is true', async () => {
    const { octokit, get } = stubOctokit('Adds the dashboard.\n\nCloses #5\nFixes #6');

    const result = await collectPrLinkedIssueNumbers(octokit, 'owner', 'repo', [101], true);

    expect(result).toEqual([5, 6]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('returns no issues and never calls GitHub when includeLinkedIssues is false', async () => {
    const { octokit, get } = stubOctokit('Closes #5\nFixes #6');

    const result = await collectPrLinkedIssueNumbers(octokit, 'owner', 'repo', [101], false);

    expect(result).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('deduplicates issues referenced across multiple PRs', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: { body: 'Closes #5' } })
      .mockResolvedValueOnce({ data: { body: 'Resolves #5\nCloses #7' } });
    const octokit = { rest: { pulls: { get } } } as unknown as Octokit;

    const result = await collectPrLinkedIssueNumbers(octokit, 'owner', 'repo', [101, 102], true);

    expect(result).toEqual([5, 7]);
  });
});
