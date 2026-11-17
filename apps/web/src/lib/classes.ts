/**
 * The class strings several features share, each a whole literal (the colours are `meaning.ts`'s): one writer for a button, a
 * popover or the floor's frame, so two features never draw the same part from two copies.
 */

/** A button that does what its form or card is for. */
export const BUTTON =
  'rounded bg-primary px-3 py-1.5 text-body-medium font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary';

/** A button beside the primary one, ringed on the card's surface. */
export const BUTTON_SECONDARY = 'bg-card text-foreground ring-1 ring-outline ring-inset hover:bg-accent disabled:hover:bg-card';

/** A small button, in a card's row or a popover. */
export const BUTTON_SMALL = 'h-6 rounded px-2 text-body-small font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

/** A popover's surface. */
export const POPOVER =
  'z-50 w-72 rounded-lg border border-outline-variant bg-card p-3 text-body-medium text-foreground shadow-lg outline-none';

/** The frame a floor (a canvas of nodes) is drawn in. */
export const FLOOR_BOX = 'overflow-hidden rounded border border-outline-variant';
