import { PageName } from '@/components/look';
import { useSidebar } from '@/components/ui/sidebar';
import { HerFace, MenuButton } from './FrameRail';
import { PANE_PLACES, RAIL_GROUPS, type Seat, seatOf } from '../nav/nav';

/**
 * The name of the page that sits at `seat`: the place of its factory's pane, the rail's destination it sits under, Nemia on her chat's
 * page; none for no seat.
 *
 * @param seat where the page sits
 */
export function seatName(seat: Seat | undefined): string | undefined {
  if (seat === undefined) return undefined;
  if (seat.level === 'factory') return PANE_PLACES.find((place) => place.id === seat.place)?.label;
  if (seat.rail === 'nemia') return 'Nemia';
  return RAIL_GROUPS.flatMap((group) => group.items).find((item) => item.id === seat.rail)?.label;
}

/**
 * The page's head, across the top of the page's column, one line as tall as `--frame-top`: the page's name (`PageName`, `seatName`), none
 * on an address no route has. On a narrow screen the menu button that opens the drawer comes first, and Nemia's face beside it
 * (`HerFace`), the rail that holds it elsewhere being a drawer there. The machine's gauges and the pause stand in the machine bar at the
 * window's foot (`MachineBar`), the factory switcher in the factory pane (`FactoryPane`).
 */
export function FrameHeader({ path }: { path: string }) {
  const { isMobile } = useSidebar();
  const name = seatName(seatOf(path));
  return (
    <header
      data-frame-header
      className="sticky top-0 z-20 flex h-(--frame-top) shrink-0 items-center gap-3 bg-background px-6 max-md:px-3"
    >
      {isMobile && <MenuButton />}
      {isMobile && <HerFace path={path} />}
      {name && <PageName>{name}</PageName>}
    </header>
  );
}
