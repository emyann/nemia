/** A step's tries, earliest first, each with its attempts and how it signed off, as the run's record keeps them. */
import type { RetryAsk } from 'agent-workflows';
import { answerOf, declaredOutput, type EarlierTry, parseCloseout, roundIn, type Run, type StepRecord, tryNote } from 'agent-workflows/run';
import { LOOP_REPLIES, outputFields, type Workflow } from 'agent-workflows/workflow';
import { artifactOf, type StepArtifact } from './artifacts.ts';
import { wordOf } from './judged.ts';
import { checkIn, type StepCheck } from './logs.ts';
import { bare, type Views } from './store.ts';

/** A loop's target's answer to one finding it was handed, as its closeout gave it. */
export type StepReply = { finding: string; answer: string; why: string };

/**
 * How a step signed off, when it did.
 *
 * `output` is what it gave of the fields its `output:` declares, and `missing` those it did not (`declaredOutput`). `replies`
 * is a loop's target's answer to each finding it was handed, when its closeout gave them. `artifacts` are the files it named,
 * each as `artifactOf` reads it: a file the api serves from the step's files directory, or the path alone.
 *
 * `schema` is the JSON Schema of each field asked about — given or missing — off the workflow the run froze, so the board can
 * draw a value by what it was declared to be and say what a field means. `raw` is the statement as the engine recorded it,
 * untouched: the fields above are read forgivingly (`parseCloseout`, `replyOf`), and a person may want what the agent said.
 */
export type StepCloseout = {
  outcome: 'done' | 'blocked';
  summary: string;
  needs: string | null;
  artifacts: StepArtifact[];
  output: Record<string, unknown>;
  missing: string[];
  replies: StepReply[] | null;
  schema: Record<string, unknown>;
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
 * `round`, `retries`, or the mode a person asked for — and null on the current try, which `current` marks. `note` is how the
 * try was reached, in `wf ls`'s words (`tryNote`), and null on the first. `status` on the current try is the step's word, as on
 * the step; on an earlier one, the engine's own word for its task — `succeeded`, `failed` — since `wf ls` words only the try
 * that decides the step. `attempts`, `check` and `closeout` are the try's own, in the step's shapes.
 */
export type StepTry = {
  try: number;
  round: number;
  then: EarlierTry['then'] | null;
  current: boolean;
  taskId: string | null;
  note: string | null;
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
   * What a person said to this try when they asked for it (`answerOf`, off their ask file): the answer `wf decide` prints under the
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
 * How one try of a step signed off, off the engine's record of its task's last attempt — as `closeoutOf` reads the current try's —
 * with what it gave of the fields its step declares, its `replies`, and each file it named as `artifactOf` reads it. Null for a
 * try that gave none, and for one whose closeout could not be read, which `unreadableIn` answers for.
 */
export function closeoutIn(run: Run, name: string, step: Workflow, taskId: string | null, views: Views): StepCloseout | null {
  const said = taskId ? views.get(taskId)?.state.attempts.at(-1)?.closeout : undefined;
  const c = said === undefined ? undefined : parseCloseout(said);
  if (!c || 'error' in c) return null;
  // `replies` apart: a loop's target owes them beside what its step declares, and they are shown as answers, not as a field.
  const fields = outputFields(step).filter((field) => field !== LOOP_REPLIES);
  const { given, missing } = declaredOutput(step, c, fields);
  const replies = c.output?.[LOOP_REPLIES];
  const declared = step.output?.schema.properties ?? {};
  return {
    outcome: c.outcome,
    summary: c.summary,
    needs: c.needs ?? null,
    artifacts: c.artifacts.map((file) => artifactOf(run, name, file)),
    output: given,
    missing,
    replies: Array.isArray(replies) ? replies.map(replyOf) : null,
    // `fromEntries`, as `declaredOutput` does it: a field JSON names `__proto__` is a property of its own.
    schema: Object.fromEntries(fields.map((field) => [field, declared[field]])),
    raw: said,
  };
}

/** A try's statement that could not be read, off the same record as `closeoutIn`'s: why, and what it said, untouched. */
export function unreadableIn(taskId: string | null, views: Views): StepUnreadable | null {
  const said = taskId ? views.get(taskId)?.state.attempts.at(-1)?.closeout : undefined;
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
 * A step's tries, earliest first: each one its record keeps behind the current (`StepRecord.tries`), then the current, whose
 * word, check, closeout and attempts the step already has. Off the views already read (`viewsOf`), with no observation of its
 * own: an earlier refused check's stderr is a file, and its output is not read. What a person said to each try is off the
 * answers the request read (`readAnswers`).
 */
export function triesOf(
  run: Run,
  name: string,
  steps: readonly Workflow[],
  views: Views,
  current: Pick<StepTry, 'status' | 'check' | 'closeout' | 'unreadable' | 'attempts'>,
  answers: readonly RetryAsk[],
): StepTry[] {
  const step = steps.find((s) => s.name === name) ?? bare(name);
  const record = run.steps[name];
  const earlier = record?.tries ?? [];
  // The step's record as it stood on its n-th try: the tries behind that one.
  const recordAt = (n: number): StepRecord => ({ taskId: null, tries: earlier.slice(0, n - 1) });
  // What a person said to the n-th try, asked of the record as it stood then: `answerOf` reads a step's current try.
  const answerAt = (n: number): string | null => answerOf({ ...run, steps: { ...run.steps, [name]: recordAt(n) } }, name, answers)?.message ?? null;
  // How the n-th try was reached, as `wf ls` words it for a record on that try — `answered`, when a person answered it.
  const noteOf = (n: number) => tryNote(step, recordAt(n), steps, answerAt(n) !== null) || null;
  return [
    ...earlier.map((t, i): StepTry => ({
      try: i + 1,
      round: roundIn({ taskId: null, tries: earlier.slice(0, i) }),
      then: t.then,
      current: false,
      taskId: t.taskId,
      note: noteOf(i + 1),
      status: wordOf(views)(t.taskId),
      attempts: attemptsIn(t.taskId, views),
      check: step.check ? checkIn(step.check, t.check?.taskId, views) : null,
      closeout: closeoutIn(run, name, step, t.taskId, views),
      unreadable: unreadableIn(t.taskId, views),
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

/** Off the engine's view of a try's task. A try with no task, or one the engine has lost, has had none. */
export function attemptsIn(taskId: string | null, views: Views): StepAttempts {
  const attempts = (taskId && views.get(taskId)?.state.attempts) || [];
  const latest = attempts.at(-1);
  return {
    count: attempts.length,
    latest: latest ? { startedAt: latest.startedAt, ended: latest.ended, endedAt: latest.endedAt ?? null, reason: latest.reason } : null,
  };
}
