/**
 * Pairing and first-visit links: single-use tickets that end in a person token minted at their claim, so no token is printed for a
 * person to copy. Each group holds both sides of its handshake. A pairing (`PairingsGroup`): a client asks for one with no token
 * (`POST /api/pairings`), shows its short code, the person approves it from the server's shell or a signed-in board (`POST
 * /api/pairings/approve`, the code in the body), and the client claims it with the secret it was answered (`POST
 * /api/pairings/:id/claim`). A first-visit link (`LinksGroup`): the person mints one (`POST /api/links`, `nemia board link`), which
 * needs no approval, and the browser that opens it claims it (`POST /api/links/claim`), which sets the board's cookie as `POST
 * /api/session` does. The ask and the two claims need no token, each judging its own secret (apps/api's `needOf`); the list, the approval
 * and the mint need one.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from 'effect/http-api';
import { BadRequest, Conflict, Failed, Forbidden, Invalid, Missing } from './api-errors.ts';
import { SESSION_COOKIE_STATES, TICKET_STATES } from './words.ts';

/** `POST /api/pairings`' body: the client's name, which the token minted at the claim is named after. */
export const PairingRequest = Schema.Struct({
  client: Schema.String.annotate({ description: "The client's name, which the token minted at the claim is named after." }),
});
export type PairingRequest = typeof PairingRequest.Type;

/**
 * What `POST /api/pairings` answers, once: the pairing's id, the short code the person approves it by, the secret the client claims it
 * with, and when it lapses (ISO 8601). The store keeps only digests of the code and the secret.
 */
export const PairingAsked = Schema.Struct({
  id: Schema.String.annotate({ description: "The pairing's id, which the claim names." }),
  code: Schema.String.annotate({ description: 'The short code the person approves the pairing by.' }),
  secret: Schema.String.annotate({ description: 'The secret the client claims it with; the store keeps only its digest.' }),
  expiresAt: Schema.String.annotate({ description: 'When the pairing lapses, as an ISO 8601 time.' }),
});
export type PairingAsked = typeof PairingAsked.Type;

/** `POST /api/pairings/:id/claim`'s body and `POST /api/links/claim`'s: the ticket's secret. */
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

/** `POST /api/pairings/approve`'s body: the short code the client shows. */
export const PairingApproval = Schema.Struct({
  code: Schema.String.annotate({
    description: "The pairing's short code, as the client shows it, in either case, with or without its dash.",
  }),
});
export type PairingApproval = typeof PairingApproval.Type;

/** `POST /api/links`' body: the base the link is printed under (`--base`), the board's own address where left out. */
export const LinkRequest = Schema.Struct({
  base: Schema.optionalKey(
    Schema.String.annotate({ description: "The base the link is printed under; the board's own address where left out." }),
  ),
});
export type LinkRequest = typeof LinkRequest.Type;

/** What `POST /api/links` answers, once: the link to open (`<base>/welcome?link=<secret>`), and when it lapses. */
export const LinkMinted = Schema.Struct({
  url: Schema.String.annotate({ description: 'The link to open, `<base>/welcome?link=<secret>`.' }),
  expiresAt: Schema.String.annotate({ description: 'When the link lapses, as an ISO 8601 time.' }),
});
export type LinkMinted = typeof LinkMinted.Type;

/** What `POST /api/links/claim` answers: the board's cookie set, and the token's name. Never the token. */
export const LinkClaimed = Schema.Struct({
  cookie: Schema.Literals(SESSION_COOKIE_STATES).annotate({
    description: "What the claim did to the board's cookie: set it, or cleared it.",
  }),
  name: Schema.String.annotate({ description: "The minted token's name." }),
});
export type LinkClaimed = typeof LinkClaimed.Type;

/** What a claim of a ticket refuses with: an unknown ticket or a wrong secret, a 404; one claimed already or past its time, a 409. */
const claimErrors = [BadRequest, Missing, Conflict, Failed];

/**
 * A pairing, both sides of its handshake: the client with no token asks for it and claims it by its secret, and the person lists the
 * pairings and approves one by its short code. A person's token alone reaches the approval.
 */
export class PairingsGroup extends HttpApiGroup.make('pairings').add(
  HttpApiEndpoint.post('ask', '/api/pairings', {
    payload: PairingRequest,
    success: PairingAsked,
    error: [BadRequest, Invalid, Failed],
  }).annotate(
    OpenApi.Description,
    'Asks for a pairing, with no token: a single-use ticket a person approves by its short code. Answers PairingAsked, once: its id, the short code and the secret the client claims it with.',
  ),
  HttpApiEndpoint.post('claim', '/api/pairings/:id/claim', {
    params: { id: Schema.String.annotate({ description: "The pairing's id, from its ask." }) },
    payload: TicketClaim,
    success: PairingClaimed,
    error: claimErrors,
  }).annotate(
    OpenApi.Description,
    'Claims an approved pairing with the secret its ask answered, minting a person token for the client. Answers PairingClaimed: its phase, and the token once this call claimed it.',
  ),
  HttpApiEndpoint.get('list', '/api/pairings', { success: PairingList, error: [Failed] }).annotate(
    OpenApi.Description,
    'Lists the pairings the store keeps, newest first, never their code nor their secret. Answers PairingList.',
  ),
  HttpApiEndpoint.post('approve', '/api/pairings/approve', {
    payload: PairingApproval,
    success: Pairing,
    error: [BadRequest, Missing, Conflict, Forbidden, Failed],
  }).annotate(
    OpenApi.Description,
    'Approves a pairing by the short code the client shows, so the client may claim it. Answers the Pairing.',
  ),
) {}

/**
 * A first-visit link, both sides of its handshake: the person mints it, and the browser that opens it claims it by its secret, with no
 * token and no approval. A person's token alone reaches the mint.
 */
export class LinksGroup extends HttpApiGroup.make('links').add(
  HttpApiEndpoint.post('mint', '/api/links', {
    payload: LinkRequest,
    success: LinkMinted,
    error: [BadRequest, Invalid, Forbidden, Failed],
  }).annotate(
    OpenApi.Description,
    'Mints a single-use first-visit link the browser that opens it claims, with no approval. Answers LinkMinted, once: the link to open and when it lapses.',
  ),
  HttpApiEndpoint.post('claim', '/api/links/claim', { payload: TicketClaim, success: LinkClaimed, error: claimErrors }).annotate(
    OpenApi.Description,
    "Claims a first-visit link with its secret, setting the board's cookie as a sign-in does. Answers LinkClaimed, the token's name and never the token.",
  ),
) {}
