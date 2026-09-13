import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Link, Outlet, useMatches, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Factory, List, Workflow } from 'lucide-react';
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
import { TooltipProvider } from '@/components/ui/tooltip';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
});

/** The menu. Runs is lit on a run's page too: the list is where a run is reached from. */
const NAV = [
  { to: '/', label: 'Factory', icon: Factory, active: (path: string) => path === '/' },
  { to: '/runs', label: 'Runs', icon: List, active: (path: string) => path === '/runs' || path.startsWith('/runs/') },
] as const;

function Root() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = useMatches({ select: (matches) => matches.some((match) => match.staticData?.fullBleed) });
  const section = NAV.find((item) => item.active(path))?.label;

  return (
    <TooltipProvider>
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
    </TooltipProvider>
  );
}

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
            <SidebarMenuButton size="lg" asChild tooltip="hkb">
              <Link to="/" onClick={picked}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-foreground text-sidebar">
                  <Workflow className="size-4" />
                </span>
                <span className="font-semibold tracking-tight">hkb</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={item.active(path)} tooltip={item.label}>
                    <Link to={item.to} onClick={picked}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
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
