import { Bot, ChartColumn, Factory, House, Inbox, List, type LucideIcon, Settings, Waypoints } from 'lucide-react';
import { factorySearch } from '../lib/factories.ts';

/** Whether `path` is `to` or a page under it: `/agents/new` is under `/agents`, `/agentsx` is not. */
const under = (to: string) => (path: string) => path === to || path.startsWith(`${to}/`);

/** The factory whose own page `path` is, its floor or its settings, `/factories/<name>/settings`; none for any other page. */
const ownerOf = (path: string): string | undefined => /^\/factories\/([^/]+)(?:\/settings)?$/.exec(path)?.[1];

/** The pages whose list reads `?factory=` and narrows to the one it names: the Inbox, Runs and Workflows. */
const LISTINGS = ['/inbox', '/runs', '/workflows'] as const;

/** A page of `LISTINGS`. */
type Listing = (typeof LISTINGS)[number];

/** Whether `path` is the page of a list that reads `?factory=`, itself and not a page under it. */
const isListing = (path: string): path is Listing => LISTINGS.some((to) => to === path);

/** A workflow's page or a step's, at `path`: its `from`, its workflow and its step, none for a workflow's page; none for any other page. */
const workflowPageAt = (path: string): { from: string; workflow: string; step?: string } | undefined => {
  const match = /^\/workflows\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (!match) return undefined;
  const [from, workflow, step] = match.slice(1).map((part) => (part === undefined ? part : decodeURIComponent(part)));
  return step === undefined ? { from, workflow } : { from, workflow, step };
};

/**
 * The tabs of Settings, in their order: what is set for the whole store, the state machines drawn from their code, and what the repository
 * offers a step.
 */
export const SETTINGS_TABS = [
  { to: '/settings', label: 'Settings' },
  { to: '/machines', label: 'Machines' },
  { to: '/capabilities', label: 'Capabilities' },
] as const;

/** A tab of Settings (`SETTINGS_TABS`): its page and its name. */
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** The tabs of the place whose tab's page `path` is, itself and not a page under it; none on any other page. */
export const tabsOf = (path: string): readonly SettingsTab[] | undefined =>
  SETTINGS_TABS.some((tab) => tab.to === path) ? SETTINGS_TABS : undefined;

/** A destination of the rail: its key, its name, its icon, and which pages light it. */
export type Destination = { id: string; label: string; icon: LucideIcon; lights: (path: string) => boolean };

/**
 * The rail's destinations, in their order: Overview, the factories' canvas at `/`; Runs, the Inbox, Factories (a factory's floor and its
 * settings), Agents and Workflows, each lit on its page and under it; Stats; and Settings, lit on each of its tabs (`SETTINGS_TABS`).
 */
export const DESTINATIONS: readonly Destination[] = [
  { id: 'overview', label: 'Overview', icon: House, lights: (path) => path === '/' },
  { id: 'runs', label: 'Runs', icon: List, lights: under('/runs') },
  { id: 'inbox', label: 'Inbox', icon: Inbox, lights: under('/inbox') },
  { id: 'factories', label: 'Factories', icon: Factory, lights: under('/factories') },
  { id: 'agents', label: 'Agents', icon: Bot, lights: under('/agents') },
  { id: 'workflows', label: 'Workflows', icon: Waypoints, lights: under('/workflows') },
  { id: 'stats', label: 'Stats', icon: ChartColumn, lights: under('/stats') },
  { id: 'settings', label: 'Settings', icon: Settings, lights: (path) => SETTINGS_TABS.some((tab) => under(tab.to)(path)) },
];

/** Every destination of `table` that the page at `path` lights: one for each of the board's routes. */
export const destinationsLit = (path: string, table: readonly Destination[] = DESTINATIONS): Destination[] =>
  table.filter((destination) => destination.lights(path));

/** The one destination the page at `path` lights, none for an address no route has. */
export const destinationOf = (path: string): Destination | undefined => {
  const lit = destinationsLit(path);
  return lit.length === 1 ? lit[0] : undefined;
};

/** A factory's floor as an address, its name escaped. */
const floorHref = (factory: string): string => `/factories/${encodeURIComponent(factory)}`;

/**
 * Where the destination `id` leads with `picked` the factory the address picks and `first` the first factory listed: a list of the Inbox,
 * Runs or Workflows narrowed to `picked`, every factory's under none; Factories to the floor of `picked`, else of `first`, else Overview;
 * any other its own page.
 */
export function destinationHref(id: string, picked: string | undefined, first: string | undefined): string {
  if (id === 'factories') {
    const factory = picked ?? first;
    return factory === undefined ? '/' : floorHref(factory);
  }
  if (id === 'overview') return '/';
  const to = `/${id}`;
  return isListing(to) && picked !== undefined ? `${to}?factory=${encodeURIComponent(picked)}` : to;
}

/**
 * The factory the address at `path` with `search` picks, from the address alone: the name of a factory's own page, its floor or its
 * settings, else the `?factory=` of a section's page — the Inbox, Runs or Workflows — or of a workflow's page or a step's, which
 * read in it, and of no other page under them; none, All factories, on every other page.
 */
export function pickedOf(path: string, search: Record<string, unknown>): string | undefined {
  return ownerOf(path) ?? (isListing(path) || workflowPageAt(path) ? factorySearch(search).factory : undefined);
}

/** `search` without its `repo`. */
const withoutRepo = ({ repo: _repo, ...kept }: Record<string, unknown>): Record<string, unknown> => kept;

/** Where a pick goes: a section's page with its search, a workflow's page or a step's in the picked factory, a factory's floor, or Overview. */
export type PickTarget =
  | { to: Listing; search: Record<string, unknown> }
  | { to: '/workflows/$from/$workflow'; params: { from: string; workflow: string }; search: Record<string, unknown> }
  | { to: '/workflows/$from/$workflow/$step'; params: { from: string; workflow: string; step: string }; search: Record<string, unknown> }
  | { to: '/factories/$factory'; params: { factory: string } }
  | { to: '/' };

/**
 * Where picking `factory` (none for All factories) takes the page at `path` with `search`: on a section's page, the same page with every
 * other key of its search kept and `factory` set or dropped — but its `repo`, dropped too, which is the repository of the factory left;
 * on a workflow's page or a step's, the same page read in the picked factory, on the repository it reads, its `repo` dropped likewise; on
 * a factory's own page, its floor or its settings, the picked factory's floor, or Overview for All factories; on any other page, the picked
 * factory's floor, and nowhere for All factories, which that page already shows.
 */
export function pickTo(path: string, search: Record<string, unknown>, factory: string | undefined): PickTarget | null {
  if (isListing(path)) {
    const { factory: _dropped, ...rest } = search;
    const kept = withoutRepo(rest);
    return { to: path, search: factory === undefined ? kept : { ...kept, factory } };
  }
  const page = workflowPageAt(path);
  if (page) {
    const { factory: _factory, repo: _repo, ...kept } = search;
    const picked = factory === undefined ? kept : { ...kept, factory };
    const { step, ...workflow } = page;
    return step === undefined
      ? { to: '/workflows/$from/$workflow', params: workflow, search: picked }
      : { to: '/workflows/$from/$workflow/$step', params: { ...workflow, step }, search: picked };
  }
  if (factory !== undefined) return { to: '/factories/$factory', params: { factory } };
  return ownerOf(path) === undefined ? null : { to: '/' };
}
