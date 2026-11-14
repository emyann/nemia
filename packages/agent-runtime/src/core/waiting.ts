/** Whether a task waits: on a person's answer (`waitsForInput`), or on the layer above's word to start its turn (`awaitsAdmission`). Read by `domain.ts` and its contracts. */
import type { State } from './state.ts';
import { turnOf } from './turn.ts';

/**
 * A task held open, its current turn ended `succeeded` (with its statement or without), not closed and not settled: it waits on a person's
 * answer, with no process running.
 */
export function waitsForInput(state: State): boolean {
  const last = state.attempts.at(-1);
  return (
    state.holdOpen === true && !state.settled && !state.closed && last?.ended === 'succeeded' && (last.turn ?? 0) === state.inputs.length
  );
}

/**
 * Whether the task waits for the layer above's word to start its current turn: queued — or filed by an older runtime,
 * without the key, which reads as queued — not settled, not asked to stop, no attempt in flight, its turn not yet
 * started, not waiting on a person and not closed, and no `admitted` entry for this turn. The one reading of it:
 * `decide` holds the start on it, `admit` writes an entry only while it holds, and a view says `queued` by it.
 */
export function awaitsAdmission(state: State): boolean {
  return admissionOf(state) === 'queued';
}

/**
 * Where a queued task stands with the layer above, for a view: `queued` while it waits for its word, `admitted`
 * once given and until the turn starts — a slot the upper layer has handed out — and nothing for a task not queued, or
 * one whose turn has started or has nothing left to start, which the phase says.
 */
export function admissionOf(state: State): 'queued' | 'admitted' | undefined {
  if (state.queued === false || state.settled || state.stopRequested) return undefined;
  const last = state.attempts.at(-1);
  if (last && last.ended === null) return undefined;
  if (state.holdOpen && (state.closed || waitsForInput(state))) return undefined;
  const turn = turnOf(state);
  if (turn.attempts.length > 0) return undefined;
  return state.admitted === turn.n ? 'admitted' : 'queued';
}

