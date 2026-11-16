import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { DEFAULT_NAMESPACE, type Proposal } from 'objects';
import { factoriesQuery } from '@/lib/api/factories';
import { inboxQuery } from '@/lib/api/inbox';
import { waitingProposalsQuery } from '@/lib/api/proposals';
import { frameRunsQuery } from '../nav/nav';
import { FactoryPane } from './FactoryPane';
import { FACTORY, factoryView, openRuns, proposal, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';

/** What a pane's reads answer: the proposals that wait, the cards not started, the runs waiting. */
type Reads = { waiting: readonly Proposal[]; cards: number; runs: number };

/**
 * The pane of `factory` at `path`, its reads seeded under the keys the pane asks them by: its Proposals line reads the proposals that
 * wait (`waitingProposalsQuery`), never the whole list.
 */
const drawn = ({ path, search, factory, lit }: Parameters<typeof FactoryPane>[0], reads: Reads) => (
  <QueryClientProvider
    client={seeded([
      [factoriesQuery.queryKey, [factoryView(DEFAULT_NAMESPACE, true), factoryView(FACTORY)]],
      [inboxQuery.queryKey, Array.from({ length: reads.cards }, (_, i) => unstartedCard(`card-${i + 1}`, factory))],
      [frameRunsQuery(path).queryKey, openRuns(reads.runs)],
      [waitingProposalsQuery(factory).queryKey, reads.waiting],
    ])}
  >
    <FactoryPane path={path} search={search} factory={factory} lit={lit} inDrawer />
  </QueryClientProvider>
);

/**
 * A factory's pane, one story a state of what its places say: two proposals waiting on the person, none waiting, and the default
 * factory, which holds no proposal and asks for none.
 *
 * Axe's `label-content-name-mismatch` alone is off, for the switcher at the pane's head (`FactoryPicker`): the ds kit's `Select` draws
 * its value before its floating label inside its trigger, while React Aria names the trigger label first, so a populated kit select
 * fails it wherever it is drawn. That is the kit's to mend, upstream; every other rule holds the pane.
 */
const meta: Meta<typeof FactoryPane> = {
  title: 'Frame/FactoryPane',
  component: FactoryPane,
  args: { path: `/factories/${FACTORY}`, search: {}, factory: FACTORY, lit: 'runs' },
  parameters: { a11y: { config: { rules: [{ id: 'label-content-name-mismatch', enabled: false }] } } },
};
export default meta;

type Story = StoryObj<typeof FactoryPane>;

/** Two proposals wait on the person, a card is not started and a run waits: each place says so. */
export const ProposalsWaiting: Story = {
  args: { lit: 'runs' },
  render: (args) =>
    drawn(args, { waiting: [proposal('nemia-k3p9q', 'waiting'), proposal('nemia-w1d3n', 'waiting', true)], cards: 1, runs: 1 }),
  play: async ({ canvasElement }) => {
    const pane = within(canvasElement);
    await waitFor(() => expect(pane.getByText('2 wait on you')).toBeVisible());
    await waitFor(() => expect(pane.getByText('1 not started')).toBeVisible());
    await waitFor(() => expect(pane.getByText('1 waiting on you')).toBeVisible());
  },
};

/** Nothing waits: no proposal, every card started, no run waiting. */
export const NoneWaiting: Story = {
  args: { lit: 'proposals' },
  render: (args) => drawn(args, { waiting: [], cards: 0, runs: 0 }),
  play: async ({ canvasElement }) => {
    const pane = within(canvasElement);
    await waitFor(() => expect(pane.getByText('none waiting')).toBeVisible());
    await waitFor(() => expect(pane.getByText('every card started')).toBeVisible());
    await waitFor(() => expect(pane.getByText('nothing waits on you')).toBeVisible());
  },
};

/** The default factory: it holds no proposal, so its line says none waits without asking. */
export const DefaultFactory: Story = {
  args: { path: `/factories/${DEFAULT_NAMESPACE}`, factory: DEFAULT_NAMESPACE, lit: 'runs' },
  render: (args) => drawn(args, { waiting: [], cards: 0, runs: 0 }),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText('none waiting')).toBeVisible());
  },
};
