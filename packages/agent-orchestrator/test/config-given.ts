/**
 * How a test gives its programs the store's root and settings, the two services a program reads the store by (`StoreRoot`,
 * `StoreConfig`), which have no default: `configGiven(root, env)` is their layer over a record the test means — never the process's own
 * environment unless it says so — and `storeGiven(root, env)` a program given them, still to be run.
 */
import { Effect, type Layer } from 'effect';
import type { Env } from '../src/config/config.store.ts';
import { storeConfigLayer, type StoreRoot } from '../src/config/root.store.ts';
import type { StoreConfig } from '../src/config/config.store.ts';

/** `StoreRoot` at `root`, and `StoreConfig` read from `env` alone: a setting the test does not name is its default. */
export const configGiven = (root: string, env: Env = {}): Layer.Layer<StoreRoot | StoreConfig> =>
  storeConfigLayer({ ...env, WF_ROOT: root });

/** `program` given the store at `root` and the settings `env` names (`configGiven`), still to be run. */
export const storeGiven =
  (root: string, env: Env = {}) =>
  <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, StoreRoot | StoreConfig>> =>
    Effect.provide(program, configGiven(root, env));
