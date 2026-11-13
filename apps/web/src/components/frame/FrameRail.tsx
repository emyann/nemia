import { useQuery } from '@tanstack/react-query';
import { PanelLeft } from 'lucide-react';
import { IconButton, NavigationDrawer, type NavigationItem, NavigationRail } from '@/components/ui/ds';
import { useSidebar } from '@/components/ui/sidebar';
import { factoriesQuery } from '@/lib/api/factories';
import { inboxQuery } from '@/lib/api/inbox';
import { factoriesShown } from '@/lib/factories';
import { inboxBadgeTitle, notStarted } from '@/lib/inbox';
import { cn } from '@/lib/utils';
import { StartFab } from '../factory/FactoryStart';
import { NemiaRailFace } from '../nemia/NemiaRailFace';
import { useNemiaPresence } from '../nemia/useNemiaPresence';
import { useFrameFold, useHerSheet, useOwnsChat } from './HerSheet';
import { destinationHref, destinationOf, DESTINATIONS, frameRunsQuery, pickedOf } from '../nav/nav';

/** What the Runs badge says to a screen reader: how many runs wait on you. */
const waitingTitle = (count: number): string => `${count} ${count === 1 ? 'waits' : 'wait'} on you`;

/**
 * The rail's destinations (`DESTINATIONS`) at `path` with `search`, `picked` the factory the address picks: each a link where
 * `destinationHref` says, Runs counting the runs that wait on you and the Inbox its cards not yet started, both the api's, read as their
 * pages read them — Runs off the frame's one count of the runs (`frameRunsQuery`), which Nemia's cue reads too — and none before they
 * are read.
 */
function useRailItems(path: string, search: Record<string, unknown>): NavigationItem[] {
  const picked = pickedOf(path, search);
  const runs = useQuery(frameRunsQuery(path, search));
  const inbox = useQuery(inboxQuery);
  const factories = useQuery(factoriesQuery);
  const first = factories.data ? factoriesShown(factories.data, false)[0]?.name : undefined;
  const waiting = runs.data?.counts.waiting ?? 0;
  const cards = inbox.data ? notStarted(inbox.data, picked).length : 0;
  const counts: Record<string, { badge: number; badgeLabel: string }> = {
    runs: { badge: waiting, badgeLabel: waitingTitle(waiting) },
    inbox: { badge: cards, badgeLabel: inboxBadgeTitle(cards, picked) },
  };
  return DESTINATIONS.map(({ id, label, icon }) => ({
    id,
    label,
    icon,
    href: destinationHref(id, picked, first),
    ...(counts[id]?.badge ? counts[id] : {}),
  }));
}

/**
 * The button that opens and closes the rail, or on a narrow screen its drawer: named for what a press does. While the rail is narrow only
 * for her side sheet (`foldedForSheet`), a press asks for it back beside the sheet and writes no `sidebar_state` cookie, the person's fold
 * being open already.
 */
export function MenuButton() {
  const { isMobile, openMobile, toggleSidebar } = useSidebar();
  const fold = useFrameFold();
  const { askRail } = useHerSheet();
  const shown = isMobile ? openMobile : fold.rail === 'expanded';
  return (
    <IconButton
      data-menu-button
      variant="standard"
      icon={PanelLeft}
      aria-label={shown ? 'Close the menu' : 'Open the menu'}
      aria-expanded={shown}
      onPress={!isMobile && fold.foldedForSheet ? askRail : toggleSidebar}
    />
  );
}

/** Nemia's face at the page at `path` with `search`, which opens and closes her side sheet (`HerSheet`). */
export function HerFace({ path, search }: { path: string; search: Record<string, unknown> }) {
  const sheet = useHerSheet();
  const presence = useNemiaPresence(path, search);
  const ownsChat = useOwnsChat();
  return <NemiaRailFace presence={presence} open={sheet.open} ownsChat={ownsChat} onToggle={sheet.toggle} />;
}

/**
 * The frame's rail at `path` with `search`, the whole height of the window at its left: Nemia's face (`HerFace`), then the menu button
 * and the FAB that starts a run (`StartFab`) above the kit's `NavigationRail`, 97 pixels closed and 221 open, with its labels beside the
 * icons, as this browser's `sidebar_state` cookie last left it, or narrow while her side sheet is open beside a page under 1600
 * (`useFrameFold`); the destination the page lights is lit. On a narrow screen the rail leaves the page's side, and the menu button of
 * the top bar opens the same destinations in the kit's modal drawer, which a pick closes.
 */
export function FrameRail({ path, search }: { path: string; search: Record<string, unknown> }) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const open = useFrameFold().rail === 'expanded';
  const picked = pickedOf(path, search);
  const items = useRailItems(path, search);
  const selected = destinationOf(path)?.id ?? null;
  if (isMobile)
    return (
      <NavigationDrawer
        variant="modal"
        aria-label="Places"
        headline="Nemia"
        isOpen={openMobile}
        onClose={() => setOpenMobile(false)}
        items={items}
        selectedKey={selected}
      />
    );
  return (
    <div
      data-frame-rail
      data-state={open ? 'expanded' : 'collapsed'}
      className="sticky top-0 z-30 flex h-svh shrink-0 border-r border-outline-variant bg-surface"
    >
      <div data-rail-scroll className="flex min-h-0 flex-col overflow-y-auto">
        <div className={cn('flex flex-col gap-1.5 pt-2.5 pb-3.5', open ? 'items-start px-5' : 'items-center')}>
          <span className={cn('flex pt-1 pb-2', open ? 'px-1' : 'justify-center')}>
            <HerFace path={path} search={search} />
          </span>
          <MenuButton />
          <StartFab name={picked} isExtended={open} />
        </div>
        <NavigationRail aria-label="Places" items={items} selectedKey={selected} isExpanded={open} className="h-auto flex-1" />
      </div>
    </div>
  );
}
