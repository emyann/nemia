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

  return {
    spawn: (r) => pick(r.harness).spawn(r),

    observe: Effect.forEach(
      Object.entries(harnesses),
      ([name, ops]) =>
        // One harness being unreachable must not blind the engine to the others: a failed
        // observe contributes nothing rather than failing the pass.
        ops.observe.pipe(
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
    ),

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
