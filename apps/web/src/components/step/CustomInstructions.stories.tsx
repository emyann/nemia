import type { Meta, StoryObj } from '@storybook/react-vite';
import { CustomInstructions } from './CustomInstructions';
import { saysReading, Unread } from '../../../.storybook/unread';

/** An agent's custom instructions: here while they are read, the shape of their box and its Save. */
const meta: Meta<typeof CustomInstructions> = {
  title: 'Run/CustomInstructions',
  component: CustomInstructions,
  args: { name: 'writer' },
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <CustomInstructions {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The custom instructions still read. */
export const Reading: StoryObj<typeof meta> = {
  play: saysReading('Reading the custom instructions…'),
};
