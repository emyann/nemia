/**
 * A command node (`run:`): a node of the workflow's graph that runs a shell line as a workload of its own on the command harness, with no
 * agent session, and signs off with a closeout the run writes for it (`commandCloseout`) off its task's last attempt — its exit code, and
 * the answer file its script left (`WF_ANSWER`, kept by the runtime at exit as the attempt's `terminationMessage`), which the node's
 * `output:` schema reads as any closeout's output is read. Every node signs off with a closeout: the session's own, a script condition's
 * answer, a command's exit. Pure.
 */
import { Result, Schema } from 'effect';
import { attemptVerdict } from '../check/index.ts';
import type { Closeout } from '../closeout/index.ts';
import { stepTaskId, tryOf, type Run } from '../record/record.ts';
import type { StepSpec } from '../step/step.ts';
import type { AttemptOf } from '../script/script.store.ts';

/** The file a command node writes its answer to, in its files folder: its typed fields, as one JSON object. */
export const COMMAND_ANSWER_FILE = 'command-answer.json';

/**
 * Whether a step is a command node: it has a `run:` line.
 * @param step The step read, or undefined where there is none.
 */
export const isCommandNode = (step: Pick<StepSpec, 'run'> | undefined): step is StepSpec & { run: string } => step?.run !== undefined;

const AnswerSchema = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown));

/**
 * The closeout a command node signs off with, off its current try's last attempt: `done` on exit 0, its output the answer its script wrote
 * (none where it wrote no file), and what it printed pointed at in its body; nothing on any other end — a non-zero exit reads `failed` and
 * one with no exit `stopped`, off its task's phase — nor on exit 0 with an answer that is not one JSON object, which reads `unsigned`.
 * @param step The command node read.
 * @param run The run whose record holds the node's current task.
 * @param attemptOf The last attempt of each task the pass viewed (`attemptIn`).
 */
export function commandCloseout(step: StepSpec & { run: string }, run: Run, attemptOf: AttemptOf) {
  const taskId = run.steps[step.name]?.taskId;
  if (!taskId || taskId !== stepTaskId(run, step.name, tryOf(run, step.name))) return undefined;
  const attempt = attemptOf(taskId);
  if (attemptVerdict(attempt) !== 0) return undefined;
  const text = attempt?.terminationMessage;
  const decoded = text === undefined || text.trim() === '' ? undefined : Schema.decodeUnknownResult(AnswerSchema)(text);
  if (decoded !== undefined && Result.isFailure(decoded)) return undefined;
  const output = decoded === undefined ? undefined : { ...decoded.success };
  const closeout: Closeout = {
    outcome: 'done',
    summary: `${step.name} exited 0`,
    body: `What it printed: \`ae logs ${taskId}\`; its stderr: \`ae output ${taskId} stderr\`.`,
    artifacts: [],
    ...(output === undefined || Object.keys(output).length === 0 ? {} : { output }),
  };
  return closeout;
}
