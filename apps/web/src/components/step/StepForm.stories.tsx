import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { KeyForm } from '@/lib/api/builder';
import { UNSET, type DraftStep } from '@/lib/builder';
import { atRest } from '../../../.storybook/play';
import { StepForm } from './StepForm';

/** The builder's form, cut to a step's amounts: its budget in dollars and its retries, a count. */
const FORM: KeyForm = {
  keys: [
    { key: 'budget', meaning: 'The most its tries may cost, in dollars.', kind: 'dollars', choices: null, byHarness: null },
    { key: 'retries', meaning: 'How many times it is tried again after a refusal.', kind: 'count', choices: null, byHarness: null },
  ],
  defaultHarness: 'local',
  roleKeys: [],
  policyKeys: [],
  agents: {},
  remote: { prefix: 'a2a:', refuses: [] },
};

/** A step of no agent, its amounts given as `budget` and `retries`. */
const stepOf = (budget: number | null, retries: number | null) =>
  ({
    name: 'implement',
    spec: { ...UNSET, budget, retries },
    body: 'Build the change.',
    own: null,
    schema: null,
  }) satisfies DraftStep as DraftStep;

/** The amounts a step's form follows, as the builder's draft holds them. */
type Args = { budget: number | null; retries: number | null };

/**
 * A step's form on the builder, cut to its amounts, a story a state: set, and unset; and beside it what the draft holds
 * (`data-draft`), which follows each keystroke.
 */
const meta: Meta<Args> = {
  title: 'Factory/StepForm',
  args: { budget: 5, retries: 1 },
  render: (args) => <Drafted {...args} />,
};
export default meta;

type Story = StoryObj<Args>;

/** The form over a draft of one step, and the draft's amounts. */
function Drafted({ budget, retries }: Args) {
  const [steps, setSteps] = useState([stepOf(budget, retries)]);
  const [step] = steps as [DraftStep];
  return (
    <div style={{ maxWidth: 420 }}>
      <StepForm
        step={step}
        steps={steps}
        form={FORM}
        schemas={[]}
        refused={null}
        layers={null}
        update={(change) => setSteps(change)}
        onRemoved={() => undefined}
      />
      <p data-draft className="font-mono text-body-small">
        {`budget ${step.spec.budget ?? 'unset'} · retries ${step.spec.retries ?? 'unset'}`}
      </p>
    </div>
  );
}

/** Set: the budget in dollars, to the cent, the retries whole; the draft hears each keystroke, the field keeping what is typed. */
export const Set: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const draft = () => canvasElement.querySelector('[data-draft]')?.textContent;
    const budget = page.getByRole('textbox', { name: 'budget' });
    await expect(budget).toHaveValue('$5.00');
    await expect(page.getByRole('textbox', { name: 'retries' })).toHaveValue('1');
    await userEvent.clear(budget);
    await expect(draft()).toBe('budget unset · retries 1');
    await userEvent.type(budget, '7.');
    await expect(draft()).toBe('budget 7 · retries 1');
    await userEvent.type(budget, '5');
    await expect(draft()).toBe('budget 7.5 · retries 1');
    await expect(budget).toHaveValue('7.5');
    atRest();
    await expect(budget).toHaveValue('$7.50');
  },
};

/** Unset: each field empty, and what it stands at said under it. */
export const Unset: Story = {
  args: { budget: null, retries: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('textbox', { name: 'budget' })).toHaveValue('');
    await expect(page.getAllByText('not set').length).toBeGreaterThanOrEqual(2);
  },
};
