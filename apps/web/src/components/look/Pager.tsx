import { Link as AriaLink } from 'react-aria-components';
import { newerOf, olderOf, pageSaid, pageSearch, rowsSaid, type PageAt } from '@/lib/finished';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { routeLink } from '../routeLink';

const PageLink = routeLink(AriaLink);

/** An outlined button of the pager, in the label face: quiet, dimmed by its ink where it leads nowhere, and ringed as the kit rings. */
const BUTTON = cn(
  'inline-flex h-8 items-center border border-outline px-3 font-plain text-label-large uppercase text-on-surface hover:bg-accent data-disabled:border-outline-variant data-disabled:text-muted-foreground data-disabled:hover:bg-transparent',
  focusRing(),
);

/**
 * The search of the same address at `page`, as a link takes it. Typed for any route: which route the pager stands on, and so whether
 * its search declares a page, is its page's to say.
 */
const searchAt = (page: number) => ((prev: Record<string, unknown>) => pageSearch(prev, page)) as never;

/**
 * One end of the pager: a link to `page` of the same address, every other key of its search kept; drawn disabled, and no link, for
 * none.
 */
function PageButton({ page, which, children }: { page: number | null; which: 'newer' | 'older'; children: string }) {
  const mark = which === 'newer' ? { 'data-pager-newer': '' } : { 'data-pager-older': '' };
  if (page === null) {
    return (
      <AriaLink isDisabled className={BUTTON} {...mark}>
        {children}
      </AriaLink>
    );
  }
  return (
    <PageLink to="." search={searchAt(page)} className={BUTTON} {...mark}>
      {children}
    </PageLink>
  );
}

/**
 * The pager of the finished runs: the rows this page shows, then Newer, where it stands, and Older. Newer and Older keep the address
 * and change its page alone (`pageSearch`), and each is disabled where it leads nowhere; from a page past the last, Newer leads to the
 * last.
 */
export function Pager({ page, pages, total, size }: PageAt) {
  const at = { page, pages, total, size };
  return (
    <div
      data-pager
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 font-mono text-body-small text-on-surface-variant"
    >
      <span data-pager-rows>{rowsSaid(at)}</span>
      <div role="group" aria-label="Pages of finished runs" className="flex items-center gap-3">
        <PageButton page={newerOf(page, pages)} which="newer">
          Newer
        </PageButton>
        <span data-pager-at className="uppercase">
          {pageSaid(at)}
        </span>
        <PageButton page={olderOf(page, pages)} which="older">
          Older
        </PageButton>
      </div>
    </div>
  );
}
