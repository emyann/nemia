/**
 * The look's cut, as any part takes it: the outline of a box with its top-right and bottom-left corners cut, its clip, and the clip
 * of a ring beside it.
 */

/** How long a cut is along each side, in pixels: a card's, a table's, a button's, a field's, a cue's. */
export type CutSize = 28 | 24 | 12 | 10 | 9;

/** How much longer a cut is, for each pixel its shape is grown by on every side, so the grown cut runs beside the first: 2 − √2. */
const GROWN = 2 - Math.SQRT2;

/**
 * The outline of a box whose top-right and bottom-left corners are cut, as a `polygon`'s points: the box's own, or with `inset` the
 * outline that many pixels inside it, its cuts beside the first's.
 *
 * @param cut how long a cut is along each side of the box, in pixels
 * @param inset how far inside the box the outline runs, in pixels
 */
export function cutPoints(cut: number, inset = 0): string {
  const far = (length: number) => (length === 0 ? '100%' : `calc(100% - ${Number(length.toFixed(2))}px)`);
  const near = (length: number) => `${Number(length.toFixed(2))}px`;
  const [a, b] = [inset, inset + cut - inset * GROWN];
  return [
    `${near(a)} ${near(a)}`,
    `${far(b)} ${near(a)}`,
    `${far(a)} ${near(b)}`,
    `${far(a)} ${far(a)}`,
    `${near(b)} ${far(a)}`,
    `${near(a)} ${far(b)}`,
  ].join(', ');
}

/** The clip that leaves a box its cut shape: its top-right and bottom-left corners cut by `cut` pixels. */
export const cutShape = (cut: number): string => `polygon(${cutPoints(cut)})`;

/**
 * The clip that leaves a box a band along its edge, `width` pixels wide, in the cut shape: the ring of a shape `cut` pixels cut that
 * stands inside the box, `width` and a gap from its edge on every side.
 *
 * @param cut how long the cut of the shape inside is, in pixels
 * @param gap the room between the shape and its ring, in pixels
 * @param width how wide the ring is, in pixels
 */
export function cutRing(cut: number, gap: number, width: number): string {
  const outer = cutPoints(cut + (gap + width) * GROWN);
  const inner = cutPoints(cut + (gap + width) * GROWN, width);
  const [from, hole] = [outer.split(', ')[0], inner.split(', ')[0]];
  return `polygon(evenodd, ${outer}, ${from}, ${inner}, ${hole}, ${from})`;
}
