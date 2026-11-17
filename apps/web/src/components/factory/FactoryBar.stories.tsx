import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DEFAULT_NAMESPACE } from 'objects';
import { expect } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import { openRunsQuery } from '@/lib/api/runs';
import { FactoryBar } from './FactoryBar';
import { FACTORY, factoryView, openRuns, seeded } from '../../../.storybook/fixtures/proposals';

/** The bar of `factory`, the factories and its runs read: the factory `nemia`, and the default one. */
const drawn = (factory: string) => (
  <QueryClientProvider
    client={seeded([
      [factoriesQuery.queryKey, [factoryView(FACTORY), factoryView(DEFAULT_NAMESPACE, true)]],
      [openRunsQuery(factory).queryKey, openRuns(1)],
    ])}
  >
    <FactoryBar factory={factory} />
  </QueryClientProvider>
);

/** The frame's side sheet for a factory, one story a state: a factory of the person's, and the default factory, tagged. */
const meta: Meta<typeof FactoryBar> = {
  title: 'Factory/FactoryBar',
  component: FactoryBar,
  args: { factory: FACTORY },
  render: (args) => drawn(args.factory),
};
export default meta;

type Story = StoryObj<typeof FactoryBar>;

/** A factory of the person's: its repositories, what its runs are doing and what it offers. */
export const Yours: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector(`[data-factory-bar="${FACTORY}"] [data-runs]`)).not.toBeNull();
  },
};

/** The default factory, tagged with the kit's tag beside its name. */
export const DefaultFactory: Story = {
  args: { factory: DEFAULT_NAMESPACE },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="tag"]')?.textContent).toBe('default');
  },
};
