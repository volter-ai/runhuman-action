import type { JobStatusResponse, RunhumanJobResult } from './types';
import { extractSuccessFromResult } from './types';

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
export function mapTerminalStatusToResult(
  finalStatus: JobStatusResponse,
  timedOut: boolean,
): RunhumanJobResult {
  const costUsd = finalStatus.costUsd ?? 0;
  const durationSeconds = finalStatus.testDurationSeconds ?? 0;

  if (timedOut) {
    return {
      success: false,
      explanation: 'Test timed out waiting for tester response',
      costUsd,
      durationSeconds,
      status: 'timeout',
    };
  }

  if (finalStatus.status === 'completed' && finalStatus.result) {
    return {
      success: extractSuccessFromResult(finalStatus.result),
      explanation: finalStatus.result.explanation,
      data: finalStatus.result.data,
      costUsd,
      durationSeconds,
      status: 'completed',
    };
  }

  if (
    finalStatus.status === 'failed' ||
    finalStatus.status === 'cancelled' ||
    finalStatus.status === 'expired'
  ) {
    return {
      success: false,
      explanation: finalStatus.error ?? `Job ended with status: ${finalStatus.status}`,
      costUsd,
      durationSeconds,
      status: 'error',
    };
  }

  throw new Error(
    `mapTerminalStatusToResult received non-terminal status '${finalStatus.status}' for job ${finalStatus.id} — ` +
      `pollForCompletion should only return on a terminal status (completed/failed/cancelled/expired) or timeout`,
  );
}
