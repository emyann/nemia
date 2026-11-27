import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import type { InboxEntry } from '@/lib/api/inbox';
import { FACTORY, factoryView, queuedCard, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { CARD_LEAST, InboxCard, InboxList, type CardSize } from './InboxCard';

/** A card drawn in `size`, over a store that holds the factory `nemia`, `width` wide. */
const drawn = (entry: InboxEntry, size: CardSize | undefined, width: number | string = 340) => (
  <QueryClientProvider client={seeded([[factoriesQuery.queryKey, [factoryView(FACTORY)]]])}>
    <div style={{ width }}>
      <InboxCard entry={entry} size={size} />
    </div>
  </QueryClientProvider>
);

/** The cards `entries` as the list, in a page column of its own (`@container/page`) `width` wide, over the same store. */
const listed = (entries: readonly InboxEntry[], width: number) => (
  <QueryClientProvider client={seeded([[factoriesQuery.queryKey, [factoryView(FACTORY)]]])}>
    <div className="@container/page" style={{ width }}>
      <InboxList entries={entries} />
    </div>
  </QueryClientProvider>
);

/** A card whose run has been started: its state, phase and the run it was started as. */
const started = (state: InboxEntry['state'], phase: InboxEntry['phase']) => ({
  ...unstartedCard('ship-it', FACTORY),
  title: 'Ship it: the first slice',
  workflow: 'quick',
  startedAs: ['ship-it-k2rq'],
  state,
  phase,
  labels: { area: 'board', work: 'feature' },
});

/**
 * A card of the Inbox, one story a state: filed with its one Start, queued behind a chain, at work, waiting on its person, done,
 * refused, stuck behind a card only a person can release, in the compact size of a chain, and as the list, wide and narrow. The frame
 * takes a colour only for a card at work, waiting, refused or stuck.
 */
const meta: Meta<typeof InboxCard> = { title: 'Store/InboxCard', component: InboxCard, tags: ['network'] };
export default meta;

type Story = StoryObj<typeof InboxCard>;

/** A card filed and not started: its tag says nothing, its labels show their values, and its one filled-out press is Start. */
export const Filed: Story = {
  args: { entry: { ...unstartedCard('decode-the-reads', FACTORY), title: 'Decode the reads', labels: { area: 'board', work: 'feature' } } },
  render: (args) => drawn(args.entry, args.size),
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByRole('article', { name: 'Card decode-the-reads' });
    await expect(within(card).getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(within(card).getByRole('button', { name: 'More actions on decode-the-reads' })).toBeVisible();
    await expect(card.querySelector('[data-card-labels] [title="area: board"]')).toHaveTextContent('board');
  },
};

/** A card queued behind cards not done: blocked, with what it waits on said in a line; no Start, the menu takes the start back. */
export const Blocked: Story = {
  args: {
    entry: {
      ...queuedCard('second-slice', FACTORY, 1),
      title: 'The second slice',
      phase: 'blocked',
      chained: true,
      waits: [{ card: 'first-slice', kind: 'waiting', state: 'filed', stalled: false }],
    },
  },
  render: (args) => drawn(args.entry, args.size),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-card-state="blocked"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-card-waits]')).toHaveTextContent('Runs once the cards before it are done.');
    await expect(within(canvasElement).queryByRole('button', { name: 'Start' })).toBeNull();
  },
};

/** A card whose run is at work: its frame in the colour of a session at work, and Open run. */
export const Working: Story = {
  args: { entry: started('running', 'working') },
  render: (args) => drawn(args.entry, args.size),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-cut-frame]')).toHaveAttribute('data-cut-frame', 'alive');
    await expect(within(canvasElement).getByRole('link', { name: 'Open run' })).toBeVisible();
  },
};

/** A card whose run waits on its person: the frame in the colour of what is yours, and the tag filled. */
export const Waiting: Story = {
  args: { entry: started('waiting', 'waiting') },
  render: (args) => drawn(args.entry, args.size),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-cut-frame]')).toHaveAttribute('data-cut-frame', 'yours');
  },
};

/** A card whose run is done: no colour on its frame. */
export const Done: Story = {
  args: { entry: started('succeeded', 'done') },
  render: (args) => drawn(args.entry, args.size),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-cut-frame]')).toHaveAttribute('data-cut-frame', 'none');
  },
};

/** A card whose start was refused: the frame in the failure's colour, the tick's try said, and Edit in place of Start. */
export const Refused: Story = {
  args: {
    entry: {
      ...queuedCard('route-the-idea', FACTORY, 1),
      state: 'refused',
      workflow: 'gone',
      tried: { at: '2026-11-19T00:00:00.000Z', repo: '/work/nemia', why: 'no workflow gone.', refused: true },
    },
  },
  render: (args) => drawn(args.entry, args.size),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-cut-frame]')).toHaveAttribute('data-cut-frame', 'failure');
    await expect(within(canvasElement).getByRole('link', { name: 'Edit' })).toBeVisible();
  },
};

/** A card that waits on one only a person can release: stuck, and Edit, which opens what it runs after. */
export const Stuck: Story = {
  args: { entry: { ...unstartedCard('third-slice', FACTORY), waits: [{ card: 'no-such-slice', kind: 'missing', stalled: true }] } },
  render: (args) => drawn(args.entry, args.size),
  play: async ({ canvasElement, userEvent }) => {
    await expect(canvasElement.querySelector('[data-card-state="stuck"]')).not.toBeNull();
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(within(document.body).getByRole('dialog', { name: 'Run third-slice after' })).toBeVisible());
    await userEvent.click(within(document.body).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
  },
};

/** The compact size, in a chain: no labels, no line of what it waits on, its name short. */
export const Compact: Story = {
  args: { entry: { ...unstartedCard('decode-the-reads', FACTORY), labels: { area: 'board' }, chained: true }, size: 'compact' },
  render: (args) => drawn(args.entry, args.size),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-card-labels]')).toBeNull();
  },
};

/** The list's rows, one of each kind: at work with its tag, filed and not started, one that reads a run, one with a long title. */
const ROWS: readonly InboxEntry[] = [
  started('running', 'working'),
  { ...unstartedCard('decode-the-reads', FACTORY), title: 'Decode the reads', labels: { area: 'board', work: 'feature' } },
  { ...unstartedCard('read-the-run', FACTORY), title: 'Read the run before it', from: ['ship-it-k2rq'] },
  {
    ...unstartedCard('tools-touched-runs-at-most-h-a599', FACTORY),
    title: 'Touched runs at most half of a workspace, and names each file it refuses where it refuses one of them',
  },
];

/** The left edge of what each cell of the list's rows draws, column by column, to the pixel; an empty or hidden cell is left out. */
const edgesOf = (root: HTMLElement) => {
  const rows = [...root.querySelectorAll('tbody tr')];
  const columns = rows[0]?.children.length ?? 0;
  return Array.from({ length: columns }, (_, column) =>
    rows.flatMap((row) => {
      const drawn = row.children[column]?.firstElementChild;
      return drawn && drawn.getClientRects().length > 0 ? [Math.round(drawn.getBoundingClientRect().left)] : [];
    }),
  );
};

/** What each row's Card cell draws past the State column's left edge: its tag and the row's card, for each part that runs over. */
const pastCardOf = (root: HTMLElement) =>
  [...root.querySelectorAll('tbody tr')].flatMap((row) => {
    const state = row.querySelector('[data-card-tag]');
    const card = row.querySelector('[data-card-cell]');
    if (state === null || card === null) return [`${row.getAttribute('data-card')}: no Card or State cell`];
    const edge = state.getBoundingClientRect().left + 0.5;
    return [...card.querySelectorAll('*')]
      .filter((part) => part.getClientRects().length > 0 && part.getBoundingClientRect().right > edge)
      .map((part) => `${row.getAttribute('data-card')}: ${part.tagName}`);
  });

/**
 * The cards as the list, wide: one header row of five columns, and every column's content standing at one x down the rows, whatever the
 * tag, the time or the button says. A row lights under the pointer, and a press on it opens the card's page.
 */
export const List: Story = {
  args: { entry: started('running', 'working') },
  render: () => listed(ROWS, 1040),
  play: async ({ canvasElement, userEvent }) => {
    const table = within(canvasElement).getByRole('grid', { name: 'Cards' });
    await expect(
      within(table)
        .getAllByRole('columnheader')
        .map((head) => head.textContent),
    ).toEqual(['Card', 'State', 'Factory / workflow', 'Filed', 'Actions']);
    const edges = edgesOf(table);
    await expect(edges.map((column) => column.length)).toEqual([4, 1, 4, 4, 4]);
    await expect(edges.map((column) => new Set(column).size)).toEqual([1, 1, 1, 1, 1]);
    await expect(pastCardOf(table)).toEqual([]);
    const row = table.querySelector<HTMLElement>('tr[data-card="decode-the-reads"]');
    if (row === null) throw new Error('the row of decode-the-reads is not drawn');
    await userEvent.hover(row);
    await waitFor(() => expect(row).toHaveAttribute('data-hovered'));
    const filed = row.querySelector<HTMLElement>('[data-card-filed]');
    if (filed === null) throw new Error('the Filed cell of decode-the-reads is not drawn');
    await userEvent.click(filed);
    const ground = canvasElement.querySelector('[data-story-ground]');
    await waitFor(() => expect(ground?.getAttribute('data-at')).toBe('/inbox/decode-the-reads'));
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await userEvent.unhover(row);
    await waitFor(() => expect(row).not.toHaveAttribute('data-hovered'));
  },
};

/**
 * The list in a page column just past the frame grid's 768-pixel step, under the 1024-pixel one: Filed has its column, Factory /
 * workflow folds under each title, and nothing a Card cell draws, its name and copy control included, reaches the State column.
 */
export const ListBetween: Story = {
  args: { entry: started('running', 'working') },
  render: () => listed(ROWS, 800),
  play: async ({ canvasElement }) => {
    const table = within(canvasElement).getByRole('grid', { name: 'Cards' });
    await expect(
      within(table)
        .getAllByRole('columnheader')
        .map((head) => head.textContent),
    ).toEqual(['Card', 'State', 'Filed', 'Actions']);
    const folded = table.querySelector('tr[data-card="ship-it"] [data-card-folded]');
    await expect(folded).toBeVisible();
    await expect(folded).toHaveTextContent('nemia / quick');
    await expect(folded?.querySelector('time')).not.toBeVisible();
    await expect(pastCardOf(table)).toEqual([]);
    const edges = edgesOf(table).filter((column) => column.length > 0);
    await expect(edges.map((column) => new Set(column).size)).toEqual([1, 1, 1, 1]);
  },
};

/** The list in a page column under the frame grid's 768-pixel step: Factory / workflow and Filed fold under each title. */
export const ListNarrow: Story = {
  args: { entry: started('running', 'working') },
  render: () => listed(ROWS, 600),
  play: async ({ canvasElement }) => {
    const table = within(canvasElement).getByRole('grid', { name: 'Cards' });
    await expect(
      within(table)
        .getAllByRole('columnheader')
        .map((head) => head.textContent),
    ).toEqual(['Card', 'State', 'Actions']);
    const folded = table.querySelector('tr[data-card="ship-it"] [data-card-folded]');
    await expect(folded).toBeVisible();
    await expect(folded).toHaveTextContent('nemia / quick');
    await expect(pastCardOf(table)).toEqual([]);
    const edges = edgesOf(table).filter((column) => column.length > 0);
    await expect(edges.map((column) => new Set(column).size)).toEqual([1, 1, 1]);
  },
};

/**
 * The longest name the store holds, 28 characters and its 4-character tail, at the narrowest width the grid gives a card: nothing draws
 * past the card.
 */
export const LongestName: Story = {
  args: { entry: { ...unstartedCard('tools-touched-runs-at-most-h-a599', FACTORY), title: 'Touched runs at most half of a workspace' } },
  render: (args) => drawn(args.entry, args.size, CARD_LEAST),
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByRole('article', { name: 'Card tools-touched-runs-at-most-h-a599' });
    const edge = card.getBoundingClientRect().right + 0.5;
    const past = [...card.querySelectorAll('*')].filter((part) => part.getBoundingClientRect().right > edge);
    await expect(past.map((part) => part.tagName)).toEqual([]);
    const copy = within(card).getByRole('button', { name: 'Copy the card name tools-touched-runs-at-most-h-a599' });
    await expect(copy.getBoundingClientRect().right).toBeLessThanOrEqual(edge);
  },
};
