import { defaultStringifySearch } from '@tanstack/react-router';
import { BookOpen, Bot, ChartColumn, Factory, Hourglass, Library, type LucideIcon, Settings } from 'lucide-react';
import { openRunsQuery } from '../../lib/api/runs.ts';

/** Whether `path` is `to` or a page under it: `/agents/new` is under `/agents`, `/agentsx` is not. */
const under = (to: string) => (path: string) => path === to || path.startsWith(`${to}/`);

/** A destination of the store's rail, by its key. */
type RailId = 'factories' | 'waiting' | 'agents' | 'skills' | 'library' | 'stats' | 'settings';

/** A place of a factory's pane, by its key: the factory's floor, then its lists, then its settings. */
export type PanePlace = 'floor' | 'runs' | 'inbox' | 'workflows' | 'agents' | 'skills' | 'proposals' | 'settings';

/**
 * Where a page sits in the frame: at the store's level, under a destination of the rail or her face (`nemia`, her chat's own page); or at
 * one factory's level, under a place of its pane.
 */
export type Seat =
  | { readonly level: 'store'; readonly rail: RailId | 'nemia' }
  | { readonly level: 'factory'; readonly factory: string; readonly place: PanePlace };

/**
 * The tabs of Settings, in their order: what is set for the whole store, what the repository offers a step, what the server needs
 * to run its factories, and the person's tokens, which reach the store.
 */
const SETTINGS_TABS = [
  { to: '/settings', label: 'Settings' },
  { to: '/capabilities', label: 'Capabilities' },
  { to: '/setup', label: 'Setup' },
  { to: '/tokens', label: 'Tokens' },
] as const;

/** A tab of Settings (`SETTINGS_TABS`): its page and its name. */
type SettingsTab = (typeof SETTINGS_TABS)[number];

/**
 * The tabs of the place whose tab's page `path` is, itself and not a page under it; none on any other page.
 *
 * @param path the address of the page
 */
export const tabsOf = (path: string): readonly SettingsTab[] | undefined =>
  SETTINGS_TABS.some((tab) => tab.to === path) ? SETTINGS_TABS : undefined;

/** The store's pages, each with the rail destination it sits under, in the order they are read: the first that holds the path wins. */
const STORE_SEATS: readonly { lights: (path: string) => boolean; rail: RailId | 'nemia'; name: string }[] = [
  { lights: (path) => path === '/', rail: 'factories', name: 'Factories' },
  { lights: (path) => path === '/welcome', rail: 'factories', name: 'Welcome' },
  { lights: (path) => under('/runs')(path) || under('/labels')(path), rail: 'waiting', name: 'Runs' },
  { lights: under('/inbox'), rail: 'waiting', name: 'Inbox' },
  { lights: under('/agents/skills'), rail: 'skills', name: 'Skills' },
  { lights: under('/agents'), rail: 'agents', name: 'Agents' },
  { lights: under('/workflows'), rail: 'agents', name: 'Workflows' },
  { lights: under('/library'), rail: 'library', name: 'Library' },
  { lights: under('/stats'), rail: 'stats', name: 'Stats' },
  { lights: (path) => SETTINGS_TABS.some((tab) => under(tab.to)(path)), rail: 'settings', name: 'Settings' },
  { lights: under('/chat'), rail: 'nemia', name: 'Nemia' },
];

/** The pane's place each first segment under a factory's path opens, its floor being the path itself. */
const PLACE_OF_SEGMENT: Readonly<Record<string, PanePlace>> = {
  runs: 'runs',
  inbox: 'inbox',
  workflows: 'workflows',
  agents: 'agents',
  skills: 'skills',
  proposals: 'proposals',
  settings: 'settings',
};

/**
 * Where the page at `path` sits: under `/factories/<name>`, that factory's level, at the pane's place its next segment names (its floor
 * for none); every other page of the board, the store's level, under the rail's destination that holds it; none for an address no route
 * has. The path alone decides: no page's search names its level.
 *
 * @param path the address of the page
 */
export function seatOf(path: string): Seat | undefined {
  const factory = /^\/factories\/([^/]+)(?:\/([^/]+))?/.exec(path);
  if (factory) {
    const place = factory[2] === undefined ? 'floor' : PLACE_OF_SEGMENT[factory[2]];
    return place && { level: 'factory', factory: decodeURIComponent(factory[1] ?? ''), place };
  }
  const store = STORE_SEATS.find((seat) => seat.lights(path));
  return store && { level: 'store', rail: store.rail };
}

/**
 * The factory a seat sits in: its own on a factory's page, none at the store's level or for no seat.
 *
 * @param seat where the page sits
 */
export const seatFactory = (seat: Seat | undefined): string | undefined => (seat?.level === 'factory' ? seat.factory : undefined);

/** A destination of the rail: its key, its name and its icon. */
type RailDestination = { readonly id: RailId; readonly label: string; readonly icon: LucideIcon };

/** A group of the rail: its name, said to a screen reader and drawn over its destinations, and its destinations in their order. */
export type RailGroup = { readonly id: 'across' | 'yours' | 'you'; readonly label: string; readonly items: readonly RailDestination[] };

/**
 * The store rail's groups, under Nemia's face: what spans factories (Factories, the canvas of them all, and Waiting, what waits on the
 * person in every factory); the person's own library (their agents, their skills, and the store's Library of every kind with the factories
 * that add each); and at the foot the person's (Stats and Settings).
 */
export const RAIL_GROUPS: readonly RailGroup[] = [
  {
    id: 'across',
    label: 'Across factories',
    items: [
      { id: 'factories', label: 'Factories', icon: Factory },
      { id: 'waiting', label: 'Waiting', icon: Hourglass },
    ],
  },
  {
    id: 'yours',
    label: 'Yours',
    items: [
      { id: 'agents', label: 'Agents', icon: Bot },
      { id: 'skills', label: 'Skills', icon: BookOpen },
      { id: 'library', label: 'Library', icon: Library },
    ],
  },
  {
    id: 'you',
    label: 'You',
    items: [
      { id: 'stats', label: 'Stats', icon: ChartColumn },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

/** Where each destination of the rail leads: Skills to its section of the Agents page, the Library to its own page. */
const RAIL_HREF: Readonly<Record<RailId, string>> = {
  factories: '/',
  waiting: '/runs',
  agents: '/agents',
  skills: '/agents#skills',
  library: '/library',
  stats: '/stats',
  settings: '/settings',
};

/**
 * Where the rail's destination `id` leads.
 *
 * @param id the destination's key
 */
export const railHref = (id: RailId): string => RAIL_HREF[id];

/**
 * The rail's destination lit at `seat`: its own on a store page, Factories on any factory's page, none on her chat's page (her face says
 * it) and for no seat.
 *
 * @param seat where the page sits
 */
export function litOf(seat: Seat | undefined): RailId | undefined {
  if (seat === undefined) return undefined;
  if (seat.level === 'factory') return 'factories';
  return seat.rail === 'nemia' ? undefined : seat.rail;
}

/** A place of the pane: its key and its name. */
type PanePlaceItem = { readonly id: PanePlace; readonly label: string };

/**
 * The factory pane's places, in their order: the floor, its runs, its inbox, its workflows, its agents, its skills, its proposals and its
 * settings.
 */
export const PANE_PLACES: readonly PanePlaceItem[] = [
  { id: 'floor', label: 'Floor' },
  { id: 'runs', label: 'Runs' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'agents', label: 'Agents' },
  { id: 'skills', label: 'Skills' },
  { id: 'proposals', label: 'Proposals' },
  { id: 'settings', label: 'Settings' },
];

/**
 * The address of `place` in `factory`'s pane, its name escaped: its floor at `/factories/<name>`, every other place under it.
 *
 * @param place the pane's place
 * @param factory the factory's name
 */
export const placeHref = (place: PanePlace, factory: string): string =>
  `/factories/${encodeURIComponent(factory)}${place === 'floor' ? '' : `/${place}`}`;

/**
 * The open runs the frame counts at `path`: the run list of the factory the page sits in (`seatOf`), every factory's at the store's
 * level — the one query the pane's Runs line and Nemia's cue read their `counts.waiting` from, and the Runs page's own when no label
 * selector narrows it, so the three say one number and are read again together.
 *
 * @param path the address of the page
 */
export const frameRunsQuery = (path: string) => openRunsQuery(seatFactory(seatOf(path)));

/**
 * The pane's places whose page reads one object by the next segment, a run, a card or a proposal, which a pick sends to the place's list.
 */
const OBJECT_PLACES: ReadonlySet<string> = new Set(['runs', 'inbox', 'proposals']);

/**
 * Where picking `factory` takes the page at `path` with `search`, as an address: on a factory's page, the same place in the picked
 * factory, every key of its search kept but `repo`, the repository of the factory left — a workflow's page, a step's, an agent's or a
 * skill's the same name read there, a run's, a card's or a proposal's page the place's list; on the
 * store's Capabilities, the picked factory's Skills; on any other page of the store's level, the picked factory's floor.
 *
 * @param path the address of the page
 * @param search the page's search
 * @param factory the factory picked
 */
export function pickTo(path: string, search: Record<string, unknown>, factory: string): string {
  const seat = seatOf(path);
  const floor = placeHref('floor', factory);
  if (seat?.level !== 'factory') return path === '/capabilities' ? placeHref('skills', factory) : floor;
  if (seat.place === 'floor') return floor;
  if (seat.place === 'settings') return placeHref('settings', factory);
  const rest = path.split('/').slice(4);
  const { repo: _repo, ...kept } = search;
  if (rest.length > 0 && OBJECT_PLACES.has(seat.place)) return placeHref(seat.place, factory);
  const tail = rest.length > 0 ? `/${rest.join('/')}` : '';
  return `${placeHref(seat.place, factory)}${tail}${defaultStringifySearch(kept)}`;
}

/**
 * The name a page's head gives the page at `path`: under a factory's path its pane's place, at the store's level the page's own, the
 * rail's destination it sits under holding several (Waiting the runs and the inbox, Agents the agents and the workflows); none for an
 * address no route has.
 *
 * @param path the address of the page
 */
export function pageNameOf(path: string): string | undefined {
  const seat = seatOf(path);
  if (seat?.level === 'factory') return PANE_PLACES.find((place) => place.id === seat.place)?.label;
  return seat && STORE_SEATS.find((one) => one.lights(path))?.name;
}
