import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FrameHeader } from './FrameHeader';
import { FramePaneProvider } from './HerSheet';

/** What a story of the head draws: the page at `path`. */
type Args = { path: string };

/** The page's head at `path`, as wide as a page's column, under the frame's own state. */
const drawn = ({ path }: Args) => (
  <FramePaneProvider shortcut={false}>
    <div style={{ width: 720, '--frame-top': '4rem' } as CSSProperties}>
      <FrameHeader path={path} />
    </div>
  </FramePaneProvider>
);

/**
 * The page's head on a screen wider than a tablet, a story a state: it names a page, and names nothing on an address no route has. On a
 * narrow screen the menu button and her face come first, which the frame's e2e pages hold (`sidebar`).
 */
const meta: Meta<Args> = { title: 'Frame/FrameHeader', args: { path: '/runs' }, render: drawn };
export default meta;

type Story = StoryObj<Args>;

/** A page of the store's: its name, and no menu button, the rail holding it. */
export const NamesThePage: Story = {
  play: async ({ canvasElement }) => {
    const head = within(canvasElement);
    await expect(head.getByText('Runs')).toBeVisible();
    await expect(head.queryByRole('button')).toBeNull();
  },
};

/** An address no route has: the head names nothing. */
export const NamesNothing: Story = {
  args: { path: '/nowhere' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-page-name]')).toBeNull();
  },
};
