/**
 * How a task restarts inside itself: a long-lived task's back-off, a kubelet's, and the words a restarted or continued session is
 * told instead of the brief. Pure, and read by `observe` (`domain.ts`, which re-exports what a caller takes).
 */
import { elapsedMs, type Instant } from './clock.ts';
import type { Attempt, Parked } from './domain.ts';
import { quote } from './quote.ts';

/**
 * How long a long-lived task waits to restart a session that ended, a kubelet's back-off: `initialMs` after one end,
 * `factor` times longer after each end in a row, never past `maxMs`; an attempt that ran `resetAfterMs` counts them again.
 */
export const RESTART_BACKOFF = { initialMs: 10_000, factor: 2, maxMs: 300_000, resetAfterMs: 600_000 } as const;

/** What a restarted session is told instead of the brief, on the conversation it continues. */
export const RESTART_WORDS = 'Your session was restarted after its process ended. Carry on where you left off.';

/** What a job continued after it was parked between two tool calls is told instead of the brief (`Attempt.parked`). */
export const PARKED_WORDS = 'Your session was paused between two tool calls and is now resumed. Carry on where you left off.';

/**
 * What a job continued after it was parked in the middle of a call to `tool` is told instead of the brief: the call was cut, and its
 * result never reached the session. The tool's name is its harness's word, quoted.
 */
export const cutWords = (tool: string): string =>
  `Your session was paused while a ${quote(tool)} call was running, and that call did not finish: its result never reached you. ` +
  'Check what it did before it was cut, run it again if it is still needed, and carry on where you left off.';

/** What a restart is told: the call its attempt's park cut, that it was parked between calls, or, not parked, that its process ended. */
export const restartWords = (parked: Parked | undefined): string =>
  parked === undefined ? RESTART_WORDS : parked.calling ? cutWords(parked.calling.tool) : PARKED_WORDS;

/** When an attempt started, on both clocks it was stamped on. */
export const startedWhen = (a: Attempt): Instant => ({ at: Date.parse(a.startedAt), mono: a.startedMono });

/** When an attempt ended, on both clocks; one not ended yet reads as its start. The one reading of an end's time `decide` makes. */
export const endedWhen = (a: Attempt): Instant => (a.endedAt === null ? startedWhen(a) : { at: Date.parse(a.endedAt), mono: a.endedMono });

/**
 * How long a long-lived task waits after its last end before restarting (`RESTART_BACKOFF`): the initial wait, doubled for each
 * attempt before it that ended in a row too soon to reset it, up to the cap. Pure arithmetic over the attempts' times.
 */
export function backoffOf(attempts: readonly Attempt[]): number {
  const { initialMs, factor, maxMs, resetAfterMs } = RESTART_BACKOFF;
  let ends = 0;
  for (const a of [...attempts].reverse()) {
    if (a.ended === null || elapsedMs(startedWhen(a), endedWhen(a)) >= resetAfterMs) break;
    ends++;
  }
  return Math.min(initialMs * factor ** Math.max(0, ends - 1), maxMs);
}
