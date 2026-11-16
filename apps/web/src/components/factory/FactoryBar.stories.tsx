import type { Meta, StoryObj } from '@storybook/react-vite';
import { FactoryBar } from './FactoryBar';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A factory's bar: here while the factories and their runs are read, in the shape of what it holds. */
const meta: Meta<typeof FactoryBar> = {
  title: 'Factory/FactoryBar',
  component: FactoryBar,
  args: { factory: 'nemia' },
  render: (args) => (
    <Unread>
      <div style={{ width: 420 }}>
        <FactoryBar {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The factories still read. */
export const Reading: StoryObj<typeof meta> = {
  play: saysReading('Reading the factories…'),
};
