/**
 * What a pass records of each step in the process's metrics (`STEP_METRICS`, `meter.verb.ts`): a try or a check that settled, a round a
 * loop was granted or ran out of, each with the attributes a series is kept by — the factory, the workflow, the step, its agent and the
 * outcome, and nothing else (`boundedAttributes`): a run's or a task's id would make a series of every run. And how long a step waited
 * outside its sessions once the wait ended (`WaitFact`): a session in the queue, its check's run, and a person at its gate. And each call
 * a harness denied one of its sessions (`DeniedFact`), which is no metric: a span of its own, with its run, its task and its tool. And,
 * once a run is over, each number of its timeline (`TimelineFact`), a span of its own too.
 *
 * Pure: the tick hands it the run and what the pass already read of its tasks; it reads nothing more, and nothing is carried from one pass
 * to the next. A settle is counted on the first pass that reads its task settled and does not find it among those the tick has counted
 * (`settlesCounted`, `settlesDue`); a record with no such mark counts none. A gate is
 * timed on the first pass that reads its approval and does not find it among those the tick has timed (`gatesTimed`), and a denied call is
 * counted on the first pass that reads its attempt ended and past those the tick has counted (`deniedCounted`). A gate approved on a try
 * that answered an earlier try's session is timed only while the run's timeline is still to hand over (`runTimed` is `false`).
 */
import path from 'node:path';
import { Invalid } from '../refusal/refusal.ts';
import { attemptVerdict } from '../check/check.ts';
import type { Run } from '../record/record.ts';
import type { Closeout } from '../closeout/index.ts';
import type { StepStatus } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { DEFAULT_FACTORY } from '../factory/factory.ts';
import type { SpendOf } from '../status/status.ts';
import { hasGate } from '../status/status.ts';
import {
  gateWaitOf,
  ranMs,
  taskUsage,
  timeline,
  timelineRows,
  type AttemptClock,
  type TaskClock,
  type TimelineRow,
  type TimelineTry,
} from '../timeline/index.ts';

/** The only attributes a step's metric carries: a series for each, never one for each run. */
export const STEP_ATTRIBUTE_KEYS: readonly string[] = ['factory', 'workflow', 'step', 'agent', 'outcome'];

/**
 * `attributes`, as they are, once every key is one of `STEP_ATTRIBUTE_KEYS`. Refuses (`Invalid`) the first key that is not, naming it: a
 * run's id, a task's, or anything else that grows with the store.
 */
export function boundedAttributes(attributes: Readonly<Record<string, string>>): Record<string, string> {
  const loose = Object.keys(attributes).find((key) => !STEP_ATTRIBUTE_KEYS.includes(key));
  if (loose !== undefined) {
    throw new Invalid({
      message:
        `a step's metric carries the attribute "${loose}", which is not one of ${STEP_ATTRIBUTE_KEYS.join(', ')}: ` +
        "a run's or a task's id makes a series of every run, so record it by those five alone.",
    });
  }
  return { ...attributes };
}

/** The four labels a step is known by, beside a run or an outcome: the factory, the workflow, the step and its agent. */
export type StepKeys = { factory: string; workflow: string; step: string; agent: string };

/** The two labels a run is known by, whatever the step: its factory or the default, and its workflow's folder. */
const runKeys = (run: Pick<Run, 'factory' | 'workflowDir'>): Pick<StepKeys, 'factory' | 'workflow'> => ({
  factory: run.factory ?? DEFAULT_FACTORY,
  workflow: path.basename(run.workflowDir),
});

/**
 * The labels of `step` in `run`, the one source of both its metrics' attributes and its sessions' labels: the run's factory or the
 * default, its workflow's folder, the step, and its agent or `none`.
 */
export const stepKeys = (run: Pick<Run, 'factory' | 'workflowDir'>, step: Workflow): StepKeys => ({
  ...runKeys(run),
  step: step.name,
  agent: step.agent?.name ?? 'none',
});

/** The attributes of `step`'s metric in `run`, for `outcome`: its labels (`stepKeys`) and the outcome. */
export const stepAttributes = (run: Pick<Run, 'factory' | 'workflowDir'>, step: Workflow, outcome: string): Record<string, string> =>
  boundedAttributes({ ...stepKeys(run, step), outcome });

/**
 * One fact of a step a pass records: a session that settled (`try`), with what it cost in dollars where measured, its tokens where
 * measured and how long it ran; a check that settled (`check`); a round its loop was granted or ran out of (`round`); a wait outside the
 * step's sessions that ended (`WaitFact`); a call its harness denied one of its sessions (`DeniedFact`); a number of its run's timeline
 * once the run is over (`TimelineFact`). `attributes` are `stepAttributes`, the outcome among them: `done`, `blocked`, `failed` or
 * `stopped` for a try; `passed`, `refused` or `unfinished` for a check; `granted` or `exhausted` for a round.
 */
export type StepFact =
  | {
      metric: 'try';
      attributes: Record<string, string>;
      costUsd?: number;
      inputTokens?: number;
      outputTokens?: number;
      ms: number;
    }
  | { metric: 'check' | 'round'; attributes: Record<string, string> }
  | WaitFact
  | DeniedFact
  | TimelineFact;

/** A call a harness denied a session, as the engine keeps it on the attempt: the tool, and what of it where the harness said. */
export type DeniedCall = { tool: string; what?: string };

/**
 * The engine's view of a task, as far as a fact reads it: its attempts, a check's with its exit code and a session's with the calls it was
 * denied, its usage, and when it was filed.
 */
export type FactView = TaskClock & { state: { attempts: readonly FactAttempt[]; filedAt?: string } };

/** One attempt of a task, as far as a fact reads it: its clock, a check's exit code, and the calls a session's harness denied it. */
type FactAttempt = AttemptClock & { exitCode?: number | null; denials?: readonly DeniedCall[] };

/** What a pass already read, that a step's facts are read off: the views of the run's tasks, their spend, the closeouts, each status. */
export type FactReads = {
  views: ReadonlyMap<string, FactView>;
  spendOf: SpendOf;
  signedOff: (step: string) => Closeout | undefined;
  statusOf: (step: Workflow) => StepStatus;
};

/**
 * Each of a step's tasks, its session's and its check's, of every try: which it is. Each once, its first mention kept: a session held open
 * and answered is the step's task and one of its tries', and one task.
 */
function tasksOf(record: Run['steps'][string]): Array<{ taskId: string; metric: 'try' | 'check' }> {
  const all = [
    ...(record.taskId ? [{ taskId: record.taskId, metric: 'try' as const }] : []),
    ...(record.check ? [{ taskId: record.check.taskId, metric: 'check' as const }] : []),
    ...(record.tries ?? []).flatMap((t) => [
      { taskId: t.taskId, metric: 'try' as const },
      ...(t.check ? [{ taskId: t.check.taskId, metric: 'check' as const }] : []),
    ]),
  ];
  const seen = new Set<string>();
  return all.filter((t) => !seen.has(t.taskId) && seen.add(t.taskId));
}

/** How a session ended: `done` or `blocked` as it signed, the step's current one read off its closeout, else `failed` or `stopped`. */
export function tryOutcome(view: FactView, current: boolean, closeout: Closeout | undefined): string {
  if (view.state.settled !== 'succeeded') return view.state.settled ?? 'failed';
  return current && closeout?.outcome === 'blocked' ? 'blocked' : 'done';
}

/** How a check ended: `passed` on exit 0, `refused` on another exit, `unfinished` with none (`attemptVerdict`). */
export function checkOutcome(view: FactView): string {
  const verdict = attemptVerdict(view.state.attempts.at(-1));
  return verdict === 'unfinished' ? verdict : verdict === 0 ? 'passed' : 'refused';
}

/** The fact of one session that settled. */
function tryFact(run: Run, step: Workflow, taskId: string, view: FactView, reads: FactReads): StepFact {
  const record = run.steps[step.name];
  const outcome = tryOutcome(view, record?.taskId === taskId, reads.signedOff(step.name));
  const spend = reads.spendOf(taskId);
  const usage = taskUsage(view);
  return {
    metric: 'try',
    attributes: stepAttributes(run, step, outcome),
    ...(spend && spend.measured > 0 ? { costUsd: spend.usd } : {}),
    ...(usage?.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
    ...(usage?.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
    ms: ranMs(view),
  };
}

/**
 * The facts of `run`'s tasks that settled (`settled`), read before the pass files anything over them: a fact for each session and each
 * check, and a round `exhausted` for each step one of them leaves out of rounds. A task of another run, or one the pass has no view of,
 * is no fact.
 */
export function settledFacts(run: Run, steps: readonly Workflow[], settled: ReadonlySet<string>, reads: FactReads): StepFact[] {
  if (!settled.size) return [];
  return steps.flatMap((step) => {
    const record = run.steps[step.name];
    if (!record) return [];
    const facts = tasksOf(record).flatMap(({ taskId, metric }): StepFact[] => {
      const view = settled.has(taskId) ? reads.views.get(taskId) : undefined;
      if (!view) return [];
      if (metric === 'check') return [{ metric, attributes: stepAttributes(run, step, checkOutcome(view)) }];
      return [tryFact(run, step, taskId, view, reads)];
    });
    if (facts.length && reads.statusOf(step) === 'exhausted')
      facts.push({ metric: 'round', attributes: stepAttributes(run, step, 'exhausted') });
    return facts;
  });
}

/**
 * The tasks of `run` whose settle the tick has not handed the metrics: each task of its steps' records, a session's and a check's alike,
 * that its view says settled and the run's mark (`settlesCounted`) does not hold. Read off the record and the views alone, so a task
 * that settled while no daemon read is due on the first pass that reads it. A task the pass has no view of is not due, nor any
 * task of a record with no mark, written before the tick kept one.
 */
export function settlesDue(run: Run, steps: readonly Workflow[], views: ReadonlyMap<string, FactView>): Set<string> {
  const counted = run.settlesCounted;
  if (!counted) return new Set();
  const tasks = steps.flatMap((step) => tasksOf(run.steps[step.name] ?? { status: 'pending' }).map((t) => t.taskId));
  return new Set(tasks.filter((taskId) => views.get(taskId)?.state.settled && !counted.includes(taskId)));
}

/**
 * What a pass hands the metrics of `run`'s settled tasks, once: their facts (`settledFacts`) and the waits they ended (`settledWaits`),
 * for the tasks due by the run's mark (`settlesDue`), with that mark as it stands once they are handed over (`marks`), for the tick to
 * write. A record with no mark counts none, and no mark is made.
 */
export function settledOnce(
  run: Run,
  steps: readonly Workflow[],
  reads: FactReads,
): { facts: StepFact[]; marks: Pick<Run, 'settlesCounted'> } {
  const due = settlesDue(run, steps, reads.views);
  const facts = [...settledFacts(run, steps, due, reads), ...settledWaits(run, steps, due, reads)];
  return { facts, marks: due.size ? { settlesCounted: [...(run.settlesCounted ?? []), ...due] } : {} };
}

/** A round `granted` for each looping step whose loop the pass took round again (`looped`). */
export const roundsGranted = (run: Run, steps: readonly Workflow[], looped: readonly string[]): StepFact[] =>
  steps.filter((s) => looped.includes(s.name)).map((step) => ({ metric: 'round', attributes: stepAttributes(run, step, 'granted') }));

/** The three waits a step is timed by outside its sessions. */
export type Wait = 'queue' | 'check' | 'gate';

/**
 * One wait that ended: which (`wait`), the step's metric attributes with its outcome (`stepAttributes`) — the try's for a queue, the
 * verdict for a check, `approved` for a gate — and, for its span alone, the run and the try; when it began and ended, and how long, in ms.
 */
export type WaitFact = {
  metric: 'wait';
  wait: Wait;
  attributes: Record<string, string>;
  run: string;
  try: number;
  from: string;
  to: string;
  ms: number;
};

/** When a wait began and ended, and the ms between: never negative. */
export type Waited = { from: string; to: string; ms: number };

/** The interval from `from` to `to`, or null where either is not known. */
const between = (from: string | null | undefined, to: string | null | undefined): Waited | null =>
  from && to ? { from, to, ms: Math.max(0, Date.parse(to) - Date.parse(from)) } : null;

/** A task's wait in the queue: from its filing to its first attempt's spawn, the timeline's `queuedMs`; null where either is not known. */
export const queueWait = (view: FactView): Waited | null =>
  between(view.state.filedAt, view.state.attempts.find((a) => a.spawnedAt)?.spawnedAt);

/**
 * A check's run: from its first attempt's spawn to its last attempt's end, the timeline's `ranMs` of a check; null where either is not
 * known.
 */
export const checkWait = (view: FactView): Waited | null =>
  between(view.state.attempts.find((a) => a.spawnedAt)?.spawnedAt, view.state.attempts.at(-1)?.endedAt);

/** Each task of a step's record, its session's and its check's, with the try it was first filed for: a recheck's session is not its own. */
function triesOf(record: Run['steps'][string]): Array<{ taskId: string; try: number; check: boolean }> {
  const tries = [...(record.tries ?? []), ...(record.taskId ? [{ taskId: record.taskId, check: record.check }] : [])];
  const seen = new Set<string>();
  return tries.flatMap((t, i) => {
    const session = seen.has(t.taskId) ? [] : [{ taskId: t.taskId, try: i + 1, check: false }];
    seen.add(t.taskId);
    return [...session, ...(t.check ? [{ taskId: t.check.taskId, try: i + 1, check: true }] : [])];
  });
}

/**
 * The queue of each session and the run of each check of `run` that settled (`settled`), off what the pass read of them before it filed
 * anything over them. A task of another run, one the pass has no view of, and one never spawned are no fact.
 */
export function settledWaits(run: Run, steps: readonly Workflow[], settled: ReadonlySet<string>, reads: FactReads): WaitFact[] {
  if (!settled.size) return [];
  return steps.flatMap((step) => {
    const record = run.steps[step.name];
    if (!record) return [];
    return triesOf(record).flatMap((t): WaitFact[] => {
      const view = settled.has(t.taskId) ? reads.views.get(t.taskId) : undefined;
      const interval = view && (t.check ? checkWait(view) : queueWait(view));
      if (!view || !interval) return [];
      const outcome = t.check ? checkOutcome(view) : tryOutcome(view, record.taskId === t.taskId, reads.signedOff(step.name));
      const wait = t.check ? 'check' : 'queue';
      return [{ metric: 'wait', wait, attributes: stepAttributes(run, step, outcome), run: run.id, try: t.try, ...interval }];
    });
  });
}

/**
 * Whether try `t` ends at the turn it ran of an earlier try's session, with no check of its own, on a `run` whose timeline is handed over
 * or was never to be (`runTimed` other than `false`): a gate `gateWaits` leaves untimed, whatever pass reads it.
 */
const answeredLate = (run: Pick<Run, 'runTimed'>, t: TimelineTry): boolean => Boolean(t.turn) && !t.check && run.runTimed !== false;

/**
 * The gate wait of each approval of `run` at a gated step that the tick has not timed (`gatesTimed`), off its `timeline` of `views`: the ms
 * `gateWaitOf` gives, ending at the approval. None on a record with no `gatesTimed`, written before the tick timed gates; none for an
 * approval whose try is not on the timeline yet, or whose wait is not known, which a later pass times once it is. And none, ever, for a
 * wait read off the turn of a try that answered an earlier try's session (`answeredLate`) on a run whose timeline is not still to hand
 * over (`runTimed` other than `false`): such a gate of a run already handed over, or started before the mark, is never timed late.
 */
export function gateWaits(run: Run, steps: readonly Workflow[], views: ReadonlyMap<string, TaskClock>): WaitFact[] {
  const timed = run.gatesTimed;
  if (!timed || !run.approvals?.length) return [];
  const tl = timeline(run, views, new Map(), steps);
  return run.approvals.flatMap((a): WaitFact[] => {
    const step = steps.find((s) => s.name === a.step);
    if (!step || !hasGate(step, run) || timed.some((g) => g.step === a.step && g.try === a.try)) return [];
    const t = tl.steps[a.step]?.find((x) => x.try === a.try);
    const ms = t && !answeredLate(run, t) ? gateWaitOf(run, tl, step, t) : null;
    if (ms === null) return [];
    const from = new Date(Date.parse(a.at) - ms).toISOString();
    return [
      { metric: 'wait', wait: 'gate', attributes: stepAttributes(run, step, 'approved'), run: run.id, try: a.try, from, to: a.at, ms },
    ];
  });
}

/**
 * What a pass hands the metrics once of `run`, and never again: each gate's wait not timed before (`gateWaits`) and each denied call not
 * counted before (`deniedCalls`), with the run's two marks as they stand once these are handed over (`marks`), for the tick to write:
 * `gatesTimed` with each gate timed, `deniedCounted` with each session's attempts counted through the last one read. A mark the record
 * has not is left out, and its facts are none.
 */
export function onceFacts(
  run: Run,
  steps: readonly Workflow[],
  views: ReadonlyMap<string, FactView>,
  callOf: (denial: DeniedCall) => string,
): { facts: StepFact[]; marks: Pick<Run, 'gatesTimed' | 'deniedCounted'> } {
  const gates = gateWaits(run, steps, views);
  const denied = deniedCalls(run, steps, views, callOf);
  const counted = new Map((run.deniedCounted ?? []).map((c) => [c.task, c.attempts]));
  for (const f of denied) counted.set(f.task, Math.max(counted.get(f.task) ?? 0, f.attempt));
  return {
    facts: [...gates, ...denied],
    marks: {
      ...(run.gatesTimed ? { gatesTimed: [...run.gatesTimed, ...gates.map((f) => ({ step: f.attributes.step, try: f.try }))] } : {}),
      ...(run.deniedCounted ? { deniedCounted: [...counted].map(([task, attempts]) => ({ task, attempts })) } : {}),
    },
  };
}

/**
 * One call a harness denied a step's session, for a span of its own and no metric: the step's four labels (`stepKeys`, no outcome: a call
 * is denied whatever its try comes to), the run, the session's task, the tool denied and the call as a permission rule names it
 * (`Skill(look)`), when its attempt ended (`at`), and which attempt of the task that was, from 1.
 */
export type DeniedFact = {
  metric: 'denied';
  attributes: Record<string, string>;
  run: string;
  task: string;
  tool: string;
  call: string;
  at: string;
  attempt: number;
};

/**
 * Each call the sessions of `run` were denied that the tick has not counted (`deniedCounted`), off `views`: every denial of every attempt
 * that ended, one per call, a call denied twice being two, as `nemia stats` counts them (`deniedCallsOf`) — whatever the attempt's turn
 * signed and whatever came of its try. Each session's task is read once, a check's never; an attempt before its task's mark, and one
 * still running, give none: a later pass counts the running one once it ends. None on a record with no `deniedCounted`, written before
 * the tick counted denials.
 *
 * @param callOf The call as a permission rule names it, in the runtime's words.
 */
export function deniedCalls(
  run: Run,
  steps: readonly Workflow[],
  views: ReadonlyMap<string, FactView>,
  callOf: (denial: DeniedCall) => string,
): DeniedFact[] {
  const counted = run.deniedCounted;
  if (!counted) return [];
  return steps.flatMap((step) => {
    const sessions = triesOf(run.steps[step.name] ?? { status: 'pending' }).filter((t) => !t.check);
    const attributes = { ...stepKeys(run, step) };
    return sessions.flatMap(({ taskId }) => {
      const from = counted.find((c) => c.task === taskId)?.attempts ?? 0;
      const attempts: readonly FactAttempt[] = views.get(taskId)?.state.attempts ?? [];
      return attempts.flatMap((a, i): DeniedFact[] => {
        if (i < from || a.ended === null || a.ended === undefined) return [];
        const at = a.endedAt ?? a.startedAt;
        return (a.denials ?? []).map((d) => ({
          metric: 'denied',
          attributes,
          run: run.id,
          task: taskId,
          tool: d.tool,
          call: callOf(d),
          at,
          attempt: i + 1,
        }));
      });
    });
  });
}

/**
 * One number of a run's timeline once the run is over (`TimelineRow`), for a span of its own and no metric: what it is a number of
 * (`of`), its row's name, which number (`part`) and its value, the run, and the try on a try's and a check's row. `attributes` are the
 * step's with the run's outcome on a try's, a check's and a step's row; the factory, the workflow and that outcome alone on a round's and
 * the run's, which are no step's.
 */
export type TimelineFact = {
  metric: 'timeline';
  attributes: Record<string, string>;
  run: string;
  of: TimelineRow['of'];
  row: string;
  part: TimelineRow['part'];
  value: number;
  try?: number;
};

/**
 * Each number of `run`'s timeline as a fact (`TimelineFact`), off `views`, which must hold every try's task and check, each filed when its
 * view says (`filedAt`): the rows `timelineRows` gives of the `timeline` the run's page reads. `outcome` is how the run ended. Null while
 * a task of the run is in flight, whose numbers are not the run's yet; `[]` for a run nothing was filed of.
 */
export function timelineFacts(
  run: Run,
  steps: readonly Workflow[],
  views: ReadonlyMap<string, FactView>,
  outcome: string,
): TimelineFact[] | null {
  const filed = new Map([...views].flatMap(([taskId, v]) => (v.state.filedAt ? [[taskId, v.state.filedAt] as const] : [])));
  const tl = timeline(run, views, filed, steps);
  if (tl.run.inFlight > 0) return null;
  return timelineRows(run, tl, steps).map((r): TimelineFact => {
    const step = steps.find((s) => s.name === r.step);
    return {
      metric: 'timeline',
      attributes: step ? stepAttributes(run, step, outcome) : boundedAttributes({ ...runKeys(run), outcome }),
      run: run.id,
      of: r.of,
      row: r.row,
      part: r.part,
      value: r.value,
      ...(r.try === null ? {} : { try: r.try }),
    };
  });
}
