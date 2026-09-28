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
import { RunnerError, type Observation, type RunnerOps } from './runner.ts';

export const composite = (harnesses: Record<string, RunnerOps>, fallback: string): RunnerOps => {
  const pick = (name?: string) => harnesses[name ?? fallback] ?? harnesses[fallback];

  /**
   * Which harness is running which session, learned from the last `observe`.
   *
   * `stop` and `logs` are given a session id and nothing else, and a session id means something
   * different to each harness. Rebuilt every pass rather than persisted — a stale map would send
   * a stop to the wrong harness, and the pass that needs it has always just observed.
   */
  const owner = new Map<string, string>();

  /**
   * The harness a task's sessions are spawned on and listed by: the one it names, or the fallback for a task that names none.
   * Undefined for a harness this engine does not have — one the task was filed on by an engine that had it, such as a remote
   * agent whose entry was since refused or removed. Such a task is routed nowhere: sent to the fallback, it was spawned there
   * as a session of another harness nobody asked for, and a session of it in flight was looked for there, not found, and
   * ended `lost` (found in review of thin runtime stage 6, part 2, round 3).
   */
  const routeOf = (asked?: string): string | undefined => {
    const name = asked ?? fallback;
    return Object.hasOwn(harnesses, name) ? name : undefined;
  };

  /** A spawn on a harness this engine does not have, refused: nothing is started, and the attempt ends in these words. */
  const notHere = (asked: string) =>
    Effect.fail(
      new RunnerError({
        verb: 'spawn',
        refused: true,
        message: `\`harness: ${asked}\` is not a harness this engine has, so nothing was started: the task was filed by an engine that had it. Its harnesses are: ${Object.keys(harnesses).join(', ')}. Give the engine that harness again, then ask for the task again.`,
      }),
    );

  /**
   * Every harness observed at once, each by `look`, and merged: what `observe` and `observeFor` both are. A harness whose look
   * failed is `unread` — nothing listed, and every name `look` was to find there not looked for — so one harness being unreachable
   * blinds the engine neither to the others nor to the fact that it could not look (2026-09-25; before, a failed look was an
   * empty listing, and the pass read each session on it gone).
   */
  const observeAll = (
    look: (name: string, ops: RunnerOps) => { read: Effect.Effect<Observation, RunnerError>; expected: readonly string[] },
  ) =>
    Effect.forEach(
      Object.entries(harnesses),
      ([name, ops]) => {
        const { read, expected } = look(name, ops);
        return read.pipe(
          Effect.map((o) => [name, o] as const),
          Effect.catchCause(() => Effect.succeed([name, { seen: new Map<string, Sighting>(), unread: new Set(expected) }] as const)),
        );
      },
      { concurrency: 'unbounded' },
    ).pipe(
      Effect.map((results): Observation => {
        const seen = new Map<string, Sighting>();
        const unread = new Set<string>();
        for (const [harness, o] of results) {
          for (const [sessionName, sighting] of o.seen) {
            seen.set(sessionName, sighting);
            owner.set(sighting.sessionId, harness);
          }
          for (const name of o.unread) unread.add(name);
        }
        return { seen, unread };
      }),
    );

  /** A harness's full listing as an observation that expected nothing, so it leaves nothing unread. */
  const listing = (ops: RunnerOps) => ops.observe.pipe(Effect.map((seen): Observation => ({ seen, unread: new Set() })));

  return {
    spawn: (r) => {
      const route = routeOf(r.harness);
      return route === undefined ? notHere(r.harness ?? fallback) : harnesses[route].spawn(r);
    },

    // To the harness the task names, as a spawn is: its vocabulary is its own. One this engine does not have is refused
    // at the door that files (`harnessRefusalOf`), which names the harnesses it has.
    refuses: (task) => {
      const route = routeOf(task.harness);
      return route === undefined ? undefined : harnesses[route].refuses?.(task);
    },

    // A harness that cannot be read contributes nothing here: a full listing is read by views and verbs, which read an
    // unread harness as nothing observed, and never by the pass (`observeFor`).
    observe: observeAll((_, ops) => ({ read: listing(ops), expected: [] })).pipe(Effect.map((o) => o.seen)),

    // Each harness told only the names routed to it, as a spawn is routed: a flat list would have Claude Code take a Codex
    // task's name for a background session it must look for. Every harness is still observed — one with nothing expected
    // is told so, and one without the verb lists everything — so a session no journal names is not hidden from a harness.
    // A harness that could not be read leaves every name routed to it unread, whichever verb it was read by, and a harness this
    // engine does not have is one nobody can read: its names are neither there nor gone, so none is spawned again or ended
    // `lost` until the harness is back.
    observeFor: (expected) =>
      observeAll((name, ops) => {
        const mine = expected.filter((e) => routeOf(e.harness) === name);
        return { read: ops.observeFor ? ops.observeFor(mine) : listing(ops), expected: mine.map((e) => e.name) };
      }).pipe(
        Effect.map((o): Observation => {
          const nowhere = expected.filter((e) => routeOf(e.harness) === undefined);
          return nowhere.length ? { seen: o.seen, unread: new Set([...o.unread, ...nowhere.map((e) => e.name)]) } : o;
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
