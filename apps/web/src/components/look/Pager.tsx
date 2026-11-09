import { Link as AriaLink } from 'react-aria-components';
import { newerOf, olderTrailOf, pageSaid, rowsSaid, trailSearch, type PageAt } from '@/lib/finished';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { routeLink } from '../nav/routeLink';

const PageLink = routeLink(AriaLink);

/** An outlined button of the pager, in the label face: quiet, dimmed by its ink where it leads nowhere, and ringed as the kit rings. */
const BUTTON = cn(
  'inline-flex h-8 items-center border border-outline px-3 font-plain text-label-large uppercase text-on-surface hover:bg-accent data-disabled:border-outline-variant data-disabled:text-muted-foreground data-disabled:hover:bg-transparent',
  focusRing(),
);

/**
 * The search of the same address at `trail`, as a link takes it. Typed for any route: which route the pager stands on, and so whether
 * its search declares a trail, is its page's to say.
 */
const searchAt = (trail: readonly string[]) => ((prev: Record<string, unknown>) => trailSearch(prev, trail)) as never;

/**
 * One end of the pager: a link to the page `trail` leads to, on the same address, every other key of its search kept; drawn disabled,
 * and no link, for none.
 */
function PageButton({ trail, which, children }: { trail: readonly string[] | null; which: 'newer' | 'older'; children: string }) {
  const mark = which === 'newer' ? { 'data-pager-newer': '' } : { 'data-pager-older': '' };
  if (trail === null) {
    return (
      <AriaLink isDisabled className={BUTTON} {...mark}>
        {children}
      </AriaLink>
    );
  }
  return (
    <PageLink to="." search={searchAt(trail)} className={BUTTON} {...mark}>
      {children}
    </PageLink>
  );
}

/**
 * The pager of the finished runs: the rows this page shows, then Newer, where it stands, and Older. Newer and Older keep the address
 * and change its trail alone (`trailSearch`): Older puts the page's `continue` on it, Newer takes its last token off; each is disabled
 * where it leads nowhere, and from a page past the last, Newer leads back.
 */
export function Pager({ trail, next, count, total, size }: PageAt) {
  const at = { trail, next, count, total, size };
  return (
    <div
      data-pager
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 font-mono text-body-small text-on-surface-variant"
    >
      <span data-pager-rows>{rowsSaid(at)}</span>
      <div role="group" aria-label="Pages of finished runs" className="flex items-center gap-3">
        <PageButton trail={newerOf(at)} which="newer">
          Newer
        </PageButton>
        <span data-pager-at className="uppercase">
          {pageSaid(at)}
        </span>
        <PageButton trail={olderTrailOf(at)} which="older">
          Older
        </PageButton>
      </div>
    </div>
  );
}
