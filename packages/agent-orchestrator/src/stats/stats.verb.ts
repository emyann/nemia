/**
 * `wf stats` (`statsRun`): the flow numbers of every run in the store (`statsOf`), off each run's record and the engine's view of every
 * task of every try, each viewed once. A controller, reaching the runtime through the client (`runtime-client.ts`): an Effect program that
 * requires the engine as a service (`EngineService`), and `stats`, its plain face in a Promise, over the engine it is handed. It writes
 * nothing, and keeps nothing between calls.
 */
import { Effect } from 'effect';
import { EngineService, awaited, unreadableJournal, type Engine, type TaskView } from '../runtime-client.ts';
import { refusedCheck, type Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { timeline } from '../timeline/timeline.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';
import { closeoutReader, everyTryOf, taskPhases, viewedOnce } from '../views/views.verb.ts';
import { phaseOfView } from '../views/views-words.ts';
import { factsOf, statsOf, type CheckVerdict, type Facts, type StatsQuery } from './stats.ts';

/** How a check's task ended (`CheckVerdict`): passed, refused (it ran to its end and exited non-zero, `refusedCheck`), or unfinished. */
function verdictOf(view: TaskView | undefined): CheckVerdict {
  const phase = phaseOfView(view);
  if (phase === 'succeeded') return 'passed';
  const last = view?.state.attempts.at(-1);
  const code = typeof last?.exitCode === 'number' && last.reason !== 'deadline' && last.reason !== 'operator' ? last.exitCode : undefined;
  return refusedCheck(phase, code) ? 'refused' : 'unfinished';
}

/**
 * One run's facts (`factsOf`), off the engine's view of every task of every try: none for a run whose frozen steps do not read. Rejects
 * with what a view rejected with, a journal that does not read among it.
 */
async function runFacts(e: Engine, run: Run): Promise<Facts> {
  let steps: Workflow[];
  try {
    steps = stepsOf(run);
  } catch {
    return { tries: [], runs: [] };
  }
  const { views } = await taskPhases(e, run);
  const everyTry = await Effect.runPromise(everyTryOf(e, run, views));
  const filed = new Map([...everyTry].flatMap(([taskId, v]) => (v.state.filedAt ? [[taskId, v.state.filedAt] as const] : [])));
  return factsOf({
    run,
    steps,
    timeline: timeline(run, everyTry, filed, steps),
    succeeded: (taskId) => phaseOfView(everyTry.get(taskId)) === 'succeeded',
    verdictOf: (taskId) => verdictOf(everyTry.get(taskId)),
    closeoutOf: closeoutReader(views, run),
  });
}

/**
 * The stats of every run in the store for `query`, as of `now` (`statsOf`), over `e` viewed once. A run a journal of which does not read
 * is left out whole and named in `unreadable`; a record that does not read is left out by the store's list, which says so on stderr.
 */
async function statsOver(e: Engine, query: StatsQuery, now: Date) {
  const facts: Facts = { tries: [], runs: [] };
  const unreadable: string[] = [];
  for (const run of runStore.runs.list()) {
    try {
      const of = await runFacts(e, run);
      facts.tries.push(...of.tries);
      facts.runs.push(...of.runs);
    } catch (err) {
      if (unreadableJournal(err) === undefined) throw err;
      unreadable.push(run.id);
    }
  }
  return statsOf(facts, query, now, unreadable);
}

/**
 * `wf stats`: the flow numbers of every run in the store for `query`, as of `now`. Fails with a refusal a read threw; dies of anything
 * else.
 */
export const statsRun = Effect.fn('stats')(function* (query: StatsQuery, now: Date = new Date()) {
  const e = viewedOnce(yield* EngineService);
  return yield* awaited(() => statsOver(e, query, now));
});

/** `wf stats` (`statsRun`) in a Promise, over `engine`: what the CLI, the api and the tests call. */
export const stats = (engine: Engine, query: StatsQuery, now: Date = new Date()) =>
  Effect.runPromise(statsRun(query, now).pipe(Effect.provide(EngineService.layer(engine))));
