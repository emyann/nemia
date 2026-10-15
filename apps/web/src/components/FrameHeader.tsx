import { PageName } from '@/components/look';
import { Avatar, SearchBar } from '@/components/ui/ds';
import { useSidebar } from '@/components/ui/sidebar';
import type { FeedStatus } from '@/lib/feed';
import { FactoryPicker } from './FactoryPicker';
import { MenuButton } from './FrameRail';
import { GaugesButton } from './GaugesButton';
import { destinationOf, pickedOf } from './nav';
import { PauseButton } from './PauseButton';

/**
 * The search, drawn as the canvas draws it and not built yet: the kit's search bar, disabled, so it takes no focus and no text, and says
 * so to the eye in its hint and to a screen reader in its name.
 */
function SearchToCome() {
  return (
    <SearchBar
      data-search-to-come
      isDisabled
      placeholder="Search · to come"
      aria-label="Search, not built yet"
      className="hidden w-90 min-w-40 shrink lg:flex"
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
 * The frame's top bar, across the top of the page beside the rail, as tall as `--frame-top` says: the page's name (`PageName`), the
 * destination the page at `path` lights, none on an address no route has; the factory switcher (`FactoryPicker`) of the factory the
 * address with `search` picks; then at its right the search and the account, both to come, the pause of every factory (`PauseButton`) and
 * the machine's gauges (`GaugesButton`, which carries `feed`). On a narrow screen the menu button that opens the drawer of destinations
 * comes first, and the bar takes two lines.
 */
export function FrameHeader({ path, search, feed }: { path: string; search: Record<string, unknown>; feed: FeedStatus }) {
  const { isMobile } = useSidebar();
  const name = destinationOf(path)?.label;
  return (
    <header
      data-frame-header
      className="sticky top-0 z-20 flex h-(--frame-top) shrink-0 flex-wrap content-center items-center gap-x-3 gap-y-2 border-b border-outline-variant bg-surface px-6 py-2 max-md:px-3 md:flex-nowrap"
    >
      {isMobile && <MenuButton />}
      {name && <PageName>{name}</PageName>}
      {isMobile && <span className="basis-full" />}
      <div className="min-w-0 max-md:flex-1 md:ml-4">
        <FactoryPicker path={path} search={search} picked={pickedOf(path, search)} />
      </div>
      <span className="min-w-0 flex-1 max-md:hidden" />
      <SearchToCome />
      <PauseButton />
      <GaugesButton feed={feed} />
      <AccountToCome />
    </header>
  );
}
