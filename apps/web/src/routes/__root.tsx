import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createLink, createRootRouteWithContext, Outlet, useMatches, useRouter, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Workflow } from 'lucide-react';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { NAV } from '@/components/nav';
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
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
});

function Root() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = useMatches({ select: (matches) => matches.some((match) => match.staticData?.fullBleed) });
  const section = NAV.find((item) => item.active(path))?.label;
  const router = useRouter();

  return (
    // React Aria's links follow a link pressed from the keyboard with a click of their own, which never reaches the router's `onClick`
    // (`createLink`): without this, Enter on a place in the menu loads the whole page again.
    <AriaRouterProvider navigate={(href) => void router.navigate({ href })}>
      <SidebarProvider>
        <AppSidebar path={path} />
        <SidebarInset className="min-w-0">
          {/* `h-12`: the Factory takes the height below it. */}
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <SidebarTrigger />
            {section && <span className="text-sm font-medium">{section}</span>}
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
      <ReactQueryDevtools buttonPosition="bottom-left" />
      <TanStackRouterDevtools position="bottom-right" />
    </AriaRouterProvider>
  );
}

/** A place in the menu: the sidebar's button, which is React Aria's link once it has an `href`, given the router's typed `to` and its click. */
const NavLink = createLink(SidebarMenuButton);

function AppSidebar({ path }: { path: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  // On a narrow screen the menu is a sheet over the page: a pick closes it, or it covers what was picked.
  const picked = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <NavLink to="/" size="lg" tooltip="hkb" onClick={picked}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-foreground text-sidebar">
                <Workflow className="size-4" />
              </span>
              <span className="font-semibold tracking-tight">hkb</span>
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
                  <NavLink to={item.to} isActive={item.active(path)} tooltip={item.label} onClick={picked}>
                    <item.icon />
                    <span>{item.label}</span>
                  </NavLink>
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
