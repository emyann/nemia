/** A task's turn, read off its fold (`turnOf`): beside `domain.ts`, which re-exports it, so `deadline.ts` reads it without a cycle. */
import type { State } from './domain.ts';

/**
 * Turn `n` of a task (the current one by default), by pure arithmetic over the fold, so `decide` reads a turn and not the
 * journal's order: its attempts; the session it continues — for a later turn, the one that ended the turn before it,
 * and none if its harness recorded none; for the first, what the task was filed against; the words it is told instead of
 * the brief — every answer given since the turn before it started, so two answers that raced are both heard; and what its
 * configuration gives for itself — the last one given with those words, whole, which the engine lays over the filing's
 * (`configForTurn`). Turn 0 is the task as filed: every attempt of a task not held open, told the brief, with nothing of
 * its own.
 */
export function turnOf(state: State, n = state.inputs.length) {
  const attempts = state.attempts.filter((a) => (a.turn ?? 0) === n);
  const before = state.attempts.filter((a) => (a.turn ?? 0) < n);
  const given = n === 0 ? [] : state.inputs.slice(before.at(-1)?.turn ?? 0, n);
  return {
    n,
    attempts,
    continues: n === 0 ? state.resumeFrom : (before.at(-1)?.nativeId ?? undefined),
    words: given.length ? given.map((i) => i.text).join('\n\n') : undefined,
    config: [...given].reverse().find((i) => i.config)?.config,
  };
}
