/**
 * The store as every run route reads it: the one engine the process reads through, the engine's views of a run's tasks, a run found by
 * its id, its workflow and the steps it is judged by, and the feed's filing times — read on from where the last read stopped.
 */
import fs from 'node:fs';
import { engine, HOME, listRuns, loadWorkflows, readFilings, unreadableJournal } from 'agent-orchestrator';
import { isGitRun, type Run } from 'agent-orchestrator/run';
import type { Workflow } from 'agent-orchestrator/workflow';

/**
 * One engine for the process, and the api only reads through it — `list`, `view` and `logs`, never
 * `tick` or `file`.
 * Filing and advancing work is `wf`'s job, so a board left open in a tab cannot start anything. The one write through it is a try's removal
 * (`DELETE /api/runs/:id`), `wf rm`'s own code, which closes a task that waits for a word nobody will give once the record is gone.
 */
export const e = engine();

export type TaskView = Awaited<ReturnType<typeof e.view>>;
export type Views = ReadonlyMap<string, TaskView>;
/** Each task a read left out because its journal does not read, by id, with why in the runtime's words (`list`'s `unreadable`). */
export type Unreadable = ReadonlyMap<string, string>;

/**
 * The engine's view of every task a run's current tries have filed — each step's, and each check's — and each earlier try's session, for its
 * decision: what a step's tries have cost together is every try's session (`stepSpend`), as the tick reads them (`taskPhases` in the package's views.ts).
 * A `view` of a settled task reads its journal and asks no harness; one of a task in flight observes its harness — a scan of the detached
 * runs' files for a job, a `claude agents` call for a background session. Read through `reader`, a request's own (`viewsFor`), a task two
 * runs read is viewed once.
 */
export async function viewsOf(run: Run, reader: typeof e = e): Promise<Views> {
  const views = new Map<string, TaskView>();
  for (const { taskId, check, tries } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, await reader.view(taskId));
    if (check) views.set(check.taskId, await reader.view(check.taskId));
    for (const t of tries ?? []) if (!views.has(t.taskId)) views.set(t.taskId, await reader.view(t.taskId));
  }
  return views;
}

/** Every task a run has filed: each step's and its check's, and each earlier try's and its check's — what a run's page reads of every try. */
const tasksOf = (run: Run): string[] =>
  Object.values(run.steps).flatMap(({ taskId, check, tries }) => [
    ...(taskId ? [taskId] : []),
    ...(check ? [check.taskId] : []),
    ...(tries ?? []).flatMap((t) => [t.taskId, ...(t.check ? [t.check.taskId] : [])]),
  ]);

/** The first task of a run's whose journal a read left out (`viewsFor`), and why; undefined for a run whose every task read. */
export function unreadableOf(run: Run, unreadable: Unreadable): { taskId: string; why: string } | undefined {
  const taskId = tasksOf(run).find((id) => unreadable.has(id));
  return taskId === undefined ? undefined : { taskId, why: unreadable.get(taskId)! };
}

/**
 * `judge` of `run`, or why it is not judged, in the words the list and a run's page say it with (`RunSummary.unreadable`): a task of its own
 * the read left out (`unreadableOf`), or one of a run it waits on, whose view rejects in the runtime's words (`unreadableJournal`). As the tick
 * leaves such a run unjudged and counts it in flight. Any other failure rejects.
 */
export async function judgedUnlessUnreadable<T>(
  run: Run,
  unreadable: Unreadable,
  judge: () => Promise<T>,
): Promise<{ judged: T } | { unreadable: string }> {
  const own = unreadableOf(run, unreadable);
  if (own) return { unreadable: unjudgedWords(run, `the journal of its task ${own.taskId} does not: ${own.why}`) };
  try {
    return { judged: await judge() };
  } catch (err) {
    const why = unreadableJournal(err);
    if (why === undefined) throw err;
    return { unreadable: unjudgedWords(run, `the journal of a task of a run it waits on does not: ${why}`) };
  }
}

/** Why `run` is not judged, whole: what reads, what does not (`why`), and what that costs until it reads. */
const unjudgedWords = (run: Run, why: string): string =>
  `${run.id}'s record reads, but ${/[.!?]$/.test(why) ? why : `${why}.`} So the board does not judge the run, and the tick does not advance it, until that journal reads again.`;

/**
 * The views a request judges `runs` by, and the engine it hands the package's `parentOf` for the runs they wait on: the tasks of those runs
 * and of the runs they wait on or are held until, found among `store`, over one look at the harnesses (`list(taskIds)`), which reads their
 * journals and no other and asks `claude agents` only for a background session in flight among them — once, however many. A task of a run
 * waited on that the views do not hold, filed since, is viewed (`seenBy`).
 *
 * A task whose journal does not read is in `unreadable` and in no view, as the runtime leaves it out: one entry no runtime wrote costs the
 * runs that read that task (`unreadableOf`), never the others.
 *
 * Before, every request read every journal in the store (`everyView`: 1,850 on the live store on 2026-09-25) for the handful of runs not at
 * rest. And a run waited on was read a `view` a task, its journal once more: 632 journals on the second request of the live store, where
 * reading the parents here too reads what the runs moving and their parents have filed, once.
 */
export async function viewsFor(
  runs: readonly Run[],
  store: () => readonly Run[] = listRuns,
): Promise<{ views: Views; reader: typeof e; unreadable: Unreadable }> {
  const parents = new Set(runs.flatMap((run) => [...(run.after ?? []), ...(run.hold && !run.cancelledAt ? run.hold.until : [])]));
  const read = parents.size ? [...runs, ...store().filter((run) => parents.has(run.id))] : runs;
  const listed = await e.list(read.flatMap(tasksOf));
  const views: Views = new Map(listed.views.map((view) => [view.id, view]));
  return { views, reader: seenBy(views), unreadable: new Map(listed.unreadable.map(({ taskId, why }) => [taskId, why])) };
}

/**
 * The engine's view of every task in its store, over one observation, by task id.
 *
 * `list` observes the harnesses once and folds every task's journal against that; `view` observes
 * afresh on each call. A task the engine has no record of is simply absent, which reads exactly as
 * `view`'s empty state does: no brief, so `unknown`. One whose journal does not read is in `unreadable` instead, and in no view
 * (`judgedUnlessUnreadable`).
 */
export async function everyView(): Promise<{ views: Views; unreadable: Unreadable }> {
  const listed = await e.list();
  return {
    views: new Map(listed.views.map((view) => [view.id, view])),
    unreadable: new Map(listed.unreadable.map(({ taskId, why }) => [taskId, why])),
  };
}

/**
 * The engine as a request that has read `views` sees it: `view` answers from them, and everything else is the engine's own. What the
 * package's `parentOf` is handed on the list and on a run's detail, so reading the runs a run waits on observes no harness again — the
 * list is what the Factory polls. A task the read did not see, filed since, is viewed.
 */
export const seenBy = (views: Views): typeof e => ({ ...e, view: async (taskId) => views.get(taskId) ?? e.view(taskId) });

/**
 * The run's workflow folder, read now.
 *
 * The run record is the truth about what ran; the folder is only where the prose came from, and it
 * can be edited or deleted after `wf start`. So a folder that no longer reads is a warning on the
 * run, not a failure of the request — and on a run that froze its workflow, nothing the page draws
 * comes from it. The case that made this so: an api older than the package's parser refused the
 * folder's newer keys, and every step of a run whose record had the whole graph read as a root.
 */
export function workflowsOf(run: Run): { steps: Workflow[]; warning: null } | { steps: null; warning: string } {
  try {
    // Its agents and skills looked for where the start looked: the run's repository's `.claude/`, then yours.
    return { steps: loadWorkflows(run.workflowDir, { repo: run.repo, home: HOME }), warning: null };
  } catch (err) {
    const why = fs.existsSync(run.workflowDir)
      ? `The workflow folder ${run.workflowDir} no longer reads as a workflow: ${(err as Error).message}.`
      : `The workflow folder ${run.workflowDir} is gone.`;
    return {
      steps: null,
      warning: run.workflow
        ? `${why} Nothing here is read from it: the steps, their spec, prose and graph are the workflow the run froze at \`wf start\`, which is what it is judged by.`
        : `${why} The steps are listed from the run record, without their spec or prose.`,
    };
  }
}

/**
 * Which steps a run has, in the order to show them.
 *
 * Every step on the record, in the record's order — the workflow's order when the run started —
 * because the record is the truth about what ran, whatever the folder says now; `wf decide` reads
 * the record too. Then any step the workflow the tick reads (`stepsOf` in store.ts) has and the record
 * does not. On a run that froze its workflow that is the frozen one, so a step the folder gained since is
 * not shown: the tick never files it, and drawn, it would wait for ever and make a root of the graph the
 * run froze — `driftOf` names it instead. On a record from before runs froze one, the folder, whose added
 * steps the tick does file.
 */
export function stepNames(run: Run, workflows: readonly Workflow[] | null): string[] {
  const added = (run.workflow ?? workflows ?? []).map((s) => s.name).filter((name) => !Object.hasOwn(run.steps, name));
  return [...Object.keys(run.steps), ...added];
}

/**
 * The steps a run is judged by: the workflow it froze at `wf start`, which the tick reads (`stepsOf` in
 * store.ts), and for a record from before runs froze one, the folder. A record whose folder no longer
 * reads is judged from the record alone, a `bare` step each.
 */
export const judgedSteps = (run: Run, folder: readonly Workflow[] | null): readonly Workflow[] =>
  run.workflow ?? folder ?? Object.keys(run.steps).map(bare);

/** A step nothing defines any more. All the record says of it is its name: no `after`, `check:` or `output:`. */
export const bare = (name: string): Workflow => ({ name, after: [], body: '' });

/**
 * When each task was filed, off the engine's feed (`readFilings`), and where the last read of it stopped: a task's view carries no filing
 * time, and the wait for a slot is filing → first attempt, and a run starts at its first filing (`runStartedAt`). Read on from the cursor on
 * each detail and each list — a filing is written once and never changes — so a page polled every five seconds reads what was appended
 * since. A read's cache: a fresh process reads the feed from the start.
 */
const filings = { filed: new Map<string, string>(), cursor: 0 };

/** Every task's filing time the feed has, read on from where the last read stopped. A feed that cannot be read this time leaves what was read before. */
export async function filedTimes(): Promise<ReadonlyMap<string, string>> {
  try {
    filings.cursor = (await readFilings(e, filings.cursor, filings.filed)).cursor;
  } catch {
    // The queue times of tasks filed since say `not known` until a read works.
  }
  return filings.filed;
}

/**
 * The folder a step of a folder run works in, off the run's record (`folderPlace` made it): null for a step of a git run, which
 * works on a branch, and for one the run has not filed yet, which has no folder.
 */
export const workFolderOf = (run: Run, step: string): string | null => (isGitRun(run) ? null : (run.steps[step]?.workspace ?? null));

/** Found among the runs the store has, not read by path, so no id can name a file outside it. */
export const findRun = (id: string): Run | undefined => listRuns().find((r) => r.id === id);

export const noSuchRun = (id: string) =>
  `No run '${id}' in this store. GET /api/runs (or \`wf ls\`) lists the runs it has; check WF_ROOT if you expected it here.`;

/**
 * The run and the task a step's routes read — null for a step not filed yet — or why there is no such step to read: no run by
 * that id, or no step by that name on the run's page.
 */
export function taskOfStep(id: string, step: string): { run: Run; taskId: string | null } | { error: string } {
  const run = findRun(id);
  if (!run) return { error: noSuchRun(id) };
  // The steps the run's page shows: those on the record, and any the folder has gained since.
  if (!stepNames(run, workflowsOf(run).steps).includes(step)) {
    return { error: `Run '${id}' has no step '${step}'. GET /api/runs/${id} lists the steps it has.` };
  }
  return { run, taskId: run.steps[step]?.taskId ?? null };
}
