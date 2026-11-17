import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { atRest } from '../../../.storybook/play';
import { listing } from '../../../.storybook/fixtures/factories';
import { RemoveWorkflow } from './RemoveWorkflow';

/** A workflow of the person's, listed. */
const QUICK = listing('quick');

/** Remove on a workflow of the person's, one story a state: offered, and asked before anything is removed. */
const meta: Meta<typeof RemoveWorkflow> = {
  title: 'Factory/RemoveWorkflow',
  component: RemoveWorkflow,
  args: { workflow: QUICK },
  render: (args) => (
    <div style={{ width: 560, display: 'flex', flexWrap: 'wrap' }}>
      <RemoveWorkflow {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof RemoveWorkflow>;

/** Offered: the kit's outlined Remove…. */
export const Offered: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Remove…' })).toHaveAttribute('data-slot', 'button');
  },
};

/** Remove… pressed: what goes, the kit's Remove in the error's colour and Keep it. */
export const Asking: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const part = within(canvasElement);
    await userEvent.click(part.getByRole('button', { name: 'Remove…' }));
    await expect(canvasElement.querySelector('[data-remove-asks] code')?.textContent).toBe(QUICK.dir);
    await expect(part.getByRole('button', { name: 'Remove' })).toBeVisible();
    await expect(part.getByRole('button', { name: 'Keep it' })).toBeVisible();
    atRest();
  },
};
