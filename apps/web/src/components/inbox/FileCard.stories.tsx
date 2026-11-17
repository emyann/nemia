import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileCard } from './FileCard';
import { saysReading, Unread } from '../../../.storybook/unread';

/** The box that files a card: here while the factories it lists are read, the shape of its line under the list. */
const meta: Meta<typeof FileCard> = {
  title: 'Store/FileCard',
  component: FileCard,
  args: { shown: 'solo' },
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <FileCard {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The factories still read. */
export const ReadingTheFactories: StoryObj<typeof meta> = {
  play: saysReading('Reading the factories…'),
};
