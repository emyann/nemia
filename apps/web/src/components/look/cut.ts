/**
 * The look's cut, as the look's parts take it: the outline of a box with its top-right and bottom-left corners cut (or its top-right
 * alone, a tag's), its clip, the clip of a ring beside it, of a band along its edge, and of what it holds kept inside its diagonals.
 * No file outside the look writes a cut (`test/look.test.ts`): it takes the part that draws one.
 */

/** How long a cut is along each side, in pixels: a card's, a table's, a button's, a field's, a cue's. */
export type CutSize = 28 | 24 | 12 | 10 | 9;

/** Which corners a cut takes: the top-right and the bottom-left, as a card, a field or a button is cut, or the top-right alone, a tag's. */
type Corners = 'two' | 'top-right';

/** How much longer a cut is, for each pixel its shape is grown by on every side, so the grown cut runs beside the first: 2 − √2. */
const GROWN = 2 - Math.SQRT2;

/** A length in pixels as a polygon writes it, to the hundredth. */
const px = (length: number) => `${Number(length.toFixed(2))}px`;

/** A length from the box's far side, its right or its bottom, as a polygon writes it. */
const far = (length: number) => (length === 0 ? '100%' : length < 0 ? `calc(100% + ${px(-length)})` : `calc(100% - ${px(length)})`);

/**
 * The outline of a box whose corners are cut, as a `polygon`'s points: the box's own, or with `inset` the outline that many pixels
 * inside it, its cuts beside the first's.
 *
 * @param cut how long a cut is along each side of the box, in pixels
 * @param inset how far inside the box the outline runs, in pixels
 * @param corners which corners are cut: the top-right and the bottom-left, or the top-right alone
 */
export function cutPoints(cut: number, inset = 0, corners: Corners = 'two') {
  const [a, b] = [inset, inset + cut - inset * GROWN];
  const foot = corners === 'two' ? [`${px(b)} ${far(a)}`, `${px(a)} ${far(b)}`] : [`${px(a)} ${far(a)}`];
  return [`${px(a)} ${px(a)}`, `${far(b)} ${px(a)}`, `${far(a)} ${px(b)}`, `${far(a)} ${far(a)}`, ...foot].join(', ');
}

/**
 * The clip that leaves a box its cut shape: its corners cut by `cut` pixels.
 *
 * @param cut how long the cut of each corner is, in pixels
 * @param corners which corners are cut: the top-right and the bottom-left, or the top-right alone
 */
export const cutShape = (cut: number, corners: Corners = 'two') => `polygon(${cutPoints(cut, 0, corners)})`;

/** The clip of the band between the outline `cut` pixels cut and the one `width` pixels inside it, each cut beside the other. */
function band(cut: number, width: number, corners: Corners) {
  const outer = cutPoints(cut, 0, corners);
  const inner = cutPoints(cut, width, corners);
  const [from, hole] = [outer.split(', ')[0], inner.split(', ')[0]];
  return `polygon(evenodd, ${outer}, ${from}, ${inner}, ${hole}, ${from})`;
}

/**
 * The clip that leaves a box a band along its edge, `width` pixels wide, in the cut shape: the ring of a shape `cut` pixels cut that
 * stands inside the box, `width` and a gap from its edge on every side.
 *
 * @param cut how long the cut of the shape inside is, in pixels
 * @param gap the room between the shape and its ring, in pixels
 * @param width how wide the ring is, in pixels
 * @param corners which corners are cut: the top-right and the bottom-left, or the top-right alone
 */
export const cutRing = (cut: number, gap: number, width: number, corners: Corners = 'two') =>
  band(cut + (gap + width) * GROWN, width, corners);

/**
 * The clip that leaves a box its edge: a band `width` pixels wide along the inside of its own cut shape, the cuts too, as a cut
 * frame's edge runs outside its ground.
 *
 * @param cut how long the cut of each corner is, in pixels
 * @param width how wide the edge is, in pixels
 * @param corners which corners are cut: the top-right and the bottom-left, or the top-right alone
 */
export const cutEdge = (cut: number, width: number, corners: Corners = 'two') => band(cut, width, corners);

/** How far past the box the clip of what a cut part holds reaches on its straight sides, in pixels: far enough to cut nothing there. */
const REACH = 9999;

/**
 * The clip that keeps what a cut part holds inside its two diagonals: each the diagonal of the shape `inset` pixels inside the box,
 * the straight sides left open far past the box, so a ring or a shadow along a side is whole and nothing crosses a cut.
 *
 * @param cut how long the cut of the top-right and bottom-left corners is, in pixels
 * @param inset how far inside the box's own diagonals what it holds is kept, in pixels: the width of the edge drawn on them
 */
export function cutHold(cut: number, inset: number) {
  const reach = inset + (inset + cut - inset * GROWN) + REACH;
  return `polygon(${[
    `${px(-REACH)} ${px(-REACH)}`,
    `${far(reach)} ${px(-REACH)}`,
    `${far(-REACH)} ${px(reach)}`,
    `${far(-REACH)} ${far(-REACH)}`,
    `${px(reach)} ${far(-REACH)}`,
    `${px(-REACH)} ${far(reach)}`,
  ].join(', ')})`;
}
