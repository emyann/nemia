import { useRef, type CSSProperties } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet, useMatches, useRouter, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { FrameHeader } from '@/components/frame/FrameHeader';
import { FrameRail } from '@/components/frame/FrameRail';
import { FrameTabs } from '@/components/frame/FrameTabs';
import { LinkRefusal } from '@/components/frame/LinkRefusal';
import { NewerRelease } from '@/components/frame/NewerRelease';
import { SetupBanner } from '@/components/frame/SetupBanner';
import { DOCK_ROOM, NemiaDock } from '@/components/nemia/NemiaDock';
import { OpenBar } from '@/components/factory/OpenBar';
import { ViewerSheet } from '@/components/view/ViewerSheet';
import { SidebarProvider, sidebarOpenOf } from '@/components/ui/sidebar';
import { barSearch } from '@/lib/bar';
import { trySearch } from '@/lib/tryAddress';
import { viewSearch } from '@/lib/viewAddress';
import { useFeed } from '@/lib/useFeed';
import { NemiaChatProvider } from '@/lib/useNemiaChat';
import { useFrameSize } from '@/lib/useFrameSize';
import { useScrollMark } from '@/lib/useScrollMark';

/**
 * The search every page reads: what the bar shows (`bar`), the try each step shows (`try`), and the file the viewer's sheet shows
 * (`view`).
 */
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  validateSearch: (search: Record<string, unknown>) => ({ ...barSearch(search), ...trySearch(search), ...viewSearch(search) }),
  component: Root,
});

/**
 * The frame of every page: the rail at the left, the whole height of the window (`FrameRail`), open or closed as this browser's
 * `sidebar_state` cookie last left it (`sidebarOpenOf`), a modal drawer on a narrow screen; beside it the top bar (`FrameHeader`), as tall
 * as `--frame-top`, naming the page, then the frame's lines: the line saying a newer release is out where one is (`NewerRelease`), the
 * line saying a run waits on a piece the server misses, linking to Setup (`SetupBanner`), and a first-visit link refused on a board that
 * asks no token (`LinkRefusal`). The lines are measured as they come and go into `--frame-lines`, which a page that fills the window
 * takes off its height beside `--frame-top`, so no page's height assumes they are not there. Then the page, under the strip of Settings'
 * tabs on one of them (`FrameTabs`), in a centred column unless a matched route's `staticData` asks for `fullBleed`. Over the page, under
 * the top bar, the floating bar (`OpenBar`) shows what the address's `?bar=` names, the same on every page, and a link to another page,
 * which carries no `bar`, closes it. Over that, the viewer's sheet shows the step's file the address's `?view=` names (`ViewerSheet`), its
 * own place, which Back closes. It follows the workflow feed once for the whole page: what moves on it is read again at once, the
 * polls slow while it is open, and the gauges say which. Her chat is held over the whole frame too (`NemiaChatProvider`), one stream of
 * hers for the visit, which her docked face and the chat page both read, so a navigation neither closes it nor opens another; her docked
 * face is drawn on every page but one whose route's `staticData` says it `ownsChat`, the chat page, which is the panel itself. Under every
 * page it is drawn over, the page ends on room as tall as her face and its gap to the window's foot (`DOCK_ROOM`), so a page scrolled to
 * its end shows its last line above her. React Aria's `RouterProvider` sends every React Aria link, pressed with Enter or clicked,
 * through the router, so no link loads the whole page again.
 */
function Root() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = useMatches({ select: (matches) => matches.some((match) => match.staticData?.fullBleed) });
  const ownsChat = useMatches({ select: (matches) => matches.some((match) => match.staticData?.ownsChat) });
  const search: Record<string, unknown> = useRouterState({ select: (state) => state.location.search });
  const router = useRouter();
  const feed = useFeed();
  useScrollMark();
  const lines = useRef<HTMLDivElement>(null);
  const linesHeight = useFrameSize(lines, true).height;

  return (
    <AriaRouterProvider navigate={(href) => void router.navigate({ href })}>
      <NemiaChatProvider>
        <SidebarProvider defaultOpen={sidebarOpenOf(document.cookie)}>
          <FrameRail path={path} search={search} />
          <div className="flex min-w-0 flex-1 flex-col" style={{ '--frame-lines': `${linesHeight}px` } as CSSProperties}>
            <FrameHeader path={path} search={search} feed={feed} />
            <main
              data-frame-page
              style={ownsChat ? undefined : { paddingBottom: DOCK_ROOM }}
              className="relative flex min-w-0 flex-1 flex-col bg-background"
            >
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
        </SidebarProvider>
        <OpenBar feed={feed} />
        <ViewerSheet />
        {!ownsChat && <NemiaDock path={path} search={search} />}
      </NemiaChatProvider>
      <ReactQueryDevtools buttonPosition="bottom-left" />
      <TanStackRouterDevtools position="bottom-right" />
    </AriaRouterProvider>
  );
}
