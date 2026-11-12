/**
 * Pairing and first-visit links, as `objects` says them (`PairGroup`, `PairingsGroup`): a browser with no token asks for a pairing
 * (`POST /api/pair`), shows its code and claims it with its secret until the person approves it (`POST /api/pair/:id/claim`); a browser
 * opened on a first-visit link claims it (`POST /api/pair/link`), which sets the board's cookie; a signed-in board lists the pairings
 * (`GET /api/pairings`) and approves one by the code the client shows (`POST /api/pairings/:code/approve`).
 */
import { queryOptions } from '@tanstack/react-query';
import { LinkClaimed, Pairing, PairingAsked, PairingClaimed, PairingList } from 'objects';
import { call, read, write } from './objects.ts';

/** How often the pairings are read again while a page shows them: a client's ask is seen within this. */
const PAIRINGS_EVERY_MS = 5_000;

/** The pairings the store keeps, newest first; never a code nor a secret. */
export const pairingsQuery = queryOptions({
  queryKey: ['pairings'],
  queryFn: () => call((c) => c.pairings.list(), read(PairingList)),
  refetchInterval: PAIRINGS_EVERY_MS,
});

/** A pairing asked for under the client name `client`: its id, the code the person approves, the secret it is claimed with. */
export const askPairing = (client: string): Promise<PairingAsked> =>
  call(
    (c) => c.pair.ask({ payload: { client } }),
    write(PairingAsked, 'A pairing may have been asked for: it lapses by itself, so ask again.'),
  );

/** A pairing's claim: `waiting` until the person approves it, then `claimed` once, with the token minted for this browser. */
export const claimPairing = (id: string, secret: string): Promise<PairingClaimed> =>
  call(
    (c) => c.pair.claim({ params: { id }, payload: { secret } }),
    write(PairingClaimed, 'The pairing may be used already: ask for another one if this browser still asks for a token.'),
  );

/** A first-visit link claimed: the api sets this browser's cookie, and answers the token's name, never the token. */
export const claimLink = (secret: string): Promise<LinkClaimed> =>
  call(
    (c) => c.pair.claimLink({ payload: { secret } }),
    write(LinkClaimed, 'The link may be used: reload the page to see whether this browser is signed in.'),
  );

/** A pairing approved by the code its client shows, typed by the person: answers the pairing, now claimable. */
export const approvePairing = (code: string): Promise<Pairing> =>
  call(
    (c) => c.pairings.approve({ params: { code } }),
    write(Pairing, 'The pairing may be approved: read the pairings again before approving it again.'),
  );
