import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { DEFAULT_NAMESPACE, type Proposal } from 'objects';
import { factoriesQuery, factoryPlacesQuery } from '@/lib/api/factories';
import { cardCountQuery } from '@/lib/api/inbox';
import { type ProposalRow, waitingProposalsQuery } from '@/lib/api/proposals';
import { frameRunsQuery } from '../nav/nav';
import { FactoryPane } from './FactoryPane';
import { FACTORY, factoryView, openRuns, proposal, seeded } from '../../../.storybook/fixtures/proposals';

/** A proposal as its list's row, which the pane's read answers. */
const rowOf = ({ metadata, spec, status }: Proposal) =>
  ({
    name: metadata.name,
    phase: status.phase,
    widens: status.widens,
    why: spec.why ?? '',
    creationTimestamp: metadata.creationTimestamp,
  }) satisfies ProposalRow;

/** What a pane's reads answer: the proposals that wait, the cards not started, the runs waiting. */
type Reads = { waiting: readonly Proposal[]; cards: number; runs: number };

/**
 * The pane of `factory` at `path`, its reads seeded under the keys the pane asks them by: its Proposals line reads the proposals that
 * wait (`waitingProposalsQuery`), as rows of their list's Table, never the whole list.
 */
/** The badge `place`'s line ends on, if it draws one. */
const badgeOf = (canvasElement: HTMLElement, place: string) =>
  canvasElement.querySelector(`[data-pane-place="${place}"] [data-slot="badge"]`);

const drawn = ({ path, search, factory, lit }: Parameters<typeof FactoryPane>[0], reads: Reads) => (
  <QueryClientProvider
    client={seeded([
      [factoriesQuery.queryKey, [factoryView(DEFAULT_NAMESPACE, true), factoryView(FACTORY)]],
      [
        factoryPlacesQuery.queryKey,
        [
          { name: DEFAULT_NAMESPACE, default: true },
          { name: FACTORY, default: false },
        ],
      ],
      [cardCountQuery(factory).queryKey, { notStarted: reads.cards, blocked: 0, waiting: 0, working: 0, done: 0, failed: 0, cancelled: 0 }],
      [frameRunsQuery(path).queryKey, openRuns(reads.runs)],
      [waitingProposalsQuery(factory).queryKey, reads.waiting.map(rowOf)],
    ])}
  >
    <FactoryPane path={path} search={search} factory={factory} lit={lit} inDrawer />
  </QueryClientProvider>
);

/**
 * A factory's pane, one story a state of what its places say: two proposals waiting on the person, none waiting, and the default
 * factory, which holds no proposal and asks for none.
 */
const meta: Meta<typeof FactoryPane> = {
  title: 'Frame/FactoryPane',
  component: FactoryPane,
  args: { path: `/factories/${FACTORY}`, search: {}, factory: FACTORY, lit: 'runs' },
};
export default meta;

type Story = StoryObj<typeof FactoryPane>;

/**
 * Two proposals wait on the person, a card is not started and a run waits: each place says so, the count of Runs and of the Inbox on
 * the kit's badge, in yours, and said to a screen reader in the line.
 */
export const ProposalsWaiting: Story = {
  args: { lit: 'runs' },
  render: (args) =>
    drawn(args, { waiting: [proposal('nemia-k3p9q', 'waiting'), proposal('nemia-w1d3n', 'waiting', true)], cards: 1, runs: 1 }),
  play: async ({ canvasElement }) => {
    const pane = within(canvasElement);
    await waitFor(() => expect(pane.getByText('2 wait on you')).toBeVisible());
    await waitFor(() => expect(pane.getByText('not started')).toBeVisible());
    await waitFor(() => expect(pane.getByText('waiting on you')).toBeVisible());
    await expect(badgeOf(canvasElement, 'runs')).toHaveTextContent('1');
    await expect(badgeOf(canvasElement, 'runs')).toHaveAttribute('data-color', 'primary');
    await expect(badgeOf(canvasElement, 'inbox')).toHaveTextContent('1');
    await expect(badgeOf(canvasElement, 'inbox')).toHaveAttribute('data-color', 'primary');
    await expect(badgeOf(canvasElement, 'proposals')).toBeNull();
    await expect(pane.getByRole('link', { name: /Runs\s+1 waiting on you/ })).toBeVisible();
    await expect(pane.getByRole('link', { name: /Inbox\s+1 not started/ })).toBeVisible();
  },
};

/** Many wait: the badges grow with their counts, and one past the kit's most shows `999+`. */
export const ManyWaiting: Story = {
  args: { lit: 'inbox' },
  render: (args) => drawn(args, { waiting: [], cards: 12, runs: 1200 }),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(badgeOf(canvasElement, 'runs')).toHaveTextContent('999+'));
    await expect(badgeOf(canvasElement, 'inbox')).toHaveTextContent('12');
  },
};

/** Nothing waits: no proposal, every card started, no run waiting; a count of 0 draws no badge, its line saying so in words. */
export const NoneWaiting: Story = {
  args: { lit: 'proposals' },
  render: (args) => drawn(args, { waiting: [], cards: 0, runs: 0 }),
  play: async ({ canvasElement }) => {
    const pane = within(canvasElement);
    await waitFor(() => expect(pane.getByText('none waiting')).toBeVisible());
    await waitFor(() => expect(pane.getByText('every card started')).toBeVisible());
    await waitFor(() => expect(pane.getByText('nothing waits on you')).toBeVisible());
    await expect(canvasElement.querySelector('[data-slot="badge"]')).toBeNull();
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
