"use client";

import {
  ProgressBar as AriaProgressBar,
  type ProgressBarProps as AriaProgressBarProps,
} from "react-aria-components";

import { composeTailwindRenderProps } from "../render-props";
import { tv } from "../utils";

const styles = tv({
  slots: {
    base: "inline-flex shrink-0 items-center justify-center align-middle",
    svg: "md3-loading-indicator-spin block overflow-visible",
    container: "fill-primary-container",
    activeIndicator: "md3-loading-indicator-morph fill-primary",
  },
  variants: {
    variant: {
      default: {},
      contained: { activeIndicator: "fill-on-primary-container" },
    },
  },
  defaultVariants: { variant: "default" },
});

/** MD3: 48dp by default (`md.comp.loading-indicator.container.width`). */
const DEFAULT_SIZE = 48;
/** The spec's range: 24–240dp. */
const MIN_SIZE = 24;
const MAX_SIZE = 240;
/** `…active-indicator.size` over `…container.width`: 38dp in 48dp. */
const INDICATOR_RATIO = 38 / 48;
/** The viewBox is 100 units wide, centred on 0. */
const HALF_BOX = 50;
/** Points on every outline: the same count for every shape is what lets CSS
    interpolate `d`, and enough of them keep the soft burst's ten points. */
const SAMPLES = 120;

type Point = { x: number; y: number };
/** A vertex in the unit square, with the radius its corner is cut to. */
type Vertex = Point & { r: number };

const rotateAbout = ({ x, y }: Point, degrees: number): Point => {
  const a = (degrees * Math.PI) / 180;
  const dx = x - 0.5;
  const dy = y - 0.5;
  return {
    x: 0.5 + dx * Math.cos(a) - dy * Math.sin(a),
    y: 0.5 + dx * Math.sin(a) + dy * Math.cos(a),
  };
};

/** Points repeated around the centre, `reps` times. With `mirror`, each
    repeat also holds its points reflected across the axis through the
    centre and the first point, walked back so the outline stays in order. */
function repeated(points: Vertex[], reps: number, mirror = false): Vertex[] {
  let unit = points;
  if (mirror) {
    const axis = Math.atan2(points[0]!.y - 0.5, points[0]!.x - 0.5);
    const reflect = (v: Vertex): Vertex => {
      const dx = v.x - 0.5;
      const dy = v.y - 0.5;
      const c = Math.cos(2 * axis);
      const s = Math.sin(2 * axis);
      return { x: 0.5 + dx * c + dy * s, y: 0.5 + dx * s - dy * c, r: v.r };
    };
    unit = [...points.slice(1).reverse().map(reflect), ...points];
  }
  const out: Vertex[] = [];
  for (let i = 0; i < reps; i++) {
    for (const v of unit)
      out.push({ ...rotateAbout(v, (360 / reps) * i), r: v.r });
  }
  return out;
}

/** A star in the unit square: `points` outer vertices at radius 0.5 and as
    many inner ones at `inner` of it, the first outer one at `turn` degrees. */
function star(
  points: number,
  inner: number,
  rounding: number,
  turn = 0,
): Vertex[] {
  const out: Vertex[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = ((turn + (180 / points) * i) * Math.PI) / 180;
    const radius = i % 2 === 0 ? 0.5 : 0.5 * inner;
    // A star's rounding is given against a radius of 1; the unit square's is 0.5.
    out.push({
      x: 0.5 + radius * Math.cos(a),
      y: 0.5 + radius * Math.sin(a),
      r: rounding / 2,
    });
  }
  return out;
}

/** The outline of a polygon whose corners are cut by circular arcs tangent
    to both edges, each at its vertex's radius, as a dense polyline. Where two
    corners want more of an edge than it has, both cuts shrink in proportion. */
function rounded(vertices: Vertex[]): Point[] {
  const n = vertices.length;
  const at = (i: number) => vertices[((i % n) + n) % n]!;
  const length = (i: number) => {
    const p = at(i);
    const q = at(i + 1);
    return Math.hypot(q.x - p.x, q.y - p.y);
  };
  // The half-angle at each vertex, and how far along each edge its cut runs.
  const half = vertices.map((p, i) => {
    const a = at(i - 1);
    const b = at(i + 1);
    const ua = Math.atan2(a.y - p.y, a.x - p.x);
    const ub = Math.atan2(b.y - p.y, b.x - p.x);
    let d = Math.abs(ua - ub);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d / 2;
  });
  const want = vertices.map((p, i) =>
    p.r > 0 ? p.r / Math.tan(Math.max(half[i]!, 1e-6)) : 0,
  );
  // Edge i runs from vertex i to i + 1.
  const fit = vertices.map((_, i) => {
    const total = want[i]! + want[(i + 1) % n]!;
    return total > length(i) ? length(i) / total : 1;
  });

  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p = at(i);
    const cut = want[i]! * Math.min(fit[(i + n - 1) % n]!, fit[i]!);
    if (cut <= 0) {
      out.push(p);
      continue;
    }
    const a = at(i - 1);
    const b = at(i + 1);
    const la = Math.hypot(a.x - p.x, a.y - p.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    const ua = { x: (a.x - p.x) / la, y: (a.y - p.y) / la };
    const ub = { x: (b.x - p.x) / lb, y: (b.y - p.y) / lb };
    const t1 = { x: p.x + ua.x * cut, y: p.y + ua.y * cut };
    const t2 = { x: p.x + ub.x * cut, y: p.y + ub.y * cut };
    // The arc's centre lies on the bisector, a radius away from both edges.
    const radius = cut * Math.tan(half[i]!);
    const bx = ua.x + ub.x;
    const by = ua.y + ub.y;
    const bl = Math.hypot(bx, by) || 1;
    const away = radius / Math.sin(Math.max(half[i]!, 1e-6));
    const c = { x: p.x + (bx / bl) * away, y: p.y + (by / bl) * away };
    const from = Math.atan2(t1.y - c.y, t1.x - c.x);
    let sweep = Math.atan2(t2.y - c.y, t2.x - c.x) - from;
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    if (sweep < -Math.PI) sweep += 2 * Math.PI;
    for (let k = 0; k <= 12; k++) {
      const angle = from + (sweep * k) / 12;
      out.push({
        x: c.x + radius * Math.cos(angle),
        y: c.y + radius * Math.sin(angle),
      });
    }
  }
  return out;
}

function ellipse(rx: number, ry: number, turn: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const a = (2 * Math.PI * i) / SAMPLES;
    out.push(
      rotateAbout(
        { x: 0.5 + rx * Math.cos(a), y: 0.5 + ry * Math.sin(a) },
        turn,
      ),
    );
  }
  return out;
}

/** The seven, in the order Compose's loading indicator morphs through them. */
const SHAPES: Point[][] = [
  // 1. Soft burst
  rounded(
    repeated(
      [
        { x: 0.193, y: 0.277, r: 0.053 },
        { x: 0.176, y: 0.055, r: 0.053 },
      ],
      10,
    ),
  ),
  // 2. 9-sided cookie
  rounded(star(9, 0.8, 0.5, -90)),
  // 3. Pentagon
  rounded(
    repeated(
      [
        { x: 0.5, y: -0.009, r: 0.172 },
        { x: 1.03, y: 0.365, r: 0.164 },
        { x: 0.828, y: 0.97, r: 0.169 },
      ],
      1,
      true,
    ),
  ),
  // 4. Pill
  rounded(
    repeated(
      [
        { x: 0.961, y: 0.039, r: 0.426 },
        { x: 1.001, y: 0.428, r: 0 },
        { x: 1.0, y: 0.609, r: 1 },
      ],
      2,
      true,
    ),
  ),
  // 5. Sunny
  rounded(star(8, 0.8, 0.15)),
  // 6. 4-sided cookie
  rounded(
    repeated(
      [
        { x: 1.237, y: 1.236, r: 0.258 },
        { x: 0.5, y: 0.918, r: 0.233 },
      ],
      4,
    ),
  ),
  // 7. Oval
  ellipse(0.5, 0.32, -45),
];

/** Where a ray from the centre at `angle` leaves the outline: the farthest
    crossing, since every one of these shapes is seen whole from its centre. */
function reach(outline: Point[], angle: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = 0;
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i]!;
    const q = outline[(i + 1) % outline.length]!;
    const px = p.x - 0.5;
    const py = p.y - 0.5;
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const t = (px * ey - py * ex) / denom;
    const s = (px * dy - py * dx) / denom;
    if (t > 0 && s >= 0 && s <= 1 && t > best) best = t;
  }
  return best;
}

/** One shape as a path in the viewBox: `SAMPLES` points from the top, at the
    same angles for every shape, scaled so its farthest point touches the
    active indicator's circle. */
function toPath(outline: Point[]): string {
  const radii = Array.from({ length: SAMPLES }, (_, i) =>
    reach(outline, -Math.PI / 2 + (2 * Math.PI * i) / SAMPLES),
  );
  const scale = (HALF_BOX * INDICATOR_RATIO) / Math.max(...radii);
  const points = radii.map((r, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / SAMPLES;
    return `${(r * scale * Math.cos(a)).toFixed(2)} ${(r * scale * Math.sin(a)).toFixed(2)}`;
  });
  return `M${points.join("L")}Z`;
}

const PATHS = SHAPES.map(toPath);

const STEP = "var(--md3-duration-long-4, 600ms)";

/** The morph and the turn, rendered with `href` + `precedence` so React hoists
    them into `<head>` once however many indicators are on the page. */
const MORPH_STYLE = `
@keyframes md3-loading-indicator-morph {
${[...PATHS, PATHS[0]!]
  .map(
    (d, i) =>
      `  ${((i / PATHS.length) * 100).toFixed(3)}% { d: path("${d}"); transform: rotate(${((720 / PATHS.length) * i).toFixed(3)}deg); }`,
  )
  .join("\n")}
}
@keyframes md3-loading-indicator-spin {
  to { transform: rotate(360deg); }
}
.md3-loading-indicator-morph {
  transform-box: view-box;
  /* The viewBox is centred on 0, so its origin is the shape's centre. */
  transform-origin: 0 0;
  animation: md3-loading-indicator-morph calc(${PATHS.length} * ${STEP})
    var(--md-sys-motion-easing-emphasized, cubic-bezier(0.2, 0, 0, 1)) infinite;
}
.md3-loading-indicator-spin {
  animation: md3-loading-indicator-spin calc(8 * ${STEP}) linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .md3-loading-indicator-morph, .md3-loading-indicator-spin { animation: none; }
}
`;

export type LoadingIndicatorProps = Omit<
  AriaProgressBarProps,
  | "children"
  | "value"
  | "minValue"
  | "maxValue"
  | "valueLabel"
  | "formatOptions"
  | "isIndeterminate"
> & {
  /** `default` (the active indicator alone, on a surface) or `contained`
      (on a `primary-container` circle, over other content). */
  variant?: "default" | "contained";
  /** Diameter in px, clamped to the spec's 24–240. Default 48. */
  size?: number;
  className?: string;
  /** Classes for the parts, keyed by slot. */
  classNames?: { container?: string; activeIndicator?: string };
};

/**
 * Loading indicator — Material 3 Expressive's looping shape morph, for a short
 * wait whose length is not known (between 200ms and 5s), on React Aria's
 * `ProgressBar` with `isIndeterminate` always on, so the `progressbar` role
 * with no value comes from the behaviour layer.
 *
 *   <LoadingIndicator aria-label="Loading news article" />
 *   <LoadingIndicator variant="contained" aria-label="Refreshing page" />
 *   <LoadingIndicator aria-label="Checking for updates" size={24} />
 *
 * Spec: https://m3.material.io/components/loading-indicator/overview ·
 * .../specs · .../guidelines · .../accessibility (pages updated 2026-07-29,
 * token table revision 2026-05-27, read 2026-10-14).
 *
 * Anatomy is the spec's two parts: the **active indicator** and an optional
 * **container**. `variant="default"` draws the active indicator alone, in
 * `primary` (`md.comp.loading-indicator.active-indicator.color`), for a loader
 * placed directly on a surface. `variant="contained"` puts it in
 * `on-primary-container` on a `primary-container` circle
 * (`md.comp.loading-indicator.contained.active-indicator.color`,
 * `…contained.container.color`, `…container.shape` = corner full), for a
 * loader placed over other content. The size is 48dp with a 38dp active
 * indicator (`…container.width/height`, `…active-indicator.size`); `size`
 * scales it from 24 to 240dp, the spec's range, and the 38/48 ratio holds at
 * every size.
 *
 * There is no `value`: the spec says a loading indicator never turns into a
 * determinate one. A process whose progress becomes known uses
 * `ProgressIndicator` from the start.
 *
 * Accessibility: it is a visual cue, so it needs a label that says what is
 * loading ("Loading news article", "Refreshing page"), passed as `aria-label`
 * or `aria-labelledby`. Without one the role has no name and axe fails it. It
 * is not focusable. The active indicator meets 3:1 against its surface or
 * container; the container itself need not.
 *
 * **The seven shapes.** The spec calls the active indicator "a looping shape
 * morph sequence composed of seven unique Material 3 shapes", and Material's
 * shape-morph page says web is not currently available. The sequence is the
 * one Compose's loading indicator uses (`LoadingIndicatorDefaults.
 * IndeterminateIndicatorPolygons`, androidx `compose/material3/…/
 * LoadingIndicator.kt`), and each shape's parameters are the published ones in
 * Compose's `MaterialShapes` reference
 * (https://developer.android.com/reference/kotlin/androidx/compose/material3/MaterialShapes,
 * source `compose/material3/…/MaterialShapes.kt`), read 2026-10-14:
 *
 *   1. Soft burst — 10 repeats of (0.193, 0.277) and (0.176, 0.055), rounding 0.053
 *   2. 9-sided cookie — a 9-point star, inner radius 0.8, rounding 0.5, turned -90°
 *   3. Pentagon — (0.5, -0.009), (1.03, 0.365), (0.828, 0.97) mirrored,
 *      roundings 0.172, 0.164, 0.169
 *   4. Pill — (0.961, 0.039) r 0.426, (1.001, 0.428), (1.0, 0.609) r 1,
 *      mirrored, 2 repeats
 *   5. Sunny — an 8-point star, inner radius 0.8, rounding 0.15
 *   6. 4-sided cookie — 4 repeats of (1.237, 1.236) r 0.258 and (0.5, 0.918) r 0.233
 *   7. Oval — a circle scaled to 0.64 in height, turned -45°
 *
 * The geometry is the kit's own code, not a port: each shape's points are
 * placed in the unit square, each corner is cut by an arc of its rounding,
 * and the outline is sampled from the centre at the same angles for every
 * shape, so CSS can interpolate one path into the next without twisting.
 *
 * Motion. The paths become one `@keyframes` on `d`, each step one
 * `--md3-duration-long-4` (Compose steps every 650ms; 600ms is the nearest
 * token) on `--md-sys-motion-easing-emphasized`, with a turn of 720°/7 per
 * step so the loop closes on a whole turn; the whole indicator also turns once
 * every eight steps. The keyframes ship as a `<style>` element inside this
 * file, as `ProgressIndicator`'s sweep does, so a copied component carries its
 * own motion and React emits it once per page. Under
 * `prefers-reduced-motion: reduce` both animations stop on the first shape.
 *
 * Deviations, each recorded:
 *
 * - **The shapes are drawn by the kit, from Compose's parameters**, so their
 *   curves may differ slightly from Compose's own; each is scaled to fill the
 *   38dp circle as it turns, where Compose scales the set as one.
 * - **The morph eases** on the emphasized curve where Compose springs.
 * - **Where CSS cannot animate `d`** (WebKit, today), the first shape turns
 *   without morphing; it still says "working".
 * - **No pull-to-refresh.** The spec gives it to Jetpack Compose only.
 *
 * Parts, each reachable through `classNames` and by `data-slot`:
 * `container` (`loading-indicator-container`, contained only) and
 * `activeIndicator` (`loading-indicator-active-indicator`).
 */
export function LoadingIndicator({
  variant = "default",
  size = DEFAULT_SIZE,
  className,
  classNames,
  ...props
}: LoadingIndicatorProps) {
  const s = styles({ variant });
  const px = Math.min(Math.max(size, MIN_SIZE), MAX_SIZE);

  return (
    <AriaProgressBar
      data-slot="loading-indicator"
      data-variant={variant}
      data-size={px}
      {...props}
      isIndeterminate
      className={composeTailwindRenderProps(className, s.base())}
    >
      <style href="md3-loading-indicator" precedence="medium">
        {MORPH_STYLE}
      </style>
      <svg
        width={px}
        height={px}
        viewBox={`${-HALF_BOX} ${-HALF_BOX} ${HALF_BOX * 2} ${HALF_BOX * 2}`}
        aria-hidden="true"
        className={s.svg()}
      >
        {variant === "contained" && (
          <circle
            data-slot="loading-indicator-container"
            r={HALF_BOX}
            className={s.container({ className: classNames?.container })}
          />
        )}
        <path
          data-slot="loading-indicator-active-indicator"
          d={PATHS[0]}
          className={s.activeIndicator({
            className: classNames?.activeIndicator,
          })}
        />
      </svg>
    </AriaProgressBar>
  );
}

export default LoadingIndicator;
