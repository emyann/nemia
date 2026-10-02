import { useState } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Outlet, useMatch, useMatches, useRouter, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Workflow } from 'lucide-react';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { FactoryCrumb } from '@/components/FactoryCrumb';
import { FactoryStart } from '@/components/FactoryStart';
import { NAV } from '@/components/nav';
import { OpenBar } from '@/components/OpenBar';
import { routeLink } from '@/components/routeLink';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
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
 * The frame of every page: the sidebar, a header naming the section — and the factory, inside one (`FactoryCrumb`), with the start of a
 * run in it (`FactoryStart`) — and the page, in a centred column unless a matched route's `staticData` asks for `fullBleed`. The header is
 * `h-12`, the height the Factory leaves above itself. Over the page, below the header, the floating bar (`OpenBar`) shows what the address's
 * `?bar=` names, the same on every page, and a link to another page, which carries no `bar`, closes it. It follows the workflow feed once
 * for the whole page: what moves on it is read again at once, and the polls slow while it is open. React Aria's `RouterProvider` sends
 * every React Aria link, pressed with Enter or clicked, through the router, so no link loads the whole page again.
 */
function Root() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = useMatches({ select: (matches) => matches.some((match) => match.staticData?.fullBleed) });
  const section = NAV.find((item) => item.active(path))?.label;
  const factory = useMatch({ from: '/factories/$factory', shouldThrow: false })?.params.factory;
  const router = useRouter();
  const feed = useFeed();

  return (
    <AriaRouterProvider navigate={(href) => void router.navigate({ href })}>
      <SidebarProvider>
        <AppSidebar path={path} factory={factory} />
        <SidebarInset className="min-w-0">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3" data-feed={feed}>
            <SidebarTrigger />
            {factory !== undefined ? <FactoryCrumb name={factory} /> : section && <span className="text-sm font-medium">{section}</span>}
            {factory !== undefined && <FactoryStart name={factory} />}
          </header>
          {fullBleed ? (
            <Outlet />
          ) : (
            <div className="mx-auto w-full max-w-4xl px-4 py-6">
              <Outlet />
            </div>
          )}
        </SidebarInset>
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
 * The menu, with `path`'s place in it marked, and `factory`, the one whose floor is open, listed among the factories; on a narrow screen it
 * is a sheet over the page, and a pick closes it.
 */
function AppSidebar({ path, factory }: { path: string; factory?: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const picked = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <NavLink to="/" size="lg" tooltip="Nemia" onPress={picked}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-foreground text-sidebar">
                <Workflow className="size-4" />
              </span>
              <span className="font-semibold tracking-tight">Nemia</span>
            </NavLink>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <NavLink to={item.to} isActive={item.active(path)} tooltip={item.label} onPress={picked}>
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
