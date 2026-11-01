/**
 * The store as the board's reading of a run stands on it: the engine's views of a run's tasks, read once for a request, the workflow a run
 * is judged by and the steps it shows, the feed's filing times read on from where the last read stopped, and whether a run is an agent's
 * try. A controller: it reads the engine through the client (`runtime-client.ts`), the runs through `runStore`, and a workflow folder off
 * disk, and writes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Exit } from 'effect';
import { asked, over, type Engine, type TaskView, unreadableJournal } from '../runtime-client.ts';
import { DEFAULT_FACTORY } from '../factory/factory.ts';
import { readFactory } from '../factory/factory.store.ts';
import type { Fills } from '../folder/folder.ts';
import { loadWorkflows } from '../folder/folder.store.ts';
import { isRefusal, Missing } from '../refusal/refusal.ts';
import { factoryFills } from '../rules/rules.store.ts';
import { runStore } from '../record/files.store.ts';
import { type Run, runTasks, unjudgedWords, unloadedWords } from '../record/record.ts';
import { unloadedOf } from '../record/steps.store.ts';
import { triesDir } from '../try/try.store.ts';
import type { Workflow } from '../step/step.ts';
import { filingsRead } from '../views/views.verb.ts';

export type { TaskView };
export type Views = ReadonlyMap<string, TaskView>;
/** Each task a read left out because its journal does not read, by id, with why in the runtime's words (`list`'s `unreadable`). */
export type Unreadable = ReadonlyMap<string, string>;

/**
 * The engine's view of every task a run's current tries have filed — each step's, and each check's — and each earlier try's session, for
 * its decision: what a step's tries have cost together is every try's session (`stepSpend`), as the tick reads them (`taskPhasesRead` in
 * views.verb.ts). A `view` of a settled task reads its journal and asks no harness; one of a task in flight observes its harness
 * — a scan of its runs' files. Read through `reader`, a request's own
 * (`viewsFor`), a task two runs read is viewed once.
 */
export const viewsOf = Effect.fn('viewsOf')(function* (run: Run, reader: Engine) {
  const views = new Map<string, TaskView>();
  for (const { taskId, check, tries } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, yield* asked('view', reader.view(taskId)));
    if (check) views.set(check.taskId, yield* asked('view', reader.view(check.taskId)));
    for (const t of tries ?? []) if (!views.has(t.taskId)) views.set(t.taskId, yield* asked('view', reader.view(t.taskId)));
  }
  return views satisfies Views;
});

/** The first task of a run's whose journal a read left out (`viewsFor`), and why; undefined for a run whose every task read. */
export function unreadableOf(run: Run, unreadable: Unreadable): { taskId: string; why: string } | undefined {
  for (const taskId of runTasks(run)) {
    const why = unreadable.get(taskId);
    if (why !== undefined) return { taskId, why };
  }
  return undefined;
}

/** What `judgedUnlessUnreadable` answers: the judgement, or why there is none. */
export type JudgedOrNot<T> = { judged: T } | { unreadable: string };

/**
 * `judge` of `run`, or why it is not judged, in the words the list and a run's page say it with (`RunSummary.unreadable`): its unfrozen
 * workflow folder that does not load (`unloadedOf`), in the folder's words (`unloadedWords`); a task of its own the read left out
 * (`unreadableOf`); or one of a run it waits on, whose view fails in the runtime's words (`unreadableJournal`). As the tick leaves such a
 * run unjudged and counts it in flight. Any other failure fails the same.
 */
export const judgedUnlessUnreadable = Effect.fn('judgedUnlessUnreadable')(function* <T, E, R>(
  run: Run,
  unreadable: Unreadable,
  judge: () => Effect.Effect<T, E, R>,
): Effect.fn.Return<JudgedOrNot<T>, E, R> {
  const folder = unloadedOf(run);
  if (folder !== undefined) return { unreadable: unloadedWords(run.id, folder, 'the board') };
  const own = unreadableOf(run, unreadable);
  if (own) return { unreadable: unjudgedWords(run.id, own.taskId, own.why, 'the board') };
  const exit = yield* Effect.exit(judge());
  if (Exit.isSuccess(exit)) return { judged: exit.value };
  const why = unreadableJournal(Cause.squash(exit.cause));
  if (why === undefined) return yield* Effect.failCause(exit.cause);
  return { unreadable: unjudgedWords(run.id, undefined, why, 'the board') };
});

/**
 * The views a request judges `runs` by, and the engine it hands `parentRead` for the runs they wait on: the tasks of those runs and of the
 * runs they wait on or are held until, found among `store`, over one look at the harnesses (`list(taskIds)`), which reads their journals
 * and no other and observes the harness of each in flight among them — once, however many. A task of a
 * run waited on that the views do not hold, filed since, is viewed (`seenBy`).
 *
 * A task whose journal does not read is in `unreadable` and in no view, as the runtime leaves it out: one entry no runtime wrote costs the
 * runs that read that task (`unreadableOf`), never the others. A run's tasks are every try's and every check's (`runTasks`).
 *
 * A request reads the journals of the runs it judges and of their parents, once, and no other: never every journal in the store
 * (`everyView`), and never a run waited on a `view` a task, its journal once more.
 */
export const viewsFor = Effect.fn('viewsFor')(function* (
  e: Engine,
  runs: readonly Run[],
  store: () => readonly Run[] = () => runStore.runs.list(),
) {
  const parents = new Set(runs.flatMap((run) => [...(run.after ?? []), ...(run.hold && !run.cancelledAt ? run.hold.until : [])]));
  const read = parents.size ? [...runs, ...store().filter((run) => parents.has(run.id))] : runs;
  const listed = yield* asked('list', e.list(read.flatMap(runTasks)));
  const views: Views = new Map(listed.views.map((view) => [view.id, view]));
  return {
    views,
    reader: seenBy(e, views),
    unreadable: new Map(listed.unreadable.map(({ taskId, why }) => [taskId, why])) satisfies Unreadable,
  };
});

/**
 * The engine as a request that has read `views` sees it: `view` answers from them, and everything else is the engine's own. What the
 * `parentRead` is handed on the list and on a run's detail, so reading the runs a run waits on observes no harness again — the
 * list is what the Factory polls. A task the read did not see, filed since, is viewed.
 */
export const seenBy = (e: Engine, views: Views): Engine => ({
  ...e,
  view: (taskId) => {
    const seen = views.get(taskId);
    return seen ? Effect.succeed(seen) : e.view(taskId);
  },
});

/**
 * What a read of `run`'s workflow folder is handed of the factory it started in, read now: its hires and rules (`factoryFills`), none for
 * a run in no factory or the default one; or, for a factory that is not there (`gone`) or whose file does not read, its name alone. Throws
 * what is no refusal.
 */
function factoryRead(run: Run): { fills?: Fills; unread?: { name: string; gone: boolean } } {
  if (run.factory === undefined || run.factory === DEFAULT_FACTORY) return {};
  try {
    return { fills: factoryFills(readFactory(run.factory), path.basename(path.resolve(run.workflowDir))).fills };
  } catch (err) {
    if (!isRefusal(err)) throw err;
    return { unread: { name: run.factory, gone: err instanceof Missing } };
  }
}

/** `why` ended with a full stop, where it ends with no stop of its own. */
const stopped = (why: string): string => (/[.!?]$/.test(why) ? why : `${why}.`);

/**
 * The run's workflow folder, read now as its start read it: its steps, or none and a warning — the folder gone, or no longer read as a
 * workflow, in the folder's words ended with one full stop.
 *
 * Its agents and skills are looked for where the start looked, the run's repository's own folder of them, then yours; and a run started
 * in a factory is read with that factory's hires and rules as they are now (`factoryRead`), so a step the factory hires an agent into
 * reads as it did. None of a start's own refusals is asked: a workflow detached since still reads. A factory that is gone or does not
 * read hands no hires: the folder is read without them, and where it then does not read, the warning names the factory and never quotes a
 * loader that was given no hires.
 *
 * The run record is the truth about what ran; the folder is only where the prose came from, and it can be edited or deleted after
 * `nemia start`. So a folder that does not read is a warning, not a failure of the request. On a run that froze its workflow, the warning
 * says nothing the page draws comes from the folder. On a run that froze none, it is the folder's words alone: such a run is not judged
 * (`judgedUnlessUnreadable` answers `unloadedWords`), and its page says that instead.
 */
export function workflowsOf(run: Run, home: string): { steps: Workflow[]; warning: null } | { steps: null; warning: string } {
  const { fills, unread } = factoryRead(run);
  try {
    return { steps: loadWorkflows(run.workflowDir, { repo: run.repo, home }, fills), warning: null };
  } catch (err) {
    const folder = `The workflow folder ${run.workflowDir}`;
    const why = !fs.existsSync(run.workflowDir)
      ? `${folder} is gone.`
      : unread
        ? `${folder} is not read as this run's start read it: the factory ${unread.name} it started in ${unread.gone ? 'is gone' : 'no longer reads'}.`
        : `${folder} no longer reads as a workflow: ${stopped((err as Error).message)}`;
    return {
      steps: null,
      warning: run.workflow
        ? `${why} Nothing here is read from it: the steps, their spec, prose and graph are the workflow the run froze at \`nemia start\`, which is what it is judged by.`
        : why,
    };
  }
}

/**
 * Which steps a run has, in the order to show them.
 *
 * Every step on the record, in the record's order — the workflow's order when the run started —
 * because the record is the truth about what ran, whatever the folder says now; `nemia decide` reads
 * the record too. Then any step the workflow the tick reads (`stepsOf` in record.store.ts) has and the record
 * does not. On a run that froze its workflow that is the frozen one, so a step the folder gained since is
 * not shown: the tick never files it, and drawn, it would wait for ever and make a root of the graph the
 * run froze — `driftOf` names it instead. On a record that froze none, the folder, whose added steps the
 * tick does file.
 */
export function stepNames(run: Run, workflows: readonly Workflow[] | null): string[] {
  const added = (run.workflow ?? workflows ?? []).map((s) => s.name).filter((name) => !Object.hasOwn(run.steps, name));
  return [...Object.keys(run.steps), ...added];
}

/**
 * The steps a run is judged by: the workflow it froze at `nemia start`, which the tick reads (`stepsOf` in
 * record.store.ts), and for a record that froze none, the folder. A record whose folder does not read is
 * judged from the record alone, a `bare` step each.
 */
export const judgedSteps = (run: Run, folder: readonly Workflow[] | null): readonly Workflow[] =>
  run.workflow ?? folder ?? Object.keys(run.steps).map(bare);

/** A step nothing defines: all the record says of it is its name, with no `after`, `check:` or `output:`. */
export const bare = (name: string): Workflow => ({ name, after: [], body: '' });

/**
 * When each task was filed, off the engine's feed (`filingsRead`), and where the last read of it stopped: a task's view carries no filing
 * time, and the wait for a slot is filing → first attempt, and a run starts at its first filing (`runStartedAt`). Read on from the cursor
 * on each detail and each list — a filing is written once and never changes — so a page polled every five seconds reads what was appended
 * since. A read's cache, one for a caller that lives long, of its engine's feed: a fresh one reads the feed from the start.
 */
export type Filings = { filed: Map<string, string>; cursor: number };

/**
 * Every task's filing time `e`'s feed has, read on from where the last read into `filings` stopped. A feed that cannot be read this time
 * leaves what was read before: the queue times of tasks filed since say `not known` until a read works.
 */
export const filedTimes = Effect.fn('filedTimes')(function* (e: Engine, filings: Filings) {
  const read = yield* Effect.exit(filingsRead(filings.cursor, filings.filed).pipe(over(e)));
  if (Exit.isSuccess(read)) filings.cursor = read.value.cursor;
  return filings.filed;
});

/** The agent a run tried, when it is a try: started from a folder directly under `tries/`. Null for every other run. */
export function tryOf(run: Pick<Run, 'workflowDir'>, home: string): { agent: string } | null {
  const dir = path.resolve(run.workflowDir);
  return path.dirname(dir) === path.resolve(triesDir(home)) ? { agent: path.basename(dir) } : null;
}
