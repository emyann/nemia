import { Link as AriaLink, type LinkProps } from 'react-aria-components';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { routeLink } from '../routeLink';

/**
 * How the board's text link is drawn: the surface's ink and no line at rest, underlined a little under the line under the pointer and
 * with the keyboard on it, where it takes the kit's ring too.
 */
export const TEXT_LINK = cn(
  'rounded-sm text-on-surface no-underline decoration-on-surface underline-offset-4 hover:underline focus-visible:underline',
  focusRing(),
);

/**
 * React Aria's link, drawn as the board's text link; a `title` says whole what a cut link shows a part of. React Aria's `Link` keeps
 * no `title` of the props it is given, so the title is put on the element it draws, through its `render`.
 */
function Linked({ className, title, ...props }: Omit<LinkProps, 'className'> & { className?: string; title?: string }) {
  return (
    <AriaLink
      {...props}
      data-text-link
      className={cn(TEXT_LINK, className)}
      render={title === undefined ? undefined : (dom) => ('href' in dom ? <a {...dom} title={title} /> : <span {...dom} title={title} />)}
    />
  );
}

/** The board's text link to a route (`routeLink`): pressed, or Enter on it, it navigates once. */
export const TextLink = routeLink(Linked);
