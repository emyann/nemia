import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet, useMatches, useRouter, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { FrameHeader } from '@/components/FrameHeader';
import { FrameRail } from '@/components/FrameRail';
import { FrameSidebar } from '@/components/FrameSidebar';
import { sectionOf } from '@/components/nav';
import { OpenBar } from '@/components/OpenBar';
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail, sidebarOpenOf, useSidebar } from '@/components/ui/sidebar';
import { barSearch } from '@/lib/bar';
import { useFeed } from '@/lib/useFeed';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  validateSearch: barSearch,
  component: Root,
});

/**
 * The frame of every page: a header across the top (`FrameHeader`) naming the section, and below it the sidebar, the rail of places beside
 * the factory's sidebar (`FrameSidebar`), open or folded as this browser's `sidebar_state` cookie last left it (`sidebarOpenOf`), then the
 * page, in a centred column unless a matched route's `staticData` asks for `fullBleed`. The header is `h-12`, the height the Factory leaves
 * above itself, and the sidebar starts under it. Over the page, below the header, the floating bar (`OpenBar`) shows what the address's
 * `?bar=` names, the same on every page, and a link to another page, which carries no `bar`, closes it. It follows the workflow feed once
 * for the whole page: what moves on it is read again at once, and the polls slow while it is open. React Aria's `RouterProvider` sends
 * every React Aria link, pressed with Enter or clicked, through the router, so no link loads the whole page again.
 */
function Root() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = useMatches({ select: (matches) => matches.some((match) => match.staticData?.fullBleed) });
  const section = sectionOf(path);
  const search: Record<string, unknown> = useRouterState({ select: (state) => state.location.search });
  const router = useRouter();
  const feed = useFeed();

  return (
    <AriaRouterProvider navigate={(href) => void router.navigate({ href })}>
      <SidebarProvider defaultOpen={sidebarOpenOf(document.cookie)} className="flex-col">
        <FrameHeader section={section} feed={feed} />
        <div className="flex flex-1">
          <AppSidebar path={path} search={search} />
          <SidebarInset className="min-w-0">
            {fullBleed ? (
              <Outlet />
            ) : (
              <div className="mx-auto w-full max-w-4xl px-4 py-6">
                <Outlet />
              </div>
            )}
          </SidebarInset>
        </div>
      </SidebarProvider>
      <OpenBar />
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
    <Sidebar collapsible="icon" className="top-12 h-[calc(100svh-3rem)]! overflow-hidden">
      <div className="flex size-full">
        <FrameRail path={path} onPick={picked} />
        {(state === 'expanded' || isMobile) && <FrameSidebar path={path} search={search} onPick={picked} />}
      </div>
      <SidebarRail />
    </Sidebar>
  );
}
