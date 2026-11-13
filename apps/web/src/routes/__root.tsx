import { useRef, type CSSProperties } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet, useMatches, useRouter, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { FrameHeader } from '@/components/frame/FrameHeader';
import { FrameRail } from '@/components/frame/FrameRail';
import { FrameTabs } from '@/components/frame/FrameTabs';
import { FrameSheet } from '@/components/frame/FrameSheet';
import { HerSheetProvider } from '@/components/frame/HerSheet';
import { LinkRefusal } from '@/components/frame/LinkRefusal';
import { NewerRelease } from '@/components/frame/NewerRelease';
import { SetupBanner } from '@/components/frame/SetupBanner';
import { SidebarProvider, sidebarOpenOf } from '@/components/ui/sidebar';
import { barSearch } from '@/lib/bar';
import { useFeed } from '@/lib/useFeed';
import { NemiaChatProvider } from '@/lib/useNemiaChat';
import { useFrameSize } from '@/lib/useFrameSize';
import { useScrollMark } from '@/lib/useScrollMark';

/** Where the router's devtools button stands in a dev build: at the rail's foot beside the query's, over neither her face nor her sheet. */
const ROUTER_TOOLS_AT: CSSProperties = { left: '4.5rem' };

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  validateSearch: barSearch,
  component: Root,
});

/**
 * The frame of every page: the rail at the left, the whole height of the window (`FrameRail`), open or closed as this browser's
 * `sidebar_state` cookie last left it (`sidebarOpenOf`), a modal drawer on a narrow screen; beside it the top bar (`FrameHeader`), as tall
 * as `--frame-top`, naming the page, then the frame's lines: the line saying a newer release is out where one is (`NewerRelease`), the
 * line saying a run waits on a piece the server misses, linking to Setup (`SetupBanner`), and a first-visit link refused on a board that
 * asks no token (`LinkRefusal`). The lines are measured as they come and go into `--frame-lines`, which a page that fills the window
 * takes off its height beside `--frame-top`, so no page's height assumes they are not there. Then the page, under the strip of Settings'
 * tabs on one of them (`FrameTabs`), in a centred column unless a matched route's `staticData` asks for `fullBleed`. At the right of the
 * frame's row, the frame's one side sheet (`FrameSheet`): docked, the page narrowing beside it and the rail folding for it under 1600
 * (`frameFold`), or the kit's modal sheet on a narrow screen. It shows one thing at a time: what the address's `?bar=` names (`OpenBar`),
 * the same on every page, which a link to another page, carrying no `bar`, closes; or else her chat, which her face, first in the rail,
 * opens in place of the bar, held over the whole frame (`HerSheetProvider`) so it stays open across pages, and closed when the address
 * comes to name a bar. On a page whose route's `staticData` says it `ownsChat`, the chat page, her chat is never drawn in the sheet, the
 * page being the panel itself. The frame follows the workflow feed once for the whole page: what moves on it is read again at once, the
 * polls slow while its stream is open, and the gauges say which. Her chat is held over the whole frame too (`NemiaChatProvider`), one
 * stream of hers for the visit, which the sheet and the chat page both read, so neither a navigation nor a bar taking the sheet closes it
 * or opens another. The devtools of a dev build sit at the rail's foot, over neither her face nor her sheet. React Aria's
 * `RouterProvider` sends every React Aria link, pressed with Enter or clicked, through the router, so no link loads the whole page again.
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
    <AriaRouterProvider navigate={(href) => void router.navigate({ href })}>
      <NemiaChatProvider>
        <HerSheetProvider>
          <SidebarProvider defaultOpen={sidebarOpenOf(document.cookie)}>
            <FrameRail path={path} search={search} />
            <div className="flex min-w-0 flex-1 flex-col" style={{ '--frame-lines': `${linesHeight}px` } as CSSProperties}>
              <FrameHeader path={path} search={search} feed={feed} />
              <main data-frame-page className="relative flex min-w-0 flex-1 flex-col bg-background">
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
            <FrameSheet path={path} search={search} feed={feed} />
          </SidebarProvider>
        </HerSheetProvider>
      </NemiaChatProvider>
      <ReactQueryDevtools buttonPosition="bottom-left" />
      <TanStackRouterDevtools position="bottom-left" toggleButtonProps={{ style: ROUTER_TOOLS_AT }} />
    </AriaRouterProvider>
  );
}
