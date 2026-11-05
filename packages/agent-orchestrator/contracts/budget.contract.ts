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
 * The types are declared here until implement moves them into `src/budget/budget.ts`, which changes no law.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A budget for one step, by its name, in dollars: what a gated step proposes, what a person gives, or a step's own `budget:`. */
export type StepBudget = { step: string; usd: number };

/** An amount a cap can be: dollars above zero, and finite. */
const anAmount = (usd: number): boolean => usd > 0 && usd < Number.POSITIVE_INFINITY;

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

const approvedCapsSpec = spec<
  (proposed: readonly StepBudget[], given: readonly StepBudget[], later: readonly string[]) => StepBudget[] | { refused: string }
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
        'refused' in output || given.every((g) => output.some((o) => o.step === g.step && o.usd === g.usd)),
    },
    aProposalStandsUnchanged: {
      description: 'Each budget the step proposed that the person did not change is the cap the approval sets for its step',
      condition: ({ input: [proposed, given], output }) =>
        'refused' in output ||
        proposed.every((p) => names(given, p.step) || output.some((o) => o.step === p.step && o.usd === p.usd)),
    },
    nothingElse: {
      description: 'An approval sets a cap only for a step the step proposed or the person gave',
      condition: ({ input: [proposed, given], output }) =>
        'refused' in output || output.every((o) => names(proposed, o.step) || names(given, o.step)),
    },
    oneCapAStep: {
      description: 'An approval sets one cap for a step at most',
      condition: ({ output }) => 'refused' in output || onceEach(output),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type ApprovedCaps = Implementation<typeof approvedCapsSpec>;

/**
 * What a step's cap is chosen from. `raised`: the budget of its latest try that carries one — a person's `nemia retry --budget`, a
 * round's raise — undefined where none does. `approved`: the caps the approvals in force set for it, in the order they were given,
 * the earliest first. `workflow`: the step's own `budget:`, undefined where it has none.
 */
export type CapInput = { raised: number | undefined; approved: readonly number[]; workflow: number | undefined };

const capInForceSpec = spec<(i: CapInput) => number | undefined>({
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
const above = (cap: StepBudget, ceilings: readonly StepBudget[]): boolean =>
  ceilings.some((c) => c.step === cap.step && cap.usd > c.usd);

const aboveTheWorkflowSpec = spec<(caps: readonly StepBudget[], ceilings: readonly StepBudget[]) => string[]>({
  ensures: {
    eachCapAboveItsCeiling: {
      description: "A cap above its step's own budget is named",
      condition: ({ input: [caps, ceilings], output }) => caps.every((c) => !above(c, ceilings) || output.includes(c.step)),
    },
    onlyACapAboveItsCeiling: {
      description: "Only a step whose cap is above its own budget is named: a step with no budget of its own never is",
      condition: ({ input: [caps, ceilings], output }) => output.every((name) => caps.some((c) => c.step === name && above(c, ceilings))),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type AboveTheWorkflow = Implementation<typeof aboveTheWorkflowSpec>;
