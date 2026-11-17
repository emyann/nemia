import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { atRest } from '../../../.storybook/play';
import { budgetsGiven, GateBudgetRows, type Amounts, type GateBudgets } from './GateBudgets';

/** The budgets `implement` proposes for the steps after it, or, approved, the caps its approval set. */
const budgetsOf = (from: GateBudgets['from'], past = false): GateBudgets => ({
  from,
  steps: [
    { step: 'review', usd: 60, said: '$60.00', why: 'Five parts, as the two wide runs took.', workflow: 40, above: true },
    { step: 'land', usd: 8, said: '$8.00', why: null, workflow: 16, above: false },
  ],
  said: 'spent $3.10 so far; at most $71.10 under these caps',
  ...(past ? { line: { usd: 50, said: 'at most $71.10 passes the line of $50 the factory set for a run of build' } } : {}),
});

/** Which budgets the gate holds: the proposal, the proposal past its factory's line, or the approval's caps. */
type Args = { from: GateBudgets['from']; past: boolean };

/**
 * The budgets at a gate, a story a state: proposed, a field each; proposed past the factory's cost line; and approved, read only. Beside
 * a proposal, what an approval would send (`data-given`), which follows each keystroke as Approve does.
 */
const meta: Meta<Args> = {
  title: 'Run/GateBudgets',
  args: { from: 'proposed', past: false },
  render: (args) => <Typed {...args} />,
};
export default meta;

type Story = StoryObj<Args>;

/** The rows over what the person typed, and what an approval would send of it. */
function Typed({ from, past }: Args) {
  const [amounts, setAmounts] = useState<Amounts>({});
  const budgets = budgetsOf(from, past);
  const { given, unread } = budgetsGiven(budgets, amounts);
  return (
    <div style={{ maxWidth: 560 }}>
      <GateBudgetRows step="implement" budgets={budgets} amounts={amounts} onAmounts={from === 'proposed' ? setAmounts : undefined} />
      {from === 'proposed' && (
        <p data-given className="font-mono text-body-small">
          {`given ${given.map((g) => `${g.step} ${g.usd}`).join(', ') || 'none'} · unread ${unread.join(', ') || 'none'}`}
        </p>
      )}
    </div>
  );
}

/**
 * Proposed: review's $60 above its workflow's $40. Typed down to $35, the words above it go and the approval would give it, before the
 * field is left; emptied, Approve would wait on it.
 */
export const Proposed: Story = {
  play: async ({ canvasElement }) => {
    const review = canvasElement.querySelector<HTMLElement>('[data-budget="review"]')!;
    const field = within(review).getByRole('textbox', { name: 'The budget of review, in dollars' });
    const given = () => canvasElement.querySelector('[data-given]')?.textContent;
    await expect(field).toHaveValue('$60.00');
    await expect(review.querySelector('[data-above-words]')).not.toBeNull();
    await userEvent.clear(field);
    await expect(given()).toBe('given none · unread review');
    await userEvent.type(field, '35');
    await expect(field).toHaveFocus();
    await expect(review.querySelector('[data-above-words]')).toBeNull();
    await expect(given()).toBe('given review 35 · unread none');
    await userEvent.type(field, '0');
    await expect(review.querySelector('[data-above-words]')).not.toBeNull();
    atRest();
    await expect(field).toHaveValue('$350.00');
  },
};

/** Proposed, the most the caps let the run cost past the line its factory set: the api's sentence, drawn as what a person weighs. */
export const PastTheLine: Story = {
  args: { past: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-past-line]')?.textContent).toMatch(/passes the line of \$50/);
  },
};

/** Approved: the caps the approval set, each read only. */
export const Approved: Story = {
  args: { from: 'approved' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('textbox')).toBeNull();
    await expect(canvasElement.querySelectorAll('[data-amount]').length).toBe(2);
  },
};
