import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import type { InboxEntry } from '@/lib/api/inbox';
import { factoriesQuery } from '@/lib/api/factories';
import { FACTORY, factoryView, queuedCard, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { CardChain } from './CardChain';

/** A chain of two cards, in columns by depth: the first, then the one that waits on it. */
const FIRST = { ...unstartedCard('first-slice', FACTORY), chained: true, followedBy: ['second-slice'] };
const SECOND = {
  ...queuedCard('second-slice', FACTORY, 1),
  chained: true,
  phase: 'blocked' as const,
  after: ['first-slice'],
  waits: [{ card: 'first-slice', kind: 'waiting' as const, state: 'filed' as const, stalled: false }],
};

/**
 * A card queued after `before`, each not done yet: blocked behind them, chained.
 * @param name The card's name.
 * @param before The cards it names in its `after`.
 */
const blockedAfter = (name: string, before: readonly string[]) => ({
  ...queuedCard(name, FACTORY, 1),
  title: `Title of ${name}`,
  chained: true,
  phase: 'blocked' as const,
  after: [...before],
  waits: before.map((card) => ({ card, kind: 'waiting' as const, state: 'filed' as const, stalled: false })),
});

/** The card a fan-out leaves from, its run at work. */
const HUB = {
  ...unstartedCard('hub', FACTORY),
  title: 'Title of hub',
  chained: true,
  state: 'running' as const,
  phase: 'working' as const,
  startedAs: ['hub-r1'],
};

/**
 * Each wire the chain draws, by the cards it joins, read against the boxes of those two cards: whether it leaves the right edge of the
 * card waited on and reaches the left edge of the card that waits, each within the card's height.
 * @param canvas The story's root.
 */
function wiresOf(canvas: HTMLElement) {
  const boxOf = (name: string) =>
    within(canvas)
      .getByRole('article', { name: `Card ${name}` })
      .getBoundingClientRect();
  return [...canvas.querySelectorAll<SVGGElement>('[data-wire]')].map((wire) => {
    const [from = '', to = ''] = (wire.dataset.wire ?? '').split('>');
    const line = wire.querySelector<SVGPathElement>('[data-wire-line]')!;
    const svg = line.ownerSVGElement!.getBoundingClientRect();
    const start = line.getPointAtLength(0);
    const end = line.getPointAtLength(line.getTotalLength());
    const [a, b] = [boxOf(from), boxOf(to)];
    const near = (x: number, edge: number) => Math.abs(x - edge) <= 2;
    const inside = (y: number, box: DOMRect) => y >= box.top && y <= box.bottom;
    return {
      wire: `${from}>${to}`,
      joins:
        near(svg.left + start.x, a.right) && inside(svg.top + start.y, a) && near(svg.left + end.x, b.left) && inside(svg.top + end.y, b),
    };
  });
}

/**
 * Waits until the chain draws `expected` wires, then proves each joins the two cards it names.
 * @param canvas The story's root.
 * @param expected Each wire, as `<card waited on>><card that waits>`.
 */
async function expectWires(canvas: HTMLElement, expected: readonly string[]) {
  await waitFor(() => expect(canvas.querySelectorAll('[data-wire]')).toHaveLength(expected.length));
  const wires = wiresOf(canvas);
  await expect(wires.map((w) => w.wire).sort()).toEqual([...expected].sort());
  await expect(wires.filter((w) => !w.joins)).toEqual([]);
}

/** A chain, whole, its cards in the compact size, each column joined to the next by a line. */
const meta: Meta<typeof CardChain> = {
  title: 'Store/CardChain',
  component: CardChain,
  tags: ['network'],
  args: { members: [[FIRST], [SECOND]] },
  render: (args) => (
    <QueryClientProvider client={seeded([[factoriesQuery.queryKey, [factoryView(FACTORY)]]])}>
      <div style={{ width: 720 }}>
        <CardChain {...args} />
      </div>
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof CardChain>;

/** Two columns: the card that goes first, and the one that waits on it. */
export const Two: Story = {
  play: async ({ canvasElement }) => {
    const chain = within(canvasElement).getByRole('list', { name: 'Chain of 2 cards' });
    await expect(within(chain).getByRole('article', { name: 'Card second-slice' })).toBeVisible();
    await expect(within(canvasElement).getByRole('button', { name: 'Start chain…' })).toBeVisible();
    await expectWires(canvasElement, ['first-slice>second-slice']);
  },
};

/** Every card working or queued: nothing left to start, so no Start chain…, and the head still says where the chain stands. */
export const Underway: Story = {
  args: { members: [[{ ...FIRST, state: 'running', phase: 'working', startedAs: ['first-slice-r1'] }], [SECOND]] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('2 cards · 1 working · 1 blocked')).toBeVisible();
    await expect(within(canvasElement).queryByRole('button', { name: 'Start chain…' })).toBeNull();
  },
};

/** A fan-out: one card at work and two blocked after it. The head names both ends, counts in the tags' words, and a wire reaches each. */
export const FanOut: Story = {
  args: { members: [[{ ...HUB, followedBy: ['left', 'right'] }], [blockedAfter('left', ['hub']), blockedAfter('right', ['hub'])]] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Toward Title of left and Title of right')).toBeVisible();
    await expect(within(canvasElement).getByText('3 cards · 1 working · 2 blocked')).toBeVisible();
    await expectWires(canvasElement, ['hub>left', 'hub>right']);
  },
};

/** A line of three: one end, and a wire between each card and the next. */
export const Line: Story = {
  args: {
    members: [
      [{ ...HUB, followedBy: ['middle'] }],
      [{ ...blockedAfter('middle', ['hub']), followedBy: ['last'] }],
      [blockedAfter('last', ['middle'])],
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Toward Title of last')).toBeVisible();
    await expectWires(canvasElement, ['hub>middle', 'middle>last']);
  },
};

/** A card filed and never queued, whose tag says nothing: the one card the count calls not started. */
const FILED: InboxEntry = { ...unstartedCard('top', FACTORY), title: 'Title of top', chained: true, followedBy: ['last'] };

/** A diamond: two cards after one, a fourth after both. One end, and a wire for each of the four waits. */
export const Diamond: Story = {
  args: {
    members: [
      [{ ...HUB, followedBy: ['top', 'bottom'] }],
      [
        { ...FILED, after: ['hub'] },
        { ...blockedAfter('bottom', ['hub']), followedBy: ['last'] },
      ],
      [blockedAfter('last', ['top', 'bottom'])],
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Toward Title of last')).toBeVisible();
    await expect(within(canvasElement).getByText('4 cards · 1 working · 2 blocked · 1 not started')).toBeVisible();
    await expectWires(canvasElement, ['hub>top', 'hub>bottom', 'top>last', 'bottom>last']);
  },
};
