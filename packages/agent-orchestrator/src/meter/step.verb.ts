/**
 * The metrics of the steps a pass saw settle (`STEP_METRICS`), recorded from the facts the pass read of them (`StepFact`, `step.ts`). A
 * controller, as `meter.verb.ts` is: it writes to the registry of whoever runs it, the process's own unless a test gives another.
 */
import { Effect, Metric } from 'effect';
import { boundedAttributes, type StepFact } from './step.ts';

/** A step's time, in ms: a minute to two hours, the span a session runs in. */
const STEP_BOUNDS = [60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000, 7_200_000];

/**
 * The metrics of a step, each by the attributes of `stepAttributes` alone: what its settled sessions cost (`step.cost`, USD, where
 * measured), their tokens (`step.tokens.input`, `step.tokens.output`, where measured) and their time (`step.duration`, ms); the sessions
 * by how they ended (`step.tries`), the checks by their verdict (`step.checks`), the rounds granted and run out of (`step.rounds`), and
 * the calls a harness denied (`step.denied`). Each counter only grows, so a collector reads it as one.
 */
export const STEP_METRICS = {
  cost: Metric.counter('step.cost', { description: "a step's settled sessions' cost, in USD", incremental: true }),
  input: Metric.counter('step.tokens.input', { description: "a step's settled sessions' input tokens", incremental: true }),
  output: Metric.counter('step.tokens.output', { description: "a step's settled sessions' output tokens", incremental: true }),
  duration: Metric.histogram('step.duration', { description: "a step's settled session's time, in ms", boundaries: STEP_BOUNDS }),
  tries: Metric.counter('step.tries', { description: "a step's sessions settled, by outcome", incremental: true }),
  checks: Metric.counter('step.checks', { description: "a step's checks settled, by verdict", incremental: true }),
  rounds: Metric.counter('step.rounds', { description: "a loop's rounds granted or exhausted", incremental: true }),
  denied: Metric.counter('step.denied', { description: "the calls a step's harness denied its sessions", incremental: true }),
} as const;

/** `value` into `metric`, by the fact's attributes, refused if one is not a step's (`boundedAttributes`). */
const into = <In, Out>(metric: Metric.Metric<In, Out>, attributes: Record<string, string>, value: In) =>
  Metric.update(Metric.withAttributes(metric, boundedAttributes(attributes)), value);

/** One fact into the metrics: a session's tally, cost, tokens, time and denials; a check's or a round's count. */
function recordFact(fact: StepFact): Effect.Effect<void> {
  const { attributes } = fact;
  if (fact.metric === 'check') return into(STEP_METRICS.checks, attributes, 1);
  if (fact.metric === 'round') return into(STEP_METRICS.rounds, attributes, 1);
  return Effect.all(
    [
      into(STEP_METRICS.tries, attributes, 1),
      into(STEP_METRICS.duration, attributes, fact.ms),
      ...(fact.costUsd !== undefined ? [into(STEP_METRICS.cost, attributes, fact.costUsd)] : []),
      ...(fact.inputTokens !== undefined ? [into(STEP_METRICS.input, attributes, fact.inputTokens)] : []),
      ...(fact.outputTokens !== undefined ? [into(STEP_METRICS.output, attributes, fact.outputTokens)] : []),
      ...(fact.denied ? [into(STEP_METRICS.denied, attributes, fact.denied)] : []),
    ],
    { discard: true },
  );
}

/** The facts a pass read of its runs' steps, each recorded once into the step's metrics (`STEP_METRICS`). */
export const recordStepMetrics = Effect.fn('recordStepMetrics')(function* (facts: readonly StepFact[]) {
  for (const fact of facts) yield* recordFact(fact);
});
