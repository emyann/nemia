import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import { inboxAllQuery, type InboxEntry } from '@/lib/api/inbox';
import { FACTORY, factoryView, queuedCard, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { InboxPage } from './InboxPage';

/** The inbox page over the cards `cards`, its factories `nemia`'s alone, every read answered from the seed. */
const drawn = (cards: readonly InboxEntry[]) => (
  <QueryClientProvider
    client={seeded([
      [factoriesQuery.queryKey, [factoryView(FACTORY)]],
      [inboxAllQuery(undefined).queryKey, cards],
    ])}
  >
    <div style={{ width: 880 }}>
      <InboxPage at={{}} onSearch={() => undefined} />
    </div>
  </QueryClientProvider>
);

/**
 * The inbox page, one story a state: two cards in play, one filed and one queued; a started card waiting on its person beside one not
 * started; cards a trigger queues and one two triggers clash on; and an empty inbox. Axe's
 * `label-content-name-mismatch` alone is off, for the box's Factory list: the ds kit's `Select` draws its value before its floating
 * label and is named by the label first, which axe reads as visible text left out of its name, an ask of the kit.
 */
const meta: Meta<typeof InboxPage> = {
  title: 'Pages/Inbox',
  component: InboxPage,
  args: { at: {}, onSearch: () => undefined },
  parameters: { a11y: { config: { rules: [{ id: 'label-content-name-mismatch', enabled: false }] } } },
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

/** No card yet: the line that says the inbox is empty. */
export const Empty: Story = {
  render: () => drawn([]),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-empty]')).not.toBeNull();
  },
};
