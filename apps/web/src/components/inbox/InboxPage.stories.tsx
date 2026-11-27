import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import { chainsQuery, inboxPageQuery, type InboxEntry, type InboxPage as Page } from '@/lib/api/inbox';
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
}: {
  cards: readonly InboxEntry[];
  at?: InboxView;
  chains?: readonly InboxEntry[];
  counts?: Page['counts'];
  remaining?: number;
  layout?: 'grid' | 'list';
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
      ])}
    >
      <div style={{ width: 1040 }}>
        <InboxPage at={at} onSearch={() => undefined} />
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
  args: { at: {}, onSearch: () => undefined },
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

/** The same cards as rows: the card first, then its tag, its place and when it was filed. */
export const OpenList: Story = {
  render: () => drawn({ cards: OPEN, counts: OPEN_COUNTS, layout: 'list' }),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('listitem', { name: 'Card ship-it' })).toBeVisible();
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
      cards: [started('shipped', 'succeeded', 'done'), started('broke', 'failed', 'failed')],
      counts: { ...NONE, notStarted: 1, done: 1, failed: 1 },
    }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-cards-count="closed"]')).toHaveTextContent('2');
  },
};

/** A search that keeps some cards: chains are not pulled out, and the words show as a chip in the bar. */
export const Searched: Story = {
  render: () => drawn({ at: { q: 'reads' }, cards: [OPEN[0]!], counts: { ...NONE, notStarted: 1 } }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-chip="q"]')).not.toBeNull();
  },
};

/** A search that keeps no card: the line that says so and the way back. */
export const NoMatch: Story = {
  render: () => drawn({ at: { q: 'nothing' }, cards: [] }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-filtered-out]')).toHaveTextContent('No card matches.');
  },
};

/** The first page of several: the pager says where it stands, and Older leads on. */
export const FirstOfMany: Story = {
  render: () => drawn({ cards: OPEN, counts: OPEN_COUNTS, remaining: 20 }),
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
