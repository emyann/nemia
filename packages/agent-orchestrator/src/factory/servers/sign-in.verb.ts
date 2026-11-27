/**
 * A factory's server signed in to and out of, from the board: the server read off the factory's record, and the engine asked to hold
 * the sign-in (`mcpSignIn`), read it (`mcpSignInState`), complete a browser one with the address a person's browser was sent to
 * (`mcpSignInCallback`) or end it (`mcpSignOut`). The road is the engine's to choose, from what the server's provider advertises: a code
 * the person types at the provider, or the browser. The engine holds the token and hands it to each session; no answer here carries
 * it, the device code, or the pasted address, and no refusal does either.
 *
 * Not a command of the table, so no CLI verb: a sign-in waits on a person, and a CLI one would have to hold its own process open for
 * it (`docs/features.md`).
 */
import { Effect } from 'effect';
import { EngineService, mcpServerOf, tried } from '../../runtime-client.ts';
import { Conflict, Invalid, Missing } from '../../refusal/refusal.ts';
import { factoryThere } from './servers.verb.ts';
import { doorAt } from '../door/factories.store.ts';
import { FactoryName } from '../factory.model.ts';
import { addedServers } from '../../library/library.verb.ts';
import type { FactoryServers } from './servers.ts';

/**
 * The server `server` of `factory`'s record, read through the Factory door at the store `home`, else the server of that name the factory
 * has added from the library (`addedServers`), as its sign-in is handed it; refused (`Missing`) for a factory or a server neither holds,
 * and (`Invalid`, naming the file and its fix) where the factory's `library.json` does not read. The engine holds a sign-in by the server's
 * name, so one sign-in to a library server serves every factory that adds it.
 */
const recorded = (factory: string, server: string, home: string, verb: string) =>
  doorAt(home, (door) =>
    Effect.gen(function* () {
      yield* factoryThere(factory, verb);
      const record = yield* door.servers.read(FactoryName.read(factory));
      const own = Object.hasOwn(record, server) ? record[server] : undefined;
      const added: FactoryServers = own === undefined ? yield* tried(() => addedServers(home, factory)) : {};
      const found = own ?? (Object.hasOwn(added, server) ? added[server] : undefined);
      if (found === undefined)
        return yield* Effect.fail(
          new Missing({
            message: `${factory} records no server \`${server}\`, so none was ${verb}. Add it first: nemia factory server add ${factory} ${server} --url <address>, or add the library's: nemia library add McpServer ${server} --factory ${factory}.`,
          }),
        );
      return mcpServerOf(found);
    }),
  );

/**
 * A refusal of the engine's, in a refusal's kind: a port another sign-in waits on, or a callback pasted where no sign-in waits, is a
 * `Conflict`, anything else `Invalid`.
 */
const kindOf = (e: { readonly message: string; readonly held: boolean; readonly callback?: string }) =>
  e.held || e.callback === 'none-waiting' ? new Conflict({ message: e.message }) : new Invalid({ message: e.message });

/** A sign-in to `server` of `factory` started: the code to type or the address to open, and when it stops waiting. */
export const serverSignIn = Effect.fn('serverSignIn')(function* (factory: string, server: string, home: string) {
  const found = yield* recorded(factory, server, home, 'signed in to');
  const e = yield* EngineService;
  return yield* e.mcpSignIn(server, found).pipe(Effect.mapError(kindOf));
});

/** The state of `server`'s last sign-in on this engine, from memory: `none`, `waiting`, `connected`, `expired` or `failed`. */
export const serverSignInState = Effect.fn('serverSignInState')(function* (factory: string, server: string, home: string) {
  yield* recorded(factory, server, home, 'read');
  const e = yield* EngineService;
  return yield* e.mcpSignInState(server);
});

/**
 * `server`'s waiting sign-in handed `url`, the address the person's browser was sent to once they approved, where that browser runs on
 * another machine than the engine: answers the sign-in's state, which reads `connected` once the harness took it. Refused as the server
 * is read (`Missing`), where no sign-in to it waits (`Conflict`), and where the address is not its redirect with a code and a state
 * (`Invalid`).
 */
export const serverSignInCallback = Effect.fn('serverSignInCallback')(function* (
  factory: string,
  server: string,
  url: string,
  home: string,
) {
  yield* recorded(factory, server, home, 'signed in to');
  const e = yield* EngineService;
  return yield* e.mcpSignInCallback(server, url).pipe(Effect.mapError(kindOf));
});

/** `server`'s waiting sign-in cancelled, or its sign-in removed: a session handed it then reads `needs-auth` until a person signs in. */
export const serverSignOut = Effect.fn('serverSignOut')(function* (factory: string, server: string, home: string) {
  const found = yield* recorded(factory, server, home, 'signed out of');
  const e = yield* EngineService;
  return yield* e.mcpSignOut(server, found).pipe(Effect.mapError(kindOf));
});
