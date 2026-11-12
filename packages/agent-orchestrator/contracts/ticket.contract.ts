/**
 * Where a ticket stands (`ticketState`, src/pairing/ticket.ts): a pairing a new client asked for, or a board's first-visit link.
 *
 * Each is single-use and short-lived: it lapses `ttlMs` after it was made, and a claim — the client's, or the browser's that opens the
 * link — is answered with a person token minted then, named after the client, once. A pairing waits for the person's approval from a
 * place already trusted (the server's shell, or a board signed in) before it can be claimed; a link was made by the person and needs no
 * approval. Claimed is for good, whatever the clock says; an unclaimed ticket past its time is expired, approved or not.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * A ticket as the store keeps it: when it was made and for how long, whether it needs an approval, and when it was approved and
 * claimed.
 */
export type Ticket = {
  readonly createdAtMs: number;
  readonly ttlMs: number;
  readonly needsApproval: boolean;
  readonly approvedAtMs?: number;
  readonly claimedAtMs?: number;
};

/** Where a ticket stands. Implement moves it into objects' words, the pairing's `status.phase`. */
export type TicketState = 'waiting' | 'claimable' | 'claimed' | 'expired';

const lapsed = (t: Ticket, nowMs: number): boolean => nowMs >= t.createdAtMs + t.ttlMs;

const ticketStateSpec = spec<(ticket: Ticket, nowMs: number) => TicketState>({
  /** A ticket lasts a positive time from a finite moment. */
  requires: ({ input: [t, nowMs] }) => Number.isFinite(t.createdAtMs) && Number.isFinite(nowMs) && t.ttlMs > 0,
  ensures: {
    claimedIsForGood: {
      description: 'A ticket claimed stays claimed, whatever the clock says: it is never claimed twice',
      condition: ({ input: [t], output }) => t.claimedAtMs === undefined || output === 'claimed',
    },
    anUnclaimedTicketLapses: {
      description: 'An unclaimed ticket past its time is expired, approved or not',
      condition: ({ input: [t, nowMs], output }) => t.claimedAtMs !== undefined || !lapsed(t, nowMs) || output === 'expired',
    },
    aPairingWaitsForTheApproval: {
      description: 'An unclaimed pairing within its time that nobody approved waits',
      condition: ({ input: [t, nowMs], output }) =>
        t.claimedAtMs !== undefined ||
        lapsed(t, nowMs) ||
        !t.needsApproval ||
        t.approvedAtMs !== undefined ||
        output === 'waiting',
    },
    anApprovedOrOpenTicketIsClaimable: {
      description: 'An unclaimed ticket within its time is claimable where it needs no approval, or was approved',
      condition: ({ input: [t, nowMs], output }) =>
        t.claimedAtMs !== undefined ||
        lapsed(t, nowMs) ||
        (t.needsApproval && t.approvedAtMs === undefined) ||
        output === 'claimable',
    },
  },
});

/** `ticketState`'s type, which src/pairing/ticket.ts takes. */
export type TicketStateOf = Implementation<typeof ticketStateSpec>;
