import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { DebugPanel } from './DebugPanel';
import { CODES, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A run whose one step is at work. */
const AT_WORK = runOf(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)]));

/** A step's Debug: here opened while the path its try took is read, the shape of its graph and its lines. */
const meta: Meta<typeof DebugPanel> = {
  title: 'Run/DebugPanel',
  component: DebugPanel,
  args: { run: AT_WORK, step: AT_WORK.steps[0], shown: 1 },
  render: (args) => (
    <Unread>
      <div style={{ width: 720 }}>
        <DebugPanel {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** Opened, the path still read. */
export const Reading: StoryObj<typeof meta> = {
  play: async (context) => {
    await userEvent.click(within(context.canvasElement).getByRole('button', { name: /Debug/ }));
    await saysReading('Reading the path…')(context);
  },
};
