import type { Meta, StoryObj } from '@storybook/react-vite';
import { FactoryRules } from './FactoryRules';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A factory's rules: here while they are read, the shape of their box and its Save. */
const meta: Meta<typeof FactoryRules> = {
  title: 'Factory/FactoryRules',
  component: FactoryRules,
  args: { name: 'nemia' },
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <FactoryRules {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The rules still read. */
export const Reading: StoryObj<typeof meta> = {
  play: saysReading('Reading the rules…'),
};
