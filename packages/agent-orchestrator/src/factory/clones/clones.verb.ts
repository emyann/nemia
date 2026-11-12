/**
 * A factory's repositories named by git URL, made and kept: `cloned` asks the place to clone each into its folder, at `nemia factory add`
 * and `apply` before anything is filed, and `clonesOnce`, the daemon's sweep (`clones`), makes again each one whose folder is gone. The
 * clone is the place's (`clone`), with the machine's own credentials; the folder is the factory's (`cloneTarget`).
 */
import fs from 'node:fs';
import { Effect, type Duration } from 'effect';
import { FactoryDoor } from '../door/factories.store.ts';
import { PlaceService } from '../../place/place.store.ts';
import { Invalid } from '../../refusal/refusal.ts';
import { sweepLoop } from '../../forget/prune/free.verb.ts';

/** Why the clone of `url` into `into` was not made, in the place's words, or none where it is there now. */
const cloneRefusal = Effect.fn('cloneRefusal')(function* (url: string, into: string) {
  const outcome = yield* (yield* PlaceService).ask('clone', { url, into });
  if ('answer' in outcome) return undefined;
  if ('refused' in outcome) return outcome.refused;
  return `the clone was not answered in time (${outcome.unread.said}): ask again once this machine reaches ${url}`;
});

/**
 * Each of `origins`, a folder to the URL it is cloned from, cloned there where it is not yet. Refused, `Invalid`, at the first the place
 * did not clone, in its words, nothing filed: a factory is filed on clones that are there.
 */
export const cloned = Effect.fn('cloned')(function* (origins: Readonly<Record<string, string>>) {
  for (const [into, url] of Object.entries(origins)) {
    const refused = yield* cloneRefusal(url, into);
    if (refused !== undefined) return yield* Effect.fail(new Invalid({ message: `${refused} Nothing was filed.` }));
  }
});

/** What the sweeps of one daemon remember, to say a refusal once while its words stand and never to decide: each folder's last words. */
export type CloneMemory = { said: Map<string, string> };

/** A daemon's memory before its first sweep. */
export const freshCloneMemory = (): CloneMemory => ({ said: new Map() });

/**
 * One sweep: each folder a factory names an origin of that is not there now cloned again, the folders it found there asked nothing.
 * A refusal is a warning, said once while its words stand. The folders cloned again.
 */
export const clonesOnce = Effect.fn('clonesOnce')(function* (memory: CloneMemory) {
  const made: string[] = [];
  const missing = new Set<string>();
  for (const factory of yield* (yield* FactoryDoor).factories.listed()) {
    if ('error' in factory) continue;
    for (const [into, url] of Object.entries(factory.origins ?? {})) {
      if (fs.existsSync(into) || missing.has(into)) continue;
      missing.add(into);
      const refused = yield* cloneRefusal(url, into);
      if (refused === undefined) {
        memory.said.delete(into);
        made.push(into);
      } else if (memory.said.get(into) !== refused) {
        memory.said.set(into, refused);
        yield* Effect.logWarning(`The repository ${into} of the factory ${factory.name} is gone, and was not cloned again: ${refused}`);
      }
    }
  }
  for (const into of memory.said.keys()) if (!missing.has(into)) memory.said.delete(into);
  return made;
});

/** The sweep's pace: a clone gone is made again within half a minute. */
export const CLONE_EVERY: Duration.Input = '30 seconds';

/** The clones' keeper, for as long as the daemon runs: a sweep (`clonesOnce`) each `CLONE_EVERY` (`sweepLoop`). */
export const clones = () => {
  const memory = freshCloneMemory();
  return sweepLoop(() => clonesOnce(memory), CLONE_EVERY, 'The clones of the factories could not be kept this sweep');
};
