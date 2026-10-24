/**
 * The trust of a factory's places, asked from one place: `trustPlaces` gives each place its trust for every harness that keeps one,
 * at a person's verb — `nemia factory add`, `apply` and `trust` — and never on a pass, which would overrule a person who took a trust
 * back; `untrustedPlaces` reads which places are not trusted now, for a listing; and `nemia factory trust <name>`, the verb that asks
 * again (`FACTORY_TRUST`). The repository a folder is in is the place's answer (`root`), and the trust is the runtime's.
 */
import { Effect } from 'effect';
import { folderTrust, tried, trustFolder } from '../runtime-client.ts';
import type { Args, Flag } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { noFactoryLine, type FactoryListing } from '../factory/factory.ts';
import { readFactories } from '../factory/factory.store.ts';
import { HARNESSES } from '../harness/harness.ts';
import { PlaceService, type Place } from '../place/place.store.ts';
import { unansweredWords } from '../place/place.ts';
import { Missing } from '../refusal/refusal.ts';
import { trustedLines, type PlaceTrust, type Untrusted } from './trust.ts';

/** How many places are asked of at once. */
const AT_ONCE = 4;

/** The repository `dir` is in as `place` answers it, undefined for a folder in none; or why it was not answered. */
const rootOf = (place: Place, dir: string): Effect.Effect<{ readonly root: string | undefined } | { readonly unasked: string }> =>
  Effect.map(place.ask('root', { dir }), (outcome) =>
    'answer' in outcome ? { root: outcome.answer.root ?? undefined } : { unasked: unansweredWords(outcome) },
  );

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

/** `--no-trust`, on `nemia factory add` and `apply`: the factory filed, and no place of it trusted. */
export const NO_TRUST: Flag = { flag: '--no-trust', kind: 'switch', key: 'noTrust' };

/** The name `nemia factory trust` was given. */
const nameOf = (args: Args): string => (typeof args.factory === 'string' ? args.factory : '');

/** The places of the factory `name`; refuses, as `Missing`, a name the store has no factory under, and one whose file does not read. */
function placesOf(name: string): readonly string[] {
  const all = readFactories();
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

/** `nemia factory trust`: the trust of one factory's places asked again, and what was done. */
export const FACTORY_TRUST: Command<{ name: string; trusts: readonly PlaceTrust[] }> = {
  name: 'factory trust',
  usage: '<name>',
  help: ["trust a factory's places for the harnesses its steps run on, so each", "place's own settings apply to them"],
  spec: {
    positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) =>
      `nemia factory trust trusts one factory's places, and ${arg} is a second: nemia factory trust <name>, once per factory.`,
    missing: 'nemia factory trust takes the name of the factory, as nemia factory ls lists it: nemia factory trust <name>.',
  },
  writes: true,
  class: 'ask',
  only: { side: 'cli', why: 'the board trusts no place: it shows the line to type, and nemia factory trust does it' },
  handler: (args) =>
    Effect.gen(function* () {
      const name = nameOf(args);
      const repos = yield* tried(() => placesOf(name));
      return { name, trusts: yield* trustPlaces(repos) };
    }),
  print: ({ name, trusts }) => {
    const lines = trustedLines(name, trusts);
    return lines.length ? lines : [`${name}  every place is trusted already: nothing was written`];
  },
};
