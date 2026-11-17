import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import type { InboxEntry } from '@/lib/api/inbox';
import { storeQuery } from '@/lib/api/store';
import { factoryWorkflowsQuery } from '@/lib/api/workflows';
import { FactoryCardStart, UnassignedStart } from './FactoryCardStart';
import { FACTORY, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { yourStore } from '../../../.storybook/fixtures/agents';
import { listing, offering, unfilled } from '../../../.storybook/fixtures/factories';

/** The start of `entry`, the factories, the store's lines and `build` on the factory's repository read. */
const drawn = (entry: InboxEntry) => (
  <QueryClientProvider
    client={seeded([
      [factoriesQuery.queryKey, [offering()]],
      [storeQuery.queryKey, yourStore],
      [factoryWorkflowsQuery({ factory: FACTORY, repo: '/work/nemia' }).queryKey, [listing('build', unfilled('build'))]],
    ])}
  >
    {entry.factory === null ? (
      <UnassignedStart entry={entry} onStarted={() => {}} onRefused={() => {}} />
    ) : (
      <FactoryCardStart entry={entry} onStarted={() => {}} onRefused={() => {}} />
    )}
  </QueryClientProvider>
);

/**
 * A card's start on the Inbox page, one story a state: a card that names its factory, its workflow picked in the kit's select; and one
 * that names none, the factory to pick first. Axe's check of them waits: the kit's select trigger is named by its value and its
 * label, which axe reads as visible text left out of its name (`label-content-name-mismatch`), an ask of the kit.
 */
const meta: Meta<{ entry: InboxEntry }> = {
  title: 'Factory/FactoryCardStart',
  args: { entry: unstartedCard('decode-the-reads', FACTORY) },
  render: ({ entry }) => drawn(entry),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** A card of the factory: its workflow preset in the select, the repository wired for it, and why it cannot start yet. */
export const NamesItsFactory: Story = {
  parameters: { a11y: { test: 'todo' } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-pick-workflow] [data-slot="select-value"]')?.textContent).toBe('build');
    await expect(canvasElement.querySelector('[data-unfilled]')).not.toBeNull();
  },
};

/** A card of no factory: the Factory select, nothing picked, and no start form before one is. */
export const NamesNone: Story = {
  parameters: { a11y: { test: 'todo' } },
  args: { entry: { ...unstartedCard('measure-the-list', FACTORY), factory: null } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-pick-factory] [data-populated]')).toBeNull();
    await expect(canvasElement.querySelector('[data-pick-workflow]')).toBeNull();
  },
};
