import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { PruneRun } from './PruneRun';
import { CODES, NOW, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A run that ended, its worktrees still on disk: one a prune is offered on. */
const ENDED = runOf(stepOf(CODES.done, [tryOf(1, CODES.done, true, null)]));

/** A run's Prune…: opened while whether it was merged is read, the shape of its form; and, for a run called off, the form itself. */
const meta: Meta<typeof PruneRun> = {
  title: 'Run/PruneRun',
  component: PruneRun,
  args: { run: ENDED },
  render: (args) => (
    <Unread>
      <div style={{ width: 480, minHeight: 320 }}>
        <PruneRun {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** Opened, whether it was merged still read. */
export const Reading: StoryObj<typeof meta> = {
  play: async (context) => {
    await userEvent.click(within(context.canvasElement).getByRole('button', { name: /^Prune/ }));
    await saysReading('Reading whether it was merged…')(context);
  },
};

/** A run called off, its worktrees still on disk: nobody has anything to decide of it, so its form reads nothing first. */
const CALLED_OFF = { ...ENDED, status: 'cancelled' as const, cancelledAt: NOW.toISOString() };

/** Opened on a run called off: what to give back, a choice each, the first chosen; then Prune… asks, in words that say what goes. */
export const Choices: StoryObj<typeof meta> = {
  args: { run: CALLED_OFF },
  render: (args) => (
    <div style={{ width: 480, minHeight: 520 }}>
      <PruneRun {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Prune/ }));
    const form = within(canvasElement.ownerDocument.body);
    const choices = await form.findAllByRole('radio');
    await expect(choices[0]).toBeChecked();
    await userEvent.click(form.getByRole('button', { name: 'Prune…' }));
    await expect(canvasElement.ownerDocument.body.querySelector('[data-prune-question]')).not.toBeNull();
  },
};
