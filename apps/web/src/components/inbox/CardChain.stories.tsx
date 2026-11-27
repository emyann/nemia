import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import { FACTORY, factoryView, queuedCard, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { CardChain } from './CardChain';

/** A chain of two cards, in columns by depth: the first, then the one that waits on it. */
const FIRST = { ...unstartedCard('first-slice', FACTORY), chained: true, followedBy: ['second-slice'] };
const SECOND = {
  ...queuedCard('second-slice', FACTORY, 1),
  chained: true,
  phase: 'blocked' as const,
  waits: [{ card: 'first-slice', kind: 'waiting' as const, state: 'filed' as const, stalled: false }],
};

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
  },
};
