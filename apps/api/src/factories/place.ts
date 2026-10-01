/**
 * Where a request is answered: the factory it names (`?factory=`) and the repository it names (`?repo=`), resolved once for every route by
 * `served` (layer.ts), so no handler reads either off the request itself, and the api reads no path a request invents.
 *
 * A request that names neither is answered in the default factory, on the api's own repository (`repoOf`), as it was before a factory was
 * one to name. A factory is read from the store (`readFactory`), never written: `wf factory` is the one writer of its file.
 */
import path from 'node:path';
import { DEFAULT_FACTORY, factoryRepo, Invalid, outsideRefusal, readFactories, readFactory, type Factory } from 'agent-orchestrator';
import { repoOf } from '../capabilities/capabilities.ts';

/** What a request is answered in: its repository, and its factory, none for the default factory. */
export type Place = { repo: string; factory: Factory | undefined };

/** What of the request `placeFor` reads: its query's `factory` and `repo`, each undefined where it is not given. */
export type PlaceQuery = { factory: string | undefined; repo: string | undefined };

/**
 * Every repository a request in the default factory may name, each as `path.resolve` spells it, named once: the api's own (`repoOf`),
 * then those of each factory in the store whose file reads, in the order `readFactories` lists them.
 */
export function knownRepos(env: NodeJS.ProcessEnv): string[] {
  const named = readFactories().flatMap((listing) => ('error' in listing ? [] : listing.repos.map((repo) => path.resolve(repo))));
  return [...new Set([repoOf(env), ...named])];
}

/** Why the default factory does not serve `repo`, which none of `known` is: an `Invalid`, naming them and the file that adds one. */
const unknownRepo = (repo: string, known: readonly string[]): Invalid =>
  new Invalid({
    message: `${repo}: the api serves its own repository and those of the factories in the store — ${known.join(', ')} — and this is none of them. Name one of them with ?repo=, or file a factory for it: wf factory add <name> --repo ${repo}.`,
  });

/**
 * Why the factory `factory` does not serve `repo`, not one of its repositories: an `Invalid`, naming them, the `?repo=` that asks for
 * one, and the `wf factory add` that files a factory on `repo`.
 */
const outsideRepo = (factory: Factory, repo: string): Invalid => {
  const repos = factory.repos.map((r) => path.resolve(r)).sort();
  return new Invalid({
    message: `${repo}: the factory ${factory.name} works on ${repos.join(', ')}, and this repository is not one of them. Name one of them — ?factory=${factory.name}&repo=${repos[0]} — or file a factory on this one: wf factory add <name> --repo ${repo}.`,
  });
};

/**
 * The factory and the repository a request is answered in, read off its query.
 *
 * - No factory, or `default`: the default factory, on `?repo=` resolved from where the api runs, else the api's own repository. A `?repo=`
 *   that is not the api's own nor any factory's (`knownRepos`) is refused, `Invalid`.
 * - A factory named: read from the store, as a start reads it (`readFactory`: `Invalid` for a name that is no slug or a file that does not
 *   read, `Missing` for none of that name). Its repository is the package's (`factoryRepo`): `?repo=`, else its only one, else the api's
 *   own; one that is not among its repositories (`outsideRefusal`) is refused, `Invalid`.
 *
 * Throws each refusal as the package's kind, so `app.onError` answers it by that kind.
 */
export function placeFor(query: PlaceQuery, env: NodeJS.ProcessEnv): Place {
  const named = query.repo === undefined ? undefined : path.resolve(query.repo);
  if (query.factory === undefined || query.factory === DEFAULT_FACTORY) {
    if (named === undefined) return { repo: repoOf(env), factory: undefined };
    const known = knownRepos(env);
    if (!known.includes(named)) throw unknownRepo(named, known);
    return { repo: named, factory: undefined };
  }
  const factory = readFactory(query.factory);
  const repo = path.resolve(factoryRepo(factory, named, repoOf(env)));
  if (outsideRefusal(factory, repo) !== undefined) throw outsideRepo(factory, repo);
  return { repo, factory };
}
