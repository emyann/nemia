import type { Meta, StoryObj } from '@storybook/react-vite';
import { PolicyRules } from './PolicyRules';
import { saysReading, Unread } from '../../../.storybook/unread';

/** Her rules at Auto: here while they are read, in the shape of the rules in force. */
const meta: Meta<typeof PolicyRules> = {
  title: 'Store/PolicyRules',
  component: PolicyRules,
  args: { agent: 'nemia' },
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <PolicyRules {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** Her rules still read. */
export const Reading: StoryObj<typeof meta> = {
  play: saysReading('Reading her rules…'),
};
