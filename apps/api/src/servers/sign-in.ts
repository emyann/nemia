/**
 * A factory's server signed in to and out of from the board, through the package's programs (`serverSignIn`, `serverSignInState`,
 * `serverSignOut`): the engine holds the sign-in and Claude Code stores what it yields, so the api carries the address to open and a
 * state word, and never a secret or a token.
 *
 * - `POST /api/factories/:factory/servers/:server/sign-in` — a sign-in started: `{ authUrl, until }`, the address the person opens in
 *   their browser and when the sign-in stops waiting. Guarded as every write of the board's is (guard.ts): it writes Claude Code's own
 *   store. 404 for a factory or a server not recorded, 409 while another sign-in waits on the server's callback port, 422 for a server
 *   with no OAuth client.
 * - `GET /api/factories/:factory/servers/:server/sign-in` — the state of its last sign-in, `{ state, until?, why? }`, from the engine's
 *   memory, spawning nothing: what the board polls while the person is in GitHub's tab.
 * - `DELETE /api/factories/:factory/servers/:server/sign-in` — signed out: `{ signedOut: true }`, the sign-in cleared from Claude Code's
 *   store, so the next read of the servers' states says `needs-auth`. Guarded; 409 while a sign-in to it waits.
 *
 * Not entries of the command table, so no CLI verb: a CLI sign-in would wait on a browser in its own process, and none is asked for.
 */
import { factoryNameRefusal, serverNameRefusal, serverSignIn, serverSignInState, serverSignOut } from 'agent-orchestrator';
import { Hono, type Context } from 'hono';
import { refusedBeforeReading, type Guarded } from '../guard.ts';
import { type ApiEnv, served } from '../layer.ts';
import { runPlaced } from '../store.ts';

const PATH = '/api/factories/:factory/servers/:server/sign-in';

/** The route `method` names for `factory`'s `server`, as a refusal says it. */
const routeOf = (method: string, factory: string, server: string) => `${method} /api/factories/${factory}/servers/${server}/sign-in`;

/** A name in the route that is no factory's or no server's, in the package's words, or null. */
const misnamed = (route: string, factory: string, server: string): string | null => {
  const wrong = factoryNameRefusal(factory) ?? serverNameRefusal(server);
  return wrong === undefined ? null : `${route}: ${wrong}`;
};

/** A sign-in's write, as the guard's refusals word it. */
const guardOf = (route: string, does: string, forAnother: string): Guarded => ({
  route,
  does,
  forAnother,
  why: "it writes Claude Code's own store, where a factory's sessions find what a server signs in with",
  reach: "sign in on the factory's settings page on the board",
  instead: "Sign in on the factory's settings page on the board",
  shape: '`{}`',
});

/** Why a write is refused before anything is read — its guard, then its names — as an answer, or null. */
const refusedWrite = (c: Context<ApiEnv>, guard: Guarded, factory: string, server: string) => {
  const refused = refusedBeforeReading(guard, c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
  if (refused) return c.json({ error: refused.error }, refused.status);
  const wrong = misnamed(guard.route, factory, server);
  return wrong === null ? null : c.json({ error: wrong }, 400);
};

export const serverSignIns = new Hono<ApiEnv>()
  .post(PATH, (c) =>
    served(c, async ({ e, placeService, home }) => {
      const { factory, server } = c.req.param();
      const refused = refusedWrite(
        c,
        guardOf(routeOf('POST', factory, server), 'signs a factory in to a server', 'sign one in'),
        factory,
        server,
      );
      if (refused) return refused;
      return c.json(await runPlaced(placeService, e, serverSignIn(factory, server, home)));
    }),
  )
  .get(PATH, (c) =>
    served(c, async ({ e, placeService, home }) => {
      const { factory, server } = c.req.param();
      const wrong = misnamed(routeOf('GET', factory, server), factory, server);
      if (wrong !== null) return c.json({ error: wrong }, 400);
      return c.json(await runPlaced(placeService, e, serverSignInState(factory, server, home)));
    }),
  )
  .delete(PATH, (c) =>
    served(c, async ({ e, placeService, home }) => {
      const { factory, server } = c.req.param();
      const refused = refusedWrite(
        c,
        guardOf(routeOf('DELETE', factory, server), 'signs a factory out of a server', 'sign one out'),
        factory,
        server,
      );
      if (refused) return refused;
      return c.json(await runPlaced(placeService, e, serverSignOut(factory, server, home)));
    }),
  );
