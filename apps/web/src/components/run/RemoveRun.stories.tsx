import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RemoveRun } from './RemoveRun';

/** Remove, on a try's page, asked twice: the first press asks, the second removes. */
const meta: Meta<typeof RemoveRun> = {
  title: 'Run/RemoveRun',
  component: RemoveRun,
  args: { id: 'try-scribe-notes-c3d4' },
  render: (args) => (
    <div style={{ width: 400 }}>
      <RemoveRun {...args} />
    </div>
  ),
};
export default meta;

/** Remove… pressed: the question, Remove and Keep it. */
export const Asking: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'Remove…' }));
    await expect(page.getByRole('button', { name: 'Remove' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Keep it' })).toBeEnabled();
  },
};
