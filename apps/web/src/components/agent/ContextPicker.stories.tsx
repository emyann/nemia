import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ConcludedPreview, ContextPicker } from './ContextPicker';
import { saysReading, Unread } from '../../../.storybook/unread';

/** The runs a start reads what they concluded from: here while they are read, the shape of the list's rows. */
const meta: Meta<typeof ContextPicker> = {
  title: 'Store/ContextPicker',
  component: ContextPicker,
  args: { selected: [], onChange: fn() },
  render: (args) => (
    <Unread>
      <div style={{ width: 560 }}>
        <ContextPicker {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The runs still read. */
export const ReadingTheRuns: StoryObj<typeof meta> = {
  play: saysReading('Reading the runs…'),
};

/** A run picked, what it concluded still read: the shape of its section. */
export const ReadingWhatItConcluded: StoryObj<typeof meta> = {
  render: () => (
    <Unread>
      <div style={{ width: 560 }}>
        <ConcludedPreview run="r-1" />
      </div>
    </Unread>
  ),
  play: saysReading('Reading what it concluded…'),
};
