import type { Meta, StoryObj } from '@storybook/react-vite';
import { delay, http, HttpResponse } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { PairingAsked, PairingClaimed } from 'objects';
import { PairBrowser } from './PairBrowser';

/** The room the part is drawn in, in pixels: a token page's column. */
type Args = { width: number };

/** The pairing the api answers the ask with. */
const ASKED: PairingAsked = { id: 'p-1', code: 'K7QM-3XRP', secret: 's-1', expiresAt: '2026-11-17T15:10:00.000Z' };

/** A claim the person has not approved yet. */
const WAITING: PairingClaimed = { phase: 'waiting' };

/** The kit's outlined button that pairs this browser, a story a state: offered, and pressed, its code waiting on the approval. */
const meta: Meta<Args> = {
  title: 'Frame/PairBrowser',
  args: { width: 448 },
  render: ({ width }) => (
    <div style={{ width }}>
      <PairBrowser />
    </div>
  ),
};
export default meta;

type Story = StoryObj<Args>;

/** Offered: Pair this browser, with its icon. */
export const Offered: Story = {
  parameters: { msw: [http.post('/api/pairings', async () => delay('infinite'))] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Pair this browser' })).toBeEnabled();
  },
};

/** Pressed while the api is asked: Asking…, the press off until it answers. */
export const Asking: Story = {
  parameters: { msw: [http.post('/api/pairings', async () => delay('infinite'))] },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Pair this browser' }));
    await waitFor(() => expect(within(canvasElement).getByRole('button', { name: 'Asking…' })).toBeDisabled());
  },
};

/** Asked: the code the person approves, large, waiting on the approval. */
export const Waiting: Story = {
  parameters: {
    msw: [
      http.post('/api/pairings', () => HttpResponse.json(ASKED, { status: 201 })),
      http.post('/api/pairings/:id/claim', () => HttpResponse.json(WAITING)),
    ],
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Pair this browser' }));
    await waitFor(() => expect(within(canvasElement).getByText('K7QM-3XRP')).toBeVisible());
    await waitFor(() => expect(within(canvasElement).getByText('Waiting for the approval…')).toBeVisible());
  },
};
