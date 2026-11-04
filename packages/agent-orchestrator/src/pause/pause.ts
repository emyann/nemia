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
import { parkedOf, phaseOfView, type WordView } from '../views/views-words.ts';

/**
 * A person's pause on the store, as its file says it: when it was put, who put it, and the person's words for why (`why`, absent when none
 * were given), each one line; and the timeout a call in flight is given before it is cut (`timeoutMs`), absent on a pause that parks no
 * session — the take-over's own, or one put before the timeout was written. A file that does not read gives each field empty, and still
 * pauses.
 */
export type Pause = { at: string; by: string; why?: string; timeoutMs?: number };

/** The timeout a store's pause gives a call in flight when nothing sets one: ten minutes (`pause-timeout.json`, `nemia pause-timeout`). */
export const DEFAULT_TIMEOUT_MS = 600_000;

/** The shortest timeout a pause takes: one second. */
export const MIN_TIMEOUT_MS = 1_000;

/** The longest timeout a pause takes: 23 hours, the runtime's bound on a held job (`JOB_HOLD_MS`), under its hook's own (`HOOK_HOLD_S`). */
export const MAX_TIMEOUT_MS = 23 * 3_600_000;

/** How a timeout is typed, as every refusal of one says it. */
export const TIMEOUT_FORM = 'digits and s, m or h, from 1s to 23h, as 90s, 10m or 2h';

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000 } as const;

/** The milliseconds `text` says by the form alone, bounds unread; undefined where it is not digits and one unit. */
const formOf = (text: string): number | undefined => {
  const m = /^(\d+)([smh])$/.exec(text.trim());
  return m ? Number(m[1]) * UNIT_MS[m[2] as keyof typeof UNIT_MS] : undefined;
};

/** Why `text` is no timeout, naming the form, or undefined for one that reads. */
export const timeoutRefusal = (text: string): string | undefined => {
  const ms = formOf(text);
  if (ms === undefined) return `a timeout is ${TIMEOUT_FORM}; it was given ${JSON.stringify(text)}`;
  return ms < MIN_TIMEOUT_MS || ms > MAX_TIMEOUT_MS
    ? `a timeout is from 1s to 23h (${TIMEOUT_FORM}); it was given ${JSON.stringify(text)}`
    : undefined;
};

/** The timeout `text` says, in milliseconds, or undefined where `timeoutRefusal` refuses it. */
export const timeoutOf = (text: string): number | undefined => (timeoutRefusal(text) === undefined ? formOf(text) : undefined);

/** Why `nemia pause`'s `--timeout` is refused: a timeout out of its form, or one given with `--now`, which cuts at once; null when none. */
export const pauseTimeoutRefusal = (timeout: string | undefined, now: boolean, shape: string): string | null => {
  if (timeout === undefined) return null;
  if (now) return `--timeout gives each call in flight a while to end, and --now cuts them at once: give one, ${shape}.`;
  const wrong = timeoutRefusal(timeout);
  return wrong === undefined ? null : `--timeout: ${wrong}: ${shape}, as nemia pause --timeout 10m.`;
};

/** A timeout in words, by its largest whole unit: `10m`, `90s`, `2h`. */
export const timeoutWords = (ms: number): string =>
  ms % 3_600_000 === 0 ? `${ms / 3_600_000}h` : ms % 60_000 === 0 ? `${ms / 60_000}m` : `${Math.round(ms / 1_000)}s`;

/**
 * How many sessions are still finishing a tool call under a pause and when what is left is cut, in one line, as the pause and a restart
 * say it while they wait: "Pausing: 2 sessions finishing a tool call, cut in 9 min". `leftMs` is rounded up to whole minutes, never
 * below one.
 */
export const pausingWords = (sessions: number, leftMs: number): string =>
  `Pausing: ${sessions} session${sessions === 1 ? '' : 's'} finishing a tool call, cut in ${Math.max(1, Math.ceil(leftMs / 60_000))} min`;

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
 * `nemia pause --now` wrote names it (`interrupted`), which runs a check again on the resume. A stop asked by another hand carries no
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
 * A task a pause at once cuts (`nemia pause --now`): `run`'s `step`, its `session` at work, whose tool call the sessions' drain cuts at
 * once and which goes on as the same try, or the `check` of its work, stopped and run again; by the task's id. A landing is never one.
 */
export type Interrupt = { run: string; step: string; kind: 'session' | 'check'; taskId: string };

/**
 * A session the pause has parked at a tool call's end: `run`'s `step`, held at its hook `after` its call to that tool where its harness
 * says it, or with its call to `cut` cut at the timeout's end. It continues as the same try once the store is resumed.
 */
export type Parked = { run: string; step: string; after?: string; cut?: string };

/**
 * What a reader of the whole store is told of the pause: the pause, or null; each task still finishing under it, none once it is
 * "Paused"; each session it has parked (`parked`); each landing it holds with its merge staged; and each other check it keeps from being
 * filed (`held`).
 */
export type Paused = { pause: Pause | null; finishing: Finishing[]; parked: Parked[]; staged: PauseStaged[]; held: PauseHeld[] };

/**
 * The pause as a pass reads it while it stands: the pause, each task still finishing under it, each session it has parked, each landing
 * it holds staged, and each other check it holds.
 */
export type PauseStanding = { pause: Pause; finishing: Finishing[]; parked: Parked[]; staged: PauseStaged[]; held: PauseHeld[] };

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
export const NOW_COST =
  'A session has its tool call cut and continues as the same try, told which call was cut; a check runs again from its start.';

/** How `nemia resume` is typed, as every line that offers it says it. */
export const RESUME_LINE = 'nemia resume';

/**
 * The tasks of `run` still at work, which the pause lets finish: each step's current task and its check's, pending or running. Left out:
 * one the runtime holds queued, which no pass admits under the pause; a session that waits on a person (`needs-human`), which holds no
 * slot and does no work until answered; a session the pause has parked (`parkedOf`); and one with no view. Each is `resumed` where one
 * of `asks`, the run's waiting asks, names it.
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

/** The session and the check of `step` in `run` at work (`atWork`), each with its task id and its view; a session parked is not. */
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
    return taskId && view && atWork(view) && !(kind === 'session' && parkedOf(view)) ? [{ taskId, kind, view }] : [];
  });
};

/** Each session among `runs` the pause has parked (`parkedOf`): a step's current task, read off `viewOf`. */
export const parkedAmong = (runs: readonly Run[], viewOf: (taskId: string) => FinishingView | undefined): Parked[] =>
  runs.flatMap((run) =>
    Object.entries(run.steps).flatMap(([step, record]) => {
      const parked = record.taskId ? parkedOf(viewOf(record.taskId)) : undefined;
      return parked ? [{ run: run.id, step, ...parked }] : [];
    }),
  );

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
 * it holds back (`staged` and `held`), when any. Under a pause with a timeout, while sessions finish, how many finish a tool call and in how
 * many minutes from `now` what is left is cut (`pausingWords`). Null when no pause stands.
 */
export const pausedWords = (paused: Pick<Paused, 'pause' | 'finishing' | 'staged' | 'held'>, now: Date = new Date()): string | null => {
  const { pause, finishing } = paused;
  if (!pause) return null;
  const sessions = finishing.filter((f) => f.kind === 'session').length;
  const head =
    pause.timeoutMs !== undefined && sessions
      ? pausingWords(sessions, Date.parse(pause.at) + pause.timeoutMs - now.getTime())
      : `Pausing: ${finishing.length} finishing`;
  return finishing.length
    ? `${head}${heldCount(paused)} — the store is paused ${sinceWords(pause)}; nothing new starts, and what runs finishes; ${RESUME_LINE} resumes it`
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

/** A session the pause has parked, in one line: its run and step, and the call it stopped after or the call cut. */
export const parkedWords = ({ run, step, after, cut }: Parked): string =>
  `${run}'s ${step} is paused${after ? ` after its call to ${after}` : cut ? `, its call to ${cut} cut` : ''}`;

/**
 * A task a pause at once cuts, in words: its run, its step, and whether its session, whose call is cut and which goes on as the same try,
 * or its check, run again.
 */
export const interruptWords = ({ run, step, kind }: Interrupt): string =>
  `${run}'s ${step}: ${kind === 'session' ? 'its session, its call cut, going on as the same try' : 'its check, run again'}`;

/** What a pause at once did, as `nemia pause --now --yes` answers it: the pause, whether it stood already, what it cut and left. */
export type PausedNow = { pause: Pause; kept: boolean; interrupted: Interrupt[]; skipped: Interrupt[] };

/** How `nemia pause --now` acts once it is shown what it stops. */
export const NOW_LINE = 'nemia pause --now --yes';

/**
 * What `nemia pause --now` says before it acts: that it would put the pause, or keep the one that stands (`standing`); each task it would
 * cut — a session's tool call, which goes on as the same try, or a check, run again — what that costs (`NOW_COST`), that a landing
 * finishes, and the line that acts (`NOW_LINE`). With nothing at work, it says so.
 */
export const nowLines = (interrupts: readonly Interrupt[], standing = false): string[] => {
  const pausing = standing ? "would keep the store's pause as it stands" : 'would pause the store';
  return [
    interrupts.length
      ? `nemia pause --now ${pausing} and cut ${interrupts.length} at work, each going on at ${RESUME_LINE}:`
      : `nemia pause --now ${pausing}; nothing outside a landing is at work, so it stops nothing.`,
    ...interrupts.map((i) => `   ${interruptWords(i)}`),
    `${NOW_COST} A landing that checks or merges is left to finish.`,
    `${NOW_LINE} does it.`,
  ];
};

/**
 * What `nemia pause --now --yes` says once it acted: the pause put, or the one that stood kept as it was put; each task it cut, or that
 * none was at work; each check it left at work, since a try of it was asked for already; and the cost.
 */
export const pausedNowLines = ({ pause, kept, interrupted, skipped }: PausedNow): string[] => [
  kept
    ? `the store's pause stands as it was put, ${sinceWords(pause)}; now what runs is cut`
    : `the store is paused at once ${sinceWords(pause)} — what runs is cut, and a landing finishes; ${RESUME_LINE} resumes it`,
  interrupted.length
    ? `cut ${interrupted.length}, each going on at ${RESUME_LINE}:`
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
 * Every line said of the pause at `now`: none when the store is not paused, else the pause as it stands (`pausedWords`), then each task
 * still finishing, each session parked (`parkedWords`) and each check it holds back (`heldLines`), indented.
 */
export const pausedLines = (paused: Paused, now: Date = new Date()): string[] => {
  const line = pausedWords(paused, now);
  if (line === null) return [];
  return [
    line,
    ...paused.finishing.map((f) => `   ${finishingWords(f)}`),
    ...paused.parked.map((p) => `   ${parkedWords(p)}`),
    ...heldLines(paused),
  ];
};

/** What `nemia up` says once the pause it said is resumed. */
export const RESUMED = 'the store is resumed — the next pass files what waits';
