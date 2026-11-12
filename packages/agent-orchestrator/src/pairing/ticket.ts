/**
 * Where a ticket stands (`ticketState`, `contracts/ticket.contract.ts`) — a pairing a new client asked for, or a board's first-visit
 * link — how long each lasts (`PAIRING_TTL_MS`, `LINK_TTL_MS`), and the short code a pairing is approved by: eight characters of an
 * alphabet with no 0, O, 1, I or L, shown as `XXXX-XXXX` (`shortCode`, `codeShown`), matched with or without its dash, in either case
 * (`codeRead`). Pure but for `shortCode`'s random bytes.
 */
import crypto from 'node:crypto';
import type { TicketStateOf } from '../../contracts/ticket.contract.ts';

export type { Ticket } from '../../contracts/ticket.contract.ts';

/** How long a pairing waits for its approval and its claim: ten minutes. */
export const PAIRING_TTL_MS = 10 * 60_000;

/** How long a first-visit link waits to be opened: ten minutes. */
export const LINK_TTL_MS = 10 * 60_000;

/**
 * Where a ticket stands at `nowMs`: claimed for good once claimed; else expired past its time; else waiting where it needs an approval
 * nobody gave; else claimable.
 */
export const ticketState: TicketStateOf = (ticket, nowMs) => {
  if (ticket.claimedAtMs !== undefined) return 'claimed';
  if (nowMs >= ticket.createdAtMs + ticket.ttlMs) return 'expired';
  return ticket.needsApproval && ticket.approvedAtMs === undefined ? 'waiting' : 'claimable';
};

/** The characters of a short code: digits and capitals, with none a person reads as another (0 and O, 1, I and L). */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** How many characters a short code has. */
const CODE_LENGTH = 8;

/** A new short code, `CODE_LENGTH` characters of `CODE_ALPHABET` drawn from random bytes, unshown: no dash. */
export const shortCode = (): string =>
  Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET.charAt(crypto.randomInt(CODE_ALPHABET.length))).join('');

/** A short code as a person is shown it: its two halves split by a dash, `XXXX-XXXX`. */
export const codeShown = (code: string): string => `${code.slice(0, CODE_LENGTH / 2)}-${code.slice(CODE_LENGTH / 2)}`;

/**
 * A short code as a person typed it, read as the store keeps it: its dash and spaces taken off, in capitals. Undefined for a text that is
 * no code: of another length, or holding a character outside the alphabet.
 */
export const codeRead = (typed: string): string | undefined => {
  const bare = typed.replace(/[\s-]/g, '').toUpperCase();
  return bare.length === CODE_LENGTH && bare.split('').every((c) => CODE_ALPHABET.includes(c)) ? bare : undefined;
};
