/**
 * The store's pause, which the runtime calls unschedulable: while it stands no pass starts new work — no step, try, round or check
 * filed, no queued task admitted, no queued card started — and what runs finishes. What still finishes under it (`finishingOf`), read off
 * the views on each pass and never stored, and its words: "Pausing" while anything finishes, "Paused" once nothing does, as `nemia ls`,
 * `nemia watch --once`, `nemia start`, `nemia up` and the board say it. Pure: its file is `pause.store.ts`'s, and the gates that honour
 * it are `assess` and the tick's `pass`.
 */
import type { Run } from '../record/record.ts';
import type { RecordMemo } from '../rest/index.ts';
import type { RetryAsk } from '../retry/index.ts';
import { endsOnBase, type Workflow } from '../step/step.ts';
import { landsOnCheck } from '../status/status.ts';
import { phaseOfView, type WordView } from '../views/views-words.ts';

/**
 * A person's pause on the store, as its file says it: when it was put, who put it, and the person's words for why (`why`, absent when none
 * were given), each one line. A file that does not read gives each field empty, and still pauses.
 */
export type Pause = { at: string; by: string; why?: string };

/**
 * A landing the pause holds with its merge staged: the ending of `run`, `step`, whose session staged the merge in `repo`'s own checkout
 * and whose check is not filed until the resume, so MERGE_HEAD stays there meanwhile.
 */
export type PauseStaged = { run: string; step: string; repo: string };

/** A check the pause holds whose merge is not staged: `run`'s `step` has signed off, and its check is not filed until the resume. */
export type PauseHeld = { run: string; step: string };

/**
 * A task still at work under the pause, which it lets finish: `run`'s `step`, as a `session` at work, the `check` of its work, or the
 * check of a `landing` (an ending that lands on its check) — `stopping` once the engine was asked to stop it, and `resumed` while an ask
 * `nemia pause --now` wrote names it (`interrupted`), which tries it again on the resume. A stop asked by another hand carries no
 * `resumed`. `calling` is the tool a session is in a call to, which a stop of the daemon waits for.
 */
export type Finishing = {
  run: string;
  step: string;
  kind: 'session' | 'check' | 'landing';
  stopping?: true;
  resumed?: true;
  calling?: string;
};

/**
 * A task a pause at once stops (`nemia pause --now`): `run`'s `step`, its `session` at work or the `check` of its work, by the task's id. A
 * landing is never one.
 */
export type Interrupt = { run: string; step: string; kind: 'session' | 'check'; taskId: string };

/**
 * What a reader of the whole store is told of the pause: the pause, or null; each task still finishing under it, none once it is
 * "Paused"; each landing it holds with its merge staged; and each other check it keeps from being filed (`held`).
 */
export type Paused = { pause: Pause | null; finishing: Finishing[]; staged: PauseStaged[]; held: PauseHeld[] };

/**
 * The pause as a pass reads it while it stands: the pause, each task still finishing under it, each landing it holds staged, and each
 * other check it holds.
 */
export type PauseStanding = { pause: Pause; finishing: Finishing[]; staged: PauseStaged[]; held: PauseHeld[] };

/**
 * A task's view as `finishingOf` reads it: the words' view (`WordView`), whether the runtime holds it queued for a slot, and whether it was
 * asked to stop (`stopRequested`), and the tool call its session is in (`calling`).
 */
export type FinishingView = WordView & {
  admission?: string;
  calling?: { tool: string };
  state: WordView['state'] & { stopRequested?: boolean };
};

/** What a pause at once costs, as `nemia pause --now` and the board's confirm say it before it is paid. */
export const NOW_COST = 'An interrupted step redoes its unfinished work and reads its context again.';

/** How `nemia resume` is typed, as every line that offers it says it. */
export const RESUME_LINE = 'nemia resume';

/**
 * The tasks of `run` still at work, which the pause lets finish: each step's current task and its check's, pending or running. Left out:
 * one the runtime holds queued, which no pass admits under the pause; a session that waits on a person (`needs-human`), which holds no
 * slot and does no work until answered; and one with no view. Each is `resumed` where one of `asks`, the run's waiting asks, names it.
 */
export function finishingOf(
  run: Run,
  steps: readonly Workflow[],
  viewOf: (taskId: string) => FinishingView | undefined,
  asks: readonly RetryAsk[] = [],
): Finishing[] {
  return steps.flatMap((step) =>
    stepAtWork(run, step, viewOf).map(({ taskId, kind, view }) => ({
      run: run.id,
      step: step.name,
      kind: kind === 'check' && landsOnCheck(step, run) ? ('landing' as const) : kind,
      ...(view.state.stopRequested ? { stopping: true as const } : {}),
      ...(asks.some((a) => a.step === step.name && a.interrupted === taskId) ? { resumed: true as const } : {}),
      ...(kind === 'session' && view.calling ? { calling: view.calling.tool } : {}),
    })),
  );
}

/** The session and the check of `step` in `run` at work (`atWork`), each with its task id and its view. */
const stepAtWork = (
  run: Run,
  step: Workflow,
  viewOf: (taskId: string) => FinishingView | undefined,
): { taskId: string; kind: 'session' | 'check'; view: FinishingView }[] => {
  const record = run.steps[step.name];
  return (
    [
      [record?.taskId, 'session'],
      [record?.check?.taskId, 'check'],
    ] as const
  ).flatMap(([taskId, kind]) => {
    const view = taskId ? viewOf(taskId) : undefined;
    return taskId && view && atWork(view) ? [{ taskId, kind, view }] : [];
  });
};

/**
 * The tasks of `run` a pause at once stops: those still at work as `finishingOf` reads them, but a step's in the repository's own
 * checkout (`workspace: base`), whose session, check and merge are a landing and finish, and one the engine was already asked to stop.
 */
export function interruptsOf(run: Run, steps: readonly Workflow[], viewOf: (taskId: string) => FinishingView | undefined): Interrupt[] {
  return steps
    .filter((step) => !endsOnBase(step))
    .flatMap((step) =>
      stepAtWork(run, step, viewOf)
        .filter(({ view }) => !view.state.stopRequested)
        .map(({ taskId, kind }) => ({ run: run.id, step: step.name, kind, taskId })),
    );
}

/** Each task a pause at once stops among `runs` (`interruptsOf`), a run's steps read (`stepsOf`) only where one of its tasks is at work. */
export function interruptsAmong(
  runs: readonly Run[],
  viewOf: (taskId: string) => FinishingView | undefined,
  stepsOf: (run: Run) => readonly Workflow[],
): Interrupt[] {
  return runs.filter((run) => live(run, viewOf)).flatMap((run) => interruptsOf(run, stepsOf(run), viewOf));
}

/** Whether one of `run`'s current tasks or checks is at work. */
const live = (run: Pick<Run, 'steps'>, viewOf: (taskId: string) => FinishingView | undefined): boolean =>
  currentTasks(run).some((taskId) => atWorkNow(taskId, viewOf));

/**
 * Each task still finishing under the pause among `runs` (`finishingOf`), each run's steps read (`stepsOf`) and its waiting asks
 * (`asksOf`) only where one of its current tasks or checks is at work.
 */
export function finishingAmong(
  runs: readonly Run[],
  viewOf: (taskId: string) => FinishingView | undefined,
  stepsOf: (run: Run) => readonly Workflow[],
  asksOf: (run: Run) => readonly RetryAsk[] = () => [],
): Finishing[] {
  return runs.filter((run) => live(run, viewOf)).flatMap((run) => finishingOf(run, stepsOf(run), viewOf, asksOf(run)));
}

/** Every step's current task and its check's, of `run`: what may still be at work. */
export const currentTasks = (run: Pick<Run, 'steps'>): string[] =>
  Object.values(run.steps).flatMap((s) => [s.taskId, s.check?.taskId].filter((id): id is string => Boolean(id)));

/**
 * A run as a pause at once first reads it, before any record is: its id, whether a person called it off, and its steps' current tasks
 * (`currentTasks`). What a reader that polls keeps between its reads, so that the records it then reads are the live runs' alone.
 */
export type RunTasks = Pick<Run, 'id' | 'cancelledAt'> & { tasks: readonly string[] };

/** The memo a caller that polls what a pause at once would stop keeps of what it reads of every run (`RunTasks`). */
export type PauseRuns = RecordMemo<RunTasks>;

/**
 * The ids among `runs` one of whose current tasks is at work: the runs whose records a pause at once then reads, and no other. A run a
 * person called off is none, as `interruptsRead` leaves one out.
 */
export const liveAmong = (runs: readonly RunTasks[], viewOf: (taskId: string) => FinishingView | undefined): string[] =>
  runs
    .filter((run) => !run.cancelledAt)
    .filter((run) => run.tasks.some((taskId) => atWorkNow(taskId, viewOf)))
    .map((run) => run.id);

/** Whether the task `taskId` is at work, as `viewOf` sees it: nothing for one with no view. */
const atWorkNow = (taskId: string, viewOf: (taskId: string) => FinishingView | undefined): boolean => {
  const view = viewOf(taskId);
  return view !== undefined && atWork(view);
};

/** Whether a task's view is at work: pending or running, neither queued for a slot nor waiting on a person. */
const atWork = (view: FinishingView): boolean => {
  const phase = phaseOfView(view);
  return (phase === 'pending' || phase === 'running') && view.admission !== 'queued' && view.phase !== 'needs-human';
};

/** Since when, by whom and why, in words: what each line of the pause says of it. */
const sinceWords = ({ at, by, why }: Pause): string =>
  `since ${at || 'a time its file no longer says'} by ${by || 'someone its file no longer names'}${why ? `: ${why}` : ''}`;

/** The pause as it was put, in one line: since when, by whom and why, what it stops, and the verb that resumes. */
export const pauseWords = (pause: Pause): string =>
  `the store is paused ${sinceWords(pause)} — nothing new starts, and what runs finishes; ${RESUME_LINE} resumes it`;

/** How many checks the pause holds back, staged landings among them, in words: `, 2 checks held`, or nothing for none. */
const heldCount = ({ staged, held }: Pick<Paused, 'staged' | 'held'>): string => {
  const n = staged.length + held.length;
  return n ? `, ${n} check${n === 1 ? '' : 's'} held` : '';
};

/**
 * The pause as it stands, in one line: "Pausing" with how many tasks still finish, or "Paused" once none does, each with how many checks
 * it holds back (`staged` and `held`), when any. Null when no pause stands.
 */
export const pausedWords = (paused: Pick<Paused, 'pause' | 'finishing' | 'staged' | 'held'>): string | null => {
  const { pause, finishing } = paused;
  if (!pause) return null;
  return finishing.length
    ? `Pausing: ${finishing.length} finishing${heldCount(paused)} — the store is paused ${sinceWords(pause)}; nothing new starts, and what runs finishes; ${RESUME_LINE} resumes it`
    : `Paused ${sinceWords(pause)} — nothing runs and nothing new starts${heldCount(paused)}; ${RESUME_LINE} resumes it`;
};

/**
 * A task still finishing under the pause, in one line: its run, its step, and what of it is at work; once asked to stop, that it is
 * stopping, and that nemia resume tries it again only where a pause at once's ask names it (`resumed`); a session in a tool call names
 * the tool.
 */
export const finishingWords = ({ run, step, kind, stopping, resumed, calling }: Finishing): string =>
  stopping
    ? `${run}'s ${step} is stopping: its ${kind === 'session' ? 'session' : 'check'} was asked to stop${resumed ? `, and is tried again on ${RESUME_LINE}` : ''}`
    : `${run}'s ${step} is finishing: ${atWorkWords(kind, calling)}`;

/** What of a step is at work, in words: its session, in its call to `calling` where it is in one, its check, or its landing's. */
const atWorkWords = (kind: Finishing['kind'], calling: string | undefined): string => {
  if (kind === 'session') return calling ? `its call to ${calling} runs` : 'its session is at work';
  return kind === 'check' ? 'its check runs' : 'the check of its landing runs';
};

/** Each session still finishing under the pause that is in a tool call (`calling`): what a stop of the daemon waits for. */
export const callsOf = (paused: { finishing: readonly Finishing[] }): Finishing[] =>
  paused.finishing.filter((f) => f.calling !== undefined);

/** A task a pause at once stops, in words: its run, its step, and whether its session or its check. */
export const interruptWords = ({ run, step, kind }: Interrupt): string =>
  `${run}'s ${step}: its ${kind === 'session' ? 'session' : 'check'}`;

/** What a pause at once did, as `nemia pause --now --yes` answers it: the pause, whether it stood already, what it stopped and left. */
export type PausedNow = { pause: Pause; kept: boolean; interrupted: Interrupt[]; skipped: Interrupt[] };

/** How `nemia pause --now` acts once it is shown what it stops. */
export const NOW_LINE = 'nemia pause --now --yes';

/**
 * What `nemia pause --now` says before it acts: that it would put the pause, or keep the one that stands (`standing`); each task it would
 * stop, what that costs (`NOW_COST`), that a landing finishes, and the line that acts (`NOW_LINE`). With nothing at work, it says so.
 */
export const nowLines = (interrupts: readonly Interrupt[], standing = false): string[] => {
  const pausing = standing ? "would keep the store's pause as it stands" : 'would pause the store';
  return [
    interrupts.length
      ? `nemia pause --now ${pausing} and stop ${interrupts.length} at work, each tried again on ${RESUME_LINE}:`
      : `nemia pause --now ${pausing}; nothing outside a landing is at work, so it stops nothing.`,
    ...interrupts.map((i) => `   ${interruptWords(i)}`),
    `${NOW_COST} A landing that checks or merges is left to finish.`,
    `${NOW_LINE} does it.`,
  ];
};

/**
 * What `nemia pause --now --yes` says once it acted: the pause put, or the one that stood kept as it was put; each task it stopped, or that
 * none was at work; each it left at work, since a try of it was asked for already; and the cost.
 */
export const pausedNowLines = ({ pause, kept, interrupted, skipped }: PausedNow): string[] => [
  kept
    ? `the store's pause stands as it was put, ${sinceWords(pause)}; now what runs is asked to stop`
    : `the store is paused at once ${sinceWords(pause)} — what runs is asked to stop, and a landing finishes; ${RESUME_LINE} resumes it`,
  interrupted.length
    ? `asked to stop ${interrupted.length}, each tried again on ${RESUME_LINE}:`
    : 'nothing outside a landing was at work: nothing was stopped',
  ...interrupted.map((i) => `   ${interruptWords(i)}`),
  ...skipped.map((i) => `   ${interruptWords(i)} — left at work: a try of it is asked for already`),
  ...(interrupted.length ? [NOW_COST] : []),
];

/** A landing the pause holds, in one line: its run, and the checkout its merge is staged in until the resume. */
export const stagedWords = ({ run, step, repo }: PauseStaged): string =>
  `${run}'s ${step} has its merge staged in ${repo} (MERGE_HEAD), and its check waits on ${RESUME_LINE}`;

/** A check the pause holds, in one line: its run and step, signed off, and that its check waits on the resume. */
export const heldWords = ({ run, step }: PauseHeld): string => `${run}'s ${step} has signed off, and its check waits on ${RESUME_LINE}`;

/** Each check the pause holds back, a line each, indented: each landing with its merge staged (`stagedWords`), then each other. */
export const heldLines = ({ staged, held }: Pick<Paused, 'staged' | 'held'>): string[] => [
  ...staged.map((s) => `   ${stagedWords(s)}`),
  ...held.map((h) => `   ${heldWords(h)}`),
];

/**
 * Every line said of the pause: none when the store is not paused, else the pause as it stands (`pausedWords`), then each task still
 * finishing and each check it holds back (`heldLines`), indented.
 */
export const pausedLines = (paused: Paused): string[] => {
  const line = pausedWords(paused);
  if (line === null) return [];
  return [line, ...paused.finishing.map((f) => `   ${finishingWords(f)}`), ...heldLines(paused)];
};

/** What `nemia up` says once the pause it said is resumed. */
export const RESUMED = 'the store is resumed — the next pass files what waits';
