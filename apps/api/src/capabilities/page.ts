/**
 * Which repository the Capabilities page reads, or why it reads none and what to do (objects' `CapabilitiesUnread`). The page is read
 * per factory: in a factory the request names, its repository (`placeFor`); with none named, the one repository every factory of the
 * store — the default among them where the api has a repository of its own (`repoOf`) — works on, where they all work on one. Nothing
 * here reads a repository or starts anything.
 */
import path from 'node:path';
import { commandLine, FACTORY_ADD, FACTORY_APPLY, type FactoryListing } from 'agent-orchestrator';
import { CLAUDE_RULES } from 'agent-orchestrator/workflow';
import type { CapabilitiesUnread, CapabilitiesWithSteps } from 'objects';
import type { Place } from '../factory/place.ts';

/** The repository the page reads, or why there is none. */
export type PageRead = { repo: string } | { unread: CapabilitiesUnread };

/** The lines that file a factory, which a page with no factory to read names: the add, and the apply from a template. */
export const FILE_FACTORY: readonly string[] = [
  commandLine(FACTORY_ADD, {}, { repos: '<path>' }),
  commandLine(FACTORY_APPLY, {}, { template: '<name>', repos: '<path>' }),
];

/** A factory the page may read with none named: its name and its repositories, each as `path.resolve` spells it. */
type Candidate = { name: string; repos: string[] };

const unread = (reason: CapabilitiesUnread['reason'], message: string, more: Partial<CapabilitiesUnread> = {}): PageRead => ({
  unread: { reason, message, factory: null, repos: [], commands: [], ...more },
});

/** `several-repositories` of the factory `name`, which works on `repos`. */
const pickRepository = (name: string, repos: readonly string[]): PageRead =>
  unread('several-repositories', `The factory ${name} works on ${repos.length} repositories: pick the one to read.`, {
    factory: name,
    repos: [...repos].sort(),
  });

/**
 * What the page reads in `place` (`placeFor`), the api's own repository being `own` (`repoOf`) and the store's factories `listings`
 * (`listedAtOnce`):
 *
 * - A factory named: its repository, or `several-repositories` where it works on several and the request names none.
 * - The default factory, a `?repo=` named that is not the api's own: that one.
 * - Else, every factory whose file reads, and the default where `own` is one: the one repository they all work on; `no-factory` where
 *   there is none of them; `several-repositories` where there is one, on several; `several-factories` otherwise.
 */
export function pageRead(place: Place, own: string | undefined, listings: readonly FactoryListing[]): PageRead {
  if (place.factory !== undefined) {
    if (place.repo !== undefined) return { repo: place.repo };
    return pickRepository(
      place.factory.name,
      place.factory.repos.map((r) => path.resolve(r)),
    );
  }
  if (place.repo !== undefined && place.repo !== own) return { repo: place.repo };
  const candidates: Candidate[] = [
    ...(own === undefined ? [] : [{ name: 'default', repos: [own] }]),
    ...listings.flatMap((l) => ('error' in l ? [] : [{ name: l.name, repos: l.repos.map((r) => path.resolve(r)) }])),
  ];
  const repos = [...new Set(candidates.flatMap((c) => c.repos))];
  const [only, ...more] = repos;
  if (only !== undefined && !more.length) return { repo: only };
  const [one, ...others] = candidates;
  if (one === undefined) {
    return unread(
      'no-factory',
      'No factory is filed in this store, and this api has no repository of its own: file a factory, and the page reads its repository.',
      { commands: [...FILE_FACTORY] },
    );
  }
  if (!others.length) return pickRepository(one.name, one.repos);
  return unread('several-factories', `The store has ${candidates.length} factories: pick one, and the page reads its repository.`);
}

/** The page's answer where it reads no repository: `unread`, no `repo`, every list empty. */
export const unreadAnswer = (why: CapabilitiesUnread): CapabilitiesWithSteps => ({
  unread: why,
  skills: [],
  agents: [],
  mcp: [],
  denied: [],
  asked: [],
  allowed: [],
  warnings: [],
  measured: CLAUDE_RULES.measuredTools,
  readOnly: CLAUDE_RULES.readOnlyCommands,
  steps: [],
});
