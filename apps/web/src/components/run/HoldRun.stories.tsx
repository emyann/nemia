import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { HoldRun } from './HoldRun';
import { CODES, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A run at work, which a hold may hold. */
const AT_WORK = runOf(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)]));

/** A run's Hold…: here opened while the runs it may wait on are read, the shape of their list. */
const meta: Meta<typeof HoldRun> = {
  title: 'Run/HoldRun',
  component: HoldRun,
  args: { run: AT_WORK },
  render: (args) => (
    <Unread>
      <div style={{ width: 480, minHeight: 320 }}>
        <HoldRun {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** Opened, the runs still read. */
export const Reading: StoryObj<typeof meta> = {
  play: async (context) => {
    await userEvent.click(within(context.canvasElement).getByRole('button', { name: 'Hold…' }));
    await saysReading('Reading the runs to wait on…')(context);
  },
};
