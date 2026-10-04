/**
 * The store's pause, which the runtime calls unschedulable: while it stands no pass starts new work — no step, try, round or check
 * filed, no queued task admitted, no queued card started — and what runs finishes. What still finishes under it (`finishingOf`), read off
 * the views on each pass and never stored, and its words: "Pausing" while anything finishes, "Paused" once nothing does, as `wf ls`,
 * `wf feed`, `wf start`, `wf up` and the board say it. Pure: its file is `pause.store.ts`'s, and the gates that honour it are `assess`
 * and the tick's `pass`.
 */
import type { Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
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

/**
 * A task still at work under the pause, which it lets finish: `run`'s `step`, as a `session` at work, the `check` of its work, or the
 * check of a `landing` (an ending that lands on its check) — and `stopping` once the engine was asked to stop it (`wf pause --now`).
 */
export type Finishing = { run: string; step: string; kind: 'session' | 'check' | 'landing'; stopping?: true };

/**
 * A task a pause at once stops (`wf pause --now`): `run`'s `step`, its `session` at work or the `check` of its work, by the task's id. A
 * landing is never one.
 */
export type Interrupt = { run: string; step: string; kind: 'session' | 'check'; taskId: string };

/**
 * What a reader of the whole store is told of the pause: the pause, or null; each task still finishing under it, none once it is
 * "Paused"; and each landing it holds with its merge staged.
 */
export type Paused = { pause: Pause | null; finishing: Finishing[]; staged: PauseStaged[] };

/** The pause as a pass reads it while it stands: the pause, each task still finishing under it, and each landing it holds staged. */
export type PauseStanding = { pause: Pause; finishing: Finishing[]; staged: PauseStaged[] };

/**
 * A task's view as `finishingOf` reads it: the words' view (`WordView`), whether the runtime holds it queued for a slot, and whether it was
 * asked to stop (`stopRequested`).
 */
export type FinishingView = WordView & { admission?: string; state: WordView['state'] & { stopRequested?: boolean } };

/** What a pause at once costs, as `wf pause --now` and the board's confirm say it before it is paid. */
export const NOW_COST = 'An interrupted step redoes its unfinished work and reads its context again.';

/** How `wf resume` is typed, as every line that offers it says it. */
export const RESUME_LINE = 'wf resume';

/**
 * The tasks of `run` still at work, which the pause lets finish: each step's current task and its check's, pending or running. Left out:
 * one the runtime holds queued, which no pass admits under the pause; a session that waits on a person (`needs-human`), which holds no
 * slot and does no work until answered; and one with no view.
 */
export function finishingOf(run: Run, steps: readonly Workflow[], viewOf: (taskId: string) => FinishingView | undefined): Finishing[] {
  return steps.flatMap((step) =>
    stepAtWork(run, step, viewOf).map(({ kind, view }) => ({
      run: run.id,
      step: step.name,
      kind: kind === 'check' && landsOnCheck(step, run) ? ('landing' as const) : kind,
      ...(view.state.stopRequested ? { stopping: true as const } : {}),
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
 * checkout (`workspace: main`), whose session, check and merge are a landing and finish, and one the engine was already asked to stop.
 */
export function interruptsOf(run: Run, steps: readonly Workflow[], viewOf: (taskId: string) => FinishingView | undefined): Interrupt[] {
  return steps
    .filter((step) => step.workspace !== 'main')
    .flatMap((step) =>
      stepAtWork(run, step, viewOf)
        .filter(({ view }) => !view.state.stopRequested)
        .map(({ taskId, kind }) => ({ run: run.id, step: step.name, kind, taskId })),
    );
}

/** Each task a pause at once stops among `runs` (`interruptsOf`), each run's steps read (`stepsOf`) only where one of its tasks is at work. */
export function interruptsAmong(
  runs: readonly Run[],
  viewOf: (taskId: string) => FinishingView | undefined,
  stepsOf: (run: Run) => readonly Workflow[],
): Interrupt[] {
  return runs.filter((run) => live(run, viewOf)).flatMap((run) => interruptsOf(run, stepsOf(run), viewOf));
}

/** Whether one of `run`'s current tasks or checks is at work. */
const live = (run: Run, viewOf: (taskId: string) => FinishingView | undefined): boolean =>
  currentTasks(run).some((taskId) => {
    const view = viewOf(taskId);
    return view !== undefined && atWork(view);
  });

/**
 * Each task still finishing under the pause among `runs` (`finishingOf`), each run's steps read (`stepsOf`) only where one of its current
 * tasks or checks is at work.
 */
export function finishingAmong(
  runs: readonly Run[],
  viewOf: (taskId: string) => FinishingView | undefined,
  stepsOf: (run: Run) => readonly Workflow[],
): Finishing[] {
  return runs.filter((run) => live(run, viewOf)).flatMap((run) => finishingOf(run, stepsOf(run), viewOf));
}

/** Every step's current task and its check's, of `run`: what may still be at work. */
export const currentTasks = (run: Run): string[] =>
  Object.values(run.steps).flatMap((s) => [s.taskId, s.check?.taskId].filter((id): id is string => Boolean(id)));

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

/**
 * The pause as it stands, in one line: "Pausing" with how many tasks still finish, or "Paused" once none does. Null when no pause stands.
 */
export const pausedWords = ({ pause, finishing }: Pick<Paused, 'pause' | 'finishing'>): string | null => {
  if (!pause) return null;
  return finishing.length
    ? `Pausing: ${finishing.length} finishing — the store is paused ${sinceWords(pause)}; nothing new starts, and what runs finishes; ${RESUME_LINE} resumes it`
    : `Paused ${sinceWords(pause)} — nothing runs and nothing new starts; ${RESUME_LINE} resumes it`;
};

/** A task still finishing under the pause, in one line: its run, its step, and what of it is at work. */
export const finishingWords = ({ run, step, kind, stopping }: Finishing): string =>
  `${run}'s ${step} is ${stopping ? 'stopping' : 'finishing'}: ${kind === 'session' ? `its session ${stopping ? 'was asked to stop' : 'is at work'}` : kind === 'check' ? `its check ${stopping ? 'was asked to stop' : 'runs'}` : 'the check of its landing runs'}`;

/** A task a pause at once stops, in words: its run, its step, and whether its session or its check. */
export const interruptWords = ({ run, step, kind }: Interrupt): string =>
  `${run}'s ${step}: its ${kind === 'session' ? 'session' : 'check'}`;

/** What a pause at once did, as `wf pause --now --yes` answers it: the pause, whether it stood already, what it stopped and left. */
export type PausedNow = { pause: Pause; kept: boolean; interrupted: Interrupt[]; skipped: Interrupt[] };

/** How `wf pause --now` acts once it is shown what it stops. */
export const NOW_LINE = 'wf pause --now --yes';

/**
 * What `wf pause --now` says before it acts: each task it would stop, what that costs (`NOW_COST`), that a landing finishes, and the line
 * that acts (`NOW_LINE`). With nothing at work, it says so.
 */
export const nowLines = (interrupts: readonly Interrupt[]): string[] => [
  interrupts.length
    ? `wf pause --now would pause the store and stop ${interrupts.length} at work, each tried again on ${RESUME_LINE}:`
    : 'wf pause --now would pause the store; nothing outside a landing is at work, so it stops nothing.',
  ...interrupts.map((i) => `   ${interruptWords(i)}`),
  `${NOW_COST} A landing that checks or merges is left to finish.`,
  `${NOW_LINE} does it.`,
];

/**
 * What `wf pause --now --yes` says once it acted: the pause put, or the one that stood kept as it was put; each task it stopped, or that
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

/**
 * Every line said of the pause: none when the store is not paused, else the pause as it stands (`pausedWords`), then each task still
 * finishing and each landing it holds, indented.
 */
export const pausedLines = (paused: Paused): string[] => {
  const line = pausedWords(paused);
  if (line === null) return [];
  return [line, ...paused.finishing.map((f) => `   ${finishingWords(f)}`), ...paused.staged.map((s) => `   ${stagedWords(s)}`)];
};

/** What `wf up` says once the pause it said is resumed. */
export const RESUMED = 'the store is resumed — the next pass files what waits';
