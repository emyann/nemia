import { useRef, type CSSProperties } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet, redirect, useMatches, useRouter, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { FrameHeader } from '@/components/frame/FrameHeader';
import { FrameRail } from '@/components/frame/FrameRail';
import { FrameTabs } from '@/components/frame/FrameTabs';
import { FrameSheet } from '@/components/frame/FrameSheet';
import { FramePaneProvider, HerSheetProvider, useFrameFold } from '@/components/frame/HerSheet';
import { FactoryPane } from '@/components/frame/FactoryPane';
import { MachineBar } from '@/components/frame/MachineBar';
import { seatOf } from '@/components/nav/nav';
import { ariaNavigate } from '@/components/nav/ariaNavigate';
import { factoryRedirect } from '@/lib/factoryAddress';
import { LinkRefusal } from '@/components/frame/LinkRefusal';
import { NewerRelease } from '@/components/frame/NewerRelease';
import { SetupBanner } from '@/components/frame/SetupBanner';
import { ViewerSheet } from '@/components/view/ViewerSheet';
import { SnackbarRegion } from '@/components/ui/ds';
import { barSearch } from '@/lib/bar';
import { trySearch } from '@/lib/tryAddress';
import { viewSearch } from '@/lib/viewAddress';
import { useFeed } from '@/lib/useFeed';
import { NemiaChatProvider } from '@/lib/useNemiaChat';
import { useFrameSize } from '@/lib/useFrameSize';
import { useScrollMark } from '@/lib/useScrollMark';

/** Where the router's devtools button stands in a dev build: beside the query's, over the machine bar's left end. */
const ROUTER_TOOLS_AT: CSSProperties = { left: '4.5rem', bottom: '2.5rem' };

/**
 * The search every page reads: what the bar shows (`bar`), the try each step shows (`try`), and the file the viewer's sheet shows
 * (`view`). An address of before the factory's paths, which named its factory in `?factory=`, is loaded again at its path
 * (`factoryRedirect`), in its place in the history, so Back does not return to it.
 */
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  validateSearch: (search: Record<string, unknown>) => ({ ...barSearch(search), ...trySearch(search), ...viewSearch(search) }),
  beforeLoad: ({ location }) => {
    const href = factoryRedirect(location.pathname, location.search);
    if (href !== undefined) throw redirect({ href, replace: true });
  },
  component: Root,
});

/**
 * The frame of every page, the layout of a list-detail frame in its regions: the store's rail at the left (`FrameRail`), across every
 * factory, collapsed and never folding, a modal drawer on a narrow screen; on a factory's page (`seatOf`) the factory pane beside it
 * (`FrameFactoryPane`), folded where the person folds it (the menu button, Ctrl+B on a factory's page alone, which has the pane, this
 * browser's `sidebar_state` cookie, `paneOpenOf`, held by `FramePaneProvider`) and covered by the docked sheet under 1600 (`frameFold`);
 * then the page's column: its head (`FrameHeader`), as tall as `--frame-top`, naming the page, then the frame's lines: the line saying a
 * newer release is out where one is (`NewerRelease`), the line saying a run waits on a piece the server misses, linking to Setup
 * (`SetupBanner`), and a first-visit link refused on a board that asks no token (`LinkRefusal`). The lines are measured as they come and go
 * into `--frame-lines`, which a page that fills the window takes off its height beside `--frame-top` and `--frame-foot`, so no page's
 * height assumes they are not there. Then the page, under the strip of Settings' tabs on one of them (`FrameTabs`), in a centred column
 * unless a matched route's `staticData` asks for `fullBleed`. The page's column (`<main data-frame-page>`) is the named container
 * `@container/page`, and a page lays out by it (`@<size>/page:`), never by the window: beside the pane and the docked sheet it is narrower
 * than the window (`test/page-room.test.ts`). At the right of the frame's row, the frame's one side sheet (`FrameSheet`): docked, the third
 * pane at 1600 and wider, or the kit's modal sheet on a narrow screen. It shows one thing at a time: what the address's `?bar=` names
 * (`OpenBar`), the same on every page, which a link to another page, carrying no `bar`, closes; or else her chat, which her face, first in
 * the rail, opens in place of the bar, held over the whole frame (`HerSheetProvider`) so it stays open across pages, and closed when the
 * address comes to name a bar. On a page whose route's `staticData` says it `ownsChat`, the chat page, her chat is never drawn in the
 * sheet, the page being the panel itself. Under the row, across the whole window, the machine bar (`MachineBar`), as tall as
 * `--frame-foot`: what the machine is doing, its gauges and the pause of every factory. The frame follows the workflow feed once for the
 * whole page: what moves on it is read again at once, the polls slow while its stream is open, and the gauges say which. Her chat is held
 * over the whole frame too (`NemiaChatProvider`), one stream of hers for the visit, which the sheet and the chat page both read, so neither
 * a navigation nor a bar taking the sheet closes it or opens another. Over the page, the viewer's sheet shows the step's file the address's
 * `?view=` names (`ViewerSheet`), its own place, which Back closes. Over the machine bar, the frame's one host of the kit's snackbar
 * (`SnackbarRegion`), where a write whose thing leaves the page says so (`sayWritten`), so a snackbar outlives the page that wrote it. The
 * devtools of a dev build sit over the machine bar's left end. React Aria's `RouterProvider` sends every React Aria link, pressed with
 * Enter or clicked, through the router, so no link loads the whole page again.
 */
function Root() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = useMatches({ select: (matches) => matches.some((match) => match.staticData?.fullBleed) });
  const search: Record<string, unknown> = useRouterState({ select: (state) => state.location.search });
  const router = useRouter();
  const feed = useFeed();
  useScrollMark();
  const lines = useRef<HTMLDivElement>(null);
  const linesHeight = useFrameSize(lines, true).height;

  return (
    <AriaRouterProvider navigate={ariaNavigate(router)}>
      <NemiaChatProvider>
        <HerSheetProvider>
          <FramePaneProvider shortcut={seatOf(path)?.level === 'factory'}>
            <div className="flex min-h-svh w-full flex-col">
              <div data-frame-row className="flex min-h-[calc(100svh-var(--frame-foot))] w-full">
                <FrameRail path={path} search={search} />
                <FrameFactoryPane path={path} search={search} />
                <div className="flex min-w-0 flex-1 flex-col" style={{ '--frame-lines': `${linesHeight}px` } as CSSProperties}>
                  <FrameHeader path={path} />
                  <main data-frame-page className="@container/page relative flex min-w-0 flex-1 flex-col bg-background">
                    <div ref={lines} data-frame-lines>
                      <NewerRelease />
                      <SetupBanner path={path} />
                      <div className="px-4 py-2 empty:hidden">
                        <LinkRefusal />
                      </div>
                    </div>
                    <FrameTabs path={path}>
                      {fullBleed ? (
                        <Outlet />
                      ) : (
                        <div className="mx-auto w-full max-w-4xl px-4 py-6">
                          <Outlet />
                        </div>
                      )}
                    </FrameTabs>
                  </main>
                </div>
                <FrameSheet path={path} feed={feed} />
              </div>
              <MachineBar path={path} feed={feed} />
              <ViewerSheet />
              <SnackbarRegion className="bottom-[calc(var(--frame-foot)+1rem)]" />
            </div>
          </FramePaneProvider>
        </HerSheetProvider>
      </NemiaChatProvider>
      <ReactQueryDevtools buttonPosition="bottom-left" />
      <TanStackRouterDevtools position="bottom-left" toggleButtonProps={{ style: ROUTER_TOOLS_AT }} />
    </AriaRouterProvider>
  );
}

/** The factory pane of the page at `path` with `search`, where the frame docks it (`frameFold`): a factory's page, open, uncovered. */
function FrameFactoryPane({ path, search }: { path: string; search: Record<string, unknown> }) {
  const fold = useFrameFold();
  const seat = seatOf(path);
  if (fold.pane !== 'docked' || seat?.level !== 'factory') return null;
  return <FactoryPane path={path} search={search} factory={seat.factory} lit={seat.place} />;
}
