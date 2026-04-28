import type { IssueRenderJob, JobStatusResponse } from '@runhuman/shared';

/**
 * Adapt a `JobStatusResponse` (the wire shape we receive from the API)
 * into the structural subset (`IssueRenderJob`) the shared issue-body
 * renderer reads. Sections of the rendered body whose fields are absent
 * on the response will be skipped — that's intentional: a partial job
 * still produces a valid body with the sections it can fill.
 */
export function jobStatusToRenderJob(status: JobStatusResponse): IssueRenderJob {
  if (status.description === undefined) {
    throw new Error(
      `JobStatusResponse for job ${status.id} is missing 'description' — cannot render issue body`,
    );
  }
  return {
    id: status.id,
    description: status.description,
    augmentedDescription: status.augmentedDescription,
    url: status.url,
    deviceClass: status.deviceClass,
    testDurationSeconds: status.testDurationSeconds,
    testerAlias: status.testerAlias,
    sessionEvents: status.testerData && {
      screenshots: status.testerData.screenshots,
      videoUrl: status.testerData.videoUrl,
    },
  };
}
