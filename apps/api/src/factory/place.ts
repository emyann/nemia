/**
 * Where a request is answered: the factory it names (`?factory=`) and the repository it names (`?repo=`), resolved once for every route by
 * `served` (layer.ts), so no handler reads either off the request itself, and the api reads no path a request invents.
 *
 * A request is placed by its factory alone. One that names none, or names `default`, is answered in the default factory, which reads no
 * repository — yours and the builtins alone — unless its `?repo=` is one a filed factory works on. The api's own repository is never a
 * request's: it is the folder the daemon's pass ticks in (`repoOf`, main.ts) and nothing else. A factory is read from the store's root
 * (`filedAtOnce`), never written: `nemia factory` is the one writer of its file.
 */
import { DEFAULT_NAMESPACE } from 'objects';
import path from 'node:path';
import { filedAtOnce, Invalid, listedAtOnce, outsideRefusal, type Factory } from 'agent-orchestrator';

/**
 * What a request is answered in: its repository, none where it has none; its factory, none for the default factory; and whether the
 * request named either (`?factory=`, `?repo=`), which a page read per factory tells from a request that leaves both to the api.
 */
export type Place = {
  repo: string | undefined;
  factory: Factory | undefined;
  named: boolean;
  /** Whether the request named `?repo=`: a card's start refuses one, its factory placing the run (`cardStart`). */
  repoNamed: boolean;
};

/** What of the request `placeFor` reads: its query's `factory` and `repo`, each undefined where it is not given. */
export type PlaceQuery = { factory: string | undefined; repo: string | undefined };

/**
 * Every repository a request in the default factory may name, each as `path.resolve` spells it, named once: those of each factory in the
 * store at `home` whose file reads, in the order the Factory door lists them (`listedAtOnce`).
 */
function knownRepos(home: string): string[] {
  return [...new Set(listedAtOnce(home).flatMap((listing) => ('error' in listing ? [] : listing.repos.map((repo) => path.resolve(repo)))))];
}

/** Why the default factory does not serve `repo`, which none of `known` is: an `Invalid`, naming them and the file that adds one. */
const unknownRepo = (repo: string, known: readonly string[]): Invalid =>
  new Invalid({
    message: `${repo}: the default factory reads only a repository a factory in the store works on — ${known.length ? known.join(', ') : 'there is none'} — and this is none of them. Name one of them with ?repo=, or file a factory for it: nemia factory add <name> --repo ${repo}.`,
  });

/**
 * Why the factory `factory` does not serve `repo`, not one of its repositories: an `Invalid`, naming them, the `?repo=` that asks for
 * one, and the `nemia factory add` that files a factory on `repo`.
 */
const outsideRepo = (factory: Factory, repo: string): Invalid => {
  const repos = factory.repos.map((r) => path.resolve(r)).sort();
  return new Invalid({
    message: `${repo}: the factory ${factory.name} works on ${repos.join(', ')}, and this repository is not one of them. Name one of them — ?factory=${factory.name}&repo=${repos[0]} — or file a factory on this one: nemia factory add <name> --repo ${repo}.`,
  });
};

/**
 * The factory and the repository a request is answered in, read off its query, the store's factories read at `home`.
 *
 * - No factory, or `default`: the default factory, on `?repo=` resolved from where the api runs, else none. A `?repo=` that no factory in
 *   the store works on (`knownRepos`) is refused, `Invalid`.
 * - A factory named: read from the store at `home`, as a start reads it (`filedAtOnce`: `Invalid` for a name that is no slug or a file that
 *   does not read, `Missing` for none of that name). Its repository is `?repo=`, else its only one, else none; a `?repo=` that is not among
 *   its repositories (`outsideRefusal`) is refused, `Invalid`.
 *
 * A place with no repository is not refused here: a handler that needs one asks for it (`repoNeeded`), and the Capabilities page says why
 * there is none. Throws each refusal as the package's kind, so `app.onError` answers it by that kind.
 */
export function placeFor(query: PlaceQuery, home: string): Place {
  return { ...placeOf(query, home), repoNamed: query.repo !== undefined };
}

/** `placeFor`'s place, but whether it named `?repo=`. */
function placeOf(query: PlaceQuery, home: string): Omit<Place, 'repoNamed'> {
  const named = query.repo === undefined ? undefined : path.resolve(query.repo);
  const factory = query.factory === undefined || query.factory === DEFAULT_NAMESPACE ? undefined : filedAtOnce(home, query.factory);
  if (factory === undefined) {
    if (named === undefined) return { repo: undefined, factory: undefined, named: query.factory !== undefined };
    const known = knownRepos(home);
    if (!known.includes(named)) throw unknownRepo(named, known);
    return { repo: named, factory: undefined, named: true };
  }
  if (named !== undefined) {
    if (outsideRefusal(factory, named) !== undefined) throw outsideRepo(factory, named);
    return { repo: named, factory, named: true };
  }
  const [only, ...more] = factory.repos;
  return { repo: only !== undefined && !more.length ? path.resolve(only) : undefined, factory, named: true };
}

/**
 * The repository `place` is answered on, for a handler that reads or writes one: refused, `Invalid`, where it has none — a factory of
 * several repositories that the request names none of, naming them and the `?repo=` that picks one; or the default factory, which reads
 * no repository, naming the `?factory=` that picks a factory and the `nemia factory add` that files one.
 */
export function repoNeeded(place: Pick<Place, 'repo' | 'factory'>): string {
  if (place.repo !== undefined) return place.repo;
  if (place.factory !== undefined) {
    const repos = place.factory.repos.map((r) => path.resolve(r)).sort();
    throw new Invalid({
      message: `the factory ${place.factory.name} works on ${repos.join(', ')}: name the one to read, ?factory=${place.factory.name}&repo=${repos[0] ?? '<path>'}.`,
    });
  }
  throw new Invalid({
    message:
      'the default factory reads no repository: name a factory to read in, ?factory=<name>, or file one on this repository: nemia factory add <name> --repo <path>.',
  });
}

/**
 * The repository whose layer a read or a write of definitions takes beside yours: the place's own; none in the default factory with no
 * `?repo=`, nor in a factory of no repository (a template's render), each of which reads yours and the builtins alone; and, for a factory
 * named whose repository the request leaves open among several, refused as `repoNeeded` refuses it, naming the `?repo=` that picks one,
 * rather than read without a word.
 */
export function repoLayer(place: Pick<Place, 'repo' | 'factory'>): string | undefined {
  if (place.repo !== undefined || place.factory === undefined || !place.factory.repos.length) return place.repo;
  return repoNeeded(place);
}
