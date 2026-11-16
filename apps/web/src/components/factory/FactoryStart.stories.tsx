import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { factoriesQuery } from '@/lib/api/factories';
import { factoryView, seeded } from '../../../.storybook/fixtures/proposals';
import { StartBar } from './FactoryStart';
import { saysReading, Unread } from '../../../.storybook/unread';

/** The bar that starts a run: here while the factories are read, the shape of its fields. */
const meta: Meta<typeof StartBar> = {
  title: 'Factory/FactoryStart',
  component: StartBar,
  args: { factory: 'nemia' },
  render: (args) => (
    <Unread>
      <div style={{ width: 420 }}>
        <StartBar {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** In a factory, the factories still read. */
export const ReadingTheFactories: StoryObj<typeof meta> = {
  play: saysReading('Reading the factories…'),
};

/** In none yet, the factories it may start in still read. */
export const AskingTheFactory: StoryObj<typeof meta> = {
  args: { factory: null },
  play: saysReading('Reading the factories…'),
};

/** The factory read, on its one repository, the workflows it offers there still read: the shape of their list. */
export const ReadingTheWorkflows: StoryObj<typeof meta> = {
  render: (args) => (
    <QueryClientProvider client={seeded([[factoriesQuery.queryKey, [factoryView('nemia')]]])}>
      <div style={{ width: 420 }}>
        <StartBar {...args} />
      </div>
    </QueryClientProvider>
  ),
  play: saysReading('Reading the workflows…'),
};
