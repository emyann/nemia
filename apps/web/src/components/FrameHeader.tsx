import { Bell, Workflow } from 'lucide-react';
import { FactoryCrumb } from '@/components/FactoryCrumb';
import { FactoryStart } from '@/components/FactoryStart';
import { routeLink } from '@/components/routeLink';
import { Button, LinkButton } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { FeedStatus } from '@/lib/feed';

/** The logo: a ghost button that is React Aria's link, given the router's `to`. */
const LogoLink = routeLink(LinkButton);

/**
 * The frame's header, across the top of every page, `h-12`, above the rail, the sidebar and the page: the button that folds the sidebar (or
 * opens its sheet on a narrow screen), the logo, a link to Home, then the section's name — or, inside the factory `factory`, its crumb
 * (`FactoryCrumb`) and the start of a run in it (`FactoryStart`). At its right, room kept for a search, the bell, drawn and not yet wired,
 * and a place for the user's menu. `feed` is the workflow feed's state, which it carries as `data-feed`.
 */
export function FrameHeader({ section, factory, feed }: { section?: string; factory?: string; feed: FeedStatus }) {
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3" data-feed={feed}>
      <SidebarTrigger />
      <LogoLink to="/" variant="ghost" className="gap-2 px-1.5 font-semibold tracking-tight">
        <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-background">
          <Workflow />
        </span>
        Nemia
      </LogoLink>
      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
      {factory !== undefined ? <FactoryCrumb name={factory} /> : section && <span className="text-sm font-medium">{section}</span>}
      {factory !== undefined && <FactoryStart name={factory} />}
      <span className="flex-1" />
      <span aria-hidden data-slot="search" className="hidden h-8 w-64 md:block" />
      <Button variant="ghost" size="icon" aria-label="Notifications" isDisabled>
        <Bell />
      </Button>
      <span aria-hidden data-slot="user-menu" className="size-7 shrink-0 rounded-full border bg-muted" />
    </header>
  );
}
