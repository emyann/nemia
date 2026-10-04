import { Blocks, Bot, ChartColumn, Factory, House, Inbox, List, Network, Waypoints } from 'lucide-react';
import { factorySearch } from '../lib/factories.ts';

/** Whether `path` is `to` or a page under it: `/agents/new` is under `/agents`, `/agentsx` is not. */
const under = (to: string) => (path: string) => path === to || path.startsWith(`${to}/`);

/** The factory whose floor `path` is, `/factories/<name>`; none for any other page. */
const floorOf = (path: string): string | undefined => /^\/factories\/([^/]+)$/.exec(path)?.[1];

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
const isListing = (path: string): path is Listing => SECTIONS.some((section) => section.to === path && section.to !== '/factories/$factory');

/**
 * The rail, the frame's narrow column of icons at the left: Home, the factories' canvas, lit on it and on a factory's floor only; Agents,
 * what a workflow's nodes may have attached, lit on an agent's page; Machines, the state machines drawn from their code; and, at its foot,
 * Capabilities, what the repository offers a step.
 */
export const RAIL = [
  { to: '/', label: 'Home', icon: House, active: (path: string) => path === '/' || path.startsWith('/factories/') },
  { to: '/agents', label: 'Agents', icon: Bot, active: under('/agents') },
  { to: '/machines', label: 'Machines', icon: Network, active: (path: string) => path === '/machines' },
  { to: '/capabilities', label: 'Capabilities', icon: Blocks, active: (path: string) => path === '/capabilities' },
] as const;

/**
 * The name the header gives the page at `path`: the section that `path` lights, else the rail's place, so a floor is Floor and the
 * canvas Home; none when neither has a place for it.
 */
export const sectionOf = (path: string) => [...SECTIONS, ...RAIL].find((item) => item.active(path))?.label;

/**
 * The factory the address at `path` with `search` picks, from the address alone: a floor's own name, else the `?factory=` of a section's
 * page — the Inbox, Runs, Workflows or Stats, and none under them; none, All factories, on every other page.
 */
export function pickedOf(path: string, search: Record<string, unknown>): string | undefined {
  return floorOf(path) ?? (isListing(path) ? factorySearch(search).factory : undefined);
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

/** Where a pick goes: a section's page with its search, a factory's floor, or Home. */
export type PickTarget =
  | { to: Listing; search: Record<string, unknown> }
  | { to: '/factories/$factory'; params: { factory: string } }
  | { to: '/' };

/**
 * Where picking `factory` (none for All factories) takes the page at `path` with `search`: on a section's page, the same page with every
 * other key of its search kept and `factory` set or dropped; on a floor, the picked factory's floor, or Home for All factories; on any
 * other page, the picked factory's floor, and nowhere for All factories, which that page already shows.
 */
export function pickTo(path: string, search: Record<string, unknown>, factory: string | undefined): PickTarget | null {
  if (isListing(path)) {
    const { factory: _dropped, ...kept } = search;
    return { to: path, search: factory === undefined ? kept : { ...kept, factory } };
  }
  if (factory !== undefined) return { to: '/factories/$factory', params: { factory } };
  return floorOf(path) === undefined ? null : { to: '/' };
}
