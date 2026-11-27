import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { searchQuery, type InboxPage, type InboxSearched } from '@/lib/api/inbox';
import { suggestedAsk } from '@/lib/searchBar';
import { FACTORY, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';
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
  { key: 'factory', value: 'nemia', cards: 20 },
  { key: 'factory', value: 'pipao', cards: 4 },
  { key: 'workflow', value: 'build', cards: 18 },
  { key: 'workflow', value: 'quick', cards: 6 },
];

/** The cards the words `run-c` find: two of the factory, each with a title that holds them. */
const FOUND: InboxSearched = {
  entries: [
    { ...unstartedCard('remove-landing-dtxn', FACTORY), title: 'run-core: Remove landing from the core' },
    {
      ...unstartedCard('a-waiting-run-wu2j', FACTORY),
      title: 'run-core: A waiting run waits for the other run',
      state: 'running',
      phase: 'working',
    },
  ],
  total: 2,
};

/** The search bar, the sort and the layout of the Inbox, and the sides under it. */
const meta: Meta<typeof InboxToolbar> = {
  title: 'Store/InboxToolbar',
  component: InboxToolbar,
  args: { view: {}, labels: LABELS, counts: COUNTS, layout: 'grid', onLayout: fn(), onSearch: fn() },
  beforeEach: () => localStorage.removeItem('nemia.inbox.recent'),
  render: (args) => (
    <QueryClientProvider client={seeded([[searchQuery(suggestedAsk({}, 'run-c'), undefined).queryKey, FOUND]])}>
      <div style={{ width: 1000, height: 460 }}>
        <InboxToolbar {...args} />
      </div>
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof InboxToolbar>;

/** The panel, as the board draws it, in the page's body: it opens where the options are, outside the story's frame. */
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

/** Focused with nothing typed: a row for each key the cards hold, then factory, workflow and state, and the filters used last. */
export const FilterBy: Story = {
  beforeEach: () => {
    localStorage.setItem('nemia.inbox.recent', 'l=area%3Dboard%2Cfactory%3Dpipao');
    return () => localStorage.removeItem('nemia.inbox.recent');
  },
  play: async ({ canvasElement, userEvent }) => {
    const bar = within(canvasElement).getByRole('combobox', { name: 'Search the cards' });
    await userEvent.click(bar);
    await waitFor(() => expect(panel().getAllByRole('option').length).toBeGreaterThan(0));
    const rows = panel().getAllByRole('option');
    const keys = rows.slice(0, 6).map((row) => row.textContent?.split(':')[0]);
    await expect(keys).toEqual(['area', 'initiative', 'work', 'factory', 'workflow', 'state']);
    await expect(rows[3]).toHaveTextContent('nemia, pipao');
    await expect(panel().getByText('Recent')).toBeVisible();
    await expect(rows[6]).toHaveTextContent('area: board · factory: pipao');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(bar).toHaveValue('area:');
  },
};

/** A key and a colon narrows the panel to that key's values, each with how many cards hold it; Esc closes it. */
export const KeyNarrows: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.type(within(canvasElement).getByRole('combobox', { name: 'Search the cards' }), 'area:');
    await waitFor(() => expect(panel().getAllByRole('option').length).toBe(3));
    for (const row of panel().getAllByRole('option')) await expect(row).toHaveTextContent(/^area: .+ cards?$/);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(panel().queryByRole('listbox')).toBeNull());
  },
};

/** Typing shows the filters the words match and the cards they find, then a line that keeps them as the search. */
export const Typing: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    await userEvent.type(within(canvasElement).getByRole('combobox', { name: 'Search the cards' }), 'run-c');
    await waitFor(() => expect(panel().getByText('Cards')).toBeVisible());
    await expect(panel().getByText('Filter')).toBeVisible();
    await expect(panel().getByRole('option', { name: /area: run-core/ })).toHaveTextContent('17 cards');
    const first = panel().getByRole('option', { name: /Remove landing/ });
    await expect(first).toHaveTextContent('dtxn');
    await expect(first.querySelector('b')).toHaveTextContent('run-c');
    await userEvent.click(panel().getByRole('option', { name: /Show all 2 cards matching “run-c”/ }));
    await expect(args.onSearch).toHaveBeenCalledWith(expect.objectContaining({ search: 'run-c' }));
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
