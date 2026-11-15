/** The paths the caller gate judges by, read by the gate (`caller.ts`) and its contract (`contracts/token-need.contract.ts`). */

/** The MCP port's path: it and every path under it need a standing token, one the person minted. */
export const MCP_PATH = '/mcp';

/**
 * The pairings' path (`src/pairing/pairing.ts`): `POST` on it asks for a pairing, and `POST` on `<it>/<id>/claim` claims one with the
 * secret it was answered, each with no token. Every other route on it or under it, the person's list and approval among them, needs one.
 */
export const PAIRINGS_PATH = '/api/pairings';

/** The last segment of a pairing's claim, `POST /api/pairings/:id/claim`. */
export const CLAIM_SEGMENT = '/claim';

/** Where the browser that opens a first-visit link claims it, `POST`, with no token (`src/pairing/pairing.ts`). */
export const LINK_CLAIM_PATH = '/api/links/claim';

/** The one method the routes that need no token are reached by: each is a write that judges the secret its body sends. */
export const OPEN_METHOD = 'POST';
