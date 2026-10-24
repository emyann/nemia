/**
 * A step's tries, earliest first, each with its attempts and how it signed off, as the run's record keeps them — and, of the revisions a
 * try ran on, the two drifts the run page shows: how the workflow folder has moved away from the steps the run started with (`driftOf`),
 * a name-level difference said as a warning, and the kinds the run and its filed steps are behind the ledger on (`kindsOf`).
 */
import {
  endWords,
  kindsDrift,
  type RetryAsk,
  bare,
  stepsDrift,
  type TaskView,
  topsOf,
  type Drift,
  type Views,
  wordOf,
} from 'agent-orchestrator';
import type { StepPhase, StepReason } from 'agent-orchestrator';
import {
  answerOf,
  type Asked,
  askedQuestions,
  declaredOutput,
  type EarlierTry,
  envelopeRefusals,
  parseCloseout,
  roundIn,
  type Run,
  type StepRecord,
  tryNote,
} from 'agent-orchestrator/run';
import { LOOP_REPLIES, outputFields, type Workflow } from 'agent-orchestrator/workflow';
import { artifactOf, valueOf, type StepArtifact, type StepValue } from '../steps/artifacts.ts';
import { checkIn, type CheckStderr, type StepCheck } from '../steps/logs.ts';

/** A loop's target's answer to one finding it was handed, as its closeout gave it. */
export type StepReply = { finding: string; answer: string; why: string };

/**
 * How a step signed off, when it did.
 *
 * `output` is what it gave of the fields its `output:` declares, and `missing` those it did not (`declaredOutput`). `replies`
 * is a loop's target's answer to each finding it was handed, when its closeout gave them. `artifacts` are the files it named,
 * each as `artifactOf` reads it: a file the api serves from the step's files directory, or the path alone; `values` the values it
 * handed on, each with a `link` where it is an http(s) address (`valueOf`).
 *
 * `apiVersion` is the version it was given in, null for one given before v1, which is converted on read; `summary` is one line, cut
 * (`summaryLine`), and `body` the markdown beneath it, null for none. `refused` is what the run does not accept of its envelope
 * (`envelopeRefusals`), each a sentence.
 *
 * `schema` is the JSON Schema of each field asked about — given or missing — off the workflow the run froze, so the board can
 * draw a value by what it was declared to be and say what a field means. `raw` is the statement as the engine recorded it,
 * untouched: the fields above are read forgivingly (`parseCloseout`, `replyOf`), and a person may want what the agent said.
 *
 * `questions` is what it asks a person through its question fields (`askedQuestions`): each field whose schema is the package's shape
 * of questions and whose value decodes as them, in the schema's order. Empty for a closeout that asks none; a field that does not decode
 * is in `output` alone, drawn as any other.
 */
export type StepCloseout = {
  apiVersion: string | null;
  outcome: 'done' | 'blocked';
  summary: string;
  body: string | null;
  needs: string | null;
  artifacts: StepArtifact[];
  values: StepValue[];
  refused: string[];
  output: Record<string, unknown>;
  missing: string[];
  replies: StepReply[] | null;
  schema: Record<string, unknown>;
  questions: Asked[];
  raw: unknown;
};

/**
 * A closing statement that `parseCloseout` could not read: its words for why, and the statement as it came. On the step and on each
 * try (`StepTry.unreadable`), where `closeout` is null.
 */
export type StepUnreadable = { error: string; raw: unknown };

/**
 * One try of a step, as the run's record keeps it: the tries behind the current one (`StepRecord.tries`), then the current.
 *
 * `try` counts from 1, and `round` is the round of its loop the try was filed in (`roundIn`). `then` is what replaced it —
 * `round`, `merge`, `retries`, or the mode a person asked for — and null on the current try, which `current` marks. `note` is how the
 * try was reached, in `nemia ls`'s words (`tryNote`), and null on the first. `status` on the current try is the step's word, as on
 * the step; on an earlier one, the engine's own word for its task — `succeeded`, `failed` — since `nemia ls` words only the try
 * that decides the step. `attempts`, `check` and `closeout` are the try's own, in the step's shapes.
 */
export type StepTry = {
  try: number;
  round: number;
  then: EarlierTry['then'] | null;
  current: boolean;
  taskId: string | null;
  note: string | null;
  /**
   * Where the try stands, as codes: the step's own on the current try, and on an earlier one the codes of its task's engine word
   * (`ENGINE_REASON`, `PHASE_OF`). `message` is the try's word, shown and never compared.
   */
  phase: StepPhase;
  reason: StepReason;
  message: string;
  /** @deprecated `message` under its old name, kept for one card. */
  status: string;
  attempts: StepAttempts;
  check: StepCheck | null;
  closeout: StepCloseout | null;
  /**
   * A statement the try gave that could not be read — why, and the statement as the engine recorded it — or null. `closeout` is null
   * then, and this is the only place what the agent said reaches the board.
   */
  unreadable: StepUnreadable | null;
  /**
   * What a person said to this try when they asked for it (`answerOf`, off their ask file): the answer `nemia decide` prints under the
   * `needs` of the try before as `your answer`. Null for a try nobody answered — and for every first try, which nobody asked for.
   */
  answer: string | null;
};

/** A step's attempts as the engine's view has them: how many, and when and how the latest went. */
export type StepAttempts = {
  count: number;
  latest: {
    startedAt: string;
    /** The harness's last word on the attempt — `done`, `failed`, `stopped`; null while it runs. */
    ended: string | null;
    /** When it ended: the `at` of the engine's `ended` event, kept as `Attempt.endedAt`; null while it runs. */
    endedAt: string | null;
    /** `harness` when the harness said it ended, `lost` when the engine stopped seeing it; null while it runs. */
    reason: string | null;
  } | null;
};

/**
 * A task's attempts on one turn, its current by default: a task held open and answered (`holdOpen`) is one try per turn under one id,
 * and an answer not yet started has no attempt on its turn, so the last attempt of the task is then the turn before's.
 */
const attemptsOn = (state: TaskView['state'] | undefined, turn?: number): TaskView['state']['attempts'] =>
  state ? state.attempts.filter((a) => (a.turn ?? 0) === (turn ?? state.inputs?.length ?? 0)) : [];

/**
 * How one try of a step signed off, off the engine's record of its turn's last attempt — as `closeoutOf` reads the current try's —
 * with what it gave of the fields its step declares, its `replies`, and each file it named as `artifactOf` reads it. Null for a
 * try that gave none, and for one whose closeout could not be read, which `unreadableIn` answers for. `replies` stand apart from the
 * declared fields: a loop's target owes them beside what its step declares, and they are shown as answers, not as a field. `schema` is
 * built with `fromEntries`, as `declaredOutput` builds its fields, so a field JSON names `__proto__` is a property of its own.
 */
export function closeoutIn(
  run: Run,
  name: string,
  step: Workflow,
  taskId: string | null,
  views: Views,
  turn?: number,
): StepCloseout | null {
  const said = taskId ? attemptsOn(views.get(taskId)?.state, turn).at(-1)?.closeout : undefined;
  const c = said === undefined ? undefined : parseCloseout(said);
  if (!c || 'error' in c) return null;
  const fields = outputFields(step).filter((field) => field !== LOOP_REPLIES);
  const { given, missing } = declaredOutput(step, c, fields);
  const replies = c.output?.[LOOP_REPLIES];
  const declared = step.output?.schema.properties ?? {};
  return {
    apiVersion: c.apiVersion ?? null,
    outcome: c.outcome,
    summary: c.summary,
    body: c.body ?? null,
    needs: c.needs ?? null,
    artifacts: c.artifacts.map((file) => artifactOf(run, name, file)),
    values: (c.values ?? []).map(valueOf),
    refused: envelopeRefusals(c),
    output: given,
    missing,
    replies: Array.isArray(replies) ? replies.map(replyOf) : null,
    schema: Object.fromEntries(fields.map((field) => [field, declared[field]])),
    questions: askedQuestions(step, c),
    raw: said,
  };
}

/** A try's statement that could not be read, off the same record as `closeoutIn`'s: why, and what it said, untouched. */
export function unreadableIn(taskId: string | null, views: Views, turn?: number): StepUnreadable | null {
  const said = taskId ? attemptsOn(views.get(taskId)?.state, turn).at(-1)?.closeout : undefined;
  if (said === undefined) return null;
  const c = parseCloseout(said);
  return 'error' in c ? { error: c.error, raw: said } : null;
}

/** One of a closeout's `replies`, forgivingly: the harness held it to its schema, and an agent filled it in. */
function replyOf(item: unknown): StepReply {
  const text = (value: unknown) => (typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value));
  if (!item || typeof item !== 'object' || Array.isArray(item)) return { finding: text(item), answer: '', why: '' };
  const { finding, answer, why } = item as Record<string, unknown>;
  return { finding: text(finding), answer: text(answer), why: text(why) };
}

/**
 * The turn of its task the earlier try `i` (from 0) of a step was: how many tries before it share its task and were no recheck. A task held
 * open and answered keeps each try a person answered under its one id, one turn each; a recheck replaces only the check, on the same turn.
 */
export const turnOfTry = (earlier: readonly EarlierTry[], i: number): number =>
  earlier.slice(0, i).filter((t) => t.taskId === earlier[i].taskId && t.then !== 'recheck').length;

/**
 * A step's tries, earliest first: each one its record keeps behind the current (`StepRecord.tries`), then the current, whose word, check,
 * closeout and attempts the step already has. Off the views already read (`viewsOf`), with no observation of its own: an earlier refused
 * check's stderr is read before (`refusedStderr`), and its stdout is not read. What a person said to each try is off the answers the
 * request read (the answers `runStore` keeps).
 *
 * An earlier try is read on the turn of its task it was: a held task a person answered keeps each try they answered under its one id, and a
 * recheck replaces only the check, on the same task and turn, so it is no turn (as `turnsOf` counts them). Its status is `succeeded` for a
 * turn a person answered, which signed and ended `done` for it, the task's own word being the turn it is on now. What a person said to a
 * try, and how it was reached as `nemia ls` words it — `answered`, when a person answered it — are read off the step's record as it stood
 * on that try, the tries behind it: `answerOf` reads a step's current try.
 */
export function triesOf(
  run: Run,
  name: string,
  steps: readonly Workflow[],
  views: Views,
  current: Pick<StepTry, 'status' | 'check' | 'closeout' | 'unreadable' | 'attempts'>,
  answers: readonly RetryAsk[],
  stderr: CheckStderr,
): StepTry[] {
  const step = steps.find((s) => s.name === name) ?? bare(name);
  const record = run.steps[name];
  const earlier = record?.tries ?? [];
  const turnAt = (i: number): number => turnOfTry(earlier, i);
  const recordAt = (n: number): StepRecord => ({ taskId: null, tries: earlier.slice(0, n - 1) });
  const answerAt = (n: number): string | null =>
    answerOf({ ...run, steps: { ...run.steps, [name]: recordAt(n) } }, name, answers)?.message ?? null;
  const noteOf = (n: number) => tryNote(step, recordAt(n), steps, answerAt(n) !== null) || null;
  return [
    ...earlier.map((t, i): StepTry => ({
      try: i + 1,
      round: roundIn({ taskId: null, tries: earlier.slice(0, i) }),
      then: t.then,
      current: false,
      taskId: t.taskId,
      note: noteOf(i + 1),
      status: turnAt(i) < (views.get(t.taskId)?.state.inputs?.length ?? 0) ? 'succeeded' : wordOf(views)(t.taskId),
      attempts: attemptsIn(t.taskId, views, turnAt(i)),
      check: step.check ? checkIn(step.check, t.check?.taskId, views, stderr) : null,
      closeout: closeoutIn(run, name, step, t.taskId, views, turnAt(i)),
      unreadable: unreadableIn(t.taskId, views, turnAt(i)),
      answer: answerAt(i + 1),
    })),
    {
      try: earlier.length + 1,
      round: roundIn(record),
      then: null,
      current: true,
      taskId: record?.taskId ?? null,
      note: noteOf(earlier.length + 1),
      ...current,
      answer: answerAt(earlier.length + 1),
    },
  ];
}

/**
 * A try's attempts (`StepAttempts`), off the engine's view of its task, on the turn it was (`attemptsOn`). A try with no task, or one the
 * engine has lost, has had none. How the latest ended is read through `endWords`: an end without the statement its task asked for is
 * `failed · unsigned`, the orchestrator's word, the runtime not judging it, and never the harness's `done` that the runtime records.
 */
export function attemptsIn(taskId: string | null, views: Views, turn?: number): StepAttempts {
  const state = taskId ? views.get(taskId)?.state : undefined;
  const attempts = attemptsOn(state, turn);
  const latest = attempts.at(-1);
  return {
    count: attempts.length,
    latest: state && latest ? { startedAt: latest.startedAt, ...endWords(state, latest), endedAt: latest.endedAt ?? null } : null,
  };
}

/** How the folder has moved away from the steps the run started with, or null if it has not. */
export function driftOf(run: Run, workflows: readonly Workflow[]): string | null {
  const inFolder = new Set(workflows.map((s) => s.name));
  const removed = Object.keys(run.steps).filter((name) => !inFolder.has(name));
  const added = workflows.map((s) => s.name).filter((name) => !Object.hasOwn(run.steps, name));
  const shown = run.workflow ? 'shown as the run froze it' : 'shown from the run record without spec or prose';
  const said = [
    ...(removed.length ? [`it no longer has ${removed.join(', ')}, ${shown}`] : []),
    ...(added.length
      ? [`it has ${added.join(', ')}, which the run did not start with${run.workflow ? ' and will never file, so it is not shown' : ''}`]
      : []),
  ];
  return said.length ? `The workflow folder ${run.workflowDir} has changed since this run started: ${said.join('; ')}.` : null;
}

/**
 * The kinds the run is behind the ledger on (`kindsDrift`, `stepsDrift`): its own pins, and those a filed step ran on that the run has
 * since moved past. The ledger is read once, for the kinds the run names and no others; a run that pinned nothing reads none, and nothing
 * is read for it.
 *
 * The ledger, not a resolve: a number here is one the ledger holds for a content anything resolved, so a kind edited and then reverted to
 * the content the run pins reads as behind the ledger's last number while `nemia refresh` answers that there is nothing to take — the verb
 * resolves to answer (`refreshedNow`), and a page's read does not pay a resolve. The board says these numbers as the ledger's for that
 * reason (`behindWords`).
 */
export function kindsOf(run: Run): readonly Drift[] {
  const steps = Object.entries(run.steps).map(([name, record]) => [name, record.pinned] as const);
  const named = [...(run.pinned ?? []), ...steps.flatMap(([, pins]) => pins ?? [])].map(({ kind, name }) => ({ kind, name }));
  if (!named.length) return [];
  const tops = topsOf(named);
  return [...kindsDrift(run.pinned, tops), ...stepsDrift(steps, run.pinned, tops)];
}
