import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import { inboxAllQuery, type InboxEntry } from '@/lib/api/inbox';
import { FACTORY, factoryView, queuedCard, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { InboxPage } from './InboxPage';

/**
 * The inbox page over the cards `cards`, its factories `nemia`'s alone, every read answered from the seed: the store's Inbox, or, where
 * `factory` is given, that factory's, seeded under its own read's key.
 */
const drawn = (cards: readonly InboxEntry[], factory?: string) => (
  <QueryClientProvider
    client={seeded([
      [factoriesQuery.queryKey, [factoryView(FACTORY)]],
      [inboxAllQuery(undefined, factory).queryKey, cards],
    ])}
  >
    <div style={{ width: 880 }}>
      <InboxPage at={factory === undefined ? {} : { factory }} onSearch={() => undefined} />
    </div>
  </QueryClientProvider>
);

/**
 * The inbox page, one story a state: two cards in play, one filed and one queued; a started card waiting on its person beside one not
 * started; cards a trigger queues and one two triggers clash on; cards that wait on others, one stalled; an empty inbox; and a factory's
 * Inbox whose factory holds no card.
 */
const meta: Meta<typeof InboxPage> = {
  title: 'Pages/Inbox',
  component: InboxPage,
  args: { at: {}, onSearch: () => undefined },
};
export default meta;

type Story = StoryObj<typeof InboxPage>;

/** Two cards in play: the filed one's kit Start, Queue and Remove, the queued one's Unqueue; the box above with the kit's fields. */
export const TwoInPlay: Story = {
  render: () => drawn([unstartedCard('decode-the-reads', FACTORY), queuedCard('measure-the-list', FACTORY, 1)]),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('textbox', { name: 'An idea' })).toBeVisible();
    await expect(page.getAllByRole('button', { name: 'Start' })[0]).toHaveAttribute('data-slot', 'button');
    await expect(page.getByRole('button', { name: 'Unqueue' })).toBeVisible();
  },
};

/** A started card whose run waits on its person: Send on and Remove, beside a card not started, which offers no Send on. */
export const StartedWaiting: Story = {
  render: () =>
    drawn([
      { ...unstartedCard('ship-it', FACTORY), workflow: 'quick', startedAs: ['ship-it-k2rq'], state: 'waiting' },
      unstartedCard('decode-the-reads', FACTORY),
    ]),
  play: async ({ canvasElement }) => {
    const started = within(canvasElement).getByRole('listitem', { name: 'Card ship-it' });
    await expect(within(started).getByRole('button', { name: 'Send on' })).toHaveAttribute('aria-expanded', 'false');
    const filed = within(canvasElement).getByRole('listitem', { name: 'Card decode-the-reads' });
    await expect(within(filed).queryByRole('button', { name: 'Send on' })).toBeNull();
  },
};

/**
 * Cards the factory's triggers queue: one queued by its trigger, said by name and with no Unqueue, since its labels queue it; and one two
 * triggers would send to two workflows, waiting, with what to change.
 */
export const Triggered: Story = {
  render: () =>
    drawn([
      {
        ...queuedCard('route-the-idea', FACTORY, 1),
        workflow: null,
        queued: { at: '2026-11-19T00:00:00.000Z', place: 1, by: ['front-door'] },
      },
      { ...unstartedCard('both-ways', FACTORY), workflow: null, clash: ['bugs', 'ready'] },
    ]),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-queued]')).toHaveTextContent('queued by front-door · 1st');
    await expect(within(canvasElement).queryByRole('button', { name: 'Unqueue' })).toBeNull();
    await expect(canvasElement.querySelector('[data-card-clash]')).toHaveTextContent('Waiting: triggers bugs, ready clash.');
  },
};

/**
 * Cards that wait on the cards their `after:` names: one queued behind a card still running, with no place in the queue; and one whose
 * named card the store does not know, stalled, in the failure's colours, with what a person can do.
 */
export const WaitingOnCards: Story = {
  render: () =>
    drawn([
      {
        ...queuedCard('second-slice', FACTORY, 1),
        queued: { at: '2026-11-19T00:00:00.000Z', place: null },
        waits: [{ card: 'first-slice', kind: 'waiting', at: 'first-slice-routed', state: 'running', stalled: false }],
      },
      { ...unstartedCard('third-slice', FACTORY), waits: [{ card: 'no-such-slice', kind: 'missing', stalled: true }] },
    ]),
  play: async ({ canvasElement }) => {
    const second = within(canvasElement).getByRole('listitem', { name: 'Card second-slice' });
    const waiting = second.querySelector('[data-card-waits]');
    await expect(waiting).toHaveTextContent('Waiting on first-slice, at first-slice-routed (running).');
    await expect(waiting).toHaveAttribute('data-stalled', 'false');
    const third = within(canvasElement).getByRole('listitem', { name: 'Card third-slice' });
    const stalled = third.querySelector('[data-card-waits]');
    await expect(stalled).toHaveAttribute('data-stalled', 'true');
    await expect(stalled).toHaveTextContent(/Needs you: Waiting on no-such-slice \(no such card\)\./);
  },
};

/** No card yet: the line that says the inbox is empty. */
export const Empty: Story = {
  render: () => drawn([]),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-empty]')).not.toBeNull();
  },
};

/** A factory's Inbox whose factory holds no card: the line that says so and links every factory's, never that the inbox is empty. */
export const EmptyInFactory: Story = {
  render: () => drawn([], FACTORY),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-filtered-out]')).toHaveTextContent(`No card of the factory ${FACTORY}`);
    await expect(canvasElement.querySelector('[data-empty]')).toBeNull();
  },
};
