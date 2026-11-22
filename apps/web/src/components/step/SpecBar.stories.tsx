import type { Meta, StoryObj } from '@storybook/react-vite';
import { SpecBar } from './SpecBar';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A workflow step's bar: here while the workflows are read, in the shape of what it holds. */
const meta: Meta<typeof SpecBar> = {
  title: 'Run/SpecBar',
  component: SpecBar,
  args: { from: 'repo', workflow: 'build', step: 'design' },
  render: (args) => (
    <Unread>
      <div style={{ width: 420 }}>
        <SpecBar {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The workflows still read. */
export const Reading: StoryObj<typeof meta> = { tags: ['network'], play: saysReading('Reading the workflows…') };
