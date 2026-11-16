import type { Meta, StoryObj } from '@storybook/react-vite';
import { FactoryInstruction } from './FactoryInstruction';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A factory's instruction: here while it is read, the shape of its box and its Save. */
const meta: Meta<typeof FactoryInstruction> = {
  title: 'Factory/FactoryInstruction',
  component: FactoryInstruction,
  args: { name: 'nemia' },
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <FactoryInstruction {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The instruction still read. */
export const Reading: StoryObj<typeof meta> = {
  play: saysReading('Reading the instruction…'),
};
