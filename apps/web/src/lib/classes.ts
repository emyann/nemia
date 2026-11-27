/**
 * The class strings several features share, each a whole literal (the colours are `meaning.ts`'s): one writer for a button, a
 * field or the floor's frame, so two features never draw the same part from two copies.
 */

/** A button that does what its form or card is for. */
export const BUTTON =
  'rounded bg-primary px-3 py-1.5 text-body-medium font-medium text-on-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary';

/** A button beside the primary one, ringed on the card's surface. */
export const BUTTON_SECONDARY =
  'bg-surface-container-low text-on-surface ring-1 ring-outline ring-inset hover:bg-surface-container-high disabled:hover:bg-surface-container-low';

/** A choice drawn as its box: the kit's radio and its words, framed, the frame lit while it is chosen (an agent's prompt, a prune). */
export const CHOICE = 'items-start rounded border border-outline-variant px-3 py-2 data-selected:border-primary';

/** The frame a floor (a canvas of nodes) is drawn in. */
export const FLOOR_BOX = 'overflow-hidden rounded border border-outline-variant';

/** The floor of a run's page, one of the pages read most: ruled above and below and boxed by nothing, so a node on it is a first box. */
export const FLOOR_RULED = 'overflow-hidden border-y border-outline-variant';

/** The frame's left and right edge, the same on every page: the grid's own, the strip of tabs' and the Overview's. */
export const FRAME_EDGE = 'px-3 @lg/page:px-6';

/** The kit dialog's shell for a cut frame: it draws no surface of its own, and keeps the scrim, the focus trap and Escape. */
export const CUT_MODAL =
  'max-h-[calc(100dvh-2rem)] w-fit max-w-[calc(100vw-2rem)] min-w-0 overflow-visible rounded-none bg-transparent p-0 shadow-none';
