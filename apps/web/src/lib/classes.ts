/**
 * The class strings several features share, each a whole literal (the colours are `meaning.ts`'s): one writer for a button, a
 * field or the floor's frame, so two features never draw the same part from two copies.
 */

/** A button that does what its form or card is for. */
export const BUTTON =
  'rounded bg-primary px-3 py-1.5 text-body-medium font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary';

/** A button beside the primary one, ringed on the card's surface. */
export const BUTTON_SECONDARY = 'bg-card text-foreground ring-1 ring-outline ring-inset hover:bg-accent disabled:hover:bg-card';

/** A button beside the primary one, outlined, at the primary's size. */
export const BUTTON_OUTLINED =
  'rounded border border-outline px-3 py-1.5 text-body-medium font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40';

/** A field a person writes a few lines in. */
export const TEXTAREA =
  'block w-full resize-y rounded border border-outline bg-background px-2 py-1.5 text-body-medium placeholder:text-muted-foreground focus:border-on-surface-variant focus:outline-none';

/** A choice drawn as its box: the kit's radio and its words, framed, the frame lit while it is chosen (an agent's prompt, a prune). */
export const CHOICE = 'items-start rounded border border-outline-variant px-3 py-2 data-selected:border-primary';

/** The frame a floor (a canvas of nodes) is drawn in. */
export const FLOOR_BOX = 'overflow-hidden rounded border border-outline-variant';
