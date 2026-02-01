import * as core from '@actions/core';
import * as github from '@actions/github';
import type { Issue, PullRequest } from './types';

type Octokit = ReturnType<typeof github.getOctokit>;

/**
 * Extract issue numbers from text using various patterns.
 * Matches: #123, fixes #123, closes #123, resolves #123, refs #123
 */
export function extractIssueNumbers(text: string): number[] {
  if (!text) return [];

  // Pattern matches issue references with optional keywords
  const pattern = /(?:fix(?:es)?|close[sd]?|resolve[sd]?|refs?)?[\s:]*#(\d+)/gi;
  const matches = [...text.matchAll(pattern)];
  const numbers = matches.map(m => parseInt(m[1], 10)).filter(n => !isNaN(n));

  // Deduplicate
  return [...new Set(numbers)];
}

/**
 * Get a pull request by number.
 */
export async function getPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequest | null> {
  try {
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    return {
      number: pr.number,
      title: pr.title,
      body: pr.body || '',
      labels: pr.labels.map(l => (typeof l === 'string' ? l : l.name || '')),
    };
  } catch (error) {
    core.warning(`Failed to fetch PR #${prNumber}: ${error}`);
    return null;
  }
}

/**
 * Get an issue by number.
 */
export async function getIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<Issue | null> {
  try {
    const { data: issue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    // Skip if this is actually a PR (PRs are also issues in GitHub API)
    if (issue.pull_request) {
      core.debug(`#${issueNumber} is a pull request, not an issue`);
      return null;
    }

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels.map(l => (typeof l === 'string' ? l : l.name || '')),
      state: issue.state as 'open' | 'closed',
    };
  } catch (error) {
    core.warning(`Failed to fetch issue #${issueNumber}: ${error}`);
    return null;
  }
}

/**
 * Find all linked issues from a pull request.
 */
export async function findLinkedIssuesFromPR(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<number[]> {
  const pr = await getPullRequest(octokit, owner, repo, prNumber);
  if (!pr) {
    return [];
  }

  // Extract issue numbers from PR title and body
  const text = `${pr.title} ${pr.body}`;
  const issueNumbers = extractIssueNumbers(text);

  core.info(`Found ${issueNumbers.length} issue references in PR #${prNumber}: ${issueNumbers.join(', ')}`);

  // Verify each issue exists and is actually an issue (not a PR)
  const validIssues: number[] = [];
  for (const num of issueNumbers) {
    const issue = await getIssue(octokit, owner, repo, num);
    if (issue) {
      validIssues.push(num);
    }
  }

  return validIssues;
}

/**
 * Collect all issues from PR numbers and explicit issue numbers, deduplicated.
 */
export async function collectIssues(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumbers: number[],
  issueNumbers: number[]
): Promise<Issue[]> {
  const allIssueNumbers = new Set<number>();

  // Find linked issues from each PR
  for (const prNumber of prNumbers) {
    const linkedIssues = await findLinkedIssuesFromPR(octokit, owner, repo, prNumber);
    for (const num of linkedIssues) {
      allIssueNumbers.add(num);
    }
  }

  // Add explicit issue numbers
  for (const num of issueNumbers) {
    allIssueNumbers.add(num);
  }

  core.info(`Total unique issues to process: ${allIssueNumbers.size}`);

  // Fetch full issue data
  const issues: Issue[] = [];
  for (const num of allIssueNumbers) {
    const issue = await getIssue(octokit, owner, repo, num);
    if (issue) {
      issues.push(issue);
    }
  }

  return issues;
}
