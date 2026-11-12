/**
 * Pairing and first-visit links: single-use tickets that end in a person token minted at their claim, so no token is printed for a
 * person to copy. A client asks for a pairing with no token (`POST /api/pair`), shows its short code, the person approves it from the
 * server's shell or a signed-in board (`POST /api/pairings/:code/approve`), and the client claims it with the secret it was answered
 * (`POST /api/pair/:id/claim`). A first-visit link (`POST /api/links`, `nemia board link`) needs no approval: the browser that opens it
 * claims it (`POST /api/pair/link`), which sets the board's cookie as `POST /api/session` does. `/api/pair` needs no token: each of its
 * routes judges its own secret (apps/api's `needOf`).
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { BadRequest, Conflict, Failed, Forbidden, Invalid, Missing } from './api-errors.ts';
import { SESSION_COOKIE_STATES, TICKET_STATES } from './words.ts';

/** `POST /api/pair`'s body: the client's name, which the token minted at the claim is named after. */
export const PairingRequest = Schema.Struct({ client: Schema.String });
export type PairingRequest = typeof PairingRequest.Type;

/**
 * What `POST /api/pair` answers, once: the pairing's id, the short code the person approves it by, the secret the client claims it with,
 * and when it lapses (ISO 8601). The store keeps only digests of the code and the secret.
 */
export const PairingAsked = Schema.Struct({
  id: Schema.String,
  code: Schema.String,
  secret: Schema.String,
  expiresAt: Schema.String,
});
export type PairingAsked = typeof PairingAsked.Type;

/** `POST /api/pair/:id/claim`'s body and `POST /api/pair/link`'s: the ticket's secret. */
export const TicketClaim = Schema.Struct({ secret: Schema.String });
export type TicketClaim = typeof TicketClaim.Type;

/**
 * What a pairing's claim answers: its phase, and once it is claimed by this call the token minted for the client and its name. A
 * pairing still `waiting` answers its phase alone, and the client asks again.
 */
export const PairingClaimed = Schema.Struct({
  phase: Schema.Literals(TICKET_STATES),
  token: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
});
export type PairingClaimed = typeof PairingClaimed.Type;

/** A pairing as `GET /api/pairings` lists it: its id, the client's name, its phase and its times. Never its code nor its secret. */
export const Pairing = Schema.Struct({
  id: Schema.String,
  client: Schema.String,
  phase: Schema.Literals(TICKET_STATES),
  createdAt: Schema.String,
  expiresAt: Schema.String,
});
export type Pairing = typeof Pairing.Type;

/** `GET /api/pairings`: the pairings the store keeps, newest first. */
export const PairingList = Schema.Struct({ pairings: Schema.Array(Pairing) });
export type PairingList = typeof PairingList.Type;

/** `POST /api/links`' body: the base the link is printed under (`--base`), the board's own address where left out. */
export const LinkRequest = Schema.Struct({ base: Schema.optionalKey(Schema.String) });
export type LinkRequest = typeof LinkRequest.Type;

/** What `POST /api/links` answers, once: the link to open (`<base>/?link=<secret>`), and when it lapses. */
export const LinkMinted = Schema.Struct({ url: Schema.String, expiresAt: Schema.String });
export type LinkMinted = typeof LinkMinted.Type;

/** What `POST /api/pair/link` answers: the board's cookie set, and the token's name. Never the token. */
export const LinkClaimed = Schema.Struct({ cookie: Schema.Literals(SESSION_COOKIE_STATES), name: Schema.String });
export type LinkClaimed = typeof LinkClaimed.Type;

/** What a claim of a ticket refuses with: an unknown ticket or a wrong secret, a 404; one claimed already or past its time, a 409. */
const claimErrors = [BadRequest, Missing, Conflict, Failed];

/** The routes a client with no token yet is let through on. */
export class PairGroup extends HttpApiGroup.make('pair').add(
  HttpApiEndpoint.post('ask', '/api/pair', { payload: PairingRequest, success: PairingAsked, error: [BadRequest, Invalid, Failed] }),
  HttpApiEndpoint.post('claim', '/api/pair/:id/claim', {
    params: { id: Schema.String },
    payload: TicketClaim,
    success: PairingClaimed,
    error: claimErrors,
  }),
  HttpApiEndpoint.post('claimLink', '/api/pair/link', { payload: TicketClaim, success: LinkClaimed, error: claimErrors }),
) {}

/** The person's side: the pairings listed and approved, and a first-visit link made. A person's token alone reaches the writes. */
export class PairingsGroup extends HttpApiGroup.make('pairings').add(
  HttpApiEndpoint.get('list', '/api/pairings', { success: PairingList, error: [Failed] }),
  HttpApiEndpoint.post('approve', '/api/pairings/:code/approve', {
    params: { code: Schema.String },
    success: Pairing,
    error: [Missing, Conflict, Forbidden, Failed],
  }),
  HttpApiEndpoint.post('link', '/api/links', {
    payload: LinkRequest,
    success: LinkMinted,
    error: [BadRequest, Invalid, Forbidden, Failed],
  }),
) {}
