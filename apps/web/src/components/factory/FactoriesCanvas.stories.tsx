import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { levelQuery } from '@/lib/api/nemia';
import { storeQuery } from '@/lib/api/store';
import type { FactoryBlock } from '@/lib/factories';
import { FactoriesCanvas } from './FactoriesCanvas';
import { seeded } from '../../../.storybook/fixtures/proposals';
import { nemiaLevel, yourStore } from '../../../.storybook/fixtures/agents';
import { block } from '../../../.storybook/fixtures/factories';

/** The Factories of `blocks`, the store's lines read and Nemia at `level`. */
const drawn = (blocks: readonly FactoryBlock[], level: 'manual' | 'semi-auto') => (
  <QueryClientProvider
    client={seeded([
      [storeQuery.queryKey, yourStore],
      [levelQuery.queryKey, level === 'manual' ? { ...nemiaLevel('manual'), factories: [] } : nemiaLevel(level)],
    ])}
  >
    <div className="flex h-[560px]">
      <FactoriesCanvas blocks={blocks} />
    </div>
  </QueryClientProvider>
);

/**
 * The Factories, one story a state: no factory yet, with Nemia off and her switch, or on; and two factories on the canvas, one whose file
 * does not read.
 */
const meta: Meta<{ blocks: readonly FactoryBlock[]; level: 'manual' | 'semi-auto' }> = {
  title: 'Factory/FactoriesCanvas',
  args: { blocks: [], level: 'manual' },
  render: ({ blocks, level }) => drawn(blocks, level),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** No factory yet, Nemia off: the kit's card says how to make one, and offers to turn her on. */
export const NoFactoryNemiaOff: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-nemia-off] [data-nemia-turn-on]')).not.toBeNull();
  },
};

/** No factory yet, Nemia on: the card says her session's state instead. */
export const NoFactoryNemiaOn: Story = {
  args: { level: 'semi-auto' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-nemia-on]')).not.toBeNull();
  },
};

/** Two factories on the canvas, one whose file does not read. */
export const Blocks: Story = {
  args: { blocks: [block('nemia'), block('broken', 'factories/broken.json: repos must be a list')] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-factory]').length).toBe(2);
  },
};
