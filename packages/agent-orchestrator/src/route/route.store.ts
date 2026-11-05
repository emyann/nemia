/**
 * A script condition's answer file, decoded, and what its task said (`scriptRead`, `scriptCloseouts`): the text the runtime kept of the
 * file at exit (the attempt's `terminationMessage`) read strictly as the design's answer, `{ route, why?, evidence? }` or
 * `{ unsure, evidence? }`, before `scriptRoute` reads it. Fields it does not name are ignored.
 */
import { Result, Schema } from 'effect';
import { attemptVerdict } from '../check/check.ts';
import { summaryLine, type Closeout } from '../closeout/index.ts';
import { stepTaskId, tryOf, type Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { scriptRoute, type ScriptAnswer, type ScriptRead } from './route.ts';

/** A task's last attempt, as far as a script condition reads it: its exit and the answer file the runtime kept. */
export type AttemptOf = (taskId: string) => { exitCode?: number | null; reason?: string | null; terminationMessage?: string } | undefined;

/** The last attempt of each task the pass viewed. */
export const attemptIn =
  (views: ReadonlyMap<string, { state: { attempts: readonly NonNullable<ReturnType<AttemptOf>>[] } }>): AttemptOf =>
  (taskId) =>
    views.get(taskId)?.state.attempts.at(-1);

/** A condition whose eval is a script. */
export const isScript = (step: Workflow | undefined): step is Workflow & { routes: string[] } =>
  step?.routes !== undefined && step.route?.kind === 'script';

const AnswerSchema = Schema.Struct({
  route: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  why: Schema.optional(Schema.String),
  unsure: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  evidence: Schema.optional(Schema.Unknown),
});

/**
 * The answer a script left, or undefined where it left none the run can use: no text, text that is not one JSON object, an answer with
 * both `route` and `unsure` or with neither, or a field of the wrong type.
 */
export function scriptAnswerOf(text: string | undefined): ScriptAnswer | undefined {
  if (text === undefined) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  const decoded = Schema.decodeUnknownResult(AnswerSchema)(raw);
  if (Result.isFailure(decoded)) return undefined;
  const { route, why, unsure } = decoded.success;
  if (route !== undefined && unsure === undefined) return { kind: 'route', route, ...(why === undefined ? {} : { why }) };
  if (unsure !== undefined && route === undefined) return { kind: 'unsure', unsure };
  return undefined;
}

/** What a script condition's task said, off its last attempt: its exit verdict and its answer file, decoded (`scriptRoute`). */
export function scriptRead(step: Workflow, run: Run, attemptOf: AttemptOf): ScriptRead | undefined {
  const taskId = run.steps[step.name]?.taskId;
  if (!isScript(step) || !taskId || taskId !== stepTaskId(run, step.name, tryOf(run, step.name))) return undefined;
  const attempt = attemptOf(taskId);
  return scriptRoute(attemptVerdict(attempt), scriptAnswerOf(attempt?.terminationMessage), step.routes);
}

/**
 * The pass's closeouts, with each script condition's answer read as its closeout: a route as a `done` one whose output is the route, an
 * unsure answer as a `blocked` one that needs its words, so the step reads as one that signed so (`unverified`, `blocked`). Every other
 * read (no answer, an undeclared route, a failed or stopped script) leaves it none, and its task's phase says the rest.
 */
export const scriptCloseouts =
  (steps: readonly Workflow[], attemptOf: AttemptOf, run: Run, closeoutOf: (step: string) => Closeout | undefined) =>
  (name: string): Closeout | undefined => {
    const step = steps.find((s) => s.name === name);
    if (!isScript(step)) return closeoutOf(name);
    const read = scriptRead(step, run, attemptOf);
    if (read?.kind === 'route') return { outcome: 'done', summary: `route ${read.route}`, artifacts: [], output: { route: read.route } };
    if (read?.kind === 'blocked') return { outcome: 'blocked', summary: summaryLine(read.unsure), artifacts: [], needs: read.unsure };
    return undefined;
  };
