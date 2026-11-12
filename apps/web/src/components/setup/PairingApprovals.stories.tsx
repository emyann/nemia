import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Pairing } from 'objects';
import { PairingApprovals } from './PairingApprovals';

/** The clients that wait to pair, as Setup lists them: one, several, none, and an approval refused. */
const meta: Meta = { title: 'Board/PairingApprovals' };
export default meta;

/** A pairing that waits, asked under `client`. */
const waiting = (id: string, client: string): Pairing => ({
  id,
  client,
  phase: 'waiting',
  createdAt: '2026-11-12T10:00:00.000Z',
  expiresAt: '2026-11-12T10:10:00.000Z',
});

/** Two that wait, and one already claimed, which is not listed. */
const PAIRINGS: Pairing[] = [
  waiting('p-1', 'laptop'),
  waiting('p-2', 'board-firefox'),
  { ...waiting('p-3', 'old-laptop'), phase: 'claimed' },
];

/** A box as wide as a phone. */
const PHONE: CSSProperties = { width: 360 };

/** A box as wide as Setup's column. */
const WIDE: CSSProperties = { width: 760 };

/** Two clients waiting. */
export const Waiting: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <PairingApprovals pairings={PAIRINGS} onApprove={() => undefined} />
    </div>
  ),
};

/** The same at a phone's width. */
export const Phone: StoryObj = {
  render: () => (
    <div style={PHONE}>
      <PairingApprovals pairings={PAIRINGS} onApprove={() => undefined} />
    </div>
  ),
};

/** None waiting. */
export const None: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <PairingApprovals pairings={[]} onApprove={() => undefined} />
    </div>
  ),
};

/** An approval refused, and the one before it approved. */
export const Refused: StoryObj = {
  render: () => (
    <div style={WIDE}>
      <PairingApprovals
        pairings={PAIRINGS}
        onApprove={() => undefined}
        approved="tablet"
        refused={{ id: 'p-1', message: 'no pairing waits under the code K7QM-3XRP: read the pairings again' }}
      />
    </div>
  ),
};
