/**
 * Where a ticket stands (`ticketState`, src/pairing/ticket.ts): a pairing a new client asked for, or a board's first-visit link.
 *
 * Each is single-use and short-lived: it lapses `ttlMs` after it was made, and a claim — the client's, or the browser's that opens the
 * link — is answered with a person token minted then, named after the client, once. A pairing waits for the person's approval from a
 * place already trusted (the server's shell, or a board signed in) before it can be claimed; a link was made by the person and needs no
 * approval. Claimed is for good, whatever the clock says; an unclaimed ticket past its time is expired, approved or not.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { TicketState } from 'objects';

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

/** The latest moment a ticket is made at, in ms since the epoch: 2^50, the year 37648, far within a double's whole numbers. */
const WHOLE_MS = 2 ** 50;

/** The longest a ticket lasts: a year. */
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const lapsed = (t: Ticket, nowMs: number): boolean => nowMs >= t.createdAtMs + t.ttlMs;

const ticketStateSpec = spec<(ticket: Ticket, nowMs: number) => TicketState>({
  /**
   * A ticket lasts a positive time, a year at most, from a moment between the epoch and 2^50 ms, each a whole number of milliseconds as
   * the clock gives them (`Date.now()`): so the moment it lapses is a sum with no rounding.
   */
  requires: ({ input: [t, nowMs] }) =>
    Number.isInteger(t.createdAtMs) &&
    Number.isInteger(nowMs) &&
    Number.isInteger(t.ttlMs) &&
    t.createdAtMs >= 0 &&
    t.createdAtMs <= WHOLE_MS &&
    t.ttlMs > 0 &&
    t.ttlMs <= YEAR_MS,
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
        t.claimedAtMs !== undefined || lapsed(t, nowMs) || !t.needsApproval || t.approvedAtMs !== undefined || output === 'waiting',
    },
    anApprovedOrOpenTicketIsClaimable: {
      description: 'An unclaimed ticket within its time is claimable where it needs no approval, or was approved',
      condition: ({ input: [t, nowMs], output }) =>
        t.claimedAtMs !== undefined || lapsed(t, nowMs) || (t.needsApproval && t.approvedAtMs === undefined) || output === 'claimable',
    },
  },
});

/** `ticketState`'s type, which src/pairing/ticket.ts takes. */
export type TicketStateOf = Implementation<typeof ticketStateSpec>;
