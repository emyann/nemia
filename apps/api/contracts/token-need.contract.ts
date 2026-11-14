/**
 * What a request needs of a token, by its path (apps/api, src/caller/caller.ts, `needOf`): the MCP port always a standing token, one
 * the person minted, held by the person or an agent, never a session's; a route the api serves its answers on (`/api`, `/openapi`), a
 * token of any live kind, on every store, loopback included — no request to them is the person for presenting none; and the board's own
 * pages — every other path, which the daemon serves from the board's built files and which carry no data of the store — none, so that a
 * browser with no token loads the page that asks for one. Whether the store is marked exposed no longer changes what a route needs.
 *
 * A request that presents a token is judged whatever its route needs (`callerBy`): this function says only what a route needs when none
 * is presented.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { TokenNeed } from 'agent-orchestrator';
import { MCP_PATH, PAIR_PATH } from '../src/caller/paths.ts';

/** Whether `path` is `root` or a path under it. */
const under = (path: string, root: string): boolean => path === root || path.startsWith(root + '/');

/** Whether `path` is the MCP port's. */
const onPort = (path: string): boolean => under(path, MCP_PATH);

/**
 * Whether `path` is a pairing route's (`PAIR_PATH`, src/caller/caller.ts): asking for a pairing, claiming it with the secret it was
 * answered, and opening a first-visit link. Each judges its own secret, and none answers with the store's data.
 */
const pairing = (path: string): boolean => under(path, PAIR_PATH);

/** Whether `path` is one the api answers on with the store's data or its route table. */
const answered = (path: string): boolean => !pairing(path) && (under(path, '/api') || under(path, '/openapi'));

const needOfSpec = spec<(path: string) => TokenNeed>({
  ensures: {
    thePortNeedsAStandingToken: {
      description: 'The MCP port needs a token the person minted, never a session’s',
      condition: ({ input: [path], output }) => !onPort(path) || output === 'standing',
    },
    everyStoreNeedsATokenForItsData: {
      description: 'A route the api answers with the store’s data or its route table needs a token, on loopback as when exposed',
      condition: ({ input: [path], output }) => !answered(path) || output === 'token',
    },
    aPairingRouteNeedsNone: {
      description: 'A pairing route — asking, claiming, a first-visit link — needs no token: it judges its own secret',
      condition: ({ input: [path], output }) => !pairing(path) || output === 'none',
    },
    aBoardPageNeedsNone: {
      description: 'A page of the board, any path neither the port nor the api’s, needs no token',
      condition: ({ input: [path], output }) => onPort(path) || answered(path) || output === 'none',
    },
  },
});

/** `needOf`'s type, which `src/caller/caller.ts` takes: it then imports nothing of tsverify. */
export type NeedOf = Implementation<typeof needOfSpec>;
