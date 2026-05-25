import type { JobStatusResponse, RunhumanJobResult } from './types';
/**
 * Map a terminal poll result to the action's verdict.
 *
 * `pollForCompletion` only returns once the job has reached a terminal status
 * (`completed`/`failed`/`cancelled`/`expired`, per `@runhuman/shared`'s
 * `isTerminalStatus`) or the local wait budget lapsed (`timedOut`). This is the
 * single place that knows how each terminal outcome maps onto a
 * {@link RunhumanJobResult} — callers latch the returned verdict and exit;
 * they never re-fetch status afterwards.
 *
 * Any other status reaching here means `pollForCompletion`'s terminal check and
 * this mapper have drifted apart — that's a bug, so we throw rather than spin.
 */
export declare function mapTerminalStatusToResult(finalStatus: JobStatusResponse, timedOut: boolean): RunhumanJobResult;
