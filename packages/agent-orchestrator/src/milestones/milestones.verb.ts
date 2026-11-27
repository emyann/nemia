/**
 * Where the store stands on the way to its first run that succeeded, read now (`milestonesNow`): the four facts `milestonesOf` judges, each
 * read from the store on every read and never from a flag — a harness whose install and sign-in are both met (this process's needs'
 * readings, `NeedsMemory`, or read now where it keeps none), a factory filed, a writable volume of a factory that is there, that no mount
 * would refuse (`volumeRefusal`) and that every harness keeping a trust trusts now (`untrustedPlaces`, read off the place), and a run with
 * a run that succeeded, as `nemia ls` says it. A controller: it reads the store and asks the place.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { HARNESS_DECLARATIONS } from 'agent-runtime/vocabulary';
import { MILESTONES, type Milestones } from 'objects';
import { StoreRoot } from '../config/root.store.ts';
import { listedAt } from '../factory/door/factories.store.ts';
import { factoryVolumesNamed, volumeRefusal } from '../factory/volume/index.ts';
import { isDirectory } from '../record/record.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import type { Run } from '../record/record.ts';
import { EngineService, over } from '../runtime-client.ts';
import { keptParent, passParents } from '../views/views.verb.ts';
import { harnessOfNeed, signInNeedOf } from '../needs/index.ts';
import { checkKey, harnessCheckOf, needsMemo, NeedsMemory, needsOnce } from '../needs/needs.verb.ts';
import { untrustedPlaces } from '../trust/untrusted.verb.ts';
import { MILESTONE_WORDS, milestonesOf, volumeWaitsOnTrust } from './milestones.ts';

/** Whether some harness the runtime declares is installed and signed in, as this process's memory of its needs reads them. */
const harnessReady = Effect.fnUntraced(function* (home: string) {
  const kept = yield* NeedsMemory;
  const memo = kept ?? needsMemo(home);
  if (kept === undefined || (memo.version === 0 && memo.readings.size === 0)) yield* needsOnce(memo);
  const met = (name: string) => {
    const need = memo.harnessNeeds.find((n) => n.name === name);
    return need !== undefined && memo.readings.get(checkKey(harnessCheckOf(need))) === 'met';
  };
  return memo.harnessNeeds.some((need) => {
    const of = harnessOfNeed(need.name, HARNESS_DECLARATIONS);
    return of?.part === 'install' && met(need.name) && met(signInNeedOf(of.name));
  });
});

/**
 * Whether some run succeeded as `nemia ls` says it, read through the parents' reader (`keptParent`) one run at a time and stopping at the
 * first that did; a run whose read fails has not.
 * @param runs The runs the store holds.
 */
const someSucceeded = Effect.fnUntraced(function* (runs: readonly Run[]) {
  const e = yield* EngineService;
  const parents = passParents();
  for (const run of runs) {
    const standing = yield* keptParent(run.id, parents.read).pipe(
      over(e),
      Effect.orElseSucceed(() => undefined),
    );
    if (standing?.standing.kind === 'released' && standing.standing.by === 'succeeded') return true;
  }
  return false;
});

/**
 * The store's four milestones now, in `MILESTONES`' order, each with its state (`milestonesOf`) and what it says (`MILESTONE_WORDS`).
 */
export const milestonesNow = Effect.fn('milestonesNow')(function* () {
  const home = yield* StoreRoot;
  const factories = yield* listedAt(home);
  const filed = factories.flatMap((f) => ('error' in f ? [] : [f]));
  const writable = filed.flatMap((f) =>
    factoryVolumesNamed(f)
      .filter((v) => !v.readOnly && volumeRefusal(f, v, home, isDirectory) === undefined)
      .map((v) => ({ factory: f.name, at: path.resolve(v.path) })),
  );
  const untrusted = writable.length === 0 ? [] : yield* untrustedPlaces(filed);
  const trusted = (w: { factory: string; at: string }) => !untrusted.some((u) => u.factory === w.factory && path.resolve(u.place) === w.at);
  const volume = writable.some(trusted);
  const waiting = writable.find((w) => !trusted(w));
  const runs = yield* (yield* RunDoor).runs.list();
  const succeeded = yield* someSucceeded(runs);
  const states = milestonesOf({ harness: yield* harnessReady(home), factory: factories.length > 0, volume, succeeded });
  return {
    milestones: MILESTONES.map((name) => ({
      name,
      state: states[name],
      message:
        name === 'volume' && states.volume === 'next' && waiting !== undefined
          ? volumeWaitsOnTrust(waiting.factory)
          : MILESTONE_WORDS[name][states[name]],
    })),
  } satisfies Milestones;
});
