/**
 * What a request needs of a token, by its method and path (apps/api, src/caller/caller.ts, `needOf`): the MCP port always a standing
 * token, one the person minted, held by the person or an agent, never a session's; a route the api serves its answers on (`/api`,
 * `/openapi`), a token of any live kind, on every store, loopback included — no request to them is the person for presenting none — but
 * the three routes a client with no token yet reaches, each named by its method and path: `POST /api/pairings` (a pairing asked), `POST
 * /api/pairings/:id/claim` (a pairing claimed) and `POST /api/links/claim` (a first-visit link claimed), which need none, each judging the
 * secret it is sent; and the board's own pages — every other path, which the daemon serves from the board's built files and which carry
 * no data of the store — none, so that a browser with no token loads the page that asks for one. Whether the store is marked exposed no
 * longer changes what a route needs.
 *
 * A request that presents a token is judged whatever its route needs (`callerBy`): this function says only what a route needs when none
 * is presented.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { TokenNeed } from 'agent-orchestrator';
import { CLAIM_SEGMENT, LINK_CLAIM_PATH, MCP_PATH, OPEN_METHOD, PAIRINGS_PATH } from '../src/caller/paths.ts';

/** Whether `path` is `root` or a path under it. */
const under = (path: string, root: string) => path === root || path.startsWith(root + '/');

/** Whether `path` is the MCP port's. */
const onPort = (path: string) => under(path, MCP_PATH);

/** Whether `path` is a pairing's claim, `/api/pairings/<id>/claim`, its id one segment that is not empty. */
const pairingClaim = (path: string) => {
  const start = PAIRINGS_PATH.length + 1;
  const end = path.length - CLAIM_SEGMENT.length;
  return path.startsWith(PAIRINGS_PATH + '/') && path.endsWith(CLAIM_SEGMENT) && end > start && !path.slice(start, end).includes('/');
};

/**
 * Whether `method` on `path` is one of the three routes a client with no token yet reaches: a pairing asked, a pairing claimed, a
 * first-visit link claimed. Each judges its own secret, and none answers with the store's data.
 */
const open = (method: string, path: string) =>
  method === OPEN_METHOD && (path === PAIRINGS_PATH || path === LINK_CLAIM_PATH || pairingClaim(path));

/** Whether `method` on `path` is a route the api answers with the store's data or its route table. */
const answered = (method: string, path: string) => !open(method, path) && (under(path, '/api') || under(path, '/openapi'));

const needOfSpec = spec<(method: string, path: string) => TokenNeed>({
  ensures: {
    thePortNeedsAStandingToken: {
      description: 'The MCP port needs a token the person minted, never a session’s',
      condition: ({ input: [, path], output }) => !onPort(path) || output === 'standing',
    },
    everyStoreNeedsATokenForItsData: {
      description:
        'A route the api answers with the store’s data or its route table needs a token, on loopback as when exposed: the pairings listed and a pairing approved among them',
      condition: ({ input: [method, path], output }) => !answered(method, path) || output === 'token',
    },
    anOpenRouteNeedsNone: {
      description:
        'Each of the three routes a client with no token reaches — a pairing asked, a pairing claimed, a link claimed — needs none',
      condition: ({ input: [method, path], output }) => !open(method, path) || output === 'none',
    },
    aBoardPageNeedsNone: {
      description: 'A page of the board, any path neither the port nor the api’s, needs no token',
      condition: ({ input: [method, path], output }) => onPort(path) || answered(method, path) || output === 'none',
    },
  },
});

/** `needOf`'s type, which `src/caller/caller.ts` takes: it then imports nothing of tsverify. */
export type NeedOf = Implementation<typeof needOfSpec>;
