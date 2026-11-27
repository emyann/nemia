import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { AgentInstructions } from './AgentInstructions';

const body = Array.from({ length: 24 }, (_, i) => `Line ${i + 1}: check the change against what the card asked.`).join('\n\n');

/** An agent's instructions: a panel of their first ten lines with their word count, and Show all, which opens the whole of them. */
const meta: Meta<typeof AgentInstructions> = {
  title: 'Frame/Agent instructions',
  component: AgentInstructions,
  args: { name: 'reviewer', file: 'agents/reviewer.md', body },
};
export default meta;

type Story = StoryObj<typeof AgentInstructions>;

/** The panel, closed. */
export const Panel: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByRole('button', { name: 'Show all' })).toBeVisible());
  },
};

/** Show all opens a dialog named for the agent, and Escape closes it. */
export const Opened: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Show all' }));
    await within(document.body).findByRole('dialog', { name: "Reviewer's instructions" });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
  },
};
