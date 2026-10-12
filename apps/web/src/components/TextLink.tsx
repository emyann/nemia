import { Link as AriaLink, type LinkProps } from 'react-aria-components';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { routeLink } from './routeLink';

/** How the board's text link is drawn: the surface's ink, underlined a little under the line, and the kit's ring for the keyboard. */
export const TEXT_LINK = cn(
  'rounded-sm text-on-surface underline decoration-outline underline-offset-4 hover:decoration-on-surface',
  focusRing(),
);

/** React Aria's link, drawn as the board's text link; a `title` says whole what a cut link shows a part of. */
function Underlined({ className, ...props }: Omit<LinkProps, 'className'> & { className?: string; title?: string }) {
  return <AriaLink {...props} data-text-link className={cn(TEXT_LINK, className)} />;
}

/** The board's text link to a route (`routeLink`): pressed, or Enter on it, it navigates once. */
export const TextLink = routeLink(Underlined);
