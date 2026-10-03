import { useState } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet, useMatch, useMatches, useRouter, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { FrameHeader } from '@/components/FrameHeader';
import { FrameRail } from '@/components/FrameRail';
import { NAV, RAIL } from '@/components/nav';
import { OpenBar } from '@/components/OpenBar';
import { routeLink } from '@/components/routeLink';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { factoriesQuery, runsQuery } from '@/lib/api';
import { barSearch } from '@/lib/bar';
import { factoryBlocks, menuFactories } from '@/lib/factories';
import { useFeed } from '@/lib/useFeed';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  validateSearch: barSearch,
  component: Root,
});

/**
 * The frame of every page: a header across the top (`FrameHeader`) naming the section — and the factory, inside one, with the start of a
 * run in it — and below it the sidebar, the rail of places beside its list, then the page, in a centred column unless a matched route's
 * `staticData` asks for `fullBleed`. The header is `h-12`, the height the Factory leaves above itself, and the sidebar starts under it.
 * Over the page, below the header, the floating bar (`OpenBar`) shows what the address's `?bar=` names, the same on every page, and a link
 * to another page, which carries no `bar`, closes it. It follows the workflow feed once for the whole page: what moves on it is read again
 * at once, and the polls slow while it is open. React Aria's `RouterProvider` sends every React Aria link, pressed with Enter or clicked,
 * through the router, so no link loads the whole page again.
 */
function Root() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = useMatches({ select: (matches) => matches.some((match) => match.staticData?.fullBleed) });
  const section = [...NAV, ...RAIL].find((item) => item.active(path))?.label;
  const factory = useMatch({ from: '/factories/$factory', shouldThrow: false })?.params.factory;
  const router = useRouter();
  const feed = useFeed();

  return (
    <AriaRouterProvider navigate={(href) => void router.navigate({ href })}>
      <SidebarProvider className="flex-col">
        <FrameHeader section={section} factory={factory} feed={feed} />
        <div className="flex flex-1">
          <AppSidebar path={path} factory={factory} />
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
 * A place in the menu: the sidebar's button, which is React Aria's link once it has an `href`, given the router's `to` and its preloading.
 */
const NavLink = routeLink(SidebarMenuButton);

/**
 * The sidebar, under the header, the provider's width open: the rail (`FrameRail`), and beside it the list in the width left, with `path`'s
 * place in each marked, and `factory`, the one whose floor is open, listed among the factories. Folded, it is the rail alone, and the list
 * is not drawn, so none of its links takes the focus while hidden. On a narrow screen it is a sheet over the page holding both, and a pick
 * closes it.
 */
function AppSidebar({ path, factory }: { path: string; factory?: string }) {
  const { isMobile, state, setOpenMobile } = useSidebar();
  const picked = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="top-12 h-[calc(100svh-3rem)]! overflow-hidden">
      <div className="flex size-full">
        <FrameRail path={path} onPick={picked} />
        {(state === 'expanded' || isMobile) && (
          <Sidebar collapsible="none" className="min-w-0 flex-1">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {NAV.map((item) => (
                      <SidebarMenuItem key={item.to}>
                        <NavLink to={item.to} isActive={item.active(path)} onPress={picked}>
                          <item.icon />
                          <span>{item.label}</span>
                        </NavLink>
                        {item.to === '/' && <FactoriesMenu path={path} open={factory} onPick={picked} />}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        )}
      </div>
      <SidebarRail />
    </Sidebar>
  );
}

/** A factory in the menu: the sidebar's sub-button, a React Aria link given the router's `to`. */
const SubLink = routeLink(SidebarMenuSubButton);

/**
 * The factories under the Factories item, one a block (`factoryBlocks`): the first `MENU_SHOWN`, and a button that shows the rest in place.
 * Each is lit on its own floor, and the one named `open`, whose floor is open, is listed past the first five too. It reads the runs
 * without polling them — a page that shows none must not read them every 5 s — so they are read again only on the feed's events and when
 * a page that polls them is open. Nothing is listed while either read has no answer.
 */
function FactoriesMenu({ path, open, onPick }: { path: string; open?: string; onPick: () => void }) {
  const [all, setAll] = useState(false);
  const factories = useQuery(factoriesQuery);
  const runs = useQuery({ ...runsQuery, refetchInterval: false });
  if (!factories.data || !runs.data) return null;
  const { shown, hidden } = menuFactories(factoryBlocks(factories.data, runs.data), all, open);
  if (!shown.length) return null;
  return (
    <SidebarMenuSub aria-label="Factories">
      {shown.map((block) => (
        <SidebarMenuSubItem key={block.name}>
          <SubLink
            to="/factories/$factory"
            params={{ factory: block.name }}
            isActive={path === `/factories/${block.name}`}
            data-factory={block.name}
            onPress={onPick}
          >
            <span>{block.name}</span>
          </SubLink>
        </SidebarMenuSubItem>
      ))}
      {hidden > 0 && (
        <SidebarMenuSubItem>
          <SidebarMenuSubButton size="sm" onPress={() => setAll(true)}>
            <span>Show {hidden} more</span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      )}
    </SidebarMenuSub>
  );
}
