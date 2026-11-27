import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import type { InboxEntry } from '@/lib/api/inbox';
import { FACTORY, factoryView, queuedCard, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { InboxCard, InboxCardRow, type CardSize } from './InboxCard';

/** A card drawn in `size`, or as a row where `row` is given, over a store that holds the factory `nemia`. */
const drawn = (entry: InboxEntry, size: CardSize | undefined, row = false) => (
  <QueryClientProvider client={seeded([[factoriesQuery.queryKey, [factoryView(FACTORY)]]])}>
    <div style={{ width: row ? 920 : 340 }}>
      {row ? (
        <ul>
          <InboxCardRow entry={entry} />
        </ul>
      ) : (
        <InboxCard entry={entry} size={size} />
      )}
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
 * refused, stuck behind a card only a person can release, in the compact size of a chain, and as a row. The frame takes a colour only for
 * a card at work, waiting, refused or stuck.
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
    await expect(await within(document.body).findByRole('dialog', { name: 'Run third-slice after' })).toBeVisible();
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

/** A card as a row of the list: the card first, then its tag, where it runs, when it was filed, and its actions. */
export const Row: Story = {
  args: { entry: started('running', 'working'), size: 'regular' },
  render: (args) => drawn(args.entry, args.size, true),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('listitem', { name: 'Card ship-it' })).toBeVisible();
  },
};
