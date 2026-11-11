/**
 * The budgets a gated step proposes for the steps after it, as data: one shape any agent's `output:` schema may declare a field of
 * (`"x-shape": "budgets"`, expanded by `expandShapes` in question.ts as `questions` is), decoded strictly (`budgetsOf`), refused back to
 * its agent where it cannot be taken (`budgetRefusals`), and, once a person approves the gate, the caps those steps are filed and judged
 * under (`approvedCaps`, written into the approval; `capInForce`, read from it on every pass). A cap above a step's own `budget:` is named
 * (`aboveTheWorkflow`), so the gate says it and no rule of auto approves it unasked; so is a run whose caps pass its factory's cost line
 * (`pastTheLine`).
 *
 * Pure. The six functions a contract proves are typed by `contracts/budget.contract.ts`.
 */
import type {
  AboveTheWorkflow,
  ApprovedCaps,
  CapInForce,
  PastTheLine,
  ProposalRefusal,
  Unchanged,
} from '../../contracts/budget.contract.ts';
import type { Closeout } from '../closeout/index.ts';
import { fieldsOf, itemsOf, sameSchema } from '../shape/shape.ts';
import type { StepSpec } from '../step/step.ts';
import { downstreamOf } from '../workspace/workspace.ts';
import { tryOf, type Run } from '../record/record.ts';

/** A budget for one step, by its name, in dollars: what a gated step proposes, what a person gives, or a step's own `budget:`. */
export type StepBudget = { step: string; usd: number };

/** A budget a gated step proposes: the step, the dollars, and which figures the amount went by (`why`). */
export type ProposedBudget = StepBudget & { why: string };

/**
 * What a step's cap is chosen from. `raised`: the budget of its latest try that carries one — a person's `nemia retry --budget`, a
 * round's raise — undefined where none does. `approved`: the caps the approvals in force set for it, in the order they were given,
 * the earliest first. `workflow`: the step's own `budget:`, undefined where it has none.
 */
export type CapInput = { raised: number | undefined; approved: readonly number[]; workflow: number | undefined };

/** The shape a field of budgets is, as its schema; strict, as every schema handed to a harness is. */
export const BUDGETS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      step: { type: 'string', description: 'The name of a step that comes after this one, directly or through another. Once each.' },
      usd: {
        type: 'number',
        description: "The most that step's tries may cost together, in dollars, above zero: its cap once a person approves this gate.",
      },
      why: { type: 'string', description: 'Which figures the amount went by: what like steps cost, and what this change adds.' },
    },
    required: ['step', 'usd', 'why'],
    additionalProperties: false,
  },
};

/** The fields a step's `output:` declares whose schema is `BUDGETS_SCHEMA`, in the schema's order: none for a step without `output:`. */
export const budgetFields = (step: StepSpec | undefined): string[] =>
  Object.entries(step?.output?.schema.properties ?? {})
    .filter(([, schema]) => sameSchema(schema, [BUDGETS_SCHEMA]))
    .map(([name]) => name);

/** The keys a budget has, sorted. */
const BUDGET_KEYS = ['step', 'usd', 'why'];

/** One budget read, or why it is not one. */
function oneBudget(value: unknown, at: string): ProposedBudget | string {
  const b = fieldsOf(value);
  if (!b) return `${at} is not an object`;
  // oxlint-disable-next-line unicorn/no-useless-spread -- the verifier sees only a spread as allocated here (`fieldsOf`)
  const keys = [...Object.keys(b)];
  keys.sort();
  if (keys.join() !== BUDGET_KEYS.join()) return `${at} has the keys ${keys.join(', ') || 'none'}, and a budget has step, usd, why`;
  const { step, usd, why } = b;
  if (typeof step !== 'string' || !step.trim()) return `${at}'s \`step\` is not a step's name`;
  if (typeof usd !== 'number') return `${at}'s \`usd\` is not a number of dollars`;
  if (typeof why !== 'string') return `${at}'s \`why\` is not text`;
  return { step, usd, why };
}

/**
 * A field's value read as budgets, strictly, or why it is not: an array of budgets, each with exactly the keys of `BUDGETS_SCHEMA`, a
 * step's name, a number and a text. Which steps they name and the amounts are `proposalRefusal`'s. Read afresh from `value`.
 */
export function budgetsOf(value: unknown): ProposedBudget[] | { error: string } {
  const items = itemsOf(value);
  if (!items) return { error: 'the budgets are not a list' };
  const budgets: ProposedBudget[] = [];
  for (const [i, item] of items.entries()) {
    const b = oneBudget(item, `budget ${i + 1}`);
    if (typeof b === 'string') return { error: b };
    budgets.push(b);
  }
  return budgets;
}

/**
 * What a closeout proposes through its step's budget fields: each budget of each field it gave that decodes, in the schema's order. None
 * for a closeout that is not there or did not read. A closeout whose budgets the run refuses (`budgetRefusals`) reads `unsigned`, and no
 * gate waits on it.
 */
export function proposedBudgets(step: StepSpec | undefined, said: Closeout | { error: string } | undefined): ProposedBudget[] {
  if (!said || 'error' in said) return [];
  return budgetFields(step).flatMap((field) => {
    const read = budgetsOf(said.output?.[field]);
    return Array.isArray(read) ? read : [];
  });
}

/** The steps a gate at `step` can set a cap for: every step that waits on it, directly or through another, in the workflow's order. */
export const laterSteps = (steps: readonly StepSpec[], step: string): string[] => {
  const later = downstreamOf(steps, step);
  return steps.filter((s) => later.has(s.name)).map((s) => s.name);
};

/**
 * Why the run does not take a closeout's budget fields, each a sentence that names the field, says why and what to do: a field that does
 * not decode (`budgetsOf`), and budgets it cannot set (`proposalRefusal`) — over every field together, so a step named in two is named
 * twice. None for a closeout not there or unreadable, nor of a field it did not give.
 */
export function budgetRefusals(
  step: StepSpec | undefined,
  steps: readonly StepSpec[],
  said: Closeout | { error: string } | undefined,
): string[] {
  if (!step || !said || 'error' in said) return [];
  const read: ProposedBudget[] = [];
  const refused: string[] = [];
  for (const field of budgetFields(step)) {
    if (said.output?.[field] === undefined) continue;
    const budgets = budgetsOf(said.output[field]);
    if (Array.isArray(budgets)) read.push(...budgets);
    else
      refused.push(`\`${field}\` is not read as budgets, so nobody can approve them: ${budgets.error}. Mend the field and sign off again.`);
  }
  const why = proposalRefusal(read, laterSteps(steps, step.name));
  if (why !== null) refused.push(`The budgets ${step.name} proposes cannot be set: ${why}. Mend them and sign off again.`);
  return refused;
}

/** Whether `usd` is an amount a cap can be: dollars above zero, and finite. */
const anAmount = (usd: number): boolean => usd > 0 && Number.isFinite(usd);

/**
 * Why `budgets` cannot be the caps a gate sets for the steps `later` names, or null: a budget for a step not among them, one that is no
 * amount of dollars above zero, and two for one step. Each in words that say what to give instead.
 */
export const proposalRefusal: ProposalRefusal = (budgets, later) => {
  const stray = budgets.find((b) => !later.includes(b.step));
  if (stray !== undefined) {
    return later.length
      ? `${JSON.stringify(stray.step)} is no step after the gate: a budget names one of ${later.join(', ')}`
      : `${JSON.stringify(stray.step)} is no step after the gate, and none comes after it: give no budgets`;
  }
  const none = budgets.find((b) => !anAmount(b.usd));
  if (none !== undefined) return `${String(none.usd)} for ${none.step} is not an amount: give dollars above zero, like 5 or 2.50`;
  const twice = budgets.find((b, i) => budgets.some((c, j) => j < i && c.step === b.step));
  if (twice !== undefined) return `${twice.step} is given two budgets: give each step one`;
  return null;
};

/** What stands of a proposal once a person gave amounts: each budget it made for a step they gave none, in its order. */
export const unchanged: Unchanged = (proposed, given) => {
  const kept: StepBudget[] = [];
  for (const p of proposed) if (!given.some((g) => g.step === p.step)) kept.push(p);
  return kept;
};

/**
 * The caps an approval sets: each budget the person gave, then each the step proposed that the person did not change. Refused where a
 * budget the person gave cannot be set (`proposalRefusal`).
 */
export const approvedCaps: ApprovedCaps = (proposed, given, later) => {
  const refused = proposalRefusal(given, later);
  if (refused !== null) return { refused };
  return { caps: [...given, ...unchanged(proposed, given)] };
};

/** The cap a step is filed and judged under: a raise of its own try, else the last approval given, else its own `budget:`, or none. */
export const capInForce: CapInForce = (i) => i.raised ?? i.approved.at(-1) ?? i.workflow;

/** The steps whose cap is above the budget `ceilings` give them, in the order of `caps`: a step with no budget of its own never is. */
export const aboveTheWorkflow: AboveTheWorkflow = (caps, ceilings) => {
  const named: string[] = [];
  for (const c of caps) if (ceilings.some((w) => w.step === c.step && c.usd > w.usd)) named.push(c.step);
  return named;
};

/**
 * Whether the most a run may cost under a gate's caps (`most`) passes the cost line its factory set for its workflow, frozen on the run
 * at its start (`line`, undefined where none is set): the gate says it, and no rule of auto approves it unasked (`withinBudget`).
 */
export const pastTheLine: PastTheLine = (most, line) => line !== undefined && most > line;

/** The steps' own budgets, as the ceilings `aboveTheWorkflow` reads: none of a step with no `budget:`. */
export const ceilingsOf = (steps: readonly StepSpec[]): StepBudget[] =>
  steps.flatMap((s) => (s.budget === undefined ? [] : [{ step: s.name, usd: s.budget }]));

/**
 * Budgets as the approve command's `budgets` argument takes them, `<step>=<amount>` each, as `nemia approve --budget` types them: what
 * the api's fold of a body's `budgets` hands the command, so both sides are read by one parser.
 */
export const budgetArgs = (budgets: readonly StepBudget[]): string[] => budgets.map((b) => `${b.step}=${String(b.usd)}`);

/**
 * The cap the approvals in force set for a step, as a list of none or one: of each approval of a try its step is still on (`approvalOf`'s
 * rule: one of an earlier try was spent by the try after it) that names the step among its `budgets`, the last given (`at`, a later file
 * winning a tie). Read from the person's files as `runRecord` composes them, on every pass. Pure: it changes nothing it is given.
 */
export const approvedCapsOf = (run: Run, step: string): number[] => {
  let last: { at: string; usd: number } | undefined;
  for (const a of run.approvals ?? []) {
    const usd = a.budgets?.[step];
    if (usd === undefined || a.try !== tryOf(run, a.step)) continue;
    if (last === undefined || a.at >= last.at) last = { at: a.at, usd };
  }
  return last === undefined ? [] : [last.usd];
};

/**
 * The cap in force on a step (`capInForce`): the last a person raised it to (`EarlierTry.budget`: `nemia retry --budget`, `nemia retry
 * --round --budget`), else the last cap an approval in force set for it (`approvedCapsOf`: `nemia approve --budget`, or the budgets its
 * gated step proposed), else its `budget:`. Read from the record and the approvals on every pass, nothing carried.
 */
export const budgetOf = (step: StepSpec, run: Run): number | undefined =>
  capInForce({
    raised: [...(run.steps[step.name]?.tries ?? [])].reverse().find((t) => t.budget !== undefined)?.budget,
    approved: approvedCapsOf(run, step.name),
    workflow: step.budget,
  });
