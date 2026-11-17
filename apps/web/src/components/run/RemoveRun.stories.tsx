import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { RemoveRun } from './RemoveRun';

/** Remove, asked once a menu's Remove… was pressed: Remove removes, Keep it closes the question. */
const meta: Meta<typeof RemoveRun> = {
  title: 'Run/RemoveRun',
  component: RemoveRun,
  args: { id: 'try-scribe-notes-c3d4', onClose: fn() },
  render: (args) => (
    <div style={{ width: 400 }}>
      <RemoveRun {...args} />
    </div>
  ),
};
export default meta;

/** Asked: the question, Remove and Keep it, which closes it. */
export const Asking: StoryObj<typeof meta> = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('button', { name: 'Remove' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Keep it' }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};
