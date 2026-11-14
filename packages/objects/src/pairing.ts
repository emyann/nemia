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
export const PairingRequest = Schema.Struct({
  client: Schema.String.annotate({ description: "The client's name, which the token minted at the claim is named after." }),
});
export type PairingRequest = typeof PairingRequest.Type;

/**
 * What `POST /api/pair` answers, once: the pairing's id, the short code the person approves it by, the secret the client claims it with,
 * and when it lapses (ISO 8601). The store keeps only digests of the code and the secret.
 */
export const PairingAsked = Schema.Struct({
  id: Schema.String.annotate({ description: "The pairing's id, which the claim names." }),
  code: Schema.String.annotate({ description: 'The short code the person approves the pairing by.' }),
  secret: Schema.String.annotate({ description: 'The secret the client claims it with; the store keeps only its digest.' }),
  expiresAt: Schema.String.annotate({ description: 'When the pairing lapses, as an ISO 8601 time.' }),
});
export type PairingAsked = typeof PairingAsked.Type;

/** `POST /api/pair/:id/claim`'s body and `POST /api/pair/link`'s: the ticket's secret. */
export const TicketClaim = Schema.Struct({
  secret: Schema.String.annotate({ description: 'The secret the ticket was answered with.' }),
});
export type TicketClaim = typeof TicketClaim.Type;

/**
 * What a pairing's claim answers: its phase, and once it is claimed by this call the token minted for the client and its name. A
 * pairing still `waiting` answers its phase alone, and the client asks again.
 */
export const PairingClaimed = Schema.Struct({
  phase: Schema.Literals(TICKET_STATES).annotate({ description: 'Where the pairing stands: waiting, claimable, claimed or expired.' }),
  token: Schema.optionalKey(
    Schema.String.annotate({ description: 'The token minted for the client, once this call claimed it; absent otherwise.' }),
  ),
  name: Schema.optionalKey(
    Schema.String.annotate({ description: "The minted token's name, once this call claimed it; absent otherwise." }),
  ),
});
export type PairingClaimed = typeof PairingClaimed.Type;

/** A pairing as `GET /api/pairings` lists it: its id, the client's name, its phase and its times. Never its code nor its secret. */
export const Pairing = Schema.Struct({
  id: Schema.String.annotate({ description: "The pairing's id." }),
  client: Schema.String.annotate({ description: "The client's name." }),
  phase: Schema.Literals(TICKET_STATES).annotate({ description: 'Where the pairing stands: waiting, claimable, claimed or expired.' }),
  createdAt: Schema.String.annotate({ description: 'When it was asked, as an ISO 8601 time.' }),
  expiresAt: Schema.String.annotate({ description: 'When it lapses, as an ISO 8601 time.' }),
});
export type Pairing = typeof Pairing.Type;

/** `GET /api/pairings`: the pairings the store keeps, newest first. */
export const PairingList = Schema.Struct({
  pairings: Schema.Array(Pairing).annotate({ description: 'The pairings the store keeps, newest first.' }),
});
export type PairingList = typeof PairingList.Type;

/** `POST /api/links`' body: the base the link is printed under (`--base`), the board's own address where left out. */
export const LinkRequest = Schema.Struct({
  base: Schema.optionalKey(
    Schema.String.annotate({ description: "The base the link is printed under; the board's own address where left out." }),
  ),
});
export type LinkRequest = typeof LinkRequest.Type;

/** What `POST /api/links` answers, once: the link to open (`<base>/?link=<secret>`), and when it lapses. */
export const LinkMinted = Schema.Struct({
  url: Schema.String.annotate({ description: 'The link to open, `<base>/?link=<secret>`.' }),
  expiresAt: Schema.String.annotate({ description: 'When the link lapses, as an ISO 8601 time.' }),
});
export type LinkMinted = typeof LinkMinted.Type;

/** What `POST /api/pair/link` answers: the board's cookie set, and the token's name. Never the token. */
export const LinkClaimed = Schema.Struct({
  cookie: Schema.Literals(SESSION_COOKIE_STATES).annotate({
    description: "What the claim did to the board's cookie: set it, or cleared it.",
  }),
  name: Schema.String.annotate({ description: "The minted token's name." }),
});
export type LinkClaimed = typeof LinkClaimed.Type;

/** What a claim of a ticket refuses with: an unknown ticket or a wrong secret, a 404; one claimed already or past its time, a 409. */
const claimErrors = [BadRequest, Missing, Conflict, Failed];

/** The routes a client with no token yet is let through on. */
export class PairGroup extends HttpApiGroup.make('pair').add(
  HttpApiEndpoint.post('ask', '/api/pair', { payload: PairingRequest, success: PairingAsked, error: [BadRequest, Invalid, Failed] }),
  HttpApiEndpoint.post('claim', '/api/pair/:id/claim', {
    params: { id: Schema.String.annotate({ description: "The pairing's id, from its ask." }) },
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
    params: { code: Schema.String.annotate({ description: "The pairing's short code, as the client shows it." }) },
    success: Pairing,
    error: [Missing, Conflict, Forbidden, Failed],
  }),
  HttpApiEndpoint.post('link', '/api/links', {
    payload: LinkRequest,
    success: LinkMinted,
    error: [BadRequest, Invalid, Forbidden, Failed],
  }),
) {}
