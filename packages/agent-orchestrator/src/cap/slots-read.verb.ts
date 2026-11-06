/**
 * The board's ceilings read (`slotsRead`), apart from `cap.verb.ts` because it reads the informer, whose judging reaches back to the
 * run slots: in `cap.verb.ts` it would close a cycle of imports.
 */
import { Effect } from 'effect';
import { EngineService, tried } from '../runtime-client.ts';
import { slotSettled } from './cap.ts';
import { slotsOf, storeRunsGiven } from './cap.verb.ts';

export type { Slots } from './cap.verb.ts';
import { lastCeilings } from '../daemon/daemon.store.ts';
import { maxRuns, verifiesRest } from '../config/config.store.ts';
import { Informer, informerRead } from '../rest/informer.verb.ts';
import { sameJudgement } from '../summary/judgement.verb.ts';
import { passParents } from '../views/views.verb.ts';
import { standingReader, standingSnapshot } from '../standing/standing.verb.ts';

/**
 * The run slots (`slotsOf`) of every run in the store, read through the engine in the context, the runs they wait on off the tick's last
 * reading of where the branches stand (`standingSnapshot`), with no git process: the cap and what holds it, as the board says it.
 *
 * Where the process keeps an informer (`Informer`, the api's), the store is listed through it as the run list reads it, a run whose files
 * stamp as they did given as the run it kept, and a run its judgement says ended at rest (`slotSettled`) is left out, its tasks not
 * listed: it is neither in flight nor held. On a verified read (`WF_VERIFY_REST=1` of `env`) every run is judged, and one left out
 * that is judged in flight or wanting a slot dies, naming it (`slotsOf`'s `settled`).
 */
export const slotsRead = Effect.fn('slotsRead')(function* (env: NodeJS.ProcessEnv = process.env) {
  const git = standingReader(yield* standingSnapshot());
  const parents = passParents(git);
  const e = yield* EngineService;
  const informer = yield* Informer;
  if (!informer || (lastCeilings()?.runs ?? maxRuns(env)) <= 0) return yield* slotsOf(e, undefined, env, parents);
  const read = yield* informerRead(e, informer, yield* tried(() => verifiesRest(env)), git, sameJudgement);
  const all = storeRunsGiven(read.given);
  read.only(all.map((run) => run.id));
  const settled = new Set(all.filter((run) => slotSettled(read.kept(run)?.judged)).map((run) => run.id));
  if (read.verify) return yield* slotsOf(e, all, env, parents, settled);
  return yield* slotsOf(
    e,
    all.filter((run) => !settled.has(run.id)),
    env,
    parents,
  );
});
