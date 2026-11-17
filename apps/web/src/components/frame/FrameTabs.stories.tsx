import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FrameTabs } from './FrameTabs';

/** What a story of the strip draws: the page at `path`, standing in for the page the frame holds under it. */
type Args = { path: string };

/** The strip over a page at `path` that says which it is, as wide as a page's column. */
const drawn = ({ path }: Args) => (
  <div style={{ width: 720 }}>
    <FrameTabs path={path}>
      <p data-page className="px-4 py-6 text-body-medium">
        The page at {path}.
      </p>
    </FrameTabs>
  </div>
);

/**
 * The frame's strip of Settings' tabs, the kit's primary `Tabs`, `TabList`, `Tab` and `TabPanel`, a story a state: Settings selected,
 * another tab selected, and a page with one view, drawn bare.
 */
const meta: Meta<Args> = { title: 'Frame/FrameTabs', args: { path: '/settings' }, render: drawn };
export default meta;

type Story = StoryObj<Args>;

/** On Settings: the four tabs, Settings selected, each a link to its own address, and its page in the panel. */
export const OnSettings: Story = {
  play: async ({ canvasElement }) => {
    const strip = within(canvasElement).getByRole('tablist', { name: 'Settings' });
    const tabs = within(strip).getAllByRole('tab');
    await expect(tabs.map((tab) => tab.textContent)).toEqual(['Settings', 'Capabilities', 'Setup', 'Tokens']);
    await expect(tabs.map((tab) => tab.getAttribute('href'))).toEqual(['/settings', '/capabilities', '/setup', '/tokens']);
    await expect(within(strip).getByRole('tab', { selected: true })).toHaveTextContent('Settings');
    await expect(within(canvasElement).getByRole('tabpanel')).toHaveTextContent('The page at /settings.');
  },
};

/** On Tokens: its tab alone selected. */
export const OnTokens: Story = {
  args: { path: '/tokens' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('tab', { selected: true })).toHaveTextContent('Tokens');
  },
};

/** A page with one view: no strip, the page bare. */
export const OnePage: Story = {
  args: { path: '/agents' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('tablist')).toBeNull();
    await expect(within(canvasElement).getByText('The page at /agents.')).toBeVisible();
  },
};
