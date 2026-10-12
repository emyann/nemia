import { Link as AriaLink, type LinkProps } from 'react-aria-components';
import { cn } from '@/lib/utils';
import { routeLink } from './routeLink';

/** How the board's text link is drawn: the surface's ink, underlined a little under the line, and a ring when the keyboard is on it. */
export const TEXT_LINK =
  'rounded-sm text-on-surface underline decoration-outline underline-offset-4 outline-none hover:decoration-on-surface data-focus-visible:ring-2 data-focus-visible:ring-ring';

/** React Aria's link, drawn as the board's text link; a `title` says whole what a cut link shows a part of. */
function Underlined({ className, ...props }: Omit<LinkProps, 'className'> & { className?: string; title?: string }) {
  return <AriaLink {...props} data-text-link className={cn(TEXT_LINK, className)} />;
}

/** The board's text link to a route (`routeLink`): pressed, or Enter on it, it navigates once. */
export const TextLink = routeLink(Underlined);
