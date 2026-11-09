import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet, useMatches, useRouter, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { FrameHeader } from '@/components/frame/FrameHeader';
import { FrameRail } from '@/components/frame/FrameRail';
import { FrameTabs } from '@/components/frame/FrameTabs';
import { NemiaDock } from '@/components/nemia/NemiaDock';
import { OpenBar } from '@/components/factory/OpenBar';
import { SidebarProvider, sidebarOpenOf } from '@/components/ui/sidebar';
import { barSearch } from '@/lib/bar';
import { useFeed } from '@/lib/useFeed';
import { NemiaChatProvider } from '@/lib/useNemiaChat';
import { useScrollMark } from '@/lib/useScrollMark';

/** The route Nemia's chat is a page of its own at: the page is the panel, so her docked face is not drawn over it. */
const CHAT = '/chat';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  validateSearch: barSearch,
  component: Root,
});

/**
 * The frame of every page: the rail at the left, the whole height of the window (`FrameRail`), open or closed as this browser's
 * `sidebar_state` cookie last left it (`sidebarOpenOf`), a modal drawer on a narrow screen; beside it the top bar (`FrameHeader`), as tall
 * as `--frame-top`, naming the page, then the page, under the strip of Settings' tabs on one of them (`FrameTabs`), in a centred column
 * unless a matched route's `staticData` asks for `fullBleed`. Over the page, under the top bar, the floating bar (`OpenBar`) shows what the
 * address's `?bar=` names, the same on every page, and a link to another page, which carries no `bar`, closes it. It follows the workflow
 * feed once for the whole page: what moves on it is read again at once, the polls slow while it is open, and the gauges say which. Her
 * chat is held over the whole frame too (`NemiaChatProvider`), one stream of hers for the visit, which her docked face and the chat page
 * both read, so a navigation neither closes it nor opens another. React
 * Aria's `RouterProvider` sends every React Aria link, pressed with Enter or clicked, through the router, so no link loads the whole page
 * again.
 */
function Root() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = useMatches({ select: (matches) => matches.some((match) => match.staticData?.fullBleed) });
  const search: Record<string, unknown> = useRouterState({ select: (state) => state.location.search });
  const router = useRouter();
  const feed = useFeed();
  useScrollMark();

  return (
    <AriaRouterProvider navigate={(href) => void router.navigate({ href })}>
      <NemiaChatProvider>
        <SidebarProvider defaultOpen={sidebarOpenOf(document.cookie)}>
          <FrameRail path={path} search={search} />
          <div className="flex min-w-0 flex-1 flex-col">
            <FrameHeader path={path} search={search} feed={feed} />
            <main data-frame-page className="relative flex min-w-0 flex-1 flex-col bg-background">
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
        {path !== CHAT && <NemiaDock path={path} search={search} />}
      </NemiaChatProvider>
      <ReactQueryDevtools buttonPosition="bottom-left" />
      <TanStackRouterDevtools position="bottom-right" />
    </AriaRouterProvider>
  );
}
