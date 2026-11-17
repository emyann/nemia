import type { Meta, StoryObj } from '@storybook/react-vite';
import { FactoryDelegations } from './FactoryDelegations';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A factory's delegations: here while they are read, the shape of its list. */
const meta: Meta<typeof FactoryDelegations> = {
  title: 'Factory/FactoryDelegations',
  component: FactoryDelegations,
  args: { name: 'nemia' },
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <FactoryDelegations {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The delegations still read. */
export const Reading: StoryObj<typeof meta> = {
  play: saysReading('Reading the delegations…'),
};
