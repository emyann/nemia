import { Link as AriaLink, type LinkProps } from 'react-aria-components';
import { filled } from '@/lib/meaning';
import { cn } from '@/components/ui/ds/utils';
import { cutRing, cutShape } from './CutFrame';
import { routeLink } from './routeLink';

/** How long the button's cut is along each side, in pixels. */
const CUT = 12;

/** The room between the button and its focus ring, and the ring's width, in pixels: the kit's ring's own. */
const [GAP, RING] = [2, 3];

/**
 * React Aria's link drawn as the look's filled button, in the hue of what waits on a person: its words on a shape of its own, the
 * top-right and bottom-left corners cut, exactly the button's box, with a state layer in its ink. Focused from the keyboard, its ring
 * is a band in that shape around it, as wide and as far as the kit's ring, the cuts followed; the link itself is clipped by nothing.
 */
function Cut({ className, children, ...props }: Omit<LinkProps, 'className' | 'children'> & { className?: string; children: string }) {
  return (
    <AriaLink {...props} data-cut-button className={cn('group/cut relative inline-flex outline-none', className)}>
      <span
        aria-hidden="true"
        data-cut-ring
        className="pointer-events-none absolute -inset-[5px] hidden bg-ring group-data-focus-visible/cut:block"
        style={{ clipPath: cutRing(CUT, GAP, RING) }}
      />
      <span
        data-cut-shape
        className={cn('relative inline-flex h-10 items-center px-6 text-label-large whitespace-nowrap uppercase', filled.yours)}
        style={{ clipPath: cutShape(CUT) }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-current opacity-0 group-hover/cut:state-opacity-hover group-data-pressed/cut:state-opacity-pressed"
        />
        <span className="relative">{children}</span>
      </span>
    </AriaLink>
  );
}

/** The look's filled button with two cut corners, as a link to a route (`routeLink`): pressed, or Enter on it, it navigates once. */
export const CutButton = routeLink(Cut);
