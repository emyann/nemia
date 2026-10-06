/**
 * What a pass records of each step in the process's metrics (`STEP_METRICS`, `step.verb.ts`): a try or a check that settled, a round a
 * loop was granted or ran out of, each with the attributes a series is kept by — the factory, the workflow, the step, its agent and the
 * outcome, and nothing else (`boundedAttributes`): a run's or a task's id would make a series of every run.
 *
 * Pure: the tick hands it the run, the tasks the feed said settled since its last read (`settledIn`), and what the pass already read of
 * them; it reads nothing more.
 */
import path from 'node:path';
import { Invalid } from '../refusal/refusal.ts';
import { attemptVerdict } from '../check/check.ts';
import type { Run } from '../record/record.ts';
import type { Closeout } from '../closeout/closeout.ts';
import type { StepStatus } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { DEFAULT_FACTORY } from '../factory/factory.ts';
import type { SpendOf } from '../status/status.ts';
import { taskUsage, type AttemptClock, type TaskClock } from '../timeline/timeline.ts';
import { ranMs } from '../timeline/took.ts';

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
      message: `a step's metric carries the attribute "${loose}", which is not one of ${STEP_ATTRIBUTE_KEYS.join(', ')}: a run's or a task's id makes a series of every run, so record it by those five alone.`,
    });
  }
  return { ...attributes };
}

/** The attributes of `step`'s metric in `run`, for `outcome`: its factory, its workflow's folder, the step, and its agent, `none` for none. */
export const stepAttributes = (run: Pick<Run, 'factory' | 'workflowDir'>, step: Workflow, outcome: string): Record<string, string> =>
  boundedAttributes({
    factory: run.factory ?? DEFAULT_FACTORY,
    workflow: path.basename(run.workflowDir),
    step: step.name,
    agent: step.agent?.name ?? 'none',
    outcome,
  });

/**
 * One fact of a step a pass records: a session that settled (`try`), with what it cost in dollars where measured, its tokens where
 * measured, how long it ran and the calls its harness denied it; a check that settled (`check`); a round its loop was granted or ran out
 * of (`round`). `attributes` are `stepAttributes`, the outcome among them: `done`, `blocked`, `failed` or `stopped` for a try; `passed`,
 * `refused` or `unfinished` for a check; `granted` or `exhausted` for a round.
 */
export type StepFact =
  | {
      metric: 'try';
      attributes: Record<string, string>;
      costUsd?: number;
      inputTokens?: number;
      outputTokens?: number;
      ms: number;
      denied: number;
    }
  | { metric: 'check' | 'round'; attributes: Record<string, string> };

/** The engine's view of a task, as far as a fact reads it: its attempts, a check's with its exit code, and its usage. */
export type FactView = TaskClock & { state: { attempts: ReadonlyArray<AttemptClock & { exitCode?: number | null }> } };

/** What a pass already read, that a step's facts are read off: the views of the run's tasks, their spend, the closeouts, each status. */
export type FactReads = {
  views: ReadonlyMap<string, FactView>;
  spendOf: SpendOf;
  signedOff: (step: string) => Closeout | undefined;
  statusOf: (step: Workflow) => StepStatus;
};

/** Each of a step's tasks, its session's and its check's, of every try: which it is. */
const tasksOf = (record: Run['steps'][string]): Array<{ taskId: string; metric: 'try' | 'check' }> => [
  ...(record.taskId ? [{ taskId: record.taskId, metric: 'try' as const }] : []),
  ...(record.check ? [{ taskId: record.check.taskId, metric: 'check' as const }] : []),
  ...(record.tries ?? []).flatMap((t) => [
    { taskId: t.taskId, metric: 'try' as const },
    ...(t.check ? [{ taskId: t.check.taskId, metric: 'check' as const }] : []),
  ]),
];

/** How a session ended: `done` or `blocked` as it signed, the step's current one read off its closeout, else `failed` or `stopped`. */
function tryOutcome(view: FactView, current: boolean, closeout: Closeout | undefined): string {
  if (view.state.settled !== 'succeeded') return view.state.settled ?? 'failed';
  return current && closeout?.outcome === 'blocked' ? 'blocked' : 'done';
}

/** How a check ended: `passed` on exit 0, `refused` on another exit, `unfinished` with none (`attemptVerdict`). */
function checkOutcome(view: FactView): string {
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
    denied: spend?.denied?.length ?? 0,
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

/** A round `granted` for each looping step whose loop the pass took round again (`looped`). */
export const roundsGranted = (run: Run, steps: readonly Workflow[], looped: readonly string[]): StepFact[] =>
  steps.filter((s) => looped.includes(s.name)).map((step) => ({ metric: 'round', attributes: stepAttributes(run, step, 'granted') }));
