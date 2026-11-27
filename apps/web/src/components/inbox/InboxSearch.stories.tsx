import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { searchQuery, type InboxPage, type InboxSearched } from '@/lib/api/inbox';
import { suggestedAsk } from '@/lib/searchBar';
import { FACTORY, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { InboxSearch } from './InboxSearch';

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

/**
 * The search bar of the Inbox, alone: its panel offers the keys the cards in view hold, narrows to a key's values, finds filters and
 * cards by what is typed, and offers the ways out of words that find nothing. A play that leaves the panel open is drawn with it, in
 * the frame's height.
 */
const meta: Meta<typeof InboxSearch> = {
  title: 'Store/InboxSearch',
  component: InboxSearch,
  args: { view: {}, labels: LABELS, counts: COUNTS, onSearch: fn() },
  beforeEach: () => localStorage.removeItem('nemia.inbox.recent'),
  render: (args) => (
    <QueryClientProvider
      client={seeded([
        [searchQuery(suggestedAsk(args.view, 'run-c'), args.view.factory).queryKey, FOUND],
        [searchQuery(suggestedAsk(args.view, 'zzz'), args.view.factory).queryKey, { entries: [], total: 0 }],
      ])}
    >
      <div style={{ width: 800, height: 580 }}>
        <InboxSearch {...args} />
      </div>
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof InboxSearch>;

/** The panel, as the board draws it, in the page's body. */
const panel = () => within(document.body);

/** Focused with nothing typed: a row for each key the cards hold, then factory, workflow and state, and the filters used last. */
export const FilterBy: Story = {
  beforeEach: () => {
    localStorage.setItem('nemia.inbox.recent', 'l=area%3Dboard%2Cfactory%3Dglobex');
    return () => localStorage.removeItem('nemia.inbox.recent');
  },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Search the cards' }));
    await waitFor(() => expect(panel().getAllByRole('option').length).toBeGreaterThan(0));
    const rows = panel().getAllByRole('option');
    const keys = rows.slice(0, 6).map((row) => row.textContent?.split(':')[0]);
    await expect(keys).toEqual(['area', 'initiative', 'work', 'factory', 'workflow', 'state']);
    await expect(rows[3]).toHaveTextContent('acme, globex');
    await expect(panel().getByText('Recent')).toBeVisible();
    await expect(rows[6]).toHaveTextContent('area: board');
    await expect(rows[6]).toHaveTextContent('factory: globex');
  },
};

/** A key and a colon narrows the panel to that key's values, each with how many cards hold it. */
export const KeyNarrows: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Search the cards' }));
    await userEvent.paste('area:');
    await waitFor(() => expect(panel().getAllByRole('option').length).toBe(3));
    for (const row of panel().getAllByRole('option')) await expect(row).toHaveTextContent(/^area: .+ cards?$/);
  },
};

/** Typing shows the filters the words match and the cards they find; a line keeps the words as the search. */
export const Typing: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const bar = within(canvasElement).getByRole('combobox', { name: 'Search the cards' });
    await userEvent.click(bar);
    await userEvent.paste('run-c');
    await waitFor(() => expect(panel().getByText('Cards')).toBeVisible());
    await expect(panel().getByText('Filter')).toBeVisible();
    await expect(panel().getByRole('option', { name: /area: run-core/ })).toHaveTextContent('17 cards');
    const first = panel().getByRole('option', { name: /Remove landing/ });
    await expect(first).toHaveTextContent('dtxn');
    await expect(first.querySelector('b')).toHaveTextContent('run-c');
    await userEvent.click(panel().getByRole('option', { name: /Show all 2 cards matching “run-c”/ }));
    await expect(args.onSearch).toHaveBeenCalledWith(expect.objectContaining({ search: 'run-c' }));
    await userEvent.click(bar);
    await userEvent.paste('run-c');
    await waitFor(() => expect(panel().getByText('Cards')).toBeVisible());
  },
};

/** Picking a card in the panel opens it. */
export const OpensACard: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Search the cards' }));
    await userEvent.paste('run-c');
    await userEvent.click(await panel().findByRole('option', { name: /Remove landing/ }));
    await waitFor(() =>
      expect(document.querySelector('[data-story-ground]')?.getAttribute('data-at')).toContain('/inbox/remove-landing-dtxn'),
    );
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

/** Words that find nothing offer the ways out, reachable by the arrow keys: the other side of the inbox, and every factory. */
export const NothingFound: Story = {
  args: { view: { factory: 'acme' } },
  play: async ({ args, canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Search the cards' }));
    await userEvent.paste('zzz');
    const closed = await panel().findByRole('option', { name: 'Search closed cards' });
    await expect(panel().getByRole('option', { name: 'Every factory' })).toBeVisible();
    await userEvent.click(closed);
    await expect(args.onSearch).toHaveBeenCalledWith(expect.objectContaining({ search: 'zzz', cards: 'closed' }));
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Search the cards' }));
    await userEvent.paste('zzz');
    await panel().findByRole('option', { name: 'Search closed cards' });
  },
};
