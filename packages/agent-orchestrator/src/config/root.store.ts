/**
 * The store's root as a program is given it: `StoreRoot`, the service a caller asks for where the store lives, which `storeConfigLayer`
 * and `storeRootLayer` read off an environment (`wfRoot`, `WF_ROOT`), with the settings `config.store.ts` reads (`StoreConfig`).
 *
 * It has no default: a program that asks the root and is given none does not compile, as `PlaceService` has none. The root is read from
 * the environment where a program is composed — `src/cli/main.ts` for the daemon and every command, `apps/api/src/app.ts` for the api,
 * and each test from its own scratch folder — and nowhere else, so no module pins a root as it loads (`test/root-given.test.ts`).
 */
import path from 'node:path';
import { Context, Layer } from 'effect';
import { type Env, settingsOf, StoreConfig, wfRoot } from './config.store.ts';

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

/** Both services a program reads the store by, from `env`: its root (`StoreRoot`, `WF_ROOT`) and its settings (`StoreConfig`). */
export const storeConfigLayer = (env: Env): Layer.Layer<StoreRoot | StoreConfig> =>
  Layer.merge(storeRootLayer(env), StoreConfig.layer(settingsOf(env)));

/**
 * The tools folder of the store at `home`, `<home>/tools`: where a fix installs a tool with no root, given to it as `NEMIA_TOOLS`, its
 * `bin/` first on the daemon's PATH (`toolsBinDir`), so every session, check and fix the daemon starts finds what was installed there.
 */
export const toolsDir = (home: string): string => path.join(home, 'tools');

/** The folder of the tools folder whose programs the daemon finds first on its PATH: `<home>/tools/bin`. */
export const toolsBinDir = (home: string): string => path.join(toolsDir(home), 'bin');

/** `pathValue` (a PATH) led by the tools folder's `bin/` of the store at `home`, once: an entry already first is not put again. */
export const pathLedByTools = (home: string, pathValue: string | undefined): string => {
  const bin = toolsBinDir(home);
  const rest = (pathValue ?? '').split(path.delimiter).filter((entry) => entry !== '' && entry !== bin);
  return [bin, ...rest].join(path.delimiter);
};
