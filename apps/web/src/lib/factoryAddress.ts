/**
 * The factory's place in an address. A factory's pages are paths under `/factories/<name>/` (`seatOf`); an address of before them, which
 * named the factory in `?factory=`, is sent to its path by `factoryRedirect`, the one reader of that key, and a run's, a step's or a
 * card's page is sent to the address of the factory its object is in by `objectHome`, which reads the object's own namespace, so a stale
 * or a wrong path corrects itself and no redirect loops.
 */
import { defaultStringifySearch, linkOptions } from '@tanstack/react-router';
import { factoryIn } from './api/namespace.ts';
import type { PagePlace } from './api/workflows.ts';

/** A factory's path, its name escaped, and `rest` under it. */
const factoryPath = (factory: string, rest: string) => `/factories/${encodeURIComponent(factory)}${rest}`;

/** The search a factory's definition page adds for a repository's definition, read in the factory: `?from=repo`. */
const fromSearch = (match: RegExpExecArray) => (match[1] === 'repo' ? { from: 'repo' } : {});

/** Each page of before the factory's paths whose `?factory=` names its factory, and the path under `/factories/<name>` it now has. */
const OLD_PAGES: readonly { at: RegExp; rest: (match: RegExpExecArray) => string; adds?: (match: RegExpExecArray) => object }[] = [
  { at: /^\/$/, rest: () => '' },
  { at: /^\/runs\/?$/, rest: () => '/runs' },
  { at: /^\/inbox$/, rest: () => '/inbox' },
  { at: /^\/workflows((?:\/[^/]+){2,3})?$/, rest: (match) => `/workflows${match[1] ?? ''}` },
  { at: /^\/capabilities$/, rest: () => '/skills' },
  { at: /^\/agents$/, rest: () => '/agents' },
  { at: /^\/agents\/(factory|repo)\/([^/]+)$/, rest: (match) => `/agents/${match[2]}`, adds: fromSearch },
  { at: /^\/agents\/skills\/(factory|repo)\/([^/]+)$/, rest: (match) => `/skills/${match[2]}`, adds: fromSearch },
];

/** The pages of one object, a run, its step or a card, whose `?factory=` is dropped, the object's own loader deciding where it belongs. */
const OBJECT_PAGES: readonly RegExp[] = [/^\/runs\/[^/]+$/, /^\/runs\/[^/]+\/steps\/[^/]+$/, /^\/inbox\/[^/]+$/];

/**
 * Where an address of before the factory's paths goes, its `?factory=` naming a factory: the page's path under that factory, every other
 * key of its search kept; a run's, a step's or a card's page the same path without the key; none for any other address, which is left as
 * it is.
 *
 * @param path the address's path
 * @param search the address's search, as the router parsed it
 */
export function factoryRedirect(path: string, search: Record<string, unknown>) {
  const { factory, ...kept } = search;
  if (typeof factory !== 'string' || factory === '') return undefined;
  if (OBJECT_PAGES.some((page) => page.test(path))) return `${path}${defaultStringifySearch(kept)}`;
  for (const page of OLD_PAGES) {
    const match = page.at.exec(path);
    if (match) return `${factoryPath(factory, page.rest(match))}${defaultStringifySearch({ ...page.adds?.(match), ...kept })}`;
  }
  return undefined;
}

/**
 * The address a run's, a step's or a card's page belongs at, `rest` being its path under its factory (`/runs/<id>`, `/inbox/<name>`):
 * under the factory its object's `namespace` names, or at the store's level for the default factory; none where `at`, the address's
 * factory (none at the store's level), already agrees.
 *
 * @param rest the object page's path below its factory's
 * @param namespace the object's own namespace, as the api answers it
 * @param at the factory the address's path names, none at the store's level
 */
export function objectHome(rest: string, namespace: string | undefined, at: string | undefined) {
  const home = factoryIn(namespace) ?? undefined;
  if (home === at) return undefined satisfies string | undefined as string | undefined;
  return (home === undefined ? rest : factoryPath(home, rest)) satisfies string | undefined as string | undefined;
}

/** The search a factory's page keeps beside its path: the repository it reads, where it names one. */
const repoSearch = (place: PagePlace) => (place.repo ? { repo: place.repo } : {});

/**
 * A link to the Workflows list read in `place`: the list of its factory, under the factory's path, on its repository where it names one;
 * every factory's for none.
 *
 * @param place the factory and the repository the list is read in
 */
export const workflowsLink = (place: PagePlace) =>
  place.factory
    ? linkOptions({ to: '/factories/$factory/workflows', params: { factory: place.factory }, search: repoSearch(place) })
    : linkOptions({ to: '/workflows', search: repoSearch(place) });

/**
 * A link to a workflow's page, or one of its steps', read in `place`: under its factory's path where it names one, on its repository
 * where it names one; at the store's level for none.
 *
 * @param place the factory and the repository it is read in
 * @param from where the workflow is read from
 * @param workflow the workflow's name
 * @param step the step's name, none for the workflow's own page
 * @param build whether the link opens the builder of one of yours, on the workflow's own page
 */
export function workflowLink(place: PagePlace, from: string, workflow: string, step?: string, build?: boolean) {
  const search = { ...repoSearch(place), ...(build && { build: true as const }) };
  if (place.factory) {
    const factory = place.factory;
    return step === undefined
      ? linkOptions({ to: '/factories/$factory/workflows/$from/$workflow', params: { factory, from, workflow }, search })
      : linkOptions({ to: '/factories/$factory/workflows/$from/$workflow/$step', params: { factory, from, workflow, step }, search });
  }
  return step === undefined
    ? linkOptions({ to: '/workflows/$from/$workflow', params: { from, workflow }, search })
    : linkOptions({ to: '/workflows/$from/$workflow/$step', params: { from, workflow, step }, search });
}

/**
 * A link to an agent's page or a skill's, by its origin and name, read in `place`: a factory's own or a repository's under the path of the
 * factory `place` names, which alone serves them — a repository's said so (`?from=repo`) and on the repository `place` names; any other,
 * yours or Nemia's, which `default` serves wherever the link is drawn, at the store's level; a factory's own or a repository's with no
 * factory named, at the store's level too, on the repository `place` names.
 *
 * @param kind whether the definition is an agent or a skill
 * @param from where the definition is read from
 * @param name the definition's name
 * @param place the factory and the repository it is read in
 */
export function definitionLink(kind: 'agent' | 'skill', from: string, name: string, place: PagePlace) {
  const own = from === 'factory' || from === 'repo';
  const search = own ? { ...(from === 'repo' && { from: 'repo' as const }), ...repoSearch(place) } : {};
  if (own && place.factory) {
    const factory = place.factory;
    return kind === 'agent'
      ? linkOptions({ to: '/factories/$factory/agents/$agent', params: { factory, agent: name }, search })
      : linkOptions({ to: '/factories/$factory/skills/$skill', params: { factory, skill: name }, search });
  }
  const kept = own ? repoSearch(place) : {};
  return kind === 'agent'
    ? linkOptions({ to: '/agents/$from/$agent', params: { from, agent: name }, search: kept })
    : linkOptions({ to: '/agents/skills/$from/$skill', params: { from, skill: name }, search: kept });
}

/**
 * The search of a factory's definition page, an agent's or a skill's: whether it is a repository's (`?from=repo`), else the factory's own,
 * and the repository it is read on.
 *
 * @param search the page's search, as the router parsed it
 */
export const definitionSearch = (search: Record<string, unknown>) => ({
  ...(search.from === 'repo' && { from: 'repo' as const }),
  ...(typeof search.repo === 'string' && search.repo ? { repo: search.repo } : {}),
});

/**
 * A link to what a repository offers a step, read in `place`: its factory's Skills, under the factory's path, where it names one; the
 * store's Capabilities tab for none; on the repository it names either way.
 *
 * @param place the factory and the repository it is read in
 */
export const skillsLink = (place: PagePlace) =>
  place.factory
    ? linkOptions({ to: '/factories/$factory/skills', params: { factory: place.factory }, search: repoSearch(place) })
    : linkOptions({ to: '/capabilities', search: repoSearch(place) });
