import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { LibraryReading } from './LibraryReading';

/** The Library page while the store's library is read: the shape of its kinds and their items, named for a screen reader. */
const meta: Meta<typeof LibraryReading> = { title: 'Store/LibraryReading', component: LibraryReading, args: {} };
export default meta;

/** The page's shape, as the route draws it while its read is out. */
export const Reading: StoryObj<typeof LibraryReading> = {
  render: () => (
    <div style={{ width: 760 }}>
      <LibraryReading />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent("Reading the store's library…");
  },
};
