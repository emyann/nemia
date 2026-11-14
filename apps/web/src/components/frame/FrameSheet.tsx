/**
 * The frame's one side sheet: the kit's standard side sheet, 400 wide, docked in the frame's row at the right of the page, the page
 * narrowing beside it, or on a narrow screen the kit's modal sheet over the page. It shows one thing at a time (`FrameFold.shows`): what
 * the address's `?bar=` names (`OpenBar`), on every page, or else Nemia's chat (`HerPanel`) where her face opened it, off her own page
 * (`/chat`), which is the panel itself. Each holds its own header, so the kit's sheet is given no title and draws no header of its own.
 */
import { SideSheet } from '@/components/ui/ds';
import { useIsMobile } from '@/hooks/use-mobile';
import { BAR_NAMES } from '@/lib/bar';
import type { FeedStatus } from '@/lib/feed';
import { useBar } from '@/lib/useBar';
import { OpenBar } from '../factory/OpenBar';
import { HerPanel, useFrameFold, useHerSheet } from './HerSheet';

/**
 * The modal sheet stands at the window's right, leaving the kit's 56 pixels of scrim at its left: the kit's own floor of 360 pixels is
 * wider than that on a phone, and its sheet then stands short of the right edge, so the floor is lifted and the sheet pushed right.
 */
const MODAL_AT_THE_RIGHT = 'ml-auto min-w-0';

/** The frame's sheet at the page at `path` with `search`, the gauges a bar shows saying `feed`. */
export function FrameSheet({ path, search, feed }: { path: string; search: Record<string, unknown>; feed: FeedStatus }) {
  const her = useHerSheet();
  const bar = useBar();
  const fold = useFrameFold();
  const narrow = useIsMobile();
  const close = fold.shows === 'bar' ? bar.close : her.close;
  const content =
    fold.shows === 'bar' ? (
      <OpenBar feed={feed} />
    ) : fold.shows === 'her' ? (
      <HerPanel path={path} search={search} onClose={her.close} />
    ) : null;
  if (narrow)
    return (
      <SideSheet
        variant="modal"
        isOpen={fold.sheet === 'modal'}
        onClose={close}
        aria-label={bar.open ? BAR_NAMES[bar.open.kind] : "Nemia's chat"}
        className={MODAL_AT_THE_RIGHT}
      >
        {fold.sheet === 'modal' && content}
      </SideSheet>
    );
  return (
    <div data-frame-sheet={fold.sheet} data-sheet-shows={fold.shows} className="sticky top-0 z-30 h-svh shrink-0 self-start">
      <SideSheet
        variant="standard"
        isOpen={fold.sheet === 'docked'}
        className="h-svh w-[400px] min-w-[400px] rounded-none border-l border-outline-variant bg-surface"
      >
        {fold.sheet === 'docked' && content}
      </SideSheet>
    </div>
  );
}
