/**
 * The budgets a gate sets (agent-orchestrator, src/budget/budget.ts): the caps a gated step's closeout proposes for the steps after
 * it, as data (`"x-shape": "budgets"`), which a person's approval makes those steps' caps, changed where the person changed them.
 *
 * `proposalRefusal` says why a closeout's budgets are not taken, and the run refuses that closeout back to its agent as it refuses a
 * question field that does not read. `approvedCaps` is what an approval writes: the proposals, with the person's own amounts over
 * them. `capInForce` is the cap a step is filed and judged under, read on every pass from the record and the approvals in force,
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

const unchangedSpec = spec<(proposed: readonly StepBudget[], given: readonly StepBudget[]) => StepBudget[]>({
  /** What `approvedCaps` hands it: a proposal that names each step once, each an amount (`settable`). */
  requires: ({ input: [proposed] }) => onceEach(proposed) && proposed.every((p) => anAmount(p.usd)),
  ensures: {
    onlyTheUnchanged: {
      description: 'What stands of a proposal is only budgets it made for steps the person gave no amount',
      condition: ({ input: [proposed, given], output }) =>
        output.every((o) => !names(given, o.step) && proposed.some((p) => p.step === o.step && p.usd === o.usd)),
    },
    everyUnchanged: {
      description: 'Every budget it made for a step the person gave no amount stands',
      condition: ({ input: [proposed, given], output }) =>
        proposed.every((p) => names(given, p.step) || output.some((o) => o.step === p.step && o.usd === p.usd)),
    },
    onceEachStands: {
      description: 'What stands names a step once at most',
      condition: ({ output }) => onceEach(output),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type Unchanged = Implementation<typeof unchangedSpec>;

const approvedCapsSpec = spec<
  (proposed: readonly StepBudget[], given: readonly StepBudget[], later: readonly string[]) => { caps: StepBudget[] } | { refused: string }
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
    thePersonsAmountWins: {
      description: 'Each budget the person gave is the cap the approval sets for its step',
      condition: ({ input: [, given], output }) =>
        'refused' in output || given.every((g) => output.caps.some((o) => o.step === g.step && o.usd === g.usd)),
    },
    /**
     * The full law, "each budget the step proposed that the person did not change is the cap the approval sets for its step", is narrowed
     * here to what tsverify proves today: it waits on tsverify proving that a loop's result keeps every element it passes on, into the
     * list its caller joins it to (src-a-filter-s-result-is-pro-p25m, in the tsverify factory: a filter or a loop proved to keep every
     * element), and is restored here once a release does. `src/budget/budget.test.ts` holds the full law until then.
     */
    aProposalStands: {
      description: 'Where the step proposed a budget the person did not change, the approval sets more caps than the person gave',
      condition: ({ input: [proposed, given], output }) =>
        'refused' in output || proposed.every((p) => names(given, p.step)) || output.caps.length > given.length,
    },
    nothingElse: {
      description: 'An approval sets a cap only for a step the step proposed or the person gave',
      condition: ({ input: [proposed, given], output }) =>
        'refused' in output || output.caps.every((o) => names(proposed, o.step) || names(given, o.step)),
    },
    oneCapAStep: {
      description: 'An approval sets one cap for a step at most',
      condition: ({ output }) => 'refused' in output || onceEach(output.caps),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type ApprovedCaps = Implementation<typeof approvedCapsSpec>;

const capInForceSpec = spec<(i: CapInput) => number | undefined>({
  /**
   * No amount it is handed is NaN, which equals nothing, itself included, so that no cap could keep the laws at it. The readers hand it
   * none: a try's budget and an approval's caps are read as dollars above zero (`Dollars`, record.store.ts), and a step's `budget:` is
   * refused at load unless it is one (`budgetOf`, keys.ts). Any other number, zero, negative or infinite, the laws bind.
   */
  requires: ({ input: [i] }) =>
    (i.raised === undefined || !Number.isNaN(i.raised)) &&
    i.approved.every((usd) => !Number.isNaN(usd)) &&
    (i.workflow === undefined || !Number.isNaN(i.workflow)),
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
