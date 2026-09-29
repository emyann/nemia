/**
 * The floor's frame and what shows in it: whether it is laid out, whether a card is in view under React Flow's transform, and where to
 * move the view to bring one into it. Pure, for the Factory's floor (`FactoryCanvas`) and its node test.
 */

/** How big a frame is drawn, in its own pixels. */
export type Size = { width: number; height: number };

/** A card's box on the floor, in the floor's units. */
export type Box = { x: number; y: number; width: number; height: number };

/** React Flow's transform: the pan across and down, in the frame's pixels, and the zoom. */
export type Transform = readonly [x: number, y: number, zoom: number];

/** A view to move to, as React Flow's `setViewport` takes it. */
export type View = { x: number; y: number; zoom: number };

/** How big `el` is laid out, in its own pixels: 0 × 0 while it is hidden or off the page. */
export const sizeOf = (el: { clientWidth: number; clientHeight: number }): Size => ({ width: el.clientWidth, height: el.clientHeight });

/** What a card is to React Flow's store, in so far as it says where the card is drawn on the floor and how big it measured. */
export type Measured = { internals: { positionAbsolute: { x: number; y: number } }; measured: { width?: number; height?: number } };

/** The boxes of `nodes` on the floor, as React Flow's store keeps them (`nodeLookup`); a card not measured yet takes no room. */
export function boxesOf(nodes: Iterable<Measured>): Box[] {
  return [...nodes].map(({ internals, measured }) => ({
    ...internals.positionAbsolute,
    width: measured.width ?? 0,
    height: measured.height ?? 0,
  }));
}

/** How much of the frame a card brought into view may take across or down, at most. */
const ROOM = 0.9;

/**
 * Whether a frame measured `size` is laid out: wider and taller than nothing. A frame hidden, taken off the page, or squeezed flat by
 * what is drawn beside it measures 0, and a view aimed at its middle then puts every card above and left of it.
 */
export const sized = ({ width, height }: Size): boolean => width > 0 && height > 0;

/** `box` as it is drawn in the frame under `transform`. */
function drawn(box: Box, [x, y, zoom]: Transform): Box {
  return { x: box.x * zoom + x, y: box.y * zoom + y, width: box.width * zoom, height: box.height * zoom };
}

/** Whether all of `box` is drawn inside a frame of `size` under `transform`. */
export function wholeInView(box: Box, transform: Transform, size: Size): boolean {
  const at = drawn(box, transform);
  return at.x >= 0 && at.y >= 0 && at.x + at.width <= size.width && at.y + at.height <= size.height;
}

/** Whether any of `boxes` is drawn, even in part, inside a frame of `size` under `transform`; none is in no frame without a size. */
export function anyInView(boxes: readonly Box[], transform: Transform, size: Size): boolean {
  return boxes.some((box) => {
    const at = drawn(box, transform);
    return at.x < size.width && at.y < size.height && at.x + at.width > 0 && at.y + at.height > 0;
  });
}

/**
 * Where a side `length` long starting at `start`, at `zoom`, is drawn on an axis of the frame `room` long: its middle in the frame's
 * middle when it fits, else its start at the frame's start, so a card taller or wider than the frame shows its head.
 */
function aim(start: number, length: number, room: number, zoom: number): number {
  return length * zoom <= room ? room / 2 - (start + length / 2) * zoom : -start * zoom;
}

/**
 * The view that brings `box` into a frame of `size` from `transform`, in the room below the first `top` pixels of it, which the panels
 * drawn over its top take: at the zoom it has, or zoomed out only as far as it must be to fit, never past `minZoom`; its middle in the
 * room's middle, or, on a side it does not fit even then, its left at the room's left or its top at the room's top. Null when all of it
 * is in that room already, and when the frame has no room below its panels — hidden, squeezed flat, or a strip — which has no middle
 * to aim at: a caller that must bring the card into view waits until the frame has one.
 */
export function revealView(box: Box, transform: Transform, size: Size, minZoom: number, top = 0): View | null {
  const room = { width: size.width, height: size.height - top };
  const [x, y, now] = transform;
  if (!sized(room) || wholeInView(box, [x, y - top, now], room)) return null;
  const zoom = Math.max(minZoom, Math.min(now, (ROOM * room.width) / box.width, (ROOM * room.height) / box.height));
  return { x: aim(box.x, box.width, room.width, zoom), y: top + aim(box.y, box.height, room.height, zoom), zoom };
}
