import { Link as AriaLink, type LinkProps } from 'react-aria-components';
import { filled, paint } from '@/lib/meaning';
import { cn } from '@/lib/utils';
import { CutCorner, type Ground } from './CutFrame';
import { routeLink } from './routeLink';

/**
 * React Aria's link drawn as the look's filled button, in the hue of what waits on a person: its top-right and bottom-left corners cut
 * by overlays painted in `on`, the ground it sits on, never by a clip, so its focus ring, drawn around its whole box, stays whole.
 */
function Cut({
  on = 'card',
  className,
  children,
  ...props
}: Omit<LinkProps, 'className' | 'children'> & { on?: Ground; className?: string; children: string }) {
  return (
    <AriaLink
      {...props}
      data-cut-button
      className={cn(
        'relative inline-flex h-10 items-center px-6 text-label-large whitespace-nowrap uppercase outline-none hover:brightness-110 data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-offset-2 data-focus-visible:ring-offset-card',
        filled.yours,
        className,
      )}
    >
      <CutCorner corner="top-right" size={12} on={on} line={paint.yours} />
      <CutCorner corner="bottom-left" size={12} on={on} line={paint.yours} />
      <span className="relative">{children}</span>
    </AriaLink>
  );
}

/** The look's filled button with two cut corners, as a link to a route (`routeLink`): pressed, or Enter on it, it navigates once. */
export const CutButton = routeLink(Cut);
