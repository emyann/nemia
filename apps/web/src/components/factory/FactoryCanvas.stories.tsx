import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import { inboxQuery, type InboxEntry } from '@/lib/api/inbox';
import { openOf, undecidedRunsQuery } from '@/lib/api/runs';
import { FactoryCanvas } from './FactoryCanvas';
import { FACTORY, factoryView, openRuns, queuedCard, seeded } from '../../../.storybook/fixtures/proposals';
import { onTheFloor } from '../../../.storybook/fixtures/runs';

/**
 * The floor of `factory` with no run on it, the inbox's cards `cards` read under the one key every reader of a page shares
 * (`inboxQuery`), so its queue draws what the pane counts.
 */
const drawn = (args: Parameters<typeof FactoryCanvas>[0], cards: readonly InboxEntry[]) => (
  <QueryClientProvider
    client={seeded([
      [factoriesQuery.queryKey, [factoryView(FACTORY)]],
      [inboxQuery.queryKey, cards],
      [undecidedRunsQuery(args.factory.name).queryKey, []],
    ])}
  >
    <FactoryCanvas {...args} />
  </QueryClientProvider>
);

/**
 * A factory's floor, one story a state of its queue: nothing queued, and two cards queued at its left edge as ghosts, in the order the
 * tick starts them. The queue reads the inbox's one query, which the pane's line reads too.
 */
const meta: Meta<typeof FactoryCanvas> = {
  title: 'Factory/FactoryCanvas',
  component: FactoryCanvas,
  args: { open: openRuns(0), factory: { name: FACTORY, default: false } },
};
export default meta;

type Story = StoryObj<typeof FactoryCanvas>;

/** No run and nothing queued: an empty floor. */
export const NothingQueued: Story = {
  args: { open: openRuns(0) },
  render: (args) => drawn(args, []),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-ghost]')).toBeNull();
  },
};

/** Two cards queued: their ghosts wait at the floor's left edge, first to start first. */
export const CardsQueued: Story = {
  args: { open: openRuns(0) },
  render: (args) => drawn(args, [queuedCard('decode-the-reads', FACTORY, 1), queuedCard('measure-the-list', FACTORY, 2)]),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-ghost="decode-the-reads"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-ghost="measure-the-list"]')).not.toBeNull();
  },
};

/**
 * Runs on the floor: one at work, one waiting on a run, one for a run slot, one held and one waiting on you. Each card says the step it is
 * on over its workflow's graph, each node a button that opens its step's card.
 */
export const RunsOnTheFloor: Story = {
  args: { open: openOf(onTheFloor) },
  render: (args) => drawn(args, []),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-run-steps]').length).toBe(5);
    await expect(canvasElement.querySelector('[data-step="implement"][data-mark="alive"] [data-step-bar]')).not.toBeNull();
  },
};
