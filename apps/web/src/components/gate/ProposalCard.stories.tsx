import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import { SnackbarRegion } from '@/components/ui/ds';
import type { Proposal } from 'objects';
import { proposalQuery } from '@/lib/api/proposals';
import { ProposalCard } from './ProposalCard';
import { FACTORY, proposal, seeded } from '../../../.storybook/fixtures/proposals';
import { saysReading, Unread } from '../../../.storybook/unread';
import { snackbarShown } from '../../../.storybook/play';

/** The card of `p`, read from a query client that holds it as its own read. */
const drawn = (p: Proposal) => (
  <QueryClientProvider client={seeded([[proposalQuery(FACTORY, p.metadata.name).queryKey, p]])}>
    <div style={{ width: 560 }}>
      <ProposalCard factory={FACTORY} name={p.metadata.name} />
    </div>
  </QueryClientProvider>
);

/**
 * A factory's proposal as its page and her chat draw it, one story a phase: waiting with Approve and Decline, waiting and widening
 * access with its mark, approved with Decline alone, and declined, offering nothing; and a decline pressed, which the frame's
 * snackbar names. A judgement reads the factory's proposals again,
 * those that wait among them.
 */
const meta: Meta<typeof ProposalCard> = {
  title: 'Factory/ProposalCard',
  component: ProposalCard,
  args: { factory: FACTORY, name: 'nemia-k3p9q' },
};
export default meta;

type Story = StoryObj<typeof ProposalCard>;

/** Waiting on the person: Approve and Decline. */
export const Waiting: Story = {
  args: { name: 'nemia-k3p9q' },
  render: (args) => drawn(proposal(args.name, 'waiting')),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-proposal-phase="waiting"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-proposal-approve]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-proposal-decline]')).not.toBeNull();
  },
};

/** Waiting, and widening access: its mark beside the phase. */
export const WaitingWidens: Story = {
  args: { name: 'nemia-w1d3n' },
  render: (args) => drawn(proposal(args.name, 'waiting', true)),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-proposal-widens]')).not.toBeNull();
  },
};

/** Approved by the person and not yet applied: Decline is still offered, Approve no more. */
export const Approved: Story = {
  args: { name: 'nemia-a9p1d' },
  render: (args) => drawn(proposal(args.name, 'approved')),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-proposal-phase="approved"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-proposal-approve]')).toBeNull();
    await expect(canvasElement.querySelector('[data-proposal-decline]')).not.toBeNull();
  },
};

/** Declined: nothing of it was written, and no judgement is left to offer. */
export const Declined: Story = {
  args: { name: 'nemia-d3c1n' },
  render: (args) => drawn(proposal(args.name, 'declined')),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-proposal-phase="declined"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-proposal-approve], [data-proposal-decline]')).toBeNull();
  },
};

/** The card while its proposal is read: the shape of its title, tags, changes and buttons, beside the phases drawn above. */
export const Reading: Story = {
  render: () => (
    <Unread>
      <div style={{ width: 560 }}>
        <ProposalCard factory={FACTORY} name="nemia-ab12c" />
      </div>
    </Unread>
  ),
  play: saysReading('Reading the proposal…'),
};

/** Waiting, then Decline pressed: the card reads declined, and the snackbar the frame hosts names the proposal declined. */
export const DeclinePressed: Story = {
  tags: ['network'],
  args: { name: 'nemia-p2d4x' },
  parameters: {
    msw: [
      http.post('/api/namespaces/:namespace/proposals/:name/decline', ({ params }) =>
        HttpResponse.json(proposal(String(params.name), 'declined')),
      ),
    ],
  },
  render: (args) => (
    <>
      {drawn(proposal(args.name, 'waiting'))}
      <SnackbarRegion />
    </>
  ),
  play: async ({ canvasElement, args }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Decline' }));
    await expect(await snackbarShown(canvasElement.ownerDocument.body)).toHaveTextContent(args.name);
    await expect(canvasElement.querySelector('[data-proposal-phase="declined"]')).not.toBeNull();
  },
};
