import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { RunBody } from './RunBar';
import { CODES, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';

/** A run at its gate: it asks a person to approve its one step, which the bar lists and points to. */
const AT_GATE = runOf(stepOf(CODES.gate, [tryOf(1, CODES.gate, true, null)], true));

/** What the frame's bar holds of a run: what it asks of a person, each step a line names a button; its steps, each a button; its brief. */
const meta: Meta<typeof RunBody> = {
  title: 'Run/RunBar',
  component: RunBody,
  args: { id: AT_GATE.id, run: AT_GATE, error: null },
  render: (args) => (
    <div style={{ width: 400 }} className="space-y-4">
      <RunBody {...args} />
    </div>
  ),
};
export default meta;

/** A run at its gate: the ask, pointing to its step, and its steps, each pressed to show it in the bar. */
export const AtItsGate: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement);
    await expect(bar.getByRole('region', { name: 'Steps' })).toBeInTheDocument();
    await expect(canvasElement.querySelector(`button[data-step="${AT_GATE.steps[0].name}"]`)).not.toBeNull();
  },
};
