import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet, useMatches, useRouter, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { FrameFooter } from '@/components/FrameFooter';
import { FrameHeader } from '@/components/FrameHeader';
import { FrameRail } from '@/components/FrameRail';
import { FrameSidebar } from '@/components/FrameSidebar';
import { FrameTabs } from '@/components/FrameTabs';
import { sectionOf } from '@/components/nav';
import { OpenBar } from '@/components/OpenBar';
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail, sidebarOpenOf, useSidebar } from '@/components/ui/sidebar';
import { barSearch } from '@/lib/bar';
import { useFeed } from '@/lib/useFeed';
import { useScrollMark } from '@/lib/useScrollMark';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  validateSearch: barSearch,
  component: Root,
});

/**
 * The frame of every page: a header across the top (`FrameHeader`) naming the section, and below it the sidebar, the rail of places beside
 * the factory's sidebar (`FrameSidebar`), open or folded as this browser's `sidebar_state` cookie last left it (`sidebarOpenOf`), then the
 * page, under the strip of its place's tabs when it is one (`FrameTabs`), in a centred column unless a matched route's `staticData` asks
 * for `fullBleed`. The header is `h-12` and the bottom bar across the foot (`FrameFooter`) `h-8`, the heights the Factory leaves beside
 * itself, and the sidebar starts under the header and ends above the bottom bar. Over the page, between the header and the bottom bar, the
 * floating bar (`OpenBar`) shows what the address's `?bar=` names, the same on every page, and a link to another page, which carries no
 * `bar`, closes it. It follows the workflow feed once for the whole page: what moves on it is read again at once, the polls slow while it
 * is open, and the bottom bar says which. React Aria's `RouterProvider` sends
 * every React Aria link, pressed with Enter or clicked, through the router, so no link loads the whole page again.
 */
function Root() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = useMatches({ select: (matches) => matches.some((match) => match.staticData?.fullBleed) });
  const section = sectionOf(path);
  const search: Record<string, unknown> = useRouterState({ select: (state) => state.location.search });
  const router = useRouter();
  const feed = useFeed();
  useScrollMark();

  return (
    <AriaRouterProvider navigate={(href) => void router.navigate({ href })}>
      <SidebarProvider defaultOpen={sidebarOpenOf(document.cookie)} className="flex-col">
        <FrameHeader section={section} />
        <div className="flex flex-1">
          <AppSidebar path={path} search={search} />
          <SidebarInset className="min-w-0">
            <FrameTabs path={path}>
              {fullBleed ? (
                <Outlet />
              ) : (
                <div className="mx-auto w-full max-w-4xl px-4 py-6">
                  <Outlet />
                </div>
              )}
            </FrameTabs>
          </SidebarInset>
        </div>
        <FrameFooter feed={feed} />
      </SidebarProvider>
      <OpenBar feed={feed} />
      <ReactQueryDevtools buttonPosition="bottom-left" />
      <TanStackRouterDevtools position="bottom-right" />
    </AriaRouterProvider>
  );
}

/**
 * The sidebar, under the header, the provider's width open: the rail (`FrameRail`), and beside it the factory's sidebar (`FrameSidebar`)
 * at `path` with `search`, in the width left. Folded, it is the rail alone, and the factory's sidebar is not drawn, so none of its links
 * takes the focus while hidden. On a narrow screen it is a sheet over the page holding both, and any press in it closes it.
 */
function AppSidebar({ path, search }: { path: string; search: Record<string, unknown> }) {
  const { isMobile, state, setOpenMobile } = useSidebar();
  const picked = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="top-12 h-[calc(100svh-5rem)]! overflow-hidden">
      <div className="flex size-full">
        <FrameRail path={path} onPick={picked} />
        {(state === 'expanded' || isMobile) && <FrameSidebar path={path} search={search} onPick={picked} />}
      </div>
      <SidebarRail />
    </Sidebar>
  );
}
