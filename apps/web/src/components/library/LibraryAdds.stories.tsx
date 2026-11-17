import type { Meta, StoryObj } from '@storybook/react-vite';
import { LibraryAdds } from './LibraryAdds';
import { saysReading, Unread } from '../../../.storybook/unread';

/** What a factory adds from the store's library: here while its adds are read, the shape of its list. */
const meta: Meta<typeof LibraryAdds> = {
  title: 'Factory/LibraryAdds',
  component: LibraryAdds,
  args: { name: 'nemia' },
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <LibraryAdds {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The adds still read. */
export const Reading: StoryObj<typeof meta> = {
  play: saysReading('Reading the adds…'),
};
