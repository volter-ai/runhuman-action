import * as github from '@actions/github';
import type { RunhumanJobResult, TestOutcome } from './types';
type Octokit = ReturnType<typeof github.getOctokit>;
/**
 * Hidden HTML marker used as the sticky key for the digest comment.
 * Kept per-PR (not per-job) so re-runs update in place.
 */
export declare const STICKY_MARKER = "<!-- runhuman-qa-digest -->";
export declare function renderDigestMarkdown(result: RunhumanJobResult, outcome: TestOutcome): string;
export interface UpsertPrDigestCommentParams {
    octokit: Octokit;
    owner: string;
    repo: string;
    prNumber: number;
    result: RunhumanJobResult;
    outcome: TestOutcome;
}
export declare function upsertPrDigestComment(params: UpsertPrDigestCommentParams): Promise<void>;
export {};
