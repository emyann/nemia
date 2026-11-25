/** A colour a meaning is drawn in: the meaning itself, or one of rest's two tints. */
export type Hue = 'yours' | 'alive' | 'failure' | 'grey' | 'sage';

/**
 * The meaning a hue says: `grey` and `sage` are both `rest`.
 * @param hue The colour asked about.
 */
export const meaningOf = (hue: Hue) => (hue === 'grey' || hue === 'sage' ? 'rest' : hue);

/** The loud form: the hue as the ground, its own ink on it. */
export const filled: Record<Hue, string> = {
  yours: 'bg-yours text-on-yours',
  alive: 'bg-alive text-on-alive',
  failure: 'bg-failure text-on-failure',
  grey: 'bg-rest text-on-rest',
  sage: 'bg-sage text-on-sage',
};

/** The tonal form: the hue's container as the ground, quieter than `filled`. */
export const container: Record<Hue, string> = {
  yours: 'bg-yours-container text-on-yours-container',
  alive: 'bg-alive-container text-on-alive-container',
  failure: 'bg-failure-container text-on-failure-container',
  grey: 'bg-surface-container-highest text-on-surface-variant',
  sage: 'bg-surface-variant text-on-surface-variant',
};

/** No ground of its own: the hue as a ring, and as the ink where the hue reads on the page's ground. */
export const ringed: Record<Hue, string> = {
  yours: 'text-yours ring-1 ring-yours ring-inset',
  alive: 'text-alive ring-1 ring-alive ring-inset',
  failure: 'text-failure ring-1 ring-failure ring-inset',
  grey: 'text-on-surface-variant ring-1 ring-rest ring-inset',
  sage: 'text-on-surface-variant ring-1 ring-sage ring-inset',
};

/** No ground of its own, and a dashed border: something the board cannot read or name. */
export const dashed: Record<Hue, string> = {
  yours: 'border border-dashed border-yours text-yours',
  alive: 'border border-dashed border-alive text-alive',
  failure: 'border border-dashed border-failure text-failure',
  grey: 'border border-dashed border-outline text-on-surface-variant',
  sage: 'border border-dashed border-sage text-on-surface-variant',
};

/** A hairline ring on the page's ground: what is still to come, whatever its hue. */
export const hairline = 'text-on-surface-variant ring-1 ring-outline-variant ring-inset';

/** The hue as ink on the page's ground: an error in `failure`, an ask in `yours`. */
export const ink: Record<Hue, string> = {
  yours: 'text-yours',
  alive: 'text-alive',
  failure: 'text-failure',
  grey: 'text-on-surface-variant',
  sage: 'text-on-surface-variant',
};

/** The hue as a border's colour: a gate's frame, a running node's. */
export const edged: Record<Hue, string> = {
  yours: 'border-yours',
  alive: 'border-alive',
  failure: 'border-failure',
  grey: 'border-rest',
  sage: 'border-sage',
};

/** The hue as a colour outside Tailwind: a minimap's fill, an SVG's stroke. */
export const paint: Record<Hue, string> = {
  yours: 'var(--meaning-yours)',
  alive: 'var(--meaning-alive)',
  failure: 'var(--meaning-failure)',
  grey: 'var(--meaning-rest)',
  sage: 'var(--meaning-sage)',
};
