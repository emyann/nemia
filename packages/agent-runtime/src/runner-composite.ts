/**
 * Several harnesses, one seam.
 *
 * A task says which harness it wants; this dispatches `spawn` to that one and MERGES what all of
 * them observe. The merge is safe without any coordination because the key is `ae/<task>/<attempt>`
 * — unique by construction — so two harnesses can never claim the same name.
 *
 * `decide` does not change, and does not learn that harnesses exist. That is the test of whether
 * the seam was drawn in the right place.
 */
import { Effect } from 'effect';
import type { Sighting } from './core/domain.ts';
import { RunnerError, type Observation, type RunnerOps } from './runner.ts';

/**
 * One runner over `harnesses`, a task routed to the harness it names, or to `fallback` when it names none.
 *
 * A task that names a harness this engine does not have — one it was filed on by an engine that had it, such as a remote
 * agent whose entry has been refused or removed — is routed nowhere (`routeOf`): sent to the fallback, it would be spawned
 * there as a session of another harness nobody asked for, and a session of it in flight would be looked for there, not
 * found, and ended `lost`. Its spawn is refused (`notHere`): nothing is started, and the attempt ends in those words.
 *
 * Every harness is observed at once and the listings merged (`observeAll`, what `observe` and `observeFor` both are). A
 * harness whose look failed is unread — nothing listed, and every name it was to find there not looked for — so one
 * harness being unreachable blinds the engine neither to the others nor to the fact that it could not look: read as an
 * empty listing, a failed look would have the pass read each session on it gone.
 *
 * Which harness runs which session (`owner`) is learned from the last observation: `stop`, `logs` and `release` are given
 * a session id and nothing else, and a session id means something different to each harness. It is never persisted — a
 * stale map would send a stop to the wrong harness, and the pass that needs it has always just observed.
 *
 * - `refuses` asks the harness the task names, as a spawn is routed: its vocabulary is its own. One this engine does not
 *   have is refused at the door that files (`harnessRefusalOf`), which names the harnesses it has.
 * - `observe` lists every harness; one that cannot be read contributes nothing: a full listing is read by views and verbs,
 *   which read an unread harness as nothing observed, and never by the pass (`observeFor`).
 * - `observeFor` tells each harness only the names routed to it, as a spawn is routed: a flat list would have Claude Code
 *   take a Codex task's name for a background session it must look for. Every harness is still observed — one with
 *   nothing expected is told so, and one without the verb lists everything — so a session no journal names is not hidden
 *   from a harness. A harness that could not be read leaves every name routed to it unread, whichever verb it was read by,
 *   and a harness this engine does not have is one nobody can read: its names are neither there nor gone, so none is
 *   spawned again or ended `lost` until the harness is back.
 * - `release` goes only to the harness that reported the session, and only if it has the verb: sent to the fallback
 *   instead, a release would ask the wrong registry to remove something by an id it never gave.
 */
export const composite = (harnesses: Record<string, RunnerOps>, fallback: string): RunnerOps => {
  const pick = (name?: string) => harnesses[name ?? fallback] ?? harnesses[fallback];

  const owner = new Map<string, string>();

  const routeOf = (asked?: string): string | undefined => {
    const name = asked ?? fallback;
    return Object.hasOwn(harnesses, name) ? name : undefined;
  };

  const notHere = (asked: string) =>
    Effect.fail(
      new RunnerError({
        verb: 'spawn',
        refused: true,
        message: `\`harness: ${asked}\` is not a harness this engine has, so nothing was started: the task was filed by an engine that had it. Its harnesses are: ${Object.keys(harnesses).join(', ')}. Give the engine that harness again, then ask for the task again.`,
      }),
    );

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

  const listing = (ops: RunnerOps) => ops.observe.pipe(Effect.map((seen): Observation => ({ seen, unread: new Set() })));

  return {
    spawn: (r) => {
      const route = routeOf(r.harness);
      return route === undefined ? notHere(r.harness ?? fallback) : harnesses[route].spawn(r);
    },

    refuses: (task) => {
      const route = routeOf(task.harness);
      return route === undefined ? undefined : harnesses[route].refuses?.(task);
    },

    observe: observeAll((_, ops) => ({ read: listing(ops), expected: [] })).pipe(Effect.map((o) => o.seen)),

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

    release: (session, task) => {
      const ops = owner.has(session.sessionId) ? pick(owner.get(session.sessionId)) : undefined;
      return ops?.release ? ops.release(session, task) : Effect.succeed(undefined);
    },
  };
};
