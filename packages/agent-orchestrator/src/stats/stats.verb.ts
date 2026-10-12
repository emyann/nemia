/**
 * `nemia stats` (`statsRun`): the flow numbers of every run in the store (`statsOf`), off each run's record and the engine's view of every
 * task of every try, each viewed once, the calls each session was refused, the skills it loaded and the files it touched read off the
 * same views (`deniedCallsOf`, `skillsLoadedOf`, `filesTouchedOf`), each try's counts read off its own task's closeout (`taskCloseout`),
 * and the rules and paths each step's skills declare read off their frozen copies (`renderedSkillRules`, `renderedSkillApplies`): no
 * session's log nor transcript, and no skill of the checkout. A controller, reaching the runtime through the client (`runtime-client.ts`):
 * an Effect program that requires the engine as a service (`EngineService`), run by a caller with `runWith`. It writes nothing. It keeps
 * nothing between
 * calls but in the memo a caller hands it (`StatsMemo`): each finished run's facts, while its inputs stand.
 */
import { isDeepStrictEqual } from 'node:util';
import { Cause, Effect, Exit } from 'effect';
import { EngineService, denialText, over, unreadableJournal, type Engine, type TaskView } from '../runtime-client.ts';
import { refusedCheck, type Run } from '../record/record.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import type { Workflow } from '../step/step.ts';
import { timeline } from '../timeline/index.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';
import { closeoutReader, everyTryOf, taskCloseout, taskPhasesRead, viewedOnce } from '../views/views.verb.ts';
import { phaseOfView } from '../views/views-words.ts';
import { renderedSkillApplies, renderedSkillRules, renderedSkillVersions } from '../agents/agents.store.ts';
import { followedFeed } from '../rest/rest.verb.ts';
import type { SeriesMemo } from '../series/series.ts';
import { seriesHealth } from '../series/series.store.ts';
import { dayOf, factsOf, keysOf, statsOf, type CheckVerdict, type Facts, type RunFact, type StatsQuery, type TryFact } from './stats.ts';
import { frozenOf, type RunFrozen } from './marks.ts';
import { deniedCallsOf, filesTouchedOf, skillsLoadedOf } from './discipline.ts';

/** How a check's task ended (`CheckVerdict`): passed, refused (it ran to its end and exited non-zero, `refusedCheck`), or unfinished. */
function verdictOf(view: TaskView | undefined): CheckVerdict {
  const phase = phaseOfView(view);
  if (phase === 'succeeded') return 'passed';
  const last = view?.state.attempts.at(-1);
  const code = typeof last?.exitCode === 'number' && last.reason !== 'deadline' && last.reason !== 'operator' ? last.exitCode : undefined;
  return refusedCheck(phase, code) ? 'refused' : 'unfinished';
}

/** A run's frozen steps (`stepsOf`), or null where they do not read. */
function stepsRead(run: Run): Workflow[] | null {
  try {
    return stepsOf(run);
  } catch {
    return null;
  }
}

/**
 * What a run froze (`frozenOf`): its steps, and each skill by the version of its rendered copy (`renderedSkillVersions`), where the copy
 * is there.
 */
const frozenRun = (run: Run, steps: readonly Workflow[]): RunFrozen =>
  frozenOf(
    { ...keysOf(run), day: dayOf(run.createdAt), at: run.createdAt, workflowDir: run.workflowDir },
    steps,
    new Map(steps.map((step) => [step.name, renderedSkillVersions(run, step)])),
  );

/**
 * One run's facts (`factsOf`) off its frozen `steps` and the engine's view of every task of every try, and whether every one of those
 * tasks had settled. Rejects with what a view rejected with, a journal that does not read among it.
 */
const runFacts = Effect.fnUntraced(function* (e: Engine, run: Run, steps: Workflow[]) {
  const { views } = yield* taskPhasesRead(run).pipe(over(e));
  const everyTry = yield* everyTryOf(e, run, views);
  const filed = new Map([...everyTry].flatMap(([taskId, v]) => (v.state.filedAt ? [[taskId, v.state.filedAt] as const] : [])));
  const settled = [...everyTry.values()].every((v) => Boolean(v.state.settled));
  const of = factsOf({
    run,
    steps,
    timeline: timeline(run, everyTry, filed, steps),
    succeeded: (taskId) => phaseOfView(everyTry.get(taskId)) === 'succeeded',
    verdictOf: (taskId) => verdictOf(everyTry.get(taskId)),
    closeoutOf: closeoutReader(views, run),
    deniedOf: (taskId) => deniedCallsOf(everyTry.get(taskId)).map(denialText),
    skillsOf: (taskId, given) => skillsLoadedOf(everyTry.get(taskId), given),
    filesOf: (taskId) => filesTouchedOf(everyTry.get(taskId)),
    rulesOf: (step) => renderedSkillRules(run, step),
    appliesOf: (step) => renderedSkillApplies(run, step),
    closeoutOfTask: (taskId) => taskCloseout(everyTry, taskId),
    deadlineOf: (taskId) => everyTry.get(taskId)?.state.deadlineSeconds ?? null,
  });
  return { ...of, settled };
});

/** One run's facts, as `statsOf` takes them: what it froze, and its tries and its run, none where a journal of it does not read. */
type RunFacts = { frozen: RunFrozen; tries: TryFact[]; runs: RunFact[] };

/**
 * What one run gives the stats: its facts; whether a journal of it did not read (`unreadable`); and whether they may be kept (`keeps`):
 * its workflow is frozen on its record, every task of every try had settled, and every journal read. Null for a run that gives nothing:
 * its record is gone or does not read, or its frozen steps do not read; such a run may be kept, as nothing.
 */
type RunRead = { id: string; facts: RunFacts; unreadable: boolean; keeps: boolean } | null;

/**
 * What a process keeps of each run's facts between calls of `stats`, in memory and nowhere else: for each run, what it gave (`RunRead`)
 * and the stamp of its files in the store it was read under (`runStore.runs.stamps`); and `cursor`, where on the engine's feed the memo
 * has read to, since a task's journal appending takes its run out (`followedFeed`). A cache of a pure function, never a source of truth:
 * a fresh process starts with none and reads every run.
 */
export type StatsMemo = { cursor?: number; runs: Map<string, { stamp: string; read: RunRead }> };

/** A memo that holds nothing: what a serving process starts with. */
export const freshStatsMemo = (): StatsMemo => ({ runs: new Map() });

/**
 * How `stats` reads: `memo`, the memo it answers runs from and keeps them in, none by default, which reads every run; and `verify`, which
 * reads each run the memo answers afresh too and fails where the two differ (`WF_VERIFY_REST=1`); and `series`, the memo the system's
 * health reads the series' days through (`seriesHealth`).
 */
export type StatsOptions = { memo?: StatsMemo; verify?: boolean; series?: SeriesMemo };

/** What `run` gives the stats (`RunRead`). Fails with what a read of it failed with but a journal that does not read. */
export const factsRead = Effect.fnUntraced(function* (e: Engine, run: Run) {
  const steps = stepsRead(run);
  if (!steps) return null;
  const frozen = frozenRun(run, steps);
  const read = yield* Effect.exit(runFacts(e, run, steps));
  if (Exit.isSuccess(read)) {
    const { tries, runs, settled } = read.value;
    return { id: run.id, facts: { frozen, tries, runs }, unreadable: false, keeps: settled && Boolean(run.workflow) } satisfies RunRead;
  }
  if (unreadableJournal(Cause.squash(read.cause)) === undefined) return yield* Effect.failCause(read.cause);
  return { id: run.id, facts: { frozen, tries: [], runs: [] }, unreadable: true, keeps: false } satisfies RunRead;
});

/**
 * What the run `id` gives the stats (`factsRead`), off its record read now, a record that does not read said on `said` as the store's
 * list says it.
 */
const runRead = Effect.fnUntraced(function* (e: Engine, id: string, said: (line: string) => void) {
  let run: Run;
  try {
    run = runStore.runs.read(id);
  } catch (err) {
    if (err instanceof Invalid) said(`left out: ${err.message}`);
    else if (!(err instanceof Missing)) throw err;
    return null;
  }
  return yield* factsRead(e, run);
});

const sayOnStderr = (line: string) => process.stderr.write(`${line}\n`);

/**
 * Every run of the store as it gives the stats, read through `memo`: the memo brought up to the engine's feed and the store stamped
 * before any record is read, so a change between the two is read as changed on the next call. A run whose stamp is the one it was kept
 * under is answered from memory, and read afresh too under `verify`, which rejects where the two differ, naming the run. Any other run
 * is read, and kept where it may be (`RunRead`), the feed was read, and no other call has read it on past where this one read to. A run
 * gone from the stamps is gone from the memo; for an engine with no feed, nothing is answered from memory, nor kept.
 */
const memoReads = Effect.fnUntraced(function* (e: Engine, memo: StatsMemo, verify: boolean) {
  const fed = typeof e.feed === 'function' && (yield* followedFeed(e, memo));
  if (!fed) memo.runs.clear();
  const readTo = memo.cursor;
  const stamps = runStore.runs.stamps();
  for (const id of memo.runs.keys()) if (!stamps.has(id)) memo.runs.delete(id);
  const reads: RunRead[] = [];
  for (const [id, stamp] of [...stamps].sort(([a], [b]) => a.localeCompare(b))) {
    const kept = memo.runs.get(id);
    if (kept?.stamp === stamp) {
      if (verify && !isDeepStrictEqual(yield* runRead(e, id, () => {}), kept.read))
        throw new Error(`the stats' memo answered the run ${id} unlike a read of it afresh: an input of its facts is not in its stamp`);
      reads.push(kept.read);
      continue;
    }
    memo.runs.delete(id);
    const read = yield* runRead(e, id, sayOnStderr);
    reads.push(read);
    if (fed && memo.cursor === readTo && (read === null || read.keeps)) memo.runs.set(id, { stamp, read });
  }
  return reads;
});

/** Every run in the store as the store lists it, each as it gives the stats (`factsRead`), read afresh. */
const listReads = Effect.fnUntraced(function* (e: Engine) {
  const reads: RunRead[] = [];
  for (const run of runStore.runs.list()) reads.push(yield* factsRead(e, run));
  return reads;
});

/**
 * The stats of every run in the store for `query`, as of `now` (`statsOf`), over `e` viewed once, through `options.memo` where one is
 * handed (`memoReads`). A run a journal of which does not read is left out of the facts and named in `unreadable`, and what it froze is
 * still compared (`frozenRun`); a run whose frozen steps do not read gives nothing; a record that does not read is left out, said on
 * stderr. The system's health is read over the days answered (`seriesHealth`).
 */
const statsOver = Effect.fnUntraced(function* (e: Engine, query: StatsQuery, now: Date, { memo, verify = false, series }: StatsOptions) {
  const facts: Facts = { tries: [], runs: [], frozen: [] };
  const unreadable: string[] = [];
  for (const read of memo ? yield* memoReads(e, memo, verify) : yield* listReads(e)) {
    if (!read) continue;
    facts.frozen.push(read.facts.frozen);
    facts.tries.push(...read.facts.tries);
    facts.runs.push(...read.facts.runs);
    if (read.unreadable) unreadable.push(read.id);
  }
  return statsOf(facts, query, now, unreadable, (from, to) => seriesHealth(from, to, series));
});

/**
 * `nemia stats`: the flow numbers of every run in the store for `query`, as of `now`, through the memo `options` hands it, if any. Fails
 * with a refusal a read threw; dies of anything else.
 */
export const statsRun = Effect.fn('stats')(function* (query: StatsQuery, now: Date = new Date(), options: StatsOptions = {}) {
  const e = viewedOnce(yield* EngineService);
  return yield* statsOver(e, query, now, options);
});
