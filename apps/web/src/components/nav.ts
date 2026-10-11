import { Bot, ChartColumn, Factory, House, Inbox, List, Network, Settings, Waypoints } from 'lucide-react';
import { factorySearch } from '../lib/factories.ts';

/** Whether `path` is `to` or a page under it: `/agents/new` is under `/agents`, `/agentsx` is not. */
const under = (to: string) => (path: string) => path === to || path.startsWith(`${to}/`);

/** The factory whose floor `path` is, `/factories/<name>`; none for any other page. */
const floorOf = (path: string): string | undefined => /^\/factories\/([^/]+)$/.exec(path)?.[1];

/** The factory whose own page `path` is, its floor or its settings, `/factories/<name>/settings`; none for any other page. */
const ownerOf = (path: string): string | undefined => /^\/factories\/([^/]+)(?:\/settings)?$/.exec(path)?.[1];

/**
 * The sidebar's sections of the picked factory, in their order: its Floor, lit on a factory's floor; the Inbox, where an idea waits to be
 * started, lit on a card's page too; Runs, lit on a run's page; Workflows, lit on a step's page; and Stats, how well the runs went.
 */
export const SECTIONS = [
  { to: '/factories/$factory', label: 'Floor', icon: Factory, active: (path: string) => floorOf(path) !== undefined },
  { to: '/inbox', label: 'Inbox', icon: Inbox, active: under('/inbox') },
  { to: '/runs', label: 'Runs', icon: List, active: under('/runs') },
  { to: '/workflows', label: 'Workflows', icon: Waypoints, active: under('/workflows') },
  { to: '/stats', label: 'Stats', icon: ChartColumn, active: (path: string) => path === '/stats' },
] as const;

/** A section of the sidebar (`SECTIONS`). */
export type Section = (typeof SECTIONS)[number];

/** The sections whose page lists every factory's things and narrows them to the one `?factory=` names. */
type Listing = Exclude<Section['to'], '/factories/$factory'>;

/** Whether `path` is the page of a section that reads `?factory=`, itself and not a page under it. */
const isListing = (path: string): path is Listing =>
  SECTIONS.some((section) => section.to === path && section.to !== '/factories/$factory');

/** A workflow's page or a step's, at `path`: its `from`, its workflow and its step, none for a workflow's page; none for any other page. */
const workflowPageAt = (path: string): { from: string; workflow: string; step?: string } | undefined => {
  const match = /^\/workflows\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (!match) return undefined;
  const [from, workflow, step] = match.slice(1).map((part) => (part === undefined ? part : decodeURIComponent(part)));
  return step === undefined ? { from, workflow } : { from, workflow, step };
};

/** The tabs of Machines & Capabilities, in their order: the state machines drawn from their code, and what the repository offers a step. */
export const PLACE_TABS = [
  { to: '/machines', label: 'Machines' },
  { to: '/capabilities', label: 'Capabilities' },
] as const;

/** A tab of a place (`PLACE_TABS`): its page and its name. */
export type PlaceTab = (typeof PLACE_TABS)[number];

/** The tabs of the place whose tab's page `path` is, itself and not a page under it; none on any other page. */
export const tabsOf = (path: string): readonly PlaceTab[] | undefined =>
  PLACE_TABS.some((tab) => tab.to === path) ? PLACE_TABS : undefined;

/**
 * The rail, the frame's narrow column of icons at the left, in one column from the top: Home, the factories' canvas, lit on it and on a
 * factory's floor only; Agents, what a workflow's nodes may have attached, lit on an agent's page; Machines & Capabilities, lit on
 * either of its tabs (`PLACE_TABS`); and Settings, what is set for the whole store, lit on its page and under it, never on a factory's
 * own settings, which are Home's.
 */
export const RAIL = [
  { to: '/', label: 'Home', icon: House, active: (path: string) => path === '/' || path.startsWith('/factories/') },
  { to: '/agents', label: 'Agents', icon: Bot, active: under('/agents') },
  { to: '/machines', label: 'Machines & Capabilities', icon: Network, active: (path: string) => tabsOf(path) === PLACE_TABS },
  { to: '/settings', label: 'Settings', icon: Settings, active: under('/settings') },
] as const;

/**
 * The name the header gives the page at `path`: the section that `path` lights, else the rail's place, so a floor is Floor and the
 * canvas Home; none when neither has a place for it.
 */
export const sectionOf = (path: string) => [...SECTIONS, ...RAIL].find((item) => item.active(path))?.label;

/**
 * The factory the address at `path` with `search` picks, from the address alone: the name of a factory's own page, its floor or its
 * settings, else the `?factory=` of a section's page — the Inbox, Runs, Workflows or Stats — or of a workflow's page or a step's, which
 * read in it, and of no other page under them; none, All factories, on every other page.
 */
export function pickedOf(path: string, search: Record<string, unknown>): string | undefined {
  return ownerOf(path) ?? (isListing(path) || workflowPageAt(path) ? factorySearch(search).factory : undefined);
}

/** Where a section's link goes: a factory's floor, or a section's page with the factory it narrows to, none for every factory's. */
export type SectionLink = { to: '/factories/$factory'; params: { factory: string } } | { to: Listing; search: { factory?: string } };

/**
 * Where `section` leads with `factory` picked: its floor, which none but a picked factory has, so none under All factories; else its page,
 * narrowed to `factory` when one is picked and to none otherwise, so no other key of the page it is drawn on rides along.
 */
export function sectionLink(section: Section, factory: string | undefined): SectionLink | null {
  if (section.to === '/factories/$factory') return factory === undefined ? null : { to: section.to, params: { factory } };
  return { to: section.to, search: factory === undefined ? {} : { factory } };
}

/** `search` without its `repo`. */
const withoutRepo = ({ repo: _repo, ...kept }: Record<string, unknown>): Record<string, unknown> => kept;

/** Where a pick goes: a section's page with its search, a workflow's page or a step's in the picked factory, a factory's floor, or Home. */
export type PickTarget =
  | { to: Listing; search: Record<string, unknown> }
  | { to: '/workflows/$from/$workflow'; params: { from: string; workflow: string }; search: Record<string, unknown> }
  | { to: '/workflows/$from/$workflow/$step'; params: { from: string; workflow: string; step: string }; search: Record<string, unknown> }
  | { to: '/factories/$factory'; params: { factory: string } }
  | { to: '/' };

/**
 * Where picking `factory` (none for All factories) takes the page at `path` with `search`: on a section's page, the same page with every
 * other key of its search kept and `factory` set or dropped — and on Workflows alone its `repo` dropped too, which is there the
 * repository of the factory left, where on Stats it is the page's own filter; on a workflow's page or a step's, the same page read in the
 * picked factory, on the repository it reads, its `repo` dropped likewise; on a factory's own page, its floor or its settings, the picked
 * factory's floor, or Home for All factories; on any other page, the picked factory's floor, and nowhere for All factories, which that
 * page already shows.
 */
export function pickTo(path: string, search: Record<string, unknown>, factory: string | undefined): PickTarget | null {
  if (isListing(path)) {
    const { factory: _dropped, ...rest } = search;
    const kept = path === '/workflows' ? withoutRepo(rest) : rest;
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
