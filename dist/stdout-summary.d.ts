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
export declare function renderStdoutIssues(issues: readonly ExtractedIssue[], jobStatus: JobStatusResponse): string[];
