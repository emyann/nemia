import { useQuery } from '@tanstack/react-query';
import { Bell, Workflow } from 'lucide-react';
import { routeLink } from '@/components/routeLink';
import { Button, LinkButton } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { openRunsQuery } from '@/lib/api';
import { bellCount, bellLabel } from '@/lib/bell';
import { useBar } from '@/lib/useBar';

/** The logo: a ghost button that is React Aria's link, given the router's `to`. */
const LogoLink = routeLink(LinkButton);

/**
 * The frame's header, across the top of every page, `h-12`, above the rail, the sidebar and the page: the button that folds the sidebar (or
 * opens its sheet on a narrow screen), the logo, a link to Home, then the section's name alone: the factory picked is the sidebar's. At its
 * right, room kept for a search, the bell (`BellButton`), wired to the runs waiting on you, and a place for the user's menu.
 */
export function FrameHeader({ section }: { section?: string }) {
  return (
    <header data-frame-header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
      <SidebarTrigger />
      <LogoLink to="/" variant="ghost" className="gap-2 px-1.5 font-semibold tracking-tight">
        <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-background">
          <Workflow />
        </span>
        Nemia
      </LogoLink>
      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
      {section && <span className="text-sm font-medium">{section}</span>}
      <span className="flex-1" />
      <span aria-hidden data-slot="search" className="hidden h-8 w-64 md:block" />
      <BellButton />
      <span aria-hidden data-slot="user-menu" className="size-7 shrink-0 rounded-full border bg-muted" />
    </header>
  );
}

/** The bar the bell opens: the runs waiting on you. */
const WAITING = { kind: 'waiting' } as const;

/**
 * The bell: how many runs wait on you across every factory, the api's count (`openRunsQuery`), named in full and drawn as a count over
 * the bell while there are any; a press opens the runs waiting on you in the floating bar, kept in the address, and pressed again closes
 * it.
 */
function BellButton() {
  const runs = useQuery(openRunsQuery());
  const { open, toggle } = useBar();
  const count = runs.data?.counts.waiting;
  const shown = bellCount(count ?? 0);
  return (
    <Button
      data-bell
      variant="ghost"
      size="icon"
      aria-label={bellLabel(count, runs.isError)}
      aria-expanded={open?.kind === 'waiting'}
      onPress={() => toggle(WAITING)}
      className="relative"
    >
      <Bell />
      {shown && (
        <span
          aria-hidden
          data-bell-count
          className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] leading-none font-semibold text-amber-950 tabular-nums"
        >
          {shown}
        </span>
      )}
    </Button>
  );
}
