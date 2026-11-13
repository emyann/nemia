import { useRef } from 'react';
import { PageName } from '@/components/look';
import { Avatar, SearchBar } from '@/components/ui/ds';
import { useSidebar } from '@/components/ui/sidebar';
import type { FeedStatus } from '@/lib/feed';
import { useFrameSize } from '@/lib/useFrameSize';
import { cn } from '@/lib/utils';
import { FactoryPicker } from '../factory/FactoryPicker';
import { HerFace, MenuButton } from './FrameRail';
import { GaugesButton } from './GaugesButton';
import { destinationOf, pickedOf } from '../nav/nav';
import { PauseButton } from './PauseButton';

/**
 * The search, drawn as the canvas draws it and not built yet: the kit's search bar, disabled, so it takes no focus and no text, and says
 * so to the eye in its hint and to a screen reader in its name.
 */
function SearchToCome({ shown }: { shown: boolean }) {
  return (
    <SearchBar
      data-search-to-come
      isDisabled
      placeholder="Search · to come"
      aria-label="Search, not built yet"
      className={cn('w-90 min-w-40 shrink', shown ? 'flex' : 'hidden')}
    />
  );
}

/**
 * The account, drawn as the canvas draws it and not built yet: the kit's avatar with an initial, an image that takes no focus and no
 * press, named so to a screen reader and on hover.
 */
function AccountToCome() {
  return (
    <span data-account-to-come title="Account · to come" className="inline-flex shrink-0 cursor-default">
      <Avatar alt="Account, not built yet" fallback="Y" size={32} />
    </span>
  );
}

/**
 * How wide the bar must be to hold everything on one line, in pixels: what it is beside an open rail on a window 80rem wide, where one
 * line was first measured to hold. Narrower, the page's name stands over the rest.
 */
const ONE_LINE = 1056;

/** How wide the bar must be to show the search, in pixels: what it is beside an open rail on a window 64rem wide. */
const SEARCH_ROOM = 800;

/**
 * The frame's top bar, across the top of the page beside the rail, as tall as `--frame-top` says: the page's name (`PageName`), the
 * destination the page at `path` lights, none on an address no route has; the factory switcher (`FactoryPicker`) of the factory the
 * address with `search` picks; then at its right the search and the account, both to come, the pause of every factory (`PauseButton`) and
 * the machine's gauges (`GaugesButton`, which carries `feed`). The bar decides by its own width, never the window's, since the rail and
 * Nemia's docked sheet take the window's room beside it: under `ONE_LINE` it takes two lines, the page's name over the rest, and says so
 * (`data-lines`), which sets `--frame-top` for every page and bar under it (`src/styles.css`); under `SEARCH_ROOM` the search, which
 * is to come, is left out. On a narrow screen the menu button that opens the drawer of
 * destinations comes first, and Nemia's face beside it (`HerFace`), the rail that holds it elsewhere being a drawer there.
 */
export function FrameHeader({ path, search, feed }: { path: string; search: Record<string, unknown>; feed: FeedStatus }) {
  const { isMobile } = useSidebar();
  const name = destinationOf(path)?.label;
  const bar = useRef<HTMLElement>(null);
  const { width } = useFrameSize(bar, true);
  const oneLine = width >= ONE_LINE;
  return (
    <header
      ref={bar}
      data-frame-header
      data-lines={oneLine ? 'one' : 'two'}
      className={cn(
        'sticky top-0 z-20 flex h-(--frame-top) shrink-0 flex-wrap content-center items-center gap-x-3 gap-y-2 border-b border-outline-variant bg-surface px-6 py-2 max-md:px-3',
        oneLine && 'flex-nowrap',
      )}
    >
      {isMobile && <MenuButton />}
      {isMobile && <HerFace path={path} search={search} />}
      {name && <PageName>{name}</PageName>}
      {!oneLine && <span className="basis-full" />}
      <div className={cn('min-w-0 max-md:flex-1 md:shrink-0', oneLine && 'ml-4')}>
        <FactoryPicker path={path} search={search} picked={pickedOf(path, search)} />
      </div>
      <span className="min-w-0 flex-1 max-md:hidden" />
      <SearchToCome shown={width >= SEARCH_ROOM} />
      <PauseButton />
      <GaugesButton feed={feed} />
      <AccountToCome />
    </header>
  );
}
