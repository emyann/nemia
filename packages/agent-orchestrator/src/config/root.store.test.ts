/**
 * The store's root as a service (`StoreRoot`, `storeRootLayer`): a program that asks the root and is given none does not compile, and
 * dies naming the service when it is run all the same; the layer answers what `WF_ROOT` names in the environment it is handed; and a
 * relative `WF_ROOT` is refused where the layer is built, in `wfRoot`'s own words, rather than read as the default.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { Cause, Effect } from 'effect';
import { StoreRoot, storeRootLayer } from './root.store.ts';
import { Invalid } from '../refusal/refusal.ts';

/** A program that reads the root it is given. */
const asks = Effect.gen(function* () {
  return yield* StoreRoot;
});

test('REFUSED: a program that asks the store root and is given none does not compile, and one run all the same dies naming the service', () => {
  // @ts-expect-error -- a program that asks the root is given none, and runSync takes no requirement
  const exit = Effect.runSyncExit(asks);
  assert.ok(exit._tag === 'Failure', 'it has no root to ask');
  assert.match(String(Cause.squash(exit.cause)), /orchestrator\/StoreRoot/);
});

test('the layer answers the root WF_ROOT names in the environment it is handed, never the one this process has', () => {
  assert.equal(Effect.runSync(asks.pipe(Effect.provide(storeRootLayer({ WF_ROOT: '/srv/wf' })))), '/srv/wf');
  assert.equal(Effect.runSync(asks.pipe(Effect.provide(StoreRoot.layer('/elsewhere')))), '/elsewhere');
  assert.equal(
    Effect.runSync(asks.pipe(Effect.provide(storeRootLayer({})))),
    path.join(os.homedir(), '.agent-workflows'),
    "an entry handed an environment naming no root gets WF_ROOT's default, which is the variable's default and not the service's",
  );
});

test('REFUSED: a relative WF_ROOT is refused where the layer is built, in wfRoot own words naming what to set', () => {
  assert.throws(
    () => storeRootLayer({ WF_ROOT: 'rel' }),
    (error: unknown) =>
      error instanceof Invalid &&
      error.exitCode === 2 &&
      error.message ===
        "WF_ROOT=rel is not an absolute path. It is the directory where runs and the engine's board live, the same for every process that reads them: WF_ROOT=/srv/wf — or unset, for ~/.agent-workflows.",
  );
});
