import type { IssueRenderJob, JobStatusResponse } from '@runhuman/shared';
/**
 * Adapt a `JobStatusResponse` (the wire shape we receive from the API)
 * into the structural subset (`IssueRenderJob`) the shared issue-body
 * renderer reads. Sections of the rendered body whose fields are absent
 * on the response will be skipped — that's intentional: a partial job
 * still produces a valid body with the sections it can fill.
 */
export declare function jobStatusToRenderJob(status: JobStatusResponse): IssueRenderJob;
