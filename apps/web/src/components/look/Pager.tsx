import { Link as AriaLink } from 'react-aria-components';
import { newerOf, olderTrailOf, pageSaid, rowsSaid, trailSearch, type PageAt } from '@/lib/finished';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { routeLink } from '../nav/routeLink';
import { Body, Label } from '@/components/ui/ds';

const PageLink = routeLink(AriaLink);

/** An outlined button of the pager, in the label face: quiet, dimmed by its ink where it leads nowhere, and ringed as the kit rings. */
const BUTTON = cn(
  'inline-flex h-8 items-center border border-outline px-3 uppercase text-on-surface hover:bg-surface-container-high data-disabled:border-outline-variant data-disabled:text-on-surface-variant data-disabled:hover:bg-transparent',
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
        <Label size="large" component="span">
          {children}
        </Label>
      </AriaLink>
    );
  }
  return (
    <PageLink to="." search={searchAt(trail)} className={BUTTON} {...mark}>
      <Label size="large" component="span">
        {children}
      </Label>
    </PageLink>
  );
}

/**
 * The pager of the finished runs or of the cards: the rows this page shows, then Newer, where it stands, and Older (or the ends the sort names). Newer and Older keep the address
 * and change its trail alone (`trailSearch`): Older puts the page's `continue` on it, Newer takes its last token off; each is disabled
 * where it leads nowhere, and from a page past the last, Newer leads back.
 */
export function Pager({
  trail,
  next,
  count,
  total,
  size,
  noun = 'Runs',
  ends = ['Newer', 'Older'],
}: PageAt & {
  /** What the pager pages, in the plural and a capital: `Runs` or `Cards`. */
  noun?: 'Runs' | 'Cards';
  /** What the ends are called, back and forward, to follow the sort: Newer and Older, Older and Newer, or Previous and Next. */
  ends?: readonly [string, string];
}) {
  const at = { trail, next, count, total, size };
  return (
    <Body
      size="small"
      component="div"
      colorRole="on-surface-variant"
      data-pager
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 font-mono"
    >
      <span data-pager-rows>{rowsSaid(at, noun)}</span>
      <div role="group" aria-label={noun === 'Runs' ? 'Pages of finished runs' : 'Pages of cards'} className="flex items-center gap-3">
        <PageButton trail={newerOf(at)} which="newer">
          {ends[0]}
        </PageButton>
        <span data-pager-at className="uppercase">
          {pageSaid(at)}
        </span>
        <PageButton trail={olderTrailOf(at)} which="older">
          {ends[1]}
        </PageButton>
      </div>
    </Body>
  );
}
