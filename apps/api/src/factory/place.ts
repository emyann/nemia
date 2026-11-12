/**
 * Where a request is answered: the factory it names (`?factory=`) and the repository it names (`?repo=`), resolved once for every route by
 * `served` (layer.ts), so no handler reads either off the request itself, and the api reads no path a request invents.
 *
 * A request that names neither is answered in the default factory, on the api's own repository (`repoOf`), as it was before a factory was
 * one to name. A factory is read from the store's root (`filedAtOnce`), never written: `nemia factory` is the one writer of its file.
 */
import { DEFAULT_NAMESPACE } from 'objects';
import path from 'node:path';
import { filedAtOnce, Invalid, listedAtOnce, outsideRefusal, type Factory, type Running } from 'agent-orchestrator';
import { repoOf } from '../capabilities/capabilities.ts';

/**
 * What a request is answered in: its repository, none where it has none; its factory, none for the default factory; and whether the
 * request named either (`?factory=`, `?repo=`), which a page read per factory tells from a request that leaves both to the api.
 */
export type Place = { repo: string | undefined; factory: Factory | undefined; named: boolean };

/** What of the request `placeFor` reads: its query's `factory` and `repo`, each undefined where it is not given. */
export type PlaceQuery = { factory: string | undefined; repo: string | undefined };

/**
 * Every repository a request in the default factory may name, each as `path.resolve` spells it, named once: the api's own (`repoOf`),
 * where it has one, then those of each factory in the store whose file reads, in the order the Factory door lists them (`listedAtOnce`).
 */
export function knownRepos(env: NodeJS.ProcessEnv, home: string, running?: Running): string[] {
  const named = listedAtOnce(home).flatMap((listing) => ('error' in listing ? [] : listing.repos.map((repo) => path.resolve(repo))));
  const own = repoOf(env, running);
  return [...new Set([...(own === undefined ? [] : [own]), ...named])];
}

/** Why the default factory does not serve `repo`, which none of `known` is: an `Invalid`, naming them and the file that adds one. */
const unknownRepo = (repo: string, known: readonly string[]): Invalid =>
  new Invalid({
    message: `${repo}: the api serves its own repository and those of the factories in the store — ${known.join(', ')} — and this is none of them. Name one of them with ?repo=, or file a factory for it: nemia factory add <name> --repo ${repo}.`,
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
 * The factory and the repository a request is answered in, read off its query.
 *
 * - No factory, or `default`: the default factory, on `?repo=` resolved from where the api runs, else the api's own repository, none where
 *   the api has none (`repoOf`). A `?repo=` that is not the api's own nor any factory's (`knownRepos`) is refused, `Invalid`.
 * - A factory named: read from the store at `home`, as a start reads it (`filedAtOnce`: `Invalid` for a name that is no slug or a file that
 *   does not read, `Missing` for none of that name). Its repository is `?repo=`, else its only one, else the api's own where that is one
 *   of its repositories, else none; a `?repo=` that is not among its repositories (`outsideRefusal`) is refused, `Invalid`.
 *
 * A place with no repository is not refused here: a handler that needs one asks for it (`repoNeeded`), and the Capabilities page says why
 * there is none. Throws each refusal as the package's kind, so `app.onError` answers it by that kind.
 */
export function placeFor(query: PlaceQuery, env: NodeJS.ProcessEnv, home: string, running?: Running): Place {
  const named = query.repo === undefined ? undefined : path.resolve(query.repo);
  if (query.factory === undefined || query.factory === DEFAULT_NAMESPACE) {
    if (named === undefined) return { repo: repoOf(env, running), factory: undefined, named: query.factory !== undefined };
    const known = knownRepos(env, home, running);
    if (!known.includes(named)) throw unknownRepo(named, known);
    return { repo: named, factory: undefined, named: true };
  }
  const factory = filedAtOnce(home, query.factory);
  if (factory === undefined) return { repo: named ?? repoOf(env, running), factory: undefined, named: true };
  if (named !== undefined) {
    if (outsideRefusal(factory, named) !== undefined) throw outsideRepo(factory, named);
    return { repo: named, factory, named: true };
  }
  const [only, ...more] = factory.repos;
  if (only !== undefined && !more.length) return { repo: path.resolve(only), factory, named: true };
  const own = repoOf(env, running);
  return { repo: own !== undefined && outsideRefusal(factory, own) === undefined ? own : undefined, factory, named: true };
}

/**
 * The repository `place` is answered on, for a handler that reads or writes one: refused, `Invalid`, where it has none — a factory of
 * several repositories that the request names none of, naming them and the `?repo=` that picks one; or the default factory of an api that
 * has no repository of its own, naming the `?factory=` that picks a factory and the `nemia factory add` that files one.
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
      'this api has no repository of its own: it runs a release whose source is no folder. Name a factory to read in, ?factory=<name>, or file one: nemia factory add <name> --repo <path>.',
  });
}
