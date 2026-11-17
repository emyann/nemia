import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { atRest } from '../../../.storybook/play';
import { NewWorkflow } from './NewWorkflow';

/** A new workflow of the person's, one story a state: offered, and its form opened, its first step's place not yet chosen. */
const meta: Meta<typeof NewWorkflow> = {
  title: 'Factory/NewWorkflow',
  component: NewWorkflow,
  args: { folder: '/home/you/.agent-workflows/workflows', onCreated: () => undefined },
  render: (args) => (
    <div style={{ width: 640 }}>
      <NewWorkflow {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof NewWorkflow>;

/** Offered: the kit's outlined New workflow. */
export const Offered: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'New workflow' })).toHaveAttribute('data-variant', 'outlined');
  },
};

/** Opened: the kit's text fields, the two places as the kit's radios with neither chosen, and Make it held until a name, a step and a place. */
export const Opened: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const part = within(canvasElement);
    await userEvent.click(part.getByRole('button', { name: 'New workflow' }));
    await expect(part.getByRole('textbox', { name: 'Workflow name' })).toBeVisible();
    await expect(part.getByRole('textbox', { name: 'What it is told' })).toBeVisible();
    await expect(part.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(0);
    await expect(part.getByRole('button', { name: 'Make it' })).toBeDisabled();
    atRest();
  },
};
