import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet, useMatches, useRouter, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { FrameHeader } from '@/components/FrameHeader';
import { FrameRail } from '@/components/FrameRail';
import { FrameTabs } from '@/components/FrameTabs';
import { OpenBar } from '@/components/OpenBar';
import { SidebarProvider, sidebarOpenOf } from '@/components/ui/sidebar';
import { barSearch } from '@/lib/bar';
import { useFeed } from '@/lib/useFeed';
import { useScrollMark } from '@/lib/useScrollMark';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  validateSearch: barSearch,
  component: Root,
});

/**
 * The frame of every page: the rail at the left, the whole height of the window (`FrameRail`), open or closed as this browser's
 * `sidebar_state` cookie last left it (`sidebarOpenOf`), a modal drawer on a narrow screen; beside it the top bar (`FrameHeader`), `h-20`,
 * naming the page, then the page, under the strip of Settings' tabs on one of them (`FrameTabs`), in a centred column unless a matched
 * route's `staticData` asks for `fullBleed`. Over the page, under the top bar, the floating bar (`OpenBar`) shows what the address's `?bar=`
 * names, the same on every page, and a link to another page, which carries no `bar`, closes it. It follows the workflow feed once for the
 * whole page: what moves on it is read again at once, the polls slow while it is open, and the gauges say which. React Aria's
 * `RouterProvider` sends every React Aria link, pressed with Enter or clicked, through the router, so no link loads the whole page again.
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
      <ReactQueryDevtools buttonPosition="bottom-left" />
      <TanStackRouterDevtools position="bottom-right" />
    </AriaRouterProvider>
  );
}
