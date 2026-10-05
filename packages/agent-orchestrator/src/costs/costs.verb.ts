/**
 * What recent runs of a run's workflow cost (`costsRead`), read off the store and the engine through the stats' one reader of a run's facts
 * (`factsRead`), and only as far back as the window (`RECENT_RUNS`): never the whole store's journals. A controller, reaching the runtime
 * through the client (`runtime-client.ts`). It writes nothing and keeps nothing between calls.
 */
import { Effect, Exit } from 'effect';
import type { Engine } from '../runtime-client.ts';
import type { Run } from '../record/record.ts';
import { runStore } from '../record/files.store.ts';
import { keysOf, type RunFact, type TryFact } from '../stats/index.ts';
import { factsRead } from '../stats/stats.verb.ts';
import { viewedOnce } from '../views/views.verb.ts';
import { costsOf, RECENT_RUNS } from './costs.ts';

/**
 * What the newest finished runs of `run`'s workflow in its factory cost (`costsOf`), `run` itself left out: the store's other runs of the
 * same factory and workflow (`keysOf`), newest first by when they were started, each read in turn until `RECENT_RUNS` of them have
 * finished. A run that gives nothing — its frozen steps do not read, a journal of it does not read, a read of it fails — is passed over.
 */
export const costsRead = Effect.fn('costsRead')(function* (e: Engine, run: Run) {
  const of = keysOf(run);
  const viewed = viewedOnce(e);
  const candidates = runStore.runs
    .list(() => {})
    .filter((other) => {
      const keys = keysOf(other);
      return other.id !== run.id && keys.factory === of.factory && keys.workflow === of.workflow;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const facts: { tries: TryFact[]; runs: RunFact[] } = { tries: [], runs: [] };
  for (const other of candidates) {
    if (facts.runs.length >= RECENT_RUNS) break;
    const read = yield* Effect.exit(factsRead(viewed, other));
    if (Exit.isFailure(read) || !read.value || read.value.unreadable) continue;
    facts.tries.push(...read.value.facts.tries);
    facts.runs.push(...read.value.facts.runs);
  }
  return costsOf(facts, of);
});
