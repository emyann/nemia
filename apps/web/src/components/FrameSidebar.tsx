/**
 * The frame's sidebar beside the rail: the factory picker, the start of a run in the factory picked, the factory's sections, the Inbox's
 * with how many of its cards are not yet started, and the favourites this browser keeps: every factory's, in the order starred, each by
 * its title, one gone said so, each with a star that takes it off.
 */
import { useQueries, useQuery } from '@tanstack/react-query';
import { List, Star, Waypoints } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { inboxQuery, openRunsQuery, runQuery, workflowsQuery } from '@/lib/api';
import { openRows } from '@/lib/factory';
import { favoriteRows, ownReads, type Favorite, type FavoriteRow } from '@/lib/favorites';
import { inboxBadgeTitle, notStarted } from '@/lib/inbox';
import { toggleFavorite, useFavorites } from '@/lib/useFavorites';
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
  const { favorites } = useFavorites();
  const rows = useFavoriteRows(favorites);
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
            <FavoriteLinks rows={rows} onPick={onPick} />
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

/**
 * The sidebar's row of each favourite (`favoriteRows`): a run by its title, off the light answer while it waits or moves, else off its own
 * record, read once the light answer is read or has failed and never polled; gone once that read finds no such run. Each read is made
 * only while something of its kind is starred.
 */
function useFavoriteRows(favorites: readonly Favorite[]): FavoriteRow[] {
  const starred = favorites.flatMap((favorite) => (favorite.kind === 'run' ? [favorite.run] : []));
  const open = useQuery({ ...openRunsQuery(), enabled: starred.length > 0 });
  const workflows = useQuery({ ...workflowsQuery, enabled: favorites.some((favorite) => favorite.kind === 'workflow') });
  const rows = open.data && openRows(open.data);
  const settled = open.data !== undefined || open.isError;
  const apart = settled ? starred.filter((id) => !rows?.some((row) => row.id === id)) : [];
  const own = useQueries({
    queries: apart.map((id) => ({ ...runQuery(id), refetchInterval: false as const })),
    combine: (results) => ownReads(apart, results),
  });
  return favoriteRows(favorites, rows, own, workflows.data);
}

/** The key a favourite's row is drawn under: its kind and every key it is known by. */
const rowKey = (favorite: Favorite): string =>
  favorite.kind === 'run' ? `run:${favorite.run}` : `workflow:${favorite.from}:${favorite.workflow}`;

/** How a favourite is named to a person: a run by its title, a workflow by its name, yours said so. */
const rowName = ({ favorite, title }: FavoriteRow): string =>
  favorite.kind === 'workflow' && favorite.from === 'yours' ? `${title} (yours)` : title;

/**
 * The favourites (`rows`), each with a star that takes it off, shown on hover: a run a link to its page, read by its title with its id on
 * hover; a workflow a link to its page; one the api no longer lists said gone, no link, its star always shown. None
 * starred says so. A press on a link runs `onPick`.
 */
export function FavoriteLinks({ rows, onPick }: { rows: readonly FavoriteRow[]; onPick?: () => void }) {
  if (!rows.length) return <p className="px-2 text-xs text-muted-foreground">Nothing starred yet.</p>;
  return (
    <SidebarMenu aria-label="Favorites">
      {rows.map((row) => (
        <SidebarMenuItem
          key={rowKey(row.favorite)}
          data-favorite={row.favorite.kind}
          data-gone={row.gone || undefined}
          title={row.gone ? `${rowName(row)}: the api no longer lists it` : row.favorite.kind === 'run' ? row.favorite.run : undefined}
        >
          {row.gone ? <GoneRow row={row} /> : <FavoriteLink row={row} onPick={onPick} />}
          <SidebarMenuAction showOnHover={!row.gone} aria-label={`Unstar ${rowName(row)}`} onPress={() => toggleFavorite(row.favorite)}>
            <Star className="fill-foreground text-foreground" />
          </SidebarMenuAction>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

/** A favourite the api lists, a link: a run to its page, a workflow to its own, yours said so. */
function FavoriteLink({ row: { favorite, title }, onPick }: { row: FavoriteRow; onPick?: () => void }) {
  if (favorite.kind === 'run')
    return (
      <PlaceLink to="/runs/$runId" params={{ runId: favorite.run }} size="sm" onPress={onPick}>
        <List />
        <span className="truncate">{title}</span>
      </PlaceLink>
    );
  return (
    <PlaceLink to="/workflows/$from/$workflow" params={{ from: favorite.from, workflow: favorite.workflow }} size="sm" onPress={onPick}>
      <Waypoints />
      <span className="truncate">
        {title}
        {favorite.from === 'yours' && <span className="text-muted-foreground"> (yours)</span>}
      </span>
    </PlaceLink>
  );
}

/** A favourite the api no longer lists: its id or name, muted, and the word gone, linking nowhere. */
function GoneRow({ row }: { row: FavoriteRow }) {
  const Icon = row.favorite.kind === 'run' ? List : Waypoints;
  return (
    <div className="flex h-7 items-center gap-2 p-2 pr-8 text-xs text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
      <Icon />
      <span className="min-w-0 truncate line-through decoration-muted-foreground/50">{rowName(row)}</span>
      <span className="shrink-0">gone</span>
    </div>
  );
}
