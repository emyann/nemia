import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { InboxSides, InboxToolbar } from './InboxToolbar';

/** The counts of a page: two cards not started, one working and one done. */
const COUNTS = { notStarted: 2, blocked: 0, waiting: 0, working: 1, done: 1, failed: 0, cancelled: 0 };

/** The search bar, the sort and the layout of the Inbox, and the sides under it. */
const meta: Meta<typeof InboxToolbar> = {
  title: 'Store/InboxToolbar',
  component: InboxToolbar,
  args: {
    view: {},
    labels: [
      { key: 'area', value: 'board', cards: 4 },
      { key: 'work', value: 'feature', cards: 2 },
    ],
    layout: 'grid',
    onLayout: fn(),
    onSearch: fn(),
  },
  render: (args) => (
    <div style={{ width: 1000 }}>
      <InboxToolbar {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof InboxToolbar>;

/** Nothing asked: the bar, Newest and Grid. */
export const Bare: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox', { name: 'Search the cards' })).toBeVisible();
  },
};

/** A search and a label kept: each a chip in the bar. */
export const Searched: Story = {
  args: { view: { q: 'reads', l: 'area=board' } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-chip="q"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-chip="area=board"]')).not.toBeNull();
  },
};

/** Open and Closed with their counts, and the chips of the open side's states. */
export const Sides: Story = {
  render: (args) => (
    <div style={{ width: 1000 }}>
      <InboxSides view={args.view} counts={COUNTS} onSearch={args.onSearch} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-cards-count="open"]')).toHaveTextContent('3');
  },
};
