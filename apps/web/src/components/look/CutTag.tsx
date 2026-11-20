import type { ReactNode } from 'react';
import { cutEdge, cutRing, cutShape } from './cut';

/** How long the tag's cut is along each side, in pixels: its top-right corner alone. */
const CUT = 7;

/** The room between the tag and its focus ring, and the ring's width, in pixels: the kit's ring's own, as the cut button's. */
const [GAP, RING] = [2, 3];

/**
 * What the tag takes off what it holds, at every depth: a border, a ring or a shadow, and an outline, each of which its clip would cut
 * open at the diagonal. Each wins over the held part's own, a focus state's too (`focus-visible:ring-*`, the kit's `focusRing`): the
 * tag draws its edge and its ring itself, in its cut shape. The border is made transparent rather than taken off, so the tag keeps
 * its size.
 */
const BARE = '**:border-transparent! **:[box-shadow:none]! **:outline-none!';

/**
 * The edge's paint, the outline's quiet hue as an image: a ground colour under the words would be taken by the accessibility check,
 * which reads no clip, as the words' ground (the cut button's `HAIRLINE_PAINT`).
 */
const EDGE_PAINT = 'linear-gradient(var(--md-sys-color-outline-variant), var(--md-sys-color-outline-variant))';

/**
 * A tag with its top-right corner cut, as the look cuts the tag that says a state, whatever tag it holds: the kit's `Tag`, or a span
 * in a meaning's hue. The holder is cut by nothing; inside it, the tag's shape is clipped to the cut (`data-cut-shape`), and what it
 * holds loses its own border, ring and outline (`BARE`), which the clip would cut open at the diagonal. With `edge` it draws its own
 * edge instead, a pixel of the outline's quiet hue along the whole cut shape, the diagonal too (`data-cut-edge`): for an outlined
 * tag, or a hairline. When something it holds has the keyboard's focus (a link around the tag), it draws the focus ring itself, a band
 * in the cut shape around it, as wide and as far as the kit's (`data-cut-ring`).
 */
export function CutTag({ edge = false, children }: { edge?: boolean; children: ReactNode }) {
  return (
    <span data-cut-tag className="group/tag relative inline-flex">
      <span
        aria-hidden="true"
        data-cut-ring
        className="pointer-events-none absolute -inset-[5px] hidden bg-ring group-has-[:focus-visible]/tag:block group-has-data-focus-visible/tag:block"
        style={{ clipPath: cutRing(CUT, GAP, RING, 'top-right') }}
      />
      <span data-cut-shape className={`relative inline-flex ${BARE}`} style={{ clipPath: cutShape(CUT, 'top-right') }}>
        {children}
        {edge && (
          <span
            aria-hidden="true"
            data-cut-edge
            className="pointer-events-none absolute inset-0"
            style={{ clipPath: cutEdge(CUT, 1, 'top-right'), backgroundImage: EDGE_PAINT }}
          />
        )}
      </span>
    </span>
  );
}
