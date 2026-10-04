/**
 * The frame's sidebar beside the rail: the factory picker, the start of a run in the factory picked, the factory's sections, the Inbox's
 * with how many of its cards are not yet started, and the favourites this browser keeps.
 */
import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { List, Star, Waypoints } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { inboxQuery } from '@/lib/api';
import { FAVORITES_KEY, favoritesOf, workflowAnchor, type Favorite } from '@/lib/favorites';
import { inboxBadgeTitle, notStarted } from '@/lib/inbox';
import { FactoryPicker } from './FactoryPicker';
import { FactoryStart } from './FactoryStart';
import { pickedOf, sectionLink, SECTIONS } from './nav';
import { routeLink } from './routeLink';

/** A place in the sidebar: its button, which is React Aria's link once it has an `href`, given the router's `to` and its preloading. */
const PlaceLink = routeLink(SidebarMenuButton);

/**
 * The sidebar at `path` with `search`: the picker of the factory the address picks (`pickedOf`), the start of a run in it, its sections,
 * each linked with the factory picked (`sectionLink`) and lit on its own pages, the Floor only once a factory is picked, the Inbox with its
 * badge (`InboxBadge`), and the favourites. A press anywhere in it runs `onPick`, which closes the sheet on a narrow screen.
 */
export function FrameSidebar({ path, search, onPick }: { path: string; search: Record<string, unknown>; onPick?: () => void }) {
  const picked = pickedOf(path, search);
  const favorites = useFavorites();
  const inbox = useInboxBadge(picked);
  return (
    <Sidebar collapsible="none" className="min-w-0 flex-1">
      <SidebarHeader className="gap-2">
        <FactoryPicker path={path} search={search} picked={picked} onPick={onPick} />
        <FactoryStart name={picked} onPress={onPick} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu aria-label="Sections">
              {SECTIONS.map((section) => {
                const link = sectionLink(section, picked);
                if (!link) return null;
                const badge = section.to === '/inbox' ? inbox : null;
                return (
                  <SidebarMenuItem key={section.to} title={badge?.title}>
                    <PlaceLink {...link} isActive={section.active(path)} onPress={onPick}>
                      <section.icon />
                      <span>{section.label}</span>
                    </PlaceLink>
                    {badge && <InboxBadge {...badge} />}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup data-favorites>
          <SidebarGroupLabel>
            <Star />
            Favorites
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <FavoriteLinks favorites={favorites} onPick={onPick} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

/**
 * What the Inbox's badge says: how many cards of the factory `picked` are not yet started (`notStarted`), every factory's under All
 * factories, and that count said whole (`inboxBadgeTitle`); null for none, nor before the inbox is read.
 */
function useInboxBadge(picked: string | undefined): { count: number; title: string } | null {
  const inbox = useQuery(inboxQuery);
  const count = inbox.data ? notStarted(inbox.data, picked).length : 0;
  return count ? { count, title: inboxBadgeTitle(count, picked) } : null;
}

/**
 * The Inbox's badge, beside its link and not in it, so the link reads its section's name alone: the count, said whole to a screen reader;
 * a press on it passes to the link beneath, and its Inbox's item says it whole on hover.
 */
function InboxBadge({ count, title }: { count: number; title: string }) {
  return (
    <SidebarMenuBadge data-inbox-badge>
      {count}
      <span className="sr-only"> {title}</span>
    </SidebarMenuBadge>
  );
}

/** Calls `onChange` each time another page of this browser changes what it keeps, and returns what stops it. */
const onStorage = (onChange: () => void) => {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
};

/** The favourites as this browser keeps them, as text; none where storage is refused. */
function storedFavorites(): string | null {
  try {
    return localStorage.getItem(FAVORITES_KEY);
  } catch {
    return null;
  }
}

/** None, where no browser keeps anything: a server's render. */
const noFavorites = () => null;

/** The favourites this browser keeps (`favoritesOf`), read again when another of its pages changes them. */
function useFavorites(): Favorite[] {
  return favoritesOf(useSyncExternalStore(onStorage, storedFavorites, noFavorites));
}

/**
 * The favourites, a link each — a run to its page, a workflow to its card on the Workflows page — or a line saying none is starred yet. A
 * press runs `onPick`.
 */
export function FavoriteLinks({ favorites, onPick }: { favorites: readonly Favorite[]; onPick?: () => void }) {
  if (!favorites.length) return <p className="px-2 text-xs text-muted-foreground">Nothing starred yet.</p>;
  return (
    <SidebarMenu aria-label="Favorites">
      {favorites.map((favorite) =>
        favorite.kind === 'run' ? (
          <SidebarMenuItem key={`run:${favorite.run}`}>
            <PlaceLink to="/runs/$runId" params={{ runId: favorite.run }} size="sm" onPress={onPick}>
              <List />
              <span className="truncate">{favorite.run}</span>
            </PlaceLink>
          </SidebarMenuItem>
        ) : (
          <SidebarMenuItem key={`workflow:${favorite.from}:${favorite.workflow}`}>
            <PlaceLink to="/workflows" search={{}} hash={workflowAnchor(favorite)} size="sm" onPress={onPick}>
              <Waypoints />
              <span className="truncate">
                {favorite.workflow}
                {favorite.from === 'yours' && <span className="text-muted-foreground"> (yours)</span>}
              </span>
            </PlaceLink>
          </SidebarMenuItem>
        ),
      )}
    </SidebarMenu>
  );
}
