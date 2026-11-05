/**
 * The budgets a gate sets (agent-orchestrator, src/budget/budget.ts): the caps a gated step's closeout proposes for the steps after
 * it, as data (`"x-shape": "budgets"`), which a person's approval makes those steps' caps, changed where the person changed them.
 *
 * `proposalRefusal` says why a closeout's budgets are not taken, and the run refuses that closeout back to its agent as it refuses a
 * question field that does not read. `approvedCaps` is what an approval writes: the proposal and the person's own amounts, each kept as
 * it came and apart from the other; `approvedCap` reads the cap it sets for one step from them, the person's amount over the
 * proposal's. `capInForce` is the cap a step is filed and judged under, read on every pass from the record and the approvals in force,
 * nothing carried. `aboveTheWorkflow` names the caps above the step's own `budget:`, which the gate says and which no rule of auto
 * approves unasked.
 *
 * The types the laws read (`StepBudget`, `CapInput`) are the code's, in `src/budget/budget.ts`.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { CapInput, StepBudget } from '../src/budget/budget.ts';

/** An amount a cap can be: dollars above zero, and finite. */
const anAmount = (usd: number): boolean => usd > 0 && Number.isFinite(usd);

/** Whether `budgets` name `step`. */
const names = (budgets: readonly StepBudget[], step: string): boolean => budgets.some((b) => b.step === step);

/** Whether no step is named twice in `budgets`. */
const onceEach = (budgets: readonly StepBudget[]): boolean =>
  budgets.every((b, i) => budgets.every((c, j) => i === j || c.step !== b.step));

/** Whether every budget names one of `later`, once, with an amount: the budgets a gate can set. */
const settable = (budgets: readonly StepBudget[], later: readonly string[]): boolean =>
  budgets.every((b) => later.includes(b.step) && anAmount(b.usd)) && onceEach(budgets);

const proposalRefusalSpec = spec<(budgets: readonly StepBudget[], later: readonly string[]) => string | null>({
  ensures: {
    onlyALaterStep: {
      description: 'A budget for a step that does not come after the gate, directly or through another, is refused',
      condition: ({ input: [budgets, later], output }) => budgets.every((b) => later.includes(b.step)) || output !== null,
    },
    onlyAnAmount: {
      description: 'A budget that is not dollars above zero is refused',
      condition: ({ input: [budgets], output }) => budgets.every((b) => anAmount(b.usd)) || output !== null,
    },
    onceAStep: {
      description: 'Two budgets for one step are refused',
      condition: ({ input: [budgets], output }) => onceEach(budgets) || output !== null,
    },
    takenOtherwise: {
      description: 'Budgets each naming a later step once, each an amount, are taken: none at all among them',
      condition: ({ input: [budgets, later], output }) => !settable(budgets, later) || output === null,
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type ProposalRefusal = Implementation<typeof proposalRefusalSpec>;

/** Whether `kept` holds `budgets` as they came: as many, each at its place, its step at its amount. */
const asTheyCame = (kept: readonly StepBudget[], budgets: readonly StepBudget[]): boolean =>
  kept.length === budgets.length && budgets.every((b, i) => kept.at(i)?.step === b.step && kept.at(i)?.usd === b.usd);

const approvedCapsSpec = spec<
  (
    proposed: readonly StepBudget[],
    given: readonly StepBudget[],
    later: readonly string[],
  ) => { proposed: StepBudget[]; given: StepBudget[] } | { refused: string }
>({
  /**
   * What a gated step proposed was taken when it signed off (`proposalRefusal`): a closeout it refuses reads unsigned, and no gate
   * waits on it.
   */
  requires: ({ input: [proposed, , later] }) => settable(proposed, later),
  ensures: {
    refusedExactlyWhenAGivenCannotBeSet: {
      description: 'An approval is refused exactly when a budget the person gave names no later step, names one twice, or is no amount',
      condition: ({ input: [, given, later], output }) => 'refused' in output === !settable(given, later),
    },
    theProposalKeptApart: {
      description: 'An approval keeps what the step proposed as it came, apart from what the person gave',
      condition: ({ input: [proposed], output }) => 'refused' in output || asTheyCame(output.proposed, proposed),
    },
    thePersonsKeptApart: {
      description: 'An approval keeps the budgets the person gave as they came, apart from what the step proposed',
      condition: ({ input: [, given], output }) => 'refused' in output || asTheyCame(output.given, given),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type ApprovedCaps = Implementation<typeof approvedCapsSpec>;

/**
 * The cap an approval sets for one step, read from what it keeps apart (`approvedCaps`): the person's amount over the proposal's. One
 * answer a step, so an approval sets one cap for a step at most by its shape.
 */
const approvedCapSpec = spec<(proposed: readonly StepBudget[], given: readonly StepBudget[], step: string) => number | undefined>({
  /**
   * What an approval keeps: each list an amount for a step, once each (`approvedCaps`, `proposalRefusal`), as the approval's file is read
   * (`Dollars`, record.store.ts).
   */
  requires: ({ input: [proposed, given] }) =>
    proposed.every((p) => anAmount(p.usd)) && given.every((g) => anAmount(g.usd)) && onceEach(proposed) && onceEach(given),
  ensures: {
    thePersonsAmountWins: {
      description: 'A budget the person gave is the cap the approval sets for its step',
      condition: ({ input: [, given, step], output }) => given.every((g) => g.step !== step || output === g.usd),
    },
    aProposalStandsUnchanged: {
      description: 'A budget the step proposed that the person did not change is the cap the approval sets for its step',
      condition: ({ input: [proposed, given, step], output }) =>
        names(given, step) || proposed.every((p) => p.step !== step || output === p.usd),
    },
    aCapExactlyWhereOneIsSaid: {
      description: 'An approval sets a cap for a step exactly when the step proposed one or the person gave one',
      condition: ({ input: [proposed, given, step], output }) => (output !== undefined) === (names(proposed, step) || names(given, step)),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type ApprovedCap = Implementation<typeof approvedCapSpec>;

const capInForceSpec = spec<(i: CapInput) => number | undefined>({
  /**
   * Every amount it is handed is one: a try's budget and an approval's caps are read as dollars above zero (`Dollars`, record.store.ts),
   * and a step's `budget:` is refused at load unless it is one (`budgetOf`, keys.ts).
   */
  requires: ({ input: [i] }) =>
    (i.raised === undefined || anAmount(i.raised)) && i.approved.every(anAmount) && (i.workflow === undefined || anAmount(i.workflow)),
  ensures: {
    aRaiseOfTheStepWins: {
      description: "A budget a person gave the step's own try is its cap, whatever a gate approved",
      condition: ({ input: [i], output }) => i.raised === undefined || output === i.raised,
    },
    thenTheLastApproval: {
      description: 'With no raise of its own, a step approved a cap is capped by the last approval given',
      condition: ({ input: [i], output }) =>
        i.raised !== undefined || i.approved.length === 0 || output === i.approved[i.approved.length - 1],
    },
    elseItsOwnBudget: {
      description: "With no raise and no approved cap, a step's cap is its own budget, or none",
      condition: ({ input: [i], output }) => i.raised !== undefined || i.approved.length > 0 || output === i.workflow,
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type CapInForce = Implementation<typeof capInForceSpec>;

/** Whether `cap` is above a budget `ceilings` give its step. */
const above = (cap: StepBudget, ceilings: readonly StepBudget[]): boolean => ceilings.some((c) => c.step === cap.step && cap.usd > c.usd);

const aboveTheWorkflowSpec = spec<(caps: readonly StepBudget[], ceilings: readonly StepBudget[]) => string[]>({
  ensures: {
    eachCapAboveItsCeiling: {
      description: "A cap above its step's own budget is named",
      condition: ({ input: [caps, ceilings], output }) => caps.every((c) => !above(c, ceilings) || output.includes(c.step)),
    },
    onlyACapAboveItsCeiling: {
      description: 'Only a step whose cap is above its own budget is named: a step with no budget of its own never is',
      condition: ({ input: [caps, ceilings], output }) => output.every((name) => caps.some((c) => c.step === name && above(c, ceilings))),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type AboveTheWorkflow = Implementation<typeof aboveTheWorkflowSpec>;
