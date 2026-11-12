/**
 * The trust of a factory's places, asked from one place: `trustPlaces` gives each place its trust for every harness that keeps one,
 * at a person's verb — `nemia factory add`, `apply` and `trust` — and never on a pass, which would overrule a person who took a trust
 * back; `untrustedPlaces` reads which places are not trusted now, for a listing; and `nemia factory trust <name>`, the verb that asks
 * again (`FACTORY_TRUST`). The repository a folder is in is the place's answer (`root`), and the trust is the runtime's.
 */
import { StoreRoot } from '../config/root.store.ts';
import { listedAtOnce } from '../factory/door/factories.store.ts';
import { Effect, Schema } from 'effect';
import { tried, trustFolder } from '../runtime-client.ts';
import { FACTORY_TRUST_WORDS } from 'objects';
import type { Served } from '../command/entry.verb.ts';
import { noFactoryLine } from '../factory/factory.ts';
import { HARNESSES } from '../harness/harness.ts';
import { PlaceService } from '../place/place.store.ts';
import { Missing } from '../refusal/refusal.ts';
import type { PlaceTrust } from './trust.ts';
import { rootOf, untrustedPlaces } from './untrusted.verb.ts';

export { untrustedPlaces };

/** What a throw of the runtime's write says, as one sentence. */
const threwWords = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** The trust of `dir` asked of every harness that keeps one, each harness's folder asked once: what was written, and what was not. */
function given(dir: string, root: string | undefined): PlaceTrust[] {
  const seen = new Set<string>();
  return HARNESSES.flatMap((harness): PlaceTrust[] => {
    const trust = trustFolder(harness, dir, undefined, root);
    if (!trust || seen.has(`${trust.harness}\n${trust.folder}`)) return [];
    seen.add(`${trust.harness}\n${trust.folder}`);
    const { folder, grants, back, wrote, refused } = trust;
    return [{ place: dir, harness: trust.harness, folder, grants, back, wrote, refused }];
  });
}

/**
 * Gives each of `repos`, the places of a factory, its trust for every harness that keeps a trust of a folder, under the repository
 * the place answers for it. Answers what was asked of each, a place already trusted with `wrote` false and nothing refused. Never
 * fails: a place whose repository was not answered, and a write that threw, are each answered as not asked, with why.
 */
export const trustPlaces = Effect.fn('trustPlaces')(function* (repos: readonly string[]) {
  const place = yield* PlaceService;
  const asked = yield* Effect.forEach(
    repos,
    (dir) =>
      Effect.map(rootOf(place, dir), (rooted): PlaceTrust[] => {
        if ('unasked' in rooted) return [{ place: dir, unasked: rooted.unasked }];
        try {
          return given(dir, rooted.root);
        } catch (err) {
          return [{ place: dir, unasked: threwWords(err) }];
        }
      }),
    { concurrency: 1 },
  );
  return asked.flat();
});

/** What `nemia factory trust` takes: the factory whose places are trusted, by its name. */
export const TrustInput = Schema.Struct({ factory: Schema.String });
export type TrustInput = typeof TrustInput.Type;

/** The places of the factory `name`; refuses, as `Missing`, a name the store has no factory under, and one whose file does not read. */
function placesOf(home: string, name: string): readonly string[] {
  const all = listedAtOnce(home);
  const found = all.find((f) => f.name === name);
  if (!found)
    throw new Missing({
      message: `${noFactoryLine(
        name,
        all.map((f) => f.name),
      )} Nothing was trusted.`,
    });
  if ('error' in found)
    throw new Missing({
      message: `${found.file} ${found.error}, so the factory ${name} names no place to trust: fix or remove the file (nemia factory rm ${name}). Nothing was trusted.`,
    });
  return found.repos;
}

/**
 * `nemia factory trust`: the trust of one factory's places asked again, and what was done. Written where the store runs, in the trust
 * files of the harnesses of that machine: the api serves it as the Factory's `trust`, calling this handler.
 */
export const FACTORY_TRUST: Served<{ name: string; trusts: readonly PlaceTrust[] }, TrustInput> = {
  ...FACTORY_TRUST_WORDS,
  input: TrustInput,
  handler: ({ factory: name }) =>
    Effect.gen(function* () {
      const home = yield* StoreRoot;
      const repos = yield* tried(() => placesOf(home, name));
      return { name, trusts: yield* trustPlaces(repos) };
    }),
};
