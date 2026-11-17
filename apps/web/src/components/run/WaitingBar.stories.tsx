import type { Meta, StoryObj } from '@storybook/react-vite';
import { WaitingBar } from './WaitingBar';
import { saysReading, Unread } from '../../../.storybook/unread';

/** The bar of what waits on you in every factory: here while the runs are read, the shape of its rows. */
const meta: Meta<typeof WaitingBar> = {
  title: 'Run/WaitingBar',
  component: WaitingBar,
  args: {},
  render: () => (
    <Unread>
      <div style={{ width: 420 }}>
        <WaitingBar />
      </div>
    </Unread>
  ),
};
export default meta;

/** The runs still read. */
export const Reading: StoryObj<typeof meta> = {
  play: saysReading('Reading the runs…'),
};
