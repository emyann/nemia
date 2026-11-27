import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import type { InboxPage } from '@/lib/api/inbox';
import { seeded } from '../../../.storybook/fixtures/proposals';
import { InboxSides, InboxToolbar } from './InboxToolbar';

/** The counts of a page: two cards not started, one working and one done. */
const COUNTS = { notStarted: 2, blocked: 0, waiting: 0, working: 1, done: 1, failed: 0, cancelled: 0 };

/** The labels of two factories' cards, as the card list counts them. */
const LABELS: InboxPage['labels'] = [
  { key: 'area', value: 'board', cards: 4 },
  { key: 'area', value: 'run-core', cards: 17 },
  { key: 'area', value: 'runtime', cards: 6 },
  { key: 'initiative', value: 'run-core', cards: 1 },
  { key: 'initiative', value: 'design-pass', cards: 3 },
  { key: 'work', value: 'feature', cards: 2 },
  { key: 'work', value: 'fix', cards: 5 },
  { key: 'factory', value: 'acme', cards: 20 },
  { key: 'factory', value: 'globex', cards: 4 },
  { key: 'workflow', value: 'build', cards: 18 },
  { key: 'workflow', value: 'quick', cards: 6 },
];

/** The search bar, the sort and the layout of the Inbox, and the sides under it. */
const meta: Meta<typeof InboxToolbar> = {
  title: 'Store/InboxToolbar',
  component: InboxToolbar,
  args: { view: {}, labels: LABELS, counts: COUNTS, layout: 'grid', onLayout: fn(), onSearch: fn() },
  beforeEach: () => localStorage.removeItem('nemia.inbox.recent'),
  render: (args) => (
    <QueryClientProvider client={seeded([])}>
      <div style={{ width: 1000, height: 460 }}>
        <InboxToolbar {...args} />
      </div>
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof InboxToolbar>;

/** The panel, as the board draws it, in the page's body. */
const panel = () => within(document.body);

/** Nothing asked: the bar, Newest and Grid. */
export const Bare: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox', { name: 'Search the cards' })).toBeVisible();
  },
};

/** A search, a label and a state kept: each a chip in the bar, with the key that clears them all. */
export const Searched: Story = {
  args: { view: { search: 'reads', l: 'area=board', phase: 'blocked' } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-chip="q"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-chip="area=board"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-chip="state=blocked"]')).not.toBeNull();
    await expect(within(canvasElement).getByRole('button', { name: 'Clear everything' })).toBeVisible();
  },
};

/** The arrow keys move over the keys and Enter picks one, which narrows the panel to its values; Esc closes the panel. */
export const Keyboard: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const bar = within(canvasElement).getByRole('combobox', { name: 'Search the cards' });
    await userEvent.click(bar);
    await waitFor(() => expect(panel().getAllByRole('option').length).toBeGreaterThan(0));
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(bar).toHaveValue('area:');
    await waitFor(() => expect(panel().getAllByRole('option').length).toBe(3));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(panel().queryByRole('listbox')).toBeNull());
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
