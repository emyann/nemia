import type { Meta, StoryObj } from '@storybook/react-vite';
import { GaugesBar } from './GaugesBar';
import { saysReading, Unread } from '../../../.storybook/unread';

/** This machine's gauges: here while what is at work and the version are read, each the shape of its sentence. */
const meta: Meta<typeof GaugesBar> = {
  title: 'Frame/GaugesBar',
  component: GaugesBar,
  args: { feed: 'open' },
  render: (args) => (
    <Unread>
      <div style={{ width: 420 }}>
        <GaugesBar {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** What is at work still read. */
export const ReadingTheRuns: StoryObj<typeof meta> = {
  play: saysReading('Reading the runs…'),
};

/** The version still read. */
export const ReadingTheVersion: StoryObj<typeof meta> = {
  play: saysReading('Reading the version…'),
};
