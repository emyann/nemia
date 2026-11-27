import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import { chainsQuery, inboxPageQuery, searchQuery, type InboxEntry, type InboxPage as Page } from '@/lib/api/inbox';
import { everyFactory, suggestedAsk } from '@/lib/searchBar';
import { inboxAskedOf, type InboxView } from '@/lib/inbox';
import { FACTORY, factoryView, queuedCard, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { InboxPage } from './InboxPage';

/** The counts of a page that holds nothing. */
const NONE: Page['counts'] = { notStarted: 0, blocked: 0, waiting: 0, working: 0, done: 0, failed: 0, cancelled: 0 };

/** A card of the factory in a state the run's phase says: started as a run, the phase its chips count. */
const started = (name: string, state: InboxEntry['state'], phase: InboxEntry['phase']) => ({
  ...unstartedCard(name, FACTORY),
  workflow: 'quick',
  startedAs: [`${name}-k2rq`],
  state,
  phase,
});

/**
 * The inbox page over the cards `cards`, its factories `nemia`'s alone, every read answered from the seed: the store's Inbox, or, where
 * `factory` is given, that factory's, seeded under its own read's key. `chains` are the cards in chains the page draws above its cards;
 * `layout` is what this browser keeps of Grid or List.
 */
const drawn = ({
  cards,
  at = {},
  chains = [],
  counts = NONE,
  remaining = 0,
  layout = 'grid',
  extra = [],
  onSearch = () => undefined,
}: {
  cards: readonly InboxEntry[];
  at?: InboxView;
  chains?: readonly InboxEntry[];
  counts?: Page['counts'];
  remaining?: number;
  layout?: 'grid' | 'list';
  extra?: ReadonlyArray<readonly [readonly unknown[], unknown]>;
  onSearch?: (patch: Partial<InboxView>) => void;
}) => {
  localStorage.setItem('nemia.inbox.layout', layout);
  const page: Page = {
    entries: [...cards],
    counts,
    labels: [
      { key: 'area', value: 'board', cards: 4 },
      { key: 'work', value: 'feature', cards: 2 },
    ],
    next: remaining > 0 ? 'bmV4dA' : null,
    remaining,
  };
  return (
    <QueryClientProvider
      client={seeded([
        [factoriesQuery.queryKey, [factoryView(FACTORY)]],
        [inboxPageQuery(inboxAskedOf(at), at.factory).queryKey, page],
        [chainsQuery(at.factory).queryKey, [...chains]],
        ...extra,
      ])}
    >
      <div style={{ width: 1040 }}>
        <InboxPage at={at} onSearch={onSearch} />
      </div>
    </QueryClientProvider>
  );
};

/**
 * The inbox page, one story a state: cards in play in a grid and in a list; a chain pulled out above its cards; the closed side; a search
 * that keeps some cards; one that keeps none; an empty inbox; a factory's Inbox whose factory holds no card; and a second page.
 */
const meta: Meta<typeof InboxPage> = {
  title: 'Pages/Inbox',
  component: InboxPage,
  args: { at: {}, onSearch: fn() },
};
export default meta;

type Story = StoryObj<typeof InboxPage>;

/** The cards of the open side: one filed, one queued, one at work and one waiting on its person; Grid, the first time. */
const OPEN = [
  unstartedCard('decode-the-reads', FACTORY),
  queuedCard('measure-the-list', FACTORY, 1),
  started('ship-it', 'running', 'working'),
  started('review-it', 'waiting', 'waiting'),
];

/** The counts of `OPEN`. */
const OPEN_COUNTS: Page['counts'] = { ...NONE, notStarted: 2, working: 1, waiting: 1 };

/** Open and its chips with their counts, the search bar, the sort and the layout, and the cards in a grid with one Start each. */
export const OpenGrid: Story = {
  render: () => drawn({ cards: OPEN, counts: OPEN_COUNTS }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('combobox', { name: 'Search the cards' })).toBeVisible();
    await expect(canvasElement.querySelector('[data-cards-count="open"]')).toHaveTextContent('4');
    await expect(page.getByRole('article', { name: 'Card decode-the-reads' })).toBeVisible();
    await expect(within(page.getByRole('article', { name: 'Card decode-the-reads' })).getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(within(page.getByRole('article', { name: 'Card measure-the-list' })).queryByRole('button', { name: 'Start' })).toBeNull();
  },
};

/** The same cards as the list: a table whose rows say the card, its tag, its place, when it was filed and its actions. */
export const OpenList: Story = {
  render: () => drawn({ cards: OPEN, counts: OPEN_COUNTS, layout: 'list' }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('tr[data-card="ship-it"]')).toBeVisible();
  },
};

/** A chain pulled out above the cards, whole: the card first, the cards that wait on it after. */
export const Chains: Story = {
  render: () => {
    const first = { ...unstartedCard('first-slice', FACTORY), chained: true, followedBy: ['second-slice'] };
    const second = {
      ...queuedCard('second-slice', FACTORY, 1),
      chained: true,
      phase: 'blocked' as const,
      waits: [{ card: 'first-slice', kind: 'waiting' as const, state: 'filed' as const, stalled: false }],
    };
    return drawn({
      cards: [unstartedCard('decode-the-reads', FACTORY)],
      chains: [first, second],
      counts: { ...NONE, notStarted: 2, blocked: 1 },
    });
  },
  play: async ({ canvasElement }) => {
    const chain = canvasElement.querySelector('[data-chain]');
    await expect(chain).not.toBeNull();
    await expect(within(chain as HTMLElement).getByRole('article', { name: 'Card second-slice' })).toBeVisible();
  },
};

/** The closed side: cards whose run is over, and the chips of what ended. */
export const Closed: Story = {
  render: () =>
    drawn({
      at: { cards: 'closed' },
      cards: [started('merged-it', 'succeeded', 'done'), started('broke', 'failed', 'failed')],
      counts: { ...NONE, notStarted: 1, done: 1, failed: 1 },
    }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-cards-count="closed"]')).toHaveTextContent('2');
  },
};

/** A search that keeps some cards: chains are not pulled out, and the words show as a chip in the bar. */
export const Searched: Story = {
  render: () => drawn({ at: { search: 'reads' }, cards: [OPEN[0]], counts: { ...NONE, notStarted: 1 } }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-chip="q"]')).not.toBeNull();
  },
};

/** A search that keeps no card: the count and Clear filters under the bar, and the page's own line with the way to the other side. */
export const NoMatch: Story = {
  render: () => drawn({ at: { search: 'nothing' }, cards: [] }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-filter-count]')).toHaveTextContent('0 cards');
    await expect(canvasElement.querySelector('[data-filter-count]')).toHaveTextContent('Clear filters');
    await expect(canvasElement.querySelector('[data-filtered-out]')).toHaveTextContent('No open card matches “nothing”.');
    await expect(within(canvasElement).getByRole('button', { name: 'Search closed cards' })).toBeVisible();
  },
};

/** A search a factory's label keeps to finds nothing there: it names the scope, says where a card does match, and offers both ways out. */
export const NothingFound: Story = {
  render: (args) => {
    const at: InboxView = { search: 'microvm', l: 'factory=globex' };
    return drawn({
      at,
      onSearch: args.onSearch,
      cards: [],
      extra: [
        [
          searchQuery(everyFactory(suggestedAsk(at, '')), undefined).queryKey,
          { entries: [unstartedCard('microvm-sandbox', 'acme')], total: 1 },
        ],
      ],
    });
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement);
    await expect(canvasElement.querySelector('[data-filtered-out]')).toHaveTextContent('No open card of globex matches “microvm”.');
    await expect(page.getByText('One open card of acme does.')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Search closed cards' }));
    await expect(args.onSearch).toHaveBeenCalledWith(expect.objectContaining({ cards: 'closed' }));
    await userEvent.click(page.getByRole('button', { name: 'Every factory' }));
    await waitFor(() => expect(canvasElement.querySelector('[data-story-ground]')?.getAttribute('data-at')).toContain('search=microvm'));
    await expect(canvasElement.querySelector('[data-story-ground]')?.getAttribute('data-at')).not.toContain('factory');
  },
};

/** The first page of several: the pager says where it stands, and Older leads on. */
export const FirstOfMany: Story = {
  render: () => drawn({ cards: OPEN, counts: OPEN_COUNTS, remaining: 30 }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-pager-at]')).toHaveTextContent('Page 1 / 3');
  },
};

/** No card yet: the line that says the inbox is empty. */
export const Empty: Story = {
  render: () => drawn({ cards: [] }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-empty]')).not.toBeNull();
  },
};

/** A factory's Inbox whose factory holds no card: the line that says so and links every factory's, never that the inbox is empty. */
export const EmptyInFactory: Story = {
  render: () => drawn({ cards: [], at: { factory: FACTORY } }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-filtered-out]')).toHaveTextContent(`No card of the factory ${FACTORY}`);
    await expect(canvasElement.querySelector('[data-empty]')).toBeNull();
  },
};
