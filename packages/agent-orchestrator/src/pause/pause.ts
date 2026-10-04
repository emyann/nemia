/**
 * The store's pause, which the runtime calls unschedulable: while it stands no pass starts new work — no step, try, round or check filed, no
 * queued task admitted, no queued card started — and what runs finishes. What still finishes under it (`finishingOf`), read off the views
 * on each pass and never stored, and its words: "Pausing" while anything finishes, "Paused" once nothing does, as `wf ls`, `wf feed`,
 * `wf start`, `wf up` and the board say it. Pure: its file is `pause.store.ts`'s, and the gates that honour it are `assess` and the tick's
 * `pass`.
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
 * check of a `landing` (an ending that lands on its check).
 */
export type Finishing = { run: string; step: string; kind: 'session' | 'check' | 'landing' };

/**
 * What a reader of the whole store is told of the pause: the pause, or null; each task still finishing under it, none once it is
 * "Paused"; and each landing it holds with its merge staged.
 */
export type Paused = { pause: Pause | null; finishing: Finishing[]; staged: PauseStaged[] };

/** The pause as a pass reads it while it stands: the pause, and each task still finishing under it. */
export type PauseStanding = { pause: Pause; finishing: Finishing[] };

/** A task's view as `finishingOf` reads it: the words' view (`WordView`), and whether the runtime holds it queued for a slot. */
export type FinishingView = WordView & { admission?: string };

/** How `wf resume` is typed, as every line that offers it says it. */
export const RESUME_LINE = 'wf resume';

/**
 * The tasks of `run` still at work, which the pause lets finish: each step's current task and its check's, pending or running. Left out:
 * one the runtime holds queued, which no pass admits under the pause; a session that waits on a person (`needs-human`), which holds no
 * slot and does no work until answered; and one with no view.
 */
export function finishingOf(run: Run, steps: readonly Workflow[], viewOf: (taskId: string) => FinishingView | undefined): Finishing[] {
  const finishing: Finishing[] = [];
  for (const step of steps) {
    const record = run.steps[step.name];
    const tasks = [
      [record?.taskId, 'session'],
      [record?.check?.taskId, landsOnCheck(step, run) ? 'landing' : 'check'],
    ] as const;
    for (const [taskId, kind] of tasks) {
      const view = taskId ? viewOf(taskId) : undefined;
      if (view && atWork(view)) finishing.push({ run: run.id, step: step.name, kind });
    }
  }
  return finishing;
}

/**
 * Each task still finishing under the pause among `runs` (`finishingOf`), each run's steps read (`stepsOf`) only where one of its current
 * tasks or checks is at work.
 */
export function finishingAmong(
  runs: readonly Run[],
  viewOf: (taskId: string) => FinishingView | undefined,
  stepsOf: (run: Run) => readonly Workflow[],
): Finishing[] {
  const live = (run: Run): boolean =>
    currentTasks(run).some((taskId) => {
      const view = viewOf(taskId);
      return view !== undefined && atWork(view);
    });
  return runs.filter(live).flatMap((run) => finishingOf(run, stepsOf(run), viewOf));
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
export const finishingWords = ({ run, step, kind }: Finishing): string =>
  `${run}'s ${step} is finishing: ${kind === 'session' ? 'its session is at work' : kind === 'check' ? 'its check runs' : 'the check of its landing runs'}`;

/** A landing the pause holds, in one line: its run, and the checkout its merge is staged in until the resume. */
export const stagedWords = ({ run, step, repo }: PauseStaged): string =>
  `${run}'s ${step} has its merge staged in ${repo} (MERGE_HEAD), and its check waits on ${RESUME_LINE}`;

/**
 * Every line said of the pause: none when the store is not paused, else the pause as it stands (`pausedWords`), then each task still
 * finishing and each landing it holds, indented.
 */
export const pausedLines = (paused: Pick<Paused, 'pause' | 'finishing'> & { staged?: readonly PauseStaged[] }): string[] => {
  const line = pausedWords(paused);
  if (line === null) return [];
  const staged = paused.staged ?? [];
  return [line, ...paused.finishing.map((f) => `   ${finishingWords(f)}`), ...staged.map((s) => `   ${stagedWords(s)}`)];
};

/** What `wf up` says once the pause it said is resumed. */
export const RESUMED = 'the store is resumed — the next pass files what waits';
