import { Button as AriaButton, Link as AriaLink, type ButtonProps, type LinkProps } from 'react-aria-components';
import { filled } from '@/lib/meaning';
import { cn } from '@/components/ui/ds/utils';
import { cutRing, cutShape } from './cut';
import { routeLink } from '../nav/routeLink';

/** How long the button's cut is along each side, in pixels. */
const CUT = 12;

/** The room between the button and its focus ring, and the ring's width, in pixels: the kit's ring's own. */
const [GAP, RING] = [2, 3];

/** What the element that is the button wears, a link or a press alike: clipped by nothing, its ring and its shape laid inside it. */
const HOLDER = 'group/cut relative inline-flex outline-none';

/** The quiet form's ground and ink: no ground, the surface's ink, inside a hairline in the outline's colour. */
const QUIET = 'text-on-surface ring-1 ring-outline ring-inset';

/** The ground and the ink of a press that is disabled, as Material draws a disabled filled button: 12 % and 38 % of the surface's ink. */
const DISABLED = 'bg-on-surface/12 text-on-surface/38';

/**
 * What the look's filled button draws inside the element that is the button, a link or a press alike: its focus ring, a band in the
 * cut shape around it, as wide and as far as the kit's ring and shown with the keyboard on it; then its words on a shape of its own,
 * the top-right and bottom-left corners cut, exactly the button's box, in the hue of what waits on a person, with a state layer in
 * its ink. `quiet` draws it smaller, with no ground, in the surface's ink inside a hairline, for a button beside what already says
 * the wait; `disabled` draws the shape in the disabled ground and ink, with no state layer and no ring.
 */
function Body({ disabled = false, quiet = false, children }: { disabled?: boolean; quiet?: boolean; children: string }) {
  return (
    <>
      {!disabled && (
        <span
          aria-hidden="true"
          data-cut-ring
          className="pointer-events-none absolute -inset-[5px] hidden bg-ring group-data-focus-visible/cut:block"
          style={{ clipPath: cutRing(CUT, GAP, RING) }}
        />
      )}
      <span
        data-cut-shape
        className={cn(
          'relative inline-flex items-center text-label-large whitespace-nowrap uppercase',
          quiet ? 'h-8 px-4' : 'h-10 px-6',
          disabled ? DISABLED : quiet ? QUIET : filled.yours,
        )}
        style={{ clipPath: cutShape(CUT) }}
      >
        {!disabled && (
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-current opacity-0 group-hover/cut:state-opacity-hover group-data-pressed/cut:state-opacity-pressed"
          />
        )}
        <span className="relative">{children}</span>
      </span>
    </>
  );
}

/** React Aria's link drawn as the look's filled button (`Body`), or its quiet form; the link itself is clipped by nothing. */
function Cut({
  className,
  quiet = false,
  children,
  ...props
}: Omit<LinkProps, 'className' | 'children'> & { className?: string; quiet?: boolean; children: string }) {
  return (
    <AriaLink {...props} data-cut-button="link" data-quiet={quiet || undefined} className={cn(HOLDER, className)}>
      <Body quiet={quiet}>{children}</Body>
    </AriaLink>
  );
}

/**
 * The look's filled button with two cut corners, as a link to a route (`routeLink`): pressed, or Enter on it, it navigates once; with
 * `quiet`, drawn with no ground inside a hairline.
 */
export const CutButton = routeLink(Cut);

/**
 * The look's filled button with two cut corners, as a button that is pressed: `onPress` runs on a click, on Enter and on Space, and
 * its ring is the link's own. With `isDisabled` it takes no press and no focus, and is drawn in the disabled ground and ink.
 */
export function CutPress({
  className,
  children,
  isDisabled = false,
  ...props
}: Omit<ButtonProps, 'className' | 'children' | 'style'> & { className?: string; children: string }) {
  return (
    <AriaButton
      {...props}
      isDisabled={isDisabled}
      data-cut-button="press"
      className={cn(HOLDER, 'cursor-pointer disabled:cursor-default', className)}
    >
      <Body disabled={isDisabled}>{children}</Body>
    </AriaButton>
  );
}
