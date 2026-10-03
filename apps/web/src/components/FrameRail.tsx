import { RAIL } from '@/components/nav';
import { routeLink } from '@/components/routeLink';
import { Sidebar, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip';

/** A place in the rail: the sidebar's button, which is React Aria's link once it has an `href`, given the router's `to` and its preloading. */
const RailLink = routeLink(SidebarMenuButton);

/**
 * The rail: a narrow column of the frame's places (`RAIL`), each an icon linking to its page, named on hover and on keyboard focus by a
 * tooltip at its right, whatever the sidebar's fold, and lit when `path` is its page. Capabilities sits at its foot. A pick runs `onPick`,
 * which closes the menu's sheet on a narrow screen.
 */
export function FrameRail({ path, onPick }: { path: string; onPick?: () => void }) {
  const foot = RAIL.length - 1;
  return (
    <Sidebar collapsible="none" className="w-[calc(var(--sidebar-width-icon)+1px)]! border-r">
      <nav aria-label="Places" className="flex min-h-0 flex-1 flex-col">
        <SidebarGroup className="flex-1 px-1.5 md:px-2">
          <SidebarGroupContent className="flex flex-1 flex-col">
            <SidebarMenu className="flex-1 gap-1">
              {RAIL.map((item, index) => (
                <SidebarMenuItem key={item.to} className={index === foot ? 'mt-auto' : undefined}>
                  <TooltipTrigger>
                    <RailLink to={item.to} aria-label={item.label} isActive={item.active(path)} onPress={onPick} className="px-2">
                      <item.icon />
                    </RailLink>
                    <Tooltip placement="right">{item.label}</Tooltip>
                  </TooltipTrigger>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </nav>
    </Sidebar>
  );
}
