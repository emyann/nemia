/**
 * What recent runs of one workflow cost, for a step that designs a change (`reads: costs`): the newest finished runs of the workflow in
 * the factory, folded from the facts `nemia stats` reads (`TryFact`, `RunFact`) into, per step, the median and p90 of what it cost a run,
 * every try and round of it summed, and the median and most of its tries; and the same for the whole run, with its rounds. Pure:
 * `costs.verb.ts` reads the facts, `costs-words.ts` says the answer. A figure with nothing measured under it is `null`, never 0.
 */
import type { RunFact, RunKeys, TryFact } from '../stats/index.ts';

/** How many finished runs of a workflow the costs go back over, newest first. */
export const RECENT_RUNS = 20;

/** The middle of a set of numbers and its 90th percentile, nearest rank; each null over nothing. */
export type Spread = { median: number | null; p90: number | null };

/**
 * One step over the window: `runs`, how many runs measured some cost of it; the median and p90 of what it cost one of those runs, its
 * tries and rounds summed; and the median and most of its tries a run, over every run it ran in.
 */
export type StepCost = { step: string; runs: number; median: number; p90: number; tries: { median: number; max: number } };

/**
 * What the newest finished runs of `workflow` in `factory` cost: `runs`, how many the window holds, and `since`, the day the oldest of
 * them finished, null with none; a line per step measured, in the order of the newest run's steps, then any other in the order met; the
 * whole run's cost over `run.runs`, the runs every session of which was measured (`RunFact.costUsd`); and the rounds each `loop:` step
 * ran to acceptance, their median and most.
 */
export type WorkflowCosts = {
  factory: string;
  workflow: string;
  runs: number;
  since: string | null;
  steps: StepCost[];
  run: Spread & { runs: number };
  rounds: { median: number | null; max: number | null };
};

/** The values sorted, low to high. */
const sorted = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b);

/** The median of `values`: the middle one, or the mean of the two middle ones; null for none. */
export function medianOf(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = sorted(values);
  const mid = Math.floor(s.length / 2);
  const [low, high] = [s[mid - 1], s[mid]];
  if (high === undefined) return null;
  if (s.length % 2) return high;
  return low === undefined ? null : (low + high) / 2;
}

/** The 90th percentile of `values`, nearest rank: the smallest value at or above nine tenths of them; null for none. */
export function p90Of(values: readonly number[]): number | null {
  const s = sorted(values);
  return s[Math.ceil(0.9 * s.length) - 1] ?? null;
}

/** One step's cost and tries in each run it ran in, by run id: the measured costs summed, null where none was; and how many tries. */
type PerRun = Map<string, { cost: number | null; tries: number }>;

/** Each step's `PerRun`, by step, in the order its tries are met. */
function perRunOf(tries: readonly TryFact[]): Map<string, PerRun> {
  const steps = new Map<string, PerRun>();
  for (const t of tries) {
    const runs = steps.get(t.step) ?? new Map();
    const was = runs.get(t.run) ?? { cost: null, tries: 0 };
    runs.set(t.run, { cost: t.costUsd === null ? was.cost : (was.cost ?? 0) + t.costUsd, tries: was.tries + 1 });
    steps.set(t.step, runs);
  }
  return steps;
}

/** A step's line (`StepCost`), none where no run measured a cost of it. */
function stepCostOf(step: string, runs: PerRun): StepCost[] {
  const costs = [...runs.values()].flatMap((r) => (r.cost === null ? [] : [r.cost]));
  const tries = [...runs.values()].map((r) => r.tries);
  const [median, p90, triesMedian] = [medianOf(costs), p90Of(costs), medianOf(tries)];
  if (median === null || p90 === null || triesMedian === null) return [];
  return [{ step, runs: costs.length, median, p90, tries: { median: triesMedian, max: Math.max(...tries) } }];
}

/**
 * What the newest finished runs of `of`'s workflow in `of`'s factory cost (`WorkflowCosts`), off a store's facts, its runs newest first:
 * the first `RECENT_RUNS` finished runs with `of`'s factory and workflow, and never `of`'s own run; the tries of no such run are left out.
 */
export function costsOf(facts: { tries: readonly TryFact[]; runs: readonly RunFact[] }, of: RunKeys): WorkflowCosts {
  const window = facts.runs.filter((r) => r.factory === of.factory && r.workflow === of.workflow && r.run !== of.run).slice(0, RECENT_RUNS);
  const ids = new Set(window.map((r) => r.run));
  const perStep = perRunOf(facts.tries.filter((t) => ids.has(t.run)));
  const order = [...new Set([...(window[0]?.steps ?? []), ...perStep.keys()])];
  const measured = window.flatMap((r) => (r.costUsd === null ? [] : [r.costUsd]));
  const rounds = window.flatMap((r) => r.rounds);
  return {
    factory: of.factory,
    workflow: of.workflow,
    runs: window.length,
    since: window.map((r) => r.day).sort()[0] ?? null,
    steps: order.flatMap((step) => stepCostOf(step, perStep.get(step) ?? new Map())),
    run: { runs: measured.length, median: medianOf(measured), p90: p90Of(measured) },
    rounds: { median: medianOf(rounds), max: rounds.length ? Math.max(...rounds) : null },
  };
}
