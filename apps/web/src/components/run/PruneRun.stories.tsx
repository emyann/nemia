import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { PruneRun } from './PruneRun';
import { CODES, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A run that ended, its worktrees still on disk: one a prune is offered on. */
const ENDED = runOf(stepOf(CODES.done, [tryOf(1, CODES.done, true, null)]));

/** A run's Prune…: here opened while whether it was merged is read, the shape of its form. */
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
