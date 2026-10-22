/**
 * The store's root as a program is given it: `StoreRoot`, the service a caller asks for where the store lives, and `storeRootLayer`,
 * which reads it off an environment (`wfRoot`, `WF_ROOT`) for the layer that gives it.
 *
 * It has no default: a program that asks the root and is given none does not compile, as `PlaceService` has none. The root is read from
 * the environment where a program is composed — `src/cli/main.ts` for the daemon and every command, `apps/api/src/app.ts` for the api,
 * and each test from its own scratch folder — and nowhere else, so no module pins a root as it loads. `storeRootLayer` takes its
 * environment required for that reason: a module cannot call it bare.
 *
 * What a store file still reads off a root of its own, as it loads, is named in `test/global-roots.baseline.ts` and refused anywhere
 * else by `test/root-given.test.ts`.
 */
import { Context, Layer } from 'effect';
import { Invalid } from '../refusal/refusal.ts';
import { type Env, wfRoot } from './config.store.ts';

/**
 * The store's directory a program asks for, given by whoever composes it — the daemon, a command, the api, a test — and by nothing
 * else. It has no default: a program that asks it and is given none does not compile.
 */
export class StoreRoot extends Context.Service<StoreRoot, string>()('orchestrator/StoreRoot') {
  /** `root`, an absolute directory, as the layer that gives it to a program. */
  static readonly layer = (root: string): Layer.Layer<StoreRoot> => Layer.succeed(StoreRoot)(StoreRoot.of(root));
}

/**
 * The root `env` names (`wfRoot`: `WF_ROOT`, or `~/.agent-workflows` when unset), as the layer that gives it. Refuses `env`'s relative
 * `WF_ROOT` in `wfRoot`'s own words. `env` is required: only a file that has an environment to hand — an entry, or a test — may call
 * this, and a module that loads cannot.
 */
export const storeRootLayer = (env: Env): Layer.Layer<StoreRoot> => StoreRoot.layer(wfRoot(env));

/**
 * The store root a command's handler was given, refused (`Invalid`) where it was given none. `Command.handler` takes its root as an
 * optional third argument, because most verbs still read a module's; a verb that takes it as a required `home` says so with this, and
 * names the road that forgot to pass one. Both roads pass one — the CLI from `wfRoot(process.env)` (`src/cli/main.ts`), the api from
 * `s.home` (`apps/api/src/commands/routes.ts`) — so this is what a new one is refused by, rather than silently reading the live store.
 */
export const rootGiven = (home: string | undefined, verb: string): string => {
  if (home !== undefined) return home;
  throw new Invalid({
    message: `nemia ${verb} was given no store root: pass it as the third argument of the command's handler, read from the environment where the program is composed (storeRootLayer, src/config/root.store.ts). Nothing was read or written.`,
  });
};
