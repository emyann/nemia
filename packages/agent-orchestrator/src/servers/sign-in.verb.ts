/**
 * A factory's server signed in to and out of, from the board: the server read off the factory's record, the shipped secret picked for
 * its client (`shippedSecretOf`), and the engine asked to hold the sign-in (`mcpSignIn`), read it (`mcpSignInState`) or clear it
 * (`mcpSignOut`). The secret is handed to the engine and to nothing else: no answer here carries it.
 *
 * Not a command of the table, so no CLI verb: a sign-in waits on a browser, and a CLI one would have to hold its own process open for
 * it (`docs/features.md`).
 */
import { Effect } from 'effect';
import { EngineService, mcpServerOf, tried, type McpSignInStarted, type McpSignInState } from '../runtime-client.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { shippedSecretOf } from './clients.ts';
import { factoryServers } from './servers.store.ts';
import { factoryThere } from './servers.verb.ts';

/** The server `server` of `factory`'s record, as its sign-in is handed it; refused (`Missing`) for a factory or a server not there. */
const recorded = (factory: string, server: string, home: string, verb: string) =>
  tried(() => {
    factoryThere(factory, verb);
    const record = factoryServers(home, factory);
    const found = Object.hasOwn(record, server) ? record[server] : undefined;
    if (found === undefined) {
      throw new Missing({
        message: `${factory} records no server \`${server}\`, so none was ${verb}. Add it first: nemia factory server add ${factory} ${server} --url <address>, or on the factory's settings page.`,
      });
    }
    return mcpServerOf(found);
  });

/** A refusal of the engine's, in a refusal's kind: a port another sign-in waits on is a `Conflict`, anything else `Invalid`. */
const kindOf = (e: { readonly message: string; readonly held: boolean }) =>
  e.held ? new Conflict({ message: e.message }) : new Invalid({ message: e.message });

/**
 * A sign-in to `server` of `factory` started: the address the person opens, and when it stops waiting. A server of a client Nemia
 * ships is handed that client's secret, which the engine stores in Claude Code's own store first; any other is handed none.
 */
export const serverSignIn = Effect.fn('serverSignIn')(function* (factory: string, server: string, home: string) {
  const found = yield* recorded(factory, server, home, 'signed in to');
  const secret = shippedSecretOf(found.oauth?.clientId);
  const e = yield* EngineService;
  return yield* e.mcpSignIn(server, found, secret).pipe(Effect.mapError(kindOf));
});

/** The state of `server`'s last sign-in on this engine, from memory: `none`, `waiting`, `connected`, `expired` or `failed`. */
export const serverSignInState = Effect.fn('serverSignInState')(function* (factory: string, server: string, home: string) {
  yield* recorded(factory, server, home, 'read');
  const e = yield* EngineService;
  return yield* e.mcpSignInState(server);
});

/** `server`'s sign-in cleared, so a session handed it reads `needs-auth` until a person signs in again. */
export const serverSignOut = Effect.fn('serverSignOut')(function* (factory: string, server: string, home: string) {
  const found = yield* recorded(factory, server, home, 'signed out of');
  const e = yield* EngineService;
  return yield* e.mcpSignOut(server, found).pipe(Effect.mapError(kindOf));
});

export type { McpSignInStarted as ServerSignInStarted, McpSignInState as ServerSignInState };
