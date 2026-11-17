import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { factoriesQuery, type Factory } from '@/lib/api/factories';
import { factoryWorkflowsQuery } from '@/lib/api/workflows';
import { StartBar } from './FactoryStart';
import { FACTORY, seeded } from '../../../.storybook/fixtures/proposals';
import { listing, offering, unfilled } from '../../../.storybook/fixtures/factories';
import { saysReading, Unread } from '../../../.storybook/unread';

/** The bar on a start in `factory`, the factories `factories` read, and `build` and `quick` on the first's one repository. */
const drawn = (factory: string | null, factories: readonly Factory[]) => (
  <QueryClientProvider
    client={seeded([
      [factoriesQuery.queryKey, factories],
      [factoryWorkflowsQuery({ factory: FACTORY, repo: '/work/nemia' }).queryKey, [listing('build'), listing('quick', unfilled('quick'))]],
    ])}
  >
    <StartBar factory={factory} />
  </QueryClientProvider>
);

/**
 * The bar on a run's start, one story a state: in no factory yet, the factories to pick; on a factory's one repository, its workflows
 * as the kit's radios; and on two, the workflow picked in the kit's select first, whose axe check waits as the card's start says.
 */
const meta: Meta<{ factory: string | null; factories: readonly Factory[] }> = {
  title: 'Factory/FactoryStart',
  args: { factory: FACTORY, factories: [offering()] },
  render: ({ factory, factories }) => drawn(factory, factories),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** On its one repository: each workflow a radio, the one whose step no agent fills disabled, saying why. */
export const OneRepository: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-workflow] [data-slot="radio"]').length).toBe(2);
    await expect(canvasElement.querySelector('[data-workflow="repo:quick"] [data-why-not]')).not.toBeNull();
  },
};

/** On two repositories: the workflow is picked by name first, in the kit's select. */
export const TwoRepositories: Story = {
  parameters: { a11y: { test: 'todo' } },
  args: { factories: [offering(['/work/nemia', '/work/site'])] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-pick-workflow]')).not.toBeNull();
  },
};

/** In no factory yet: the factories a run can start in, one a button. */
export const NoFactoryYet: Story = {
  args: { factory: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector(`[data-start-factory="${FACTORY}"] button`)).not.toBeNull();
  },
};

/** In a factory, the factories still read. */
export const ReadingTheFactories: Story = {
  render: ({ factory }) => (
    <Unread>
      <div style={{ width: 420 }}>
        <StartBar factory={factory} />
      </div>
    </Unread>
  ),
  play: saysReading('Reading the factories…'),
};

/** In none yet, the factories it may start in still read. */
export const AskingTheFactory: Story = { ...ReadingTheFactories, args: { factory: null } };

/** The factory read, on its one repository, the workflows it offers there still read: the shape of their list. */
export const ReadingTheWorkflows: Story = {
  render: ({ factory, factories }) => (
    <QueryClientProvider client={seeded([[factoriesQuery.queryKey, factories]])}>
      <div style={{ width: 420 }}>
        <StartBar factory={factory} />
      </div>
    </QueryClientProvider>
  ),
  play: saysReading('Reading the workflows…'),
};
