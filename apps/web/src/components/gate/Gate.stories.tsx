import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Gate } from './Gate';

/** A step at its gate, with a send-back to itself: the gate the run page opens on, boxed with its own sentence. */
const meta: Meta<typeof Gate> = {
  title: 'Run/Gate',
  component: Gate,
  args: { runId: 'r-1', step: 'plan', approveLine: 'approve r-1 plan' },
  render: (args) => (
    <div style={{ width: 420 }}>
      <Gate {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof Gate>;

/** The gate of `plan`: its sentence, the box for words, Approve, and the send-back form. */
export const AtItsGate: Story = {
  play: async ({ canvasElement }) => {
    const gate = within(canvasElement).getByRole('region', { name: 'The gate of plan' });
    await expect(within(gate).getByRole('button', { name: 'Approve' })).toBeEnabled();
  },
};

/** A gate no send-back reaches: Approve alone. */
export const ApprovalAlone: Story = {
  args: { back: [] },
  play: async ({ canvasElement }) => {
    const gate = within(canvasElement).getByRole('region', { name: 'The gate of plan' });
    await expect(within(gate).getByRole('button', { name: 'Approve' })).toBeEnabled();
    await expect(within(gate).queryByRole('button', { name: /Send back/ })).toBeNull();
  },
};
