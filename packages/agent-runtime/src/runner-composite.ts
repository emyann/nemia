/**
 * Several harnesses, one seam.
 *
 * A task says which harness it wants; this dispatches `spawn` to that one and MERGES what all of
 * them observe. The merge is safe without any coordination because the key is `ae/<task>/<attempt>`
 * — unique by construction — so two harnesses can never claim the same name.
 *
 * `decide` does not change, and does not learn that harnesses exist. That is the test of whether
 * the seam was drawn in the right place, and it is the reason this file is forty lines.
 */
import { Effect } from 'effect';
import type { Sighting } from './domain.ts';
import { RunnerError, type RunnerOps } from './runner.ts';

export const composite = (harnesses: Record<string, RunnerOps>, fallback: string): RunnerOps => {
  const pick = (name?: string) => harnesses[name ?? fallback] ?? harnesses[fallback]!;

  /**
   * Which harness is running which session, learned from the last `observe`.
   *
   * `stop` and `logs` are given a session id and nothing else, and a session id means something
   * different to each harness. Rebuilt every pass rather than persisted — a stale map would send
   * a stop to the wrong harness, and the pass that needs it has always just observed.
   */
  const owner = new Map<string, string>();

  /** The name of the harness `pick` gives for a task's harness: where its spawn went, and so where its session is listed. */
  const routeOf = (asked?: string) => (harnesses[asked ?? fallback] ? (asked ?? fallback) : fallback);

  /** Every harness observed at once, each by `look`, and merged: what `observe` and `observeFor` both are. */
  const observeAll = (look: (name: string, ops: RunnerOps) => Effect.Effect<Map<string, Sighting>, RunnerError>) => Effect.forEach(
    Object.entries(harnesses),
    ([name, ops]) =>
      // One harness being unreachable must not blind the engine to the others: a failed
      // observe contributes nothing rather than failing the pass.
      look(name, ops).pipe(
        Effect.map((m) => [name, m] as const),
        Effect.catchCause(() => Effect.succeed([name, new Map<string, Sighting>()] as const)),
      ),
    { concurrency: 'unbounded' },
  ).pipe(
    Effect.map((results) => {
      const merged = new Map<string, Sighting>();
      for (const [harness, m] of results) {
        for (const [sessionName, sighting] of m) {
          merged.set(sessionName, sighting);
          owner.set(sighting.sessionId, harness);
        }
      }
      return merged;
    }),
  );

  return {
    spawn: (r) => pick(r.harness).spawn(r),

    // To the harness the task names, as a spawn is: its vocabulary is its own.
    refuses: (task) => pick(task.harness).refuses?.(task),

    observe: observeAll((_, ops) => ops.observe),

    // Each harness told only the names routed to it, as a spawn is routed: a flat list would have Claude Code take a Codex
    // task's name for a background session it must look for. Every harness is still observed — one with nothing expected
    // is told so, and one without the verb lists everything — so a session no journal names is not hidden from a harness.
    observeFor: (expected) => observeAll((name, ops) => {
      const mine = expected.filter((e) => routeOf(e.harness) === name);
      return ops.observeFor ? ops.observeFor(mine) : ops.observe;
    }),

    stop: (sessionId) => pick(owner.get(sessionId)).stop(sessionId),

    logs: (sessionId) =>
      owner.has(sessionId)
        ? pick(owner.get(sessionId)).logs(sessionId)
        : Effect.fail(new RunnerError({ verb: 'logs', message: `no harness owns ${sessionId} — run a pass first` })),

    // Only to the harness that reported the session, and only if it has the verb. Sent to the fallback
    // instead, a release would ask the wrong registry to remove something by an id it never gave.
    release: (session, task) => {
      const ops = owner.has(session.sessionId) ? pick(owner.get(session.sessionId)) : undefined;
      return ops?.release ? ops.release(session, task) : Effect.succeed(undefined);
    },
  };
};
