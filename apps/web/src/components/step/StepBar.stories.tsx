import type { Meta, StoryObj } from '@storybook/react-vite';
import { StepBar } from './StepBar';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A step's bar: here while its run is read, in the shape of what it holds. */
const meta: Meta<typeof StepBar> = {
  title: 'Run/StepBar',
  component: StepBar,
  args: { run: 'r-1', step: 'design' },
  render: (args) => (
    <Unread>
      <div style={{ width: 420 }}>
        <StepBar {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The run still read. */
export const Reading: StoryObj<typeof meta> = {
  play: saysReading('Reading the run…'),
};
