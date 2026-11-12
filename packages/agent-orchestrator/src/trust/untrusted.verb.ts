/**
 * Which places of a factory a harness does not trust now (`untrustedPlaces`), read fresh off the place and the harness's own file, apart
 * from the trust's verbs (`trust.verb.ts`) so a controller that only reads it — the needs' sweep, a fix — imports no command.
 */
import { Effect } from 'effect';
import { folderTrust } from '../runtime-client.ts';
import type { FactoryListing } from '../factory/factory.ts';
import { HARNESSES } from '../harness/harness.ts';
import { PlaceService, type Place } from '../place/place.store.ts';
import { unansweredWords } from '../place/place.ts';
import type { Untrusted } from './trust.ts';

/** How many places are asked of at once. */
const AT_ONCE = 4;

/** The repository `dir` is in as `place` answers it, undefined for a folder in none; or why it was not answered. */
export const rootOf = (place: Place, dir: string): Effect.Effect<{ readonly root: string | undefined } | { readonly unasked: string }> =>
  Effect.map(place.ask('root', { dir }), (outcome) =>
    'answer' in outcome ? { root: outcome.answer.root ?? undefined } : { unasked: unansweredWords(outcome) },
  );

/** The harnesses' trusts of `dir` that are not given now, one a harness's folder. */
function lacking(factory: string, dir: string, root: string | undefined): Untrusted[] {
  const seen = new Set<string>();
  return HARNESSES.flatMap((harness): Untrusted[] => {
    const trust = folderTrust(harness, dir, undefined, root);
    if (!trust || trust.trusted || seen.has(`${trust.harness}\n${trust.folder}`)) return [];
    seen.add(`${trust.harness}\n${trust.folder}`);
    return [{ factory, place: dir, harness: trust.harness, folder: trust.folder, withheld: trust.grants, never: trust.never }];
  });
}

/**
 * The places of `factories` that a harness does not trust now, read fresh off the place and the harness's own file: nothing is kept
 * of an earlier read. A factory that does not read has no place, and a place whose repository was not answered is left out — not
 * known is never said as not trusted.
 */
export const untrustedPlaces = Effect.fn('untrustedPlaces')(function* (factories: readonly FactoryListing[]) {
  const place = yield* PlaceService;
  const places = factories.flatMap((f) => ('error' in f ? [] : f.repos.map((dir) => ({ factory: f.name, dir }))));
  const read = yield* Effect.forEach(
    places,
    ({ factory, dir }) => Effect.map(rootOf(place, dir), (rooted) => ('unasked' in rooted ? [] : lacking(factory, dir, rooted.root))),
    { concurrency: AT_ONCE },
  );
  return read.flat();
});
