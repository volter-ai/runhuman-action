import { buildIssueBody } from '@runhuman/shared';
import { jobStatusToRenderJob } from './job-like-adapter';
import type { ExtractedIssue, JobStatusResponse } from './types';

/**
 * Render the per-issue stdout block for the action's `qa-test` job log.
 * One line per issue with a `--- Issue N/M ---` separator, followed by
 * the full `buildIssueBody` body so a coding agent reading the log can
 * see root cause / suggested fix / code references without leaving the
 * job page or parsing the JSON output.
 *
 * Returns lines, not a single string — `core.info` is called once per
 * line by the caller so the log output preserves line boundaries the
 * way `@actions/core` expects.
 */
export function renderStdoutIssues(
  issues: readonly ExtractedIssue[],
  jobStatus: JobStatusResponse,
): string[] {
  if (issues.length === 0) return [];

  const renderJob = jobStatusToRenderJob(jobStatus);
  const ctx = { jobUrl: jobStatus.jobUrl };
  const lines: string[] = [`=== Extracted Issues (${issues.length}) ===`];

  for (const [index, issue] of issues.entries()) {
    lines.push('');
    lines.push(`--- Issue ${index + 1}/${issues.length} ---`);
    lines.push(buildIssueBody(issue, renderJob, ctx));
  }

  return lines;
}
