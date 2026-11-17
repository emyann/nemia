import { useQuery } from '@tanstack/react-query';
import { Link, ListItem } from '@/components/ui/ds';
import { factoriesQuery } from '@/lib/api/factories';
import { inboxQuery } from '@/lib/api/inbox';
import { waitingProposalsQuery } from '@/lib/api/proposals';
import { notStarted } from '@/lib/inbox';
import { cn } from '@/lib/utils';
import { FactoryPicker } from '../factory/FactoryPicker';
import { PaneStart } from '../factory/FactoryStart';
import { frameRunsQuery, PANE_PLACES, type PanePlace, placeHref } from '../nav/nav';

/**
 * What a place of the pane says under its name: Runs how many wait on the person, off the frame's one count of the runs (`frameRunsQuery`),
 * the Inbox how many cards are not started, and Proposals how many proposals wait on the person, asked of the api by phase
 * (`waitingProposalsQuery`) and never as the whole list, read for a factory a person made alone, the default factory having none; none
 * for any other place, or before they are read.
 */
function usePlaceLines(path: string, factory: string): Partial<Record<PanePlace, string>> {
  const runs = useQuery(frameRunsQuery(path)).data;
  const inbox = useQuery(inboxQuery).data;
  const place = useQuery(factoriesQuery).data?.find((f) => f.name === factory);
  const proposals = useQuery({ ...waitingProposalsQuery(factory), enabled: place !== undefined && !place.default }).data;
  const cards = inbox ? notStarted(inbox, factory).length : undefined;
  const waiting = place?.default ? 0 : proposals?.length;
  return {
    ...(runs && { runs: runs.counts.waiting > 0 ? `${runs.counts.waiting} waiting on you` : 'nothing waits on you' }),
    ...(cards !== undefined && { inbox: cards > 0 ? `${cards} not started` : 'every card started' }),
    ...(waiting !== undefined && { proposals: waiting > 0 ? `${waiting} wait on you` : 'none waiting' }),
  };
}

/**
 * The places of `factory`'s pane, each the kit's link to its page under the factory's path (`placeHref`), which the root's `RouterProvider`
 * navigates, the one the page sits at (`lit`)
 * selected, on `secondary-container`, and said current to a screen reader; a place pressed calls `onPicked`, which closes a drawer.
 */
function PanePlaces({ path, factory, lit, onPicked }: { path: string; factory: string; lit: PanePlace; onPicked?: () => void }) {
  const lines = usePlaceLines(path, factory);
  return (
    <nav aria-label={`${factory}'s places`} className="flex flex-col gap-0.5">
      {PANE_PLACES.map((place) => (
        <Link
          key={place.id}
          href={placeHref(place.id, factory)}
          data-pane-place={place.id}
          onPress={onPicked}
          aria-current={place.id === lit ? 'page' : undefined}
          color="inherit"
          underline="hover"
          className="block rounded-shape-full data-focus-visible:no-underline data-hovered:no-underline"
        >
          <ListItem
            headline={<span className="text-body-large">{place.label}</span>}
            supportingText={lines[place.id]}
            className={cn(
              'min-h-12 rounded-shape-full py-1.5',
              place.id === lit ? 'bg-secondary-container text-on-secondary-container' : 'hover:bg-surface-container-high',
            )}
          />
        </Link>
      ))}
    </nav>
  );
}

/**
 * The factory pane, one factory's: the list pane of the frame's list-detail layout, 360 wide on `surface-container-low`. At its head the
 * switcher (`FactoryPicker`) on `surface-container-high`, then Start a run (`PaneStart`); under them the factory's places (`PanePlaces`),
 * the one the page at `path` sits at lit. Docked, it stands as tall as the window less the machine bar; in the narrow screen's drawer
 * (`inDrawer`) it takes the drawer's height, and a place pressed closes the drawer (`onPicked`).
 */
export function FactoryPane({
  path,
  search,
  factory,
  lit,
  inDrawer = false,
  onPicked,
}: {
  path: string;
  search: Record<string, unknown>;
  factory: string;
  lit: PanePlace;
  inDrawer?: boolean;
  onPicked?: () => void;
}) {
  return (
    <aside
      data-factory-pane={factory}
      aria-label={`The factory ${factory}`}
      className={cn(
        'flex shrink-0 flex-col gap-3 bg-surface-container-low p-3',
        inDrawer ? 'w-full' : 'sticky top-0 z-20 h-[calc(100svh-var(--frame-foot))] w-[360px] self-start overflow-y-auto',
      )}
    >
      <div data-pane-head className="flex flex-col gap-3 rounded-shape-large bg-surface-container-high p-3">
        <FactoryPicker path={path} search={search} picked={factory} />
        <PaneStart name={factory} />
      </div>
      <PanePlaces path={path} factory={factory} lit={lit} onPicked={onPicked} />
    </aside>
  );
}
