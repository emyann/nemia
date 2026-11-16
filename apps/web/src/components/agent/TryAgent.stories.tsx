import type { Meta, StoryObj } from '@storybook/react-vite';
import { TryRun } from './TryAgent';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A try of an agent: here while its run is read, in the shape of its box. */
const meta: Meta<typeof TryRun> = {
  title: 'Store/TryAgent',
  component: TryRun,
  args: { id: 'r-try' },
  render: (args) => (
    <Unread>
      <div style={{ width: 480 }}>
        <TryRun {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The try still read. */
export const Reading: StoryObj<typeof meta> = {
  play: saysReading('Reading the try…'),
};
