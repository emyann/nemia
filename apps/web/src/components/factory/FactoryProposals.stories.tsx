import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { type ProposalRow, proposalsQuery } from '@/lib/api/proposals';
import { FactoryProposals } from './FactoryProposals';
import { FACTORY, seeded } from '../../../.storybook/fixtures/proposals';

/** A row of the proposals' list, named `name`, in `phase`. */
const row = (name: string, phase: ProposalRow['phase'], widens = false) =>
  ({ name, phase, widens, why: 'the plan needs its notes written', creationTimestamp: '2026-11-15T18:00:00.000Z' }) satisfies ProposalRow;

/** The proposals of a factory, on its own page: what waits first, each row a link with its phase; and a factory with none. */
const meta: Meta<typeof FactoryProposals> = {
  title: 'Factory/FactoryProposals',
  component: FactoryProposals,
  args: { factory: FACTORY },
  render: (args) => (
    <QueryClientProvider
      client={seeded([
        [
          proposalsQuery(args.factory).queryKey,
          [row('nemia-a9p1d', 'applied'), row('nemia-k3p9q', 'waiting', true), row('nemia-d3c1n', 'declined')],
        ],
      ])}
    >
      <div style={{ width: 640 }}>
        <FactoryProposals {...args} />
      </div>
    </QueryClientProvider>
  ),
};
export default meta;

/** Three proposals, one waiting and widening access, listed first. */
export const Listed: StoryObj<typeof FactoryProposals> = {
  play: async ({ canvasElement }) => {
    const rows = [...canvasElement.querySelectorAll('[data-factory-proposal]')].map((it) => it.getAttribute('data-factory-proposal'));
    await expect(rows[0]).toBe('nemia-k3p9q');
    await expect(rows).toHaveLength(3);
  },
};

/** A factory with no proposal: one line that says so. */
export const None: StoryObj<typeof FactoryProposals> = {
  args: { factory: 'empty' },
  render: (args) => (
    <QueryClientProvider client={seeded([[proposalsQuery(args.factory).queryKey, []]])}>
      <div style={{ width: 640 }}>
        <FactoryProposals {...args} />
      </div>
    </QueryClientProvider>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-no-proposals="empty"]')).not.toBeNull();
  },
};
