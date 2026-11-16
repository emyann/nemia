import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { NowForm } from './PauseButton';
import { saysReading, Unread } from '../../../.storybook/unread';

/** Stop now… of the pause: here while what runs is read, the shape of what it says it stops. */
const meta: Meta<typeof NowForm> = {
  title: 'Frame/PauseButton',
  component: NowForm,
  args: { standing: false, onPut: fn(), onClose: fn(), isPending: false },
  render: (args) => (
    <Unread>
      <div style={{ width: 360 }}>
        <NowForm {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** What runs still read. */
export const ReadingWhatRuns: StoryObj<typeof meta> = { play: saysReading('Reading what runs.') };
