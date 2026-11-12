/**
 * What a request needs of a token, by its path and whether the store is marked exposed (apps/api, src/caller/caller.ts, `needOf`): the
 * MCP port always one of the person's tokens; a route the api serves its answers on (`/api`, `/openapi`), a token of any live kind where
 * the store is exposed; and the board's own pages — every other path, which the daemon serves from the board's built files and which
 * carry no data of the store — none, so that a browser reaching an exposed store can load the page that asks for a token.
 *
 * A request that presents a token is judged whatever its route needs (`callerBy`): this function says only what a route needs when none
 * is presented.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { TokenNeed } from 'agent-orchestrator';
import { MCP_PATH, PAIR_PATH } from '../src/caller/caller.ts';

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

const needOfSpec = spec<(path: string, exposed: boolean) => TokenNeed>({
  ensures: {
    thePortNeedsThePerson: {
      description: 'The MCP port needs one of the person’s tokens, exposed or not',
      condition: ({ input: [path], output }) => !onPort(path) || output === 'person',
    },
    anExposedStoreNeedsATokenForItsData: {
      description: 'On a store marked exposed, a route the api answers with the store’s data or its route table needs a token',
      condition: ({ input: [path, exposed], output }) => !exposed || !answered(path) || output === 'token',
    },
    aPairingRouteNeedsNone: {
      description: 'A pairing route — asking, claiming, a first-visit link — needs no token, exposed or not: it judges its own secret',
      condition: ({ input: [path], output }) => !pairing(path) || output === 'none',
    },
    aBoardPageNeedsNone: {
      description: 'A page of the board, any path neither the port nor the api’s, needs no token, exposed or not',
      condition: ({ input: [path], output }) => onPort(path) || answered(path) || output === 'none',
    },
    anUnexposedStoreNeedsNoneButThePort: {
      description: 'On a store not marked exposed, nothing but the MCP port needs a token: a request with none is the person',
      condition: ({ input: [path, exposed], output }) => exposed || onPort(path) || output === 'none',
    },
  },
});

/** `needOf`'s type, which `src/caller/caller.ts` takes: it then imports nothing of tsverify. */
export type NeedOf = Implementation<typeof needOfSpec>;
