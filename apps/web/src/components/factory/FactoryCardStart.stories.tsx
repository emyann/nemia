import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { factoriesQuery } from '@/lib/api/factories';
import { storeQuery } from '@/lib/api/store';
import { fn } from 'storybook/test';
import { FactoryCardStart, UnassignedStart } from './FactoryCardStart';
import { factoryView, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A card's start: here while the factory it starts in is read, the shape of its field. */
const meta: Meta<typeof FactoryCardStart> = {
  title: 'Store/FactoryCardStart',
  component: FactoryCardStart,
  args: { entry: unstartedCard('flag', 'nemia'), onStarted: fn(), onRefused: fn() },
  render: (args) => (
    <Unread>
      <div style={{ width: 560 }}>
        <FactoryCardStart {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** A card that names its factory, the factory still read. */
export const ReadingTheFactory: StoryObj<typeof meta> = {
  play: saysReading('Reading the factory…'),
};

/** A card that names none, the factories it may start in still read. */
export const ReadingTheFactories: StoryObj<typeof meta> = {
  render: (args) => (
    <Unread>
      <div style={{ width: 560 }}>
        <UnassignedStart {...args} />
      </div>
    </Unread>
  ),
  play: saysReading('Reading the factories…'),
};

/** The store and its factory read, the workflow the card names still read: the shape of what it says and its Start. */
export const ReadingTheWorkflow: StoryObj<typeof meta> = {
  render: (args) => (
    <QueryClientProvider
      client={seeded([
        [factoriesQuery.queryKey, [factoryView('nemia')]],
        [
          storeQuery.queryKey,
          {
            workflows: '/store/workflows',
            agents: '/store/agents',
            skills: '/store/skills',
            fileFactory: 'the line that files a factory',
            turnOnNemia: 'the line that turns her on',
          },
        ],
      ])}
    >
      <div style={{ width: 560 }}>
        <FactoryCardStart {...args} />
      </div>
    </QueryClientProvider>
  ),
  play: saysReading('Reading the workflow…'),
};
