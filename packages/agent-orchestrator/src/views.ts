/**
 * What the runtime's views of a run's tasks say, read into the words the pure functions take: a task's phase, a step's closeout and
 * whether it was asked for one, what its sessions cost, what its check exited with and said, what was said to it, what the runs it waits
 * on concluded (`parentOf`), what each step consumed, and when each task was filed. A controller: it reads the runtime through the client
 * (`runtime-client.ts`), and the store's files beneath it, and files nothing — the tick (`tick.ts`), the verbs and the screens read through it.
 */
import fs from 'node:fs';
import { denialText, type Engine, type TaskView } from './runtime-client.ts';
import { lastLines, readVerdict, stdoutTail, type CheckRefusal, type Verdict } from './check.ts';
import type { Consumed } from './radius.ts';
import type { Workflow } from './workflow.ts';
import { decision, gated, resultSteps, taskSpend, type CloseoutAsked, type ParentRun, type Run, type Said, type SpendOf, type TaskPhase } from './run.ts';
import { parseCloseout, type Closeout } from './closeout.ts';
import { taskUsage } from './timeline.ts';
import { checkStderr, readAsks, stepsOf } from './store.ts';
import { parentRecord, shippedOf } from './branches.ts';
import { continuesFrom } from './retry.ts';

/**
 * The engine's task phases, narrowed to what a run cares about.
 *
 * A task the engine has never heard of is `unknown`, NOT `pending`. It folds to the same empty
 * state as one that is filed and waiting for a slot — `settled: null`, zero attempts — and the one
 * thing that tells them apart is that a filed task has the brief it was filed with.
 *
 * Worth the line, because `pending` counts as in flight. A run whose engine board has since been
 * cleared read as running for ever: `wf cancel` claimed to stop steps nobody can find, and
 * `wf decide` said "still running". `unknown` was in the type for this and was simply unreachable.
 * Found by the `wf rm` run (34774e0), whose verb was not kept; this was.
 *
 * Exported, log-free, so a consumer narrows a view as the tick does. No view at all is `unknown` too.
 */
export const phaseOfView = (v: TaskView | undefined): TaskPhase => {
  if (!v) return 'unknown';
  if (v.state.settled) return v.state.settled;
  if (v.state.attempts.length) return 'running';
  return v.state.brief ? 'pending' : 'unknown';
};

/**
 * The engine's word on every task this run has filed, read once.
 *
 * One read per task per pass, shared by everything that then wants an answer: `advance` needs the
 * views themselves (for the session id a `resume:` step continues), and the pure functions need
 * only the phase.
 *
 * `earlierTries` reads each try a step has left behind as well. They are read for one thing — what the step's tries have cost together,
 * which the cap in force on it is held to (`stepSpend`, `overBudget`, `budgetUsdFor`) — and every reader of that is gated on there being a
 * cap (`budgetOf`), so with none in force they are read and never asked. A screen reads them all the same (`decide` prints what a run cost
 * and its timeline over every try), and so does anything that must answer for a try that is over. The tick does not: `advance` asks for
 * them only while a cap is in force, because a step answered without limit — the supervisor, which is answered for as long as a person
 * keeps answering — would otherwise add one journal read per answer to every pass of every four seconds, for ever, buying nothing.
 */
export async function taskPhases(e: Engine, run: Run, { earlierTries = true }: { earlierTries?: boolean } = {}): Promise<{
  views: Map<string, TaskView>;
  phaseOf: (taskId: string) => TaskPhase;
}> {
  const views = new Map<string, TaskView>();
  for (const { taskId, check, tries } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, await e.view(taskId));
    if (check) views.set(check.taskId, await e.view(check.taskId));
    // A settled task is read off its journal, and asks no harness — but it is still a read, once per try per pass.
    if (earlierTries) for (const t of tries ?? []) if (!views.has(t.taskId)) views.set(t.taskId, await e.view(t.taskId));
  }
  return {
    views,
    phaseOf: (taskId) => phaseOfView(views.get(taskId)),
  };
}

/**
 * Whether a task's attempt ended without the closing statement its task asked for — the orchestrator's judgement since stage 4a, off
 * what the runtime reports: its harness let the session go `done` with `stated: false`. And, on a journal written before stage 4a,
 * the runtime's own old verdict, `reason: 'unsigned'` (an attempt it ended `failed`). An end with no `stated` key is not read as a
 * missing statement: a `done` with no closeout from before 2026-09-19 would otherwise read unsigned, and be nudged, long after.
 */
const unsignedEnd = (state: TaskView['state'], a: TaskView['state']['attempts'][number] | undefined): boolean =>
  state.closeoutSchema !== undefined && a !== undefined && a.closeout === undefined
  && (a.reason === 'unsigned' || (a.ended === 'done' && a.stated === false));

/**
 * Whether a task was asked for a closeout: the schema the engine keeps on its record of the filing — and `unsigned` when its last
 * attempt ended without it (`unsignedEnd`), which the runtime reports and the orchestrator judges. What tells a step that ended
 * without one — `unsigned` — from a task that was never asked, and from one that failed. Exported, log-free, for a consumer that
 * words a step as `wf ls` does.
 */
export const closeoutAsked = (views: ReadonlyMap<string, TaskView>) => (taskId: string): CloseoutAsked => {
  const state = views.get(taskId)?.state;
  if (!state?.closeoutSchema) return false;
  return unsignedEnd(state, state.attempts.at(-1)) ? 'unsigned' : true;
};

/**
 * How an attempt ended, in the words a person has read for it since 2026-09-19: an attempt that ended without the statement its task
 * asked for is `failed`, `unsigned` — the orchestrator's word, off the runtime's `stated: false` (`unsignedEnd`) — and any other is as
 * the runtime recorded it. The one writer of those words for a surface that shows an attempt's end, so the board says what it said
 * when the runtime judged it: never read an attempt's raw `reason` for `unsigned`.
 */
export const endWords = (state: TaskView['state'], a: TaskView['state']['attempts'][number]): { ended: string | null; reason: string | null } =>
  unsignedEnd(state, a) ? { ended: 'failed', reason: 'unsigned' } : { ended: a.ended, reason: a.reason };

/**
 * Whether the harness marked a task's session blocked while its attempt runs — the engine's `needs-human` — off views already read. What
 * tells a step waiting on a person with nothing signed, as on a login refresh the harness lost, from one still working (`retryable`).
 * Exported, log-free, for a consumer that asks `retry` for such a step as `wf retry` does.
 */
export const harnessBlocked = (views: ReadonlyMap<string, TaskView>) => (taskId: string): boolean => views.get(taskId)?.phase === 'needs-human';

/**
 * What the harness says a task's blocked session waits for, in its own words (`TaskView.waitingFor`), off views already read — `permission
 * prompt`, as `claude agents --json` prints it. `undefined` for a task nobody is waiting on, and for a harness that says nothing: the
 * detached ones never do. Costs no observation of its own: the engine read it on the same pass it read the phase.
 *
 * Exported, log-free, for a consumer that words a step as `wf ls` does. The words themselves are `waitingWords` and `harnessWaitLine` in
 * run.ts, which is the only place this repository turns the harness's word into a sentence.
 */
export const waitingOf = (views: ReadonlyMap<string, TaskView>) => (taskId: string): string | undefined => views.get(taskId)?.waitingFor;

/**
 * What a task's sessions were denied, off views already read: every call the harness refused on an attempt that ended, as a permission rule
 * names it (`denialText`: `Skill(look)`, `Bash(pytest)`), each text once, in the order first denied. Empty for a task nobody read, one whose
 * attempts denied nothing, and one whose harness cannot say — a `background: true` session records none (the runtime's `Attempt.denials`) —
 * so an empty list is not a claim that nothing was denied. Costs no observation of its own: the denials are on the engine's journal.
 *
 * Every attempt of the task, not only its last: an attempt the engine started again within one filing is the same try, and what the first
 * was denied is still what the step could not do. A try is a task of its own (`checkTaskId`, `sessionTasks`), so the current try's task
 * says the current try's denials, and a try filed after them starts with none.
 *
 * Exported, log-free, for a consumer that words a step as `wf ls` does. The words themselves are `deniedWords` in run.ts.
 */
export const deniedOf = (views: ReadonlyMap<string, TaskView>) => (taskId: string): string[] =>
  [...new Set((views.get(taskId)?.state.attempts ?? []).flatMap((a) => (a.denials ?? []).map(denialText)))];

/**
 * What each task's sessions cost, off views already read (`taskSpend`): what holds a step to its `budget:`, and what `wf ls` and `wf decide`
 * print beside it — and what they were denied (`deniedOf`), which stops a step that says `denials: fail`. Exported, log-free, for a consumer that words a step as `wf ls` does. A task with no view read has no spend known.
 */
export const spendReader = (views: ReadonlyMap<string, TaskView>): SpendOf => (taskId) => {
  const spent = taskSpend(views.get(taskId));
  return spent && { ...spent, denied: deniedOf(views)(taskId) };
};

/**
 * What each step's current check exited with, off the engine's record: the code its process gave, or
 * `unfinished` when it gave none — killed by a signal, stopped, or never started — and `undefined` for a step
 * with no check filed. What the tick tells a refusal from a check that did not finish by (`refusedCheck`),
 * without reading a log: a run waiting on a person costs no more each pass. The check prints the code it exits
 * with, so this and the log's `[wf check] exit N`, which `wf ls` reads, agree.
 *
 * Exported for a consumer that words a check as `wf ls` does, without a `logs` call per refused check.
 */
export const exitVerdicts = (views: ReadonlyMap<string, TaskView>, run: Run) => (step: string): Verdict | undefined => {
  const taskId = run.steps[step]?.check?.taskId;
  if (!taskId) return undefined;
  // A check the operator or its deadline cut short did not finish, whatever code its process died with.
  const last = views.get(taskId)?.state.attempts.at(-1);
  return typeof last?.exitCode === 'number' && last.reason !== 'deadline' && last.reason !== 'operator' ? last.exitCode : 'unfinished';
};

/**
 * The harness's own id for the session a try after the task continues — what `--resume` takes: its last session's, or, where the harness
 * refused to start that one, the session it was filed to continue (`continuesFrom`).
 */
export const sessionIn = (views: ReadonlyMap<string, TaskView>, taskId: string): string | undefined =>
  continuesFrom(views.get(taskId)?.state.attempts);

/**
 * The engine's own word for a task's phase, off views already read — but `unknown` for a task it has no record of, as `phaseOfView` has it:
 * the engine folds that task to the state of one filed and waiting for a slot, and calls it `pending`, which is in flight. What `wf ls`
 * prints beside a step, and what the feed words it from (`feedPhase`).
 */
export const engineWord = (views: ReadonlyMap<string, TaskView>) => (taskId: string): string => {
  const v = views.get(taskId);
  return v?.state.brief ? v.phase : 'unknown';
};

/**
 * How many times a person said something to each step's current try while it ran (`wf say`): the engine's `said` on the try's task, off
 * views already read. Exported, log-free, for a consumer that words a step as `wf ls` does.
 */
export const saidCount = (views: ReadonlyMap<string, TaskView>, run: Run) => (stepName: string): number => {
  const taskId = run.steps[stepName]?.taskId;
  return (taskId ? views.get(taskId)?.state.said?.length : undefined) ?? 0;
};

/** What was said to a task's sessions while they ran (`wf say`), off its view: none for a task with no view, or one from before `said`. */
export const saidIn = (view: TaskView | undefined): readonly Said[] => view?.state.said ?? [];

/**
 * What a settled check said, for a person to read.
 *
 * `passed` is the engine's settled phase — the worker's reading of the exit code, and the only thing
 * the run gates on. The rest is evidence: the number from the log's last line, and the last lines of
 * each stream, kept apart because a loud stderr must not push a test runner's stdout verdict off the
 * screen.
 */
export type CheckReport = { command: string; passed: boolean; verdict: Verdict; stdout: string; stderr: string };

export async function checkReports(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  phaseOf: (taskId: string) => TaskPhase,
  want: (phase: TaskPhase) => boolean,
): Promise<Map<string, CheckReport>> {
  const reports = new Map<string, CheckReport>();
  for (const step of steps) {
    const taskId = run.steps[step.name]?.check?.taskId;
    if (!taskId || !step.check || !want(phaseOf(taskId))) continue;
    reports.set(step.name, { passed: phaseOf(taskId) === 'succeeded', ...(await refusalOf(e, step.check, taskId)) });
  }
  return reports;
}

/** What a check said, off its log and its stderr file: the verdict, and the last lines of each stream. */
export async function refusalOf(e: Engine, command: string, taskId: string): Promise<CheckRefusal> {
  const log = await e.logs(taskId);
  return { command, verdict: readVerdict(log), stdout: stdoutTail(log), stderr: lastLines(tailOf(checkStderr(taskId))) };
}

/** The end of a file that may be large, or absent — a check stopped before it started wrote none. */
function tailOf(file: string, bytes = 64_000): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const buf = Buffer.alloc(Math.min(size, bytes));
      fs.readSync(fd, buf, 0, buf.length, size - buf.length);
      return buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return ''; }
}

/**
 * Where the run's work ended up, for a person who now has to go and look at it.
 *
 * A branch, not a directory: the worktree is scaffolding and gets removed, the branch is the
 * result and stays in the repository. Reported as soon as a terminal step has a branch, so it is
 * useful while the run is still going, not only afterwards.
 */
/**
 * How a step signed off: its closing statement, as the engine recorded it on the attempt.
 *
 * The engine carries the payload and never reads it; this reads it. No git and no path — the step
 * made the statement to its harness, and it lives on the engine's record of the attempt that made
 * it, which is also what keeps a resumed step from being credited with its parent's.
 */
export function closeoutOf(views: ReadonlyMap<string, TaskView>, run: Run, stepName: string): Closeout | { error: string } | undefined {
  const taskId = run.steps[stepName]?.taskId;
  const said = taskId ? views.get(taskId)?.state.attempts.at(-1)?.closeout : undefined;
  return said === undefined ? undefined : parseCloseout(said);
}

/** Only the well-formed ones, for the pure functions that just want the outcome. */
export const closeoutReader = (views: ReadonlyMap<string, TaskView>, run: Run) => (stepName: string): Closeout | undefined => {
  const c = closeoutOf(views, run, stepName);
  return c && !('error' in c) ? c : undefined;
};

/**
 * A run another waits on (`--after`), read by the pass that asks and carried nowhere — what `runReady` and `waitsOf` are handed.
 *
 * Shipped is the run's own `wf decide`'s word, and nothing stricter or looser: `decision` says `shipped` — the run is not running, it was
 * not cancelled, and every result branch is on its base branch (`isShipped`), with work past its base or with every step succeeded. A child
 * starts when its parent's `wf decide` says shipped, and a child waits exactly while it does not. A result branch is cut at its run's base,
 * which is on the base branch, so a branch nobody has committed to is on it from the moment it is cut: a parent still running has not shipped
 * for that, nor one that ended failed, blocked or unsigned with nothing committed; one whose steps all signed off with nothing to commit has,
 * as its `wf decide` says. A run that worked on its base branch itself (`--no-worktree`) never has.
 *
 * Git first, which costs no harness observe: a result branch not on the base branch has not shipped, whatever the run's steps say. The
 * engine's view of the parent's tasks is read only once every one is.
 *
 * A result branch git no longer has is read by the tip the parent's own tick recorded once it had finished (`tipsSeen`, `isShipped`), so
 * the diamond's first parent merged and cleaned up while the second is still in review still counts. One whose tip git cannot find on
 * the base — dropped unmerged, or deleted before any tick saw its run finish — is `gone`, and not shipped. A run that started before the
 * branch was deleted never asks (`gated`).
 */
export async function parentOf(e: Engine, id: string): Promise<ParentRun> {
  const known = parentRecord(id);
  const { record } = known;
  if (!record || record.cancelledAt || known.gone) return { ...known, shipped: false };
  let steps: Workflow[];
  try { steps = stepsOf(record); } catch { return { ...known, shipped: false }; }
  const branches = resultSteps(steps).map((s) => record.steps[s.name]?.branch).filter((b): b is string => Boolean(b));
  if (!branches.length || !branches.every(shippedOf(record))) return { ...known, shipped: false };
  const { views, phaseOf } = await taskPhases(e, record);
  const { asks, rounds } = readAsks(id);
  const said = decision(steps, record, phaseOf, shippedOf(record), closeoutReader(views, record), closeoutAsked(views), exitVerdicts(views, record), asks, rounds, () => false, spendReader(views));
  return { ...known, shipped: said.kind === 'shipped' };
}

/**
 * The runs this run waits on, each read once (`parentOf`) — and none, without a look, for a run the gate no longer applies to (`gated`).
 * And the runs a person holds it until (`Run.hold`), for as long as the hold stands.
 */
export async function parentsOf(e: Engine, run: Run): Promise<(id: string) => ParentRun> {
  const read = new Map<string, ParentRun>();
  const ids = [...(gated(run) ? run.after! : []), ...(run.hold && !run.cancelledAt ? run.hold.until : [])];
  for (const id of new Set(ids)) read.set(id, await parentOf(e, id));
  return (id) => read.get(id) ?? { shipped: false };
}

/**
 * What each step's current task consumed, summed over its attempts (`sumUsage`): the try whose closeout
 * and check `wf decide` prints beside it. A settled attempt's usage is on the engine's record, the one in
 * flight on the view; an attempt that never started consumed nothing, and is left out.
 *
 * Off views already read, not a view of its own: each `e.view` is a harness observe (~300 ms, plan §4b),
 * so `decide` reads each task once and hands its views here.
 */
export function consumption(views: ReadonlyMap<string, TaskView>, run: Run): Record<string, Consumed | undefined> {
  const used: Record<string, Consumed | undefined> = {};
  for (const [name, { taskId }] of Object.entries(run.steps)) {
    const v = taskId ? views.get(taskId) : undefined;
    if (!v) continue;
    used[name] = taskUsage(v);
  }
  return used;
}

/**
 * When each task was filed, off the engine's feed from `after`, added to `into`: the one record of a filing time, since a task's view
 * carries none — and the time between filing and a first attempt is the wait for a slot (`timeline`). A filing is written once and never
 * changes, so a reader that keeps `into` and the cursor reads on from where it stopped. A feed that cannot be read rejects, as the engine's does.
 */
export async function readFilings(e: Engine, after = 0, into = new Map<string, string>()): Promise<{ filed: Map<string, string>; cursor: number }> {
  const { entries, cursor } = await e.feed(after);
  for (const { taskId, event } of entries) if (event.kind === 'filed') into.set(taskId, event.at);
  return { filed: into, cursor };
}
