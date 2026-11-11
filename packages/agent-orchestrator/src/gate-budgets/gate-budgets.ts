/**
 * The budgets a gate shows (`GateBudgets`): before its approval, those its step's closeout proposes for the steps after it; after it, the
 * caps the approval set — each with the step's own `budget:` and whether the amount is above it — and the run's line: what it has spent,
 * and the most it may cost under these caps — and, where that most passes the cost line its factory set for its workflow (`Run.costLine`,
 * `pastTheLine`), the line in a sentence a person reads as it is. Read by the Run object's gate (`gateOf`, tries.verb.ts) and by `nemia
 * decide`. Pure.
 */
import type { Closeout } from '../closeout/index.ts';
import type { Run } from '../record/record.ts';
import { approvalOf, budgetOf, hasGate, runSpend, spentWord, stepSpend, type SpendOf } from '../status/status.ts';
import { dollars } from '../money/money.ts';
import type { StepSpec } from '../step/step.ts';
import { aboveTheWorkflow, budgetRefusals, ceilingsOf, pastTheLine, proposedBudgets } from '../budget/budget.ts';
import { basename } from 'node:path';
import type { GateBudgetsFrom } from 'objects';

/** Where a gate's budgets come from: its step's closeout, before the approval, or the approval itself. */
export type { GateBudgetsFrom };

/**
 * One budget at a gate: the step, the amount and its words, why the step proposed it (null where the person gave the amount), the step's
 * own `budget:` (null where it has none), and whether the amount is above it.
 */
export type GateBudget = { step: string; usd: number; said: string; why: string | null; workflow: number | null; above: boolean };

/**
 * The run's cost line where the most it may cost under a gate's caps passes it: the line in dollars, and a sentence naming the most, the
 * line, the factory and the workflow, which the board and `nemia decide` show as it is.
 */
export type GateLine = { usd: number; said: string };

/**
 * The budgets at a gate (`GateBudget`), where they come from, the run's line in a person's words, and its cost line where the caps pass it
 * (`GateLine`), absent otherwise.
 */
export type GateBudgets = { from: GateBudgetsFrom; steps: GateBudget[]; said: string; line?: GateLine };

/**
 * The budgets at `step`'s gate, or undefined for a step with no gate, an approval that set no cap, or a closeout that proposes none or
 * budgets the run refuses (`budgetRefusals`):
 * the caps of the approval of the try it is on where it set some, else what its closeout `said` proposes. The run's line counts each step
 * at the most it may cost — the larger of its cap here (or its cap in force, for a step not here) and what its tries have cost — and names
 * the steps with no cap, which bound nothing.
 */
export function gateBudgets(
  run: Run,
  step: StepSpec,
  steps: readonly StepSpec[],
  said: Closeout | { error: string } | undefined,
  spendOf: SpendOf,
): GateBudgets | undefined {
  if (!hasGate(step, run)) return undefined;
  const proposed = proposedBudgets(step, said);
  const approval = approvalOf(run, step.name);
  const approved = Object.entries(approval?.budgets ?? {}).map(([name, usd]) => ({
    step: name,
    usd,
    why: proposed.find((p) => p.step === name && p.usd === usd)?.why ?? null,
  }));
  if (!approval && budgetRefusals(step, steps, said).length) return undefined;
  const from: GateBudgetsFrom = approval ? 'approved' : 'proposed';
  const rows = approval ? approved : proposed;
  if (!rows.length) return undefined;
  const above = aboveTheWorkflow(rows, ceilingsOf(steps));
  const budgets = rows.map((r) => ({
    step: r.step,
    usd: r.usd,
    said: dollars(r.usd),
    why: r.why,
    workflow: steps.find((s) => s.name === r.step)?.budget ?? null,
    above: above.includes(r.step),
  }));
  const bound = runBound(run, steps, budgets, spendOf);
  const runSaid = `the run has spent ${spentWord(runSpend(run, spendOf))}; ${boundWords(bound)}`;
  const line = run.costLine;
  return line !== undefined && pastTheLine(bound.most, line)
    ? { from, steps: budgets, said: runSaid, line: { usd: line, said: lineWords(run, bound.most, line) } }
    : { from, steps: budgets, said: runSaid };
}

/** The most the run may cost under `budgets` and the caps in force on every other step, and the steps with no cap, which bound nothing. */
type RunBound = { most: number; uncapped: string[] };

/** The run's bound: each step counted at the larger of its cap (here, else in force) and what its tries have cost. */
function runBound(run: Run, steps: readonly StepSpec[], budgets: readonly GateBudget[], spendOf: SpendOf): RunBound {
  const uncapped: string[] = [];
  let most = 0;
  for (const s of steps) {
    const cap = budgets.find((b) => b.step === s.name)?.usd ?? budgetOf(s, run);
    const cost = stepSpend(run, s.name, spendOf).usd;
    if (cap === undefined) uncapped.push(s.name);
    most += Math.max(cap ?? 0, cost);
  }
  return { most, uncapped };
}

/** The bound in words, naming the steps with no cap. */
const boundWords = ({ most, uncapped }: RunBound): string =>
  uncapped.length
    ? `at most ${dollars(most)} under these caps, but for ${uncapped.join(', ')}, which ${uncapped.length > 1 ? 'have' : 'has'} no cap`
    : `at most ${dollars(most)} under these caps`;

/** The sentence of a line passed: the most, the line, the factory that set it and the workflow it is set for. */
const lineWords = (run: Run, most: number, line: number): string =>
  `at most ${dollars(most)} under these caps passes the cost line of ${dollars(line)} factory ${run.factory ?? 'default'} sets for ${basename(run.workflowDir)}`;

/** The budgets at every gate of `run` that has some (`gateBudgets`), by its step: what `nemia decide` carries beside its gate lines. */
export const gatesBudgets = (
  run: Run,
  steps: readonly StepSpec[],
  said: (step: string) => Closeout | undefined,
  spendOf: SpendOf,
): Record<string, GateBudgets> =>
  Object.fromEntries(
    steps.flatMap((s) => {
      const at = gateBudgets(run, s, steps, said(s.name), spendOf);
      return at ? [[s.name, at] as const] : [];
    }),
  );
