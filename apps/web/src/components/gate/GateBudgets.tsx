/**
 * The budgets a gated step proposes for the steps after it, at its gate, and the caps its approval set, under the approval: the rows the
 * api says (`step.gate.budgets`, objects' `StepGate`), an amount field each while they are the proposal, and what an approval sends of
 * what the person typed (`budgetsGiven`).
 */
import type { StepView } from '../../lib/runView';
import type { Frozen } from '../../lib/frozen';
import { budgetWord } from '../../lib/money';

/** The budgets a gated step proposed for the steps after it, or the caps its approval set, as the api says each. */
export type GateBudgets = NonNullable<NonNullable<StepView['gate']>['budgets']>;
/** A cap a person gives a later step at the gate, as the approval's body carries it. */
export type GivenBudget = { step: string; usd: number };
/** What a person typed in each budget's amount field, by step: a step not there is left as proposed. */
export type Amounts = Readonly<Record<string, string>>;

/** The amount a field holds, or null where it holds no number above zero. */
const amountOf = (text: string): number | null => {
  const usd = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(usd) && usd > 0 ? usd : null;
};

/**
 * What a person gave at the gate of its step's proposal (`budgets` while `from: 'proposed'`; nothing else gives anything), off what they
 * typed (`amounts`): the rows whose amount they changed to another amount above zero (`given`), in the proposal's order — a field put back
 * to the proposal's amount gives nothing — and the rows whose field holds no such amount (`unread`), which Approve waits on.
 */
export const budgetsGiven = (
  budgets: Frozen<GateBudgets> | null | undefined,
  amounts: Amounts,
): { given: GivenBudget[]; unread: string[] } => {
  const given: GivenBudget[] = [];
  const unread: string[] = [];
  for (const row of budgets?.from === 'proposed' ? budgets.steps : []) {
    const text = amounts[row.step];
    if (text === undefined) continue;
    const usd = amountOf(text);
    if (usd === null) unread.push(row.step);
    else if (usd !== row.usd) given.push({ step: row.step, usd });
  }
  return { given, unread };
};

/** The proposal's rows with a field each, where the gate's budgets are its step's proposal; nothing else. */
export function GateBudgetFields({
  budgets,
  ...rest
}: {
  step: string;
  budgets: Frozen<GateBudgets> | null | undefined;
  amounts: Amounts;
  onAmounts: (next: Amounts) => void;
  field: string;
}) {
  return budgets?.from === 'proposed' ? <GateBudgetRows budgets={budgets} {...rest} /> : null;
}

/**
 * The budgets of a gate: per later step, its amount (a field holding it while it is the step's proposal and `onAmounts` is given), the
 * step's own `budget:`, the words `above the workflow's $X` where the amount is above it, and why the step proposed it; then the run's
 * line, what it has spent and the most it may cost under these caps, as the api says it, and, where that most passes the cost line its
 * factory set for the run, the api's sentence saying so, drawn as what a person weighs (`data-past-line`). Approved, the caps the
 * approval set, each read only (`Approved`).
 */
export function GateBudgetRows({
  step,
  budgets,
  amounts = {},
  onAmounts,
  field = 'budget',
}: {
  step: string;
  budgets: Frozen<GateBudgets>;
  amounts?: Amounts;
  onAmounts?: (next: Amounts) => void;
  field?: string;
}) {
  const proposed = budgets.from === 'proposed';
  const editing = proposed && onAmounts ? (step: string, text: string) => onAmounts({ ...amounts, [step]: text }) : null;
  return (
    <section
      aria-label={proposed ? `The budgets ${step} proposes` : `The budgets the approval of ${step} set`}
      data-gate-budgets={budgets.from}
      className="space-y-2 rounded border border-outline-variant p-3"
    >
      <h3 className="text-label-medium text-muted-foreground">
        {proposed ? (
          <>
            The budgets <span className="text-foreground">{step}</span> proposes for the steps after it: change one to set it with your
            approval
          </>
        ) : (
          'The budgets the approval set for the steps after it'
        )}
      </h3>
      <ul className="space-y-2">
        {budgets.steps.map((row) => (
          <BudgetRow key={row.step} row={row} typed={amounts[row.step]} onTyped={editing} field={field} />
        ))}
      </ul>
      <p data-said className="break-words border-t border-outline-variant pt-2 text-body-small">
        {budgets.said}
      </p>
      {budgets.line && (
        <p data-past-line className="break-words text-body-small font-medium text-yours">
          {budgets.line.said}
        </p>
      )}
    </section>
  );
}

/**
 * One step's budget: its name, its amount (a field where `onTyped` is given, holding what was typed or else the proposal), its own
 * budget, the words `above the workflow's $X` where the amount — as typed, while it is one — is above it, and why.
 */
function BudgetRow({
  row,
  typed,
  onTyped,
  field,
}: {
  row: Frozen<GateBudgets['steps'][number]>;
  typed: string | undefined;
  onTyped: ((step: string, text: string) => void) | null;
  field: string;
}) {
  const usd = typed === undefined ? row.usd : (amountOf(typed) ?? row.usd);
  const above = typed === undefined ? row.above : row.workflow !== null && usd > row.workflow;
  const id = `${field}-budget-${row.step}`;
  return (
    <li data-budget={row.step} data-above={above ? '' : undefined} className="min-w-0 space-y-0.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{row.step}</span>{' '}
        {onTyped ? (
          <label htmlFor={id} className="flex items-center gap-1 text-body-small">
            <span className="sr-only">{`The budget of ${row.step}, in dollars`}</span>
            <span aria-hidden className="font-mono text-money">
              $
            </span>
            <input
              id={id}
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              value={typed ?? String(row.usd)}
              onChange={(event) => onTyped(row.step, event.target.value)}
              className={AMOUNT}
            />
          </label>
        ) : (
          <span data-amount className="font-mono text-money">
            {row.said}
          </span>
        )}{' '}
        <span data-own className="text-body-small text-muted-foreground">
          {row.workflow === null ? 'no budget of its own' : `its own budget ${budgetWord(row.workflow)}`}
        </span>{' '}
        {above && row.workflow !== null && (
          <span data-above-words className="text-body-small font-medium text-yours">
            {`above the workflow's ${budgetWord(row.workflow)}`}
          </span>
        )}
      </div>
      {row.why !== null && (
        <p data-why className="break-words text-body-small text-muted-foreground">
          {row.why}
        </p>
      )}
    </li>
  );
}

const AMOUNT =
  'w-24 rounded border border-outline bg-background px-2 py-1 font-mono text-body-medium focus:border-on-surface-variant focus:outline-none';
