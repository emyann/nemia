import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import { factoryInboxQuery, type InboxEntry } from '@/lib/api/inbox';
import { runObjectQuery } from '@/lib/api/run';
import { openOf, undecidedRunsQuery } from '@/lib/api/runs';
import { forgetFactoryLayout, forgetFactoryOpen, saveFactoryOpen } from '@/lib/canvas';
import { FactoryCanvas } from './FactoryCanvas';
import { FACTORY, factoryView, openRuns, queuedCard, seeded } from '../../../.storybook/fixtures/proposals';
import { onTheFloor, TARGET_RUNS } from '../../../.storybook/fixtures/runs';

/**
 * The floor of `factory` with no run on it, its cards in play `cards` read under the one key every reader of its page shares
 * (`factoryInboxQuery`), so its queue draws what the pane counts.
 */
const drawn = (
  args: Parameters<typeof FactoryCanvas>[0],
  cards: readonly InboxEntry[],
  read: readonly (keyof typeof TARGET_RUNS)[] = [],
) => (
  <QueryClientProvider
    client={seeded([
      [factoriesQuery.queryKey, [factoryView(FACTORY)]],
      [factoryInboxQuery(args.factory.name).queryKey, cards],
      [undecidedRunsQuery(args.factory.name).queryKey, []],
      ...read.map((four) => [runObjectQuery(TARGET_RUNS[four].metadata.name).queryKey, TARGET_RUNS[four]] as const),
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

/** Whether two boxes on the screen share any pixel. */
const meet = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Runs on the floor: one at work, opened into its panel, one waiting on a run, one for a run slot, one held and one waiting on you. Each
 * card says the step it is on over its workflow's graph, each node a button that opens its step's card; the panel takes the cells it
 * spans (`openSpan`), and every other card is laid out clear of it.
 */
export const RunsOnTheFloor: Story = {
  args: { open: openOf(onTheFloor) },
  beforeEach: () => {
    forgetFactoryLayout();
    saveFactoryOpen([TARGET_RUNS['1sw7'].metadata.name]);
    return () => {
      forgetFactoryOpen();
      forgetFactoryLayout();
    };
  },
  render: (args) => drawn(args, [], Object.keys(TARGET_RUNS) as (keyof typeof TARGET_RUNS)[]),
  play: async ({ canvasElement }) => {
    const panel = await waitFor(() => {
      const found = canvasElement.querySelector('article[data-size="xl"]');
      if (!found) throw new Error('the opened card is not drawn yet');
      return found;
    });
    await expect(canvasElement.querySelectorAll('[data-run-steps]').length, 'the five in flight and lgll, which 649a waits on').toBe(6);
    await expect(
      panel.querySelector('[data-tile="implement"][data-state="working"]'),
      'the step at work, a press in the panel',
    ).not.toBeNull();
    await expect(
      canvasElement.querySelector('[data-step="land"][data-mark="failure"] [data-step-bar]'),
      "a closed card's step",
    ).not.toBeNull();
    const box = panel.getBoundingClientRect();
    const others = [...canvasElement.querySelectorAll('article[data-run]')].filter((card) => card !== panel);
    await expect(others.length, 'the five other cards').toBe(5);
    for (const card of others)
      await expect(meet(card.getBoundingClientRect(), box), `${card.getAttribute('data-run')} stands clear of the panel`).toBe(false);
    const underPanels = await waitFor(() => {
      const panels = [...canvasElement.querySelectorAll('.react-flow__panel')].map((one) => one.getBoundingClientRect());
      const under = [...canvasElement.querySelectorAll('article[data-run]')]
        .filter((card) => panels.some((one) => meet(card.getBoundingClientRect(), one)))
        .map((card) => card.getAttribute('data-run'));
      if (under.length > 0) throw new Error(`under a panel of the floor: ${under.join(', ')}`);
      return under;
    });
    await expect(underPanels, 'no card under a panel of the floor, once it is fitted').toEqual([]);
  },
};

/** A run the list could not judge, a task it reads having a journal that does not read. */
const UNREADABLE = {
  id: 'give-the-floor-a-legend-u7r2',
  factory: FACTORY,
  unjudged: "give-the-floor-a-legend-u7r2-implement's journal does not read: entry 5 is a `measured` event whose usage no runtime wrote",
};

/** A run whose record the list could not judge: a bare card, its id for its title, saying it is unreadable and why on hover. */
export const AnUnreadableRun: Story = {
  args: { open: { ...openRuns(0), counts: { waiting: 0, inFlight: 1, finished: 0 }, inFlight: [UNREADABLE] } },
  beforeEach: () => {
    forgetFactoryLayout();
    return () => forgetFactoryLayout();
  },
  render: (args) => drawn(args, []),
  play: async ({ canvasElement }) => {
    const said = await waitFor(() => {
      const found = canvasElement.querySelector('[data-unreadable]');
      if (!found) throw new Error('the unreadable run is not drawn yet');
      return found;
    });
    await expect(said.getAttribute('title')).toBe(UNREADABLE.unjudged);
    await expect(canvasElement.querySelector('[data-slot="card"]')).not.toBeNull();
  },
};
