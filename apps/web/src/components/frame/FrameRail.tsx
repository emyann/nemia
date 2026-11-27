import { useQuery } from '@tanstack/react-query';
import { PanelLeft } from 'lucide-react';
import { Avatar, IconButton, NavigationDrawer, type NavigationItem, NavigationRail } from '@/components/ui/ds';
import { openRunsQuery } from '@/lib/api/runs';
import { NemiaRailFace } from '../nemia/NemiaRailFace';
import { useNemiaPresence } from '../nemia/useNemiaPresence';
import { useFrameFold, useFramePane, useHerSheet, useOwnsChat } from './HerSheet';
import { FactoryPane } from './FactoryPane';
import { litOf, RAIL_GROUPS, type RailGroup, railHref, seatOf } from '../nav/nav';

/** What Waiting's badge says to a screen reader: how many runs wait on you, in every factory. */
const waitingTitle = (count: number) => `${count} ${count === 1 ? 'waits' : 'wait'} on you in every factory`;

/**
 * The rail's groups (`RAIL_GROUPS`) as the kit's items, each a link where `railHref` says, Waiting counting the runs that wait on you in
 * every factory, the api's, none before they are read.
 */
function useRailGroups() {
  const runs = useQuery(openRunsQuery());
  const waiting = runs.data?.counts.waiting ?? 0;
  return RAIL_GROUPS.map((group) => ({
    group,
    items: group.items.map(({ id, label, icon }) => ({
      id,
      label,
      icon,
      href: railHref(id),
      ...(id === 'waiting' && waiting > 0 ? { badge: waiting, badgeLabel: waitingTitle(waiting) } : {}),
    })),
  }));
}

/**
 * The button that folds and unfolds the factory pane, or on a narrow screen opens the drawer: named for what a press does. The pane the
 * sheet covers under 1600 is said closed, and a press there folds it as the person keeps it, which the sheet closing then shows.
 */
export function MenuButton() {
  const { narrow, drawerOpen, open, toggle } = useFramePane();
  const fold = useFrameFold();
  const shown = narrow ? drawerOpen : fold.pane === 'docked';
  const name = narrow ? (shown ? 'Close the menu' : 'Open the menu') : open ? 'Fold the factory pane' : 'Unfold the factory pane';
  return <IconButton data-menu-button variant="standard" icon={PanelLeft} aria-label={name} aria-expanded={shown} onPress={toggle} />;
}

/**
 * Nemia's face at the page at `path`, which shows her chat in the frame's side sheet, in place of what the address's `?bar=` names, or
 * closes it where the sheet shows her; it says open only while the sheet shows her (`FrameFold.shows`).
 */
export function HerFace({ path }: { path: string }) {
  const sheet = useHerSheet();
  const fold = useFrameFold();
  const presence = useNemiaPresence(path);
  const ownsChat = useOwnsChat();
  return <NemiaRailFace presence={presence} open={fold.shows === 'her'} ownsChat={ownsChat} onToggle={sheet.toggle} />;
}

/**
 * The account, drawn as the canvas draws it and not built yet: the kit's avatar with an initial, which takes no focus and no press, on a
 * neutral tier, since the kit's primary container is the board's `yours` and nothing here waits on the person.
 */
function AccountToCome() {
  return (
    <span data-account-to-come title="Account · to come" className="inline-flex shrink-0 cursor-default">
      <Avatar alt="Account, not built yet" fallback="Y" size={32} className="bg-surface-container-highest text-on-surface" />
    </span>
  );
}

/**
 * The store's rail at `path` with `search`, across every factory, the whole height of the window less the machine bar at its left: 80
 * wide, collapsed, and never folding. Nemia's face (`HerFace`) first, and on a factory's page the menu button that folds its pane; then
 * the groups, each the kit's narrow `NavigationRail` under its name — what spans factories (Factories, Waiting), yours (Agents, Skills) —
 * and at the foot the person's (Stats, Settings) over the account, to come. The destination the page lights (`litOf`) is lit. On a
 * narrow screen the rail leaves the page's side, and the menu button of the page's head opens the kit's modal drawer, which holds the
 * factory pane (`FactoryPane`) on a factory's page over the same groups, and which a pick closes.
 */
export function FrameRail({ path, search }: { path: string; search: Record<string, unknown> }) {
  const { narrow, drawerOpen, setDrawerOpen } = useFramePane();
  const seat = seatOf(path);
  const groups = useRailGroups();
  const selected = litOf(seat) ?? null;
  if (narrow)
    return (
      <NavigationDrawer
        variant="modal"
        aria-label="Places"
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        header={
          seat?.level === 'factory' ? (
            <FactoryPane
              path={path}
              search={search}
              factory={seat.factory}
              lit={seat.place}
              inDrawer
              onPicked={() => setDrawerOpen(false)}
            />
          ) : undefined
        }
        sections={groups.map(({ group, items }) => ({ headline: group.label, items }))}
        selectedKey={selected}
      />
    );
  const top = groups.slice(0, -1);
  const foot = groups.at(-1);
  return (
    <div data-frame-rail data-rail-scroll className="z-30 flex w-20 shrink-0 flex-col overflow-y-auto bg-background">
      <div className="flex flex-col items-center gap-2 pt-3 pb-2">
        <HerFace path={path} />
        {seat?.level === 'factory' && <MenuButton />}
      </div>
      {top.map(({ group, items }) => (
        <RailGroupOf key={group.id} group={group} items={items} selected={selected} />
      ))}
      {foot && (
        <div className="mt-auto flex flex-col items-center gap-2 pb-3">
          <RailGroupOf group={foot.group} items={foot.items} selected={selected} />
          <AccountToCome />
        </div>
      )}
    </div>
  );
}

/** One group of the rail: its name over its destinations, the kit's narrow `NavigationRail`, named for a screen reader by the group. */
function RailGroupOf({ group, items, selected }: { group: RailGroup; items: NavigationItem[]; selected: string | null }) {
  return (
    <div data-rail-group={group.id} className="flex w-20 flex-col items-center pt-2">
      <span aria-hidden className="w-full px-1 text-center text-label-small text-balance text-on-surface-variant">
        {group.label}
      </span>
      <NavigationRail
        aria-label={group.label}
        items={items}
        selectedKey={selected}
        isNarrow
        className="h-auto bg-transparent [&>div:first-child]:hidden"
      />
    </div>
  );
}
