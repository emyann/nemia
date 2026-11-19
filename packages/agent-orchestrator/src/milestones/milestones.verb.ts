/**
 * Where the store stands on the way to its first landed change, read now (`milestonesNow`): the four facts `milestonesOf` judges, each
 * read from the store on every read and never from a flag — a harness whose install and sign-in are both met (this process's needs'
 * readings, `NeedsMemory`, or read now where it keeps none), a factory filed, a volume of a factory that is there and that no mount would
 * refuse (`volumeRefusal`), and a run with a step whose landing made a commit. A controller: it reads the store.
 */
import { Effect } from 'effect';
import { HARNESS_DECLARATIONS } from 'agent-runtime/vocabulary';
import { MILESTONES, type Milestones } from 'objects';
import { StoreRoot } from '../config/root.store.ts';
import { listedAtOnce } from '../factory/door/factories.store.ts';
import { factoryVolumesNamed, volumeRefusal } from '../factory/volume/volume.ts';
import { isDirectory } from '../record/record.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { tried } from '../runtime-client.ts';
import { harnessOfNeed, signInNeedOf } from '../needs/index.ts';
import { checkKey, harnessCheckOf, needsMemo, NeedsMemory, needsOnce } from '../needs/needs.verb.ts';
import { MILESTONE_WORDS, milestonesOf } from './milestones.ts';

/** Whether some harness the runtime declares is installed and signed in, as this process's memory of its needs reads them. */
const harnessReady = Effect.fnUntraced(function* (home: string) {
  const kept = yield* NeedsMemory;
  const memo = kept ?? needsMemo(home);
  if (kept === undefined || (memo.version === 0 && memo.readings.size === 0)) yield* needsOnce(memo);
  const met = (name: string): boolean => {
    const need = memo.harnessNeeds.find((n) => n.name === name);
    return need !== undefined && memo.readings.get(checkKey(harnessCheckOf(need))) === 'met';
  };
  return memo.harnessNeeds.some((need) => {
    const of = harnessOfNeed(need.name, HARNESS_DECLARATIONS);
    return of?.part === 'install' && met(need.name) && met(signInNeedOf(of.name));
  });
});

/**
 * The store's four milestones now, in `MILESTONES`' order, each with its state (`milestonesOf`) and what it says (`MILESTONE_WORDS`).
 */
export const milestonesNow = Effect.fn('milestonesNow')(function* () {
  const home = yield* StoreRoot;
  const factories = yield* tried(() => listedAtOnce(home));
  const filed = factories.flatMap((f) => ('error' in f ? [] : [f]));
  const volume = filed.some((f) => factoryVolumesNamed(f).some((v) => volumeRefusal(f, v, home, isDirectory) === undefined));
  const runs = yield* (yield* RunDoor).runs.list();
  const landed = runs.some((run) => Object.values(run.steps).some((s) => s.landed !== undefined && 'commit' in s.landed));
  const states = milestonesOf({ harness: yield* harnessReady(home), factory: factories.length > 0, volume, landed });
  return {
    milestones: MILESTONES.map((name) => ({ name, state: states[name], message: MILESTONE_WORDS[name][states[name]] })),
  } satisfies Milestones;
});
