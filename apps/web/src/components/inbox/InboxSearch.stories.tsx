import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { seeded } from '../../../.storybook/fixtures/proposals';
import { InboxSearch } from './InboxSearch';

/** The counts of a page: two cards not started, one working and one done. */
const COUNTS = { notStarted: 2, blocked: 0, waiting: 0, working: 1, done: 1, failed: 0, cancelled: 0 };

/** The search bar of the Inbox: its panel offers the keys the cards in view hold, then factory, workflow and state. */
const meta: Meta<typeof InboxSearch> = {
  title: 'Store/InboxSearch',
  component: InboxSearch,
  args: {
    view: {},
    labels: [
      { key: 'area', value: 'board', cards: 4 },
      { key: 'factory', value: 'acme', cards: 4 },
      { key: 'workflow', value: 'build', cards: 4 },
    ],
    counts: COUNTS,
    onSearch: fn(),
  },
  beforeEach: () => localStorage.removeItem('nemia.inbox.recent'),
  render: (args) => (
    <QueryClientProvider client={seeded([])}>
      <div style={{ width: 800, height: 380 }}>
        <InboxSearch {...args} />
      </div>
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof InboxSearch>;

/** Focused with nothing typed: a row for the key the cards hold, then factory, workflow and state. */
export const Keys: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Search the cards' }));
    await waitFor(() => expect(within(document.body).getAllByRole('option')).toHaveLength(4));
    await userEvent.keyboard('{Escape}');
  },
};

/** A filter in the address is a chip in the bar, with the key that clears everything. */
export const Filtered: Story = {
  args: { view: { l: 'area=board', phase: 'working' } },
  play: async ({ canvasElement, userEvent, args }) => {
    await expect(canvasElement.querySelector('[data-chip="state=working"]')).not.toBeNull();
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Clear everything' }));
    await expect(args.onSearch).toHaveBeenCalledWith(expect.objectContaining({ l: undefined, phase: undefined }));
  },
};
