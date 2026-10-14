"use client";

import { type ReactNode } from "react";
import {
  Label,
  Meter as AriaMeter,
  type MeterProps as AriaMeterProps,
} from "react-aria-components";

import { composeTailwindRenderProps } from "../render-props";
import { tv } from "../utils";

/**
 * A meter: a quantity within a known range — a quota, a disk's use, a score —
 * on React Aria's `Meter`, so the `meter` role, `aria-valuenow`,
 * `aria-valuemin`, `aria-valuemax`, `aria-valuetext` and the locale-formatted
 * value come from the behaviour layer (`value`, `minValue`, `maxValue`,
 * `formatOptions`, `valueLabel`). It is not progress on a task: for that,
 * `ProgressIndicator`.
 *
 *   <Meter label="Storage used" value={62} showValue />
 *   <Meter label="Boards this month" value={3} maxValue={5} valueLabel="3 of 5" showValue />
 *   <Meter label="Over your plan" value={100} color="error" />
 *
 * Material 3 does not describe this component. It is Material-derived: its
 * anatomy is the determinate linear progress indicator's, and each borrowing
 * is cited by its page.
 *
 * - **Anatomy, colour roles and measures**:
 *   https://m3.material.io/components/progress-indicators/specs — the track,
 *   the active indicator and the stop indicator; the active and stop
 *   indicators `primary` (`md.comp.progress-indicator.active-indicator.color`,
 *   `…stop-indicator.color`) and the track `secondary-container`
 *   (`…track.color`); every end `rounded-shape-full` (`…track.shape`,
 *   `…active-indicator.shape` = `md.sys.shape.corner.full`); 4dp thick
 *   (`…linear.active-indicator.thickness`), configurable ("Track thickness …
 *   Configurable"); a 4dp gap between the active indicator and the track
 *   (`…linear.track-active-indicator-space`); a 4dp stop indicator
 *   (`…linear.stop-indicator.size`) flush with the trailing end
 *   (`…linear.stop-indicator.trailing-space` 0dp), and on a thicker bar
 *   still 4dp, centred in the rounded end (`…linear.thick.stop-indicator.
 *   size` 4dp, `…trailing-space` 2dp at 8dp).
 * - **The low value as a dot, the stop indicator, the mirroring**:
 *   https://m3.material.io/components/progress-indicators/guidelines — "At
 *   low percentages … this should appear as a dot", so a non-zero value
 *   draws at least one thickness; the stop indicator marks the end of the
 *   track; "Linear progress indicators should be mirrored horizontally" in
 *   right-to-left, so the bar is placed with logical insets.
 * - **Contrast and the name**:
 *   https://m3.material.io/components/progress-indicators/accessibility — the
 *   active indicator at 3:1 against its surface; the stop indicator kept
 *   while the track is below 3:1 with what is around it, which
 *   `secondary-container` on a surface is; a label that says what is
 *   measured.
 * - **The four colours**: https://m3.material.io/styles/color/roles — `color`
 *   takes `primary` (default, the progress indicator's own), `secondary`,
 *   `tertiary` or `error` ("Use error roles to communicate error states") for
 *   the active and stop indicators. The track stays `secondary-container`
 *   whatever the colour. There is no neutral: Material gives the active
 *   indicator no surface role.
 * - **The label and the value**: https://m3.material.io/styles/typography —
 *   written as `ProgressIndicator` writes them: the label `label-large` in
 *   `on-surface`, the value `label-medium` in `on-surface-variant`, with
 *   tabular figures; `showValue` defaults to false.
 * - **The shape**: https://m3.material.io/styles/shape — the full corner.
 * - **Right to left**: https://m3.material.io/foundations/layout/bidirectionality-rtl
 *
 * Not kept, because a meter is a reading and not a task under way: the
 * indeterminate states, the circular form, the wavy active indicator, and
 * motion — a value that changes is drawn at once, with no transition. Not
 * applicable: a state layer and the 48dp target, because a meter is read,
 * not driven; it takes no focus, press or hover.
 *
 * Accessibility: pass `label` (a React Aria `Label`, wired through
 * `aria-labelledby`) or `aria-label`. Colour never carries the meaning alone:
 * the label or the value text says it ("Over your plan"). React Aria clamps
 * the value to `minValue`…`maxValue`, so a quantity over the range reads and
 * draws as the maximum; say that it is over in the label or in `valueLabel`.
 * In forced-colours mode the bar is drawn in system colours.
 */
const styles = tv({
  slots: {
    base: "flex w-full flex-col gap-2",
    header: "flex items-baseline justify-between gap-2",
    label: "text-label-large font-label-large text-on-surface",
    value: "text-label-medium font-label-medium text-on-surface-variant tabular-nums",
    track: "relative w-full overflow-hidden rounded-shape-full",
    activeIndicator:
      "absolute inset-y-0 start-0 rounded-shape-full forced-colors:bg-[CanvasText]",
    remainingTrack:
      "absolute inset-y-0 rounded-shape-full bg-secondary-container forced-colors:bg-[GrayText]",
    stopIndicator:
      "absolute top-1/2 -translate-y-1/2 rounded-shape-full forced-colors:bg-[CanvasText]",
  },
  variants: {
    color: {
      primary: { activeIndicator: "bg-primary", stopIndicator: "bg-primary" },
      secondary: { activeIndicator: "bg-secondary", stopIndicator: "bg-secondary" },
      tertiary: { activeIndicator: "bg-tertiary", stopIndicator: "bg-tertiary" },
      error: { activeIndicator: "bg-error", stopIndicator: "bg-error" },
    },
  },
  defaultVariants: { color: "primary" },
});

/** MD3 baseline: 4dp thickness (`md.comp.progress-indicator.linear.active-indicator.thickness`). */
const THICKNESS = 4;
/** MD3: a 4dp stop indicator at every thickness (`…linear.stop-indicator.size`, `…linear.thick.stop-indicator.size`). */
const STOP = 4;
/** MD3 baseline: 4dp between the active indicator and the track (`…linear.track-active-indicator-space`). */
const GAP = 4;

export type MeterProps = Omit<AriaMeterProps, "children"> & {
  /** A visible label that says what is measured. Prefer it over `aria-label`
      where there is room. */
  label?: ReactNode;
  /** Show the formatted value (or `valueLabel`) beside the label. */
  showValue?: boolean;
  /** The colour role of the active and stop indicators; default `primary`.
      The track stays `secondary-container`. */
  color?: "primary" | "secondary" | "tertiary" | "error";
  /** Track and active-indicator thickness in px; default 4. */
  thickness?: number;
  className?: string;
};

export function Meter({
  label,
  showValue = false,
  color = "primary",
  thickness = THICKNESS,
  className,
  ...props
}: MeterProps) {
  const s = styles({ color });
  const stop = Math.min(STOP, thickness);

  return (
    <AriaMeter
      data-slot="meter"
      data-color={color}
      {...props}
      className={composeTailwindRenderProps(className, s.base())}
    >
      {({ percentage, valueText }) => (
        <>
          {(label || showValue) && (
            <div className={s.header()}>
              {label ? <Label className={s.label()}>{label}</Label> : <span />}
              {showValue && <span className={s.value()}>{valueText}</span>}
            </div>
          )}
          <div
            data-slot="meter-track"
            className={s.track()}
            style={{ height: thickness }}
          >
            <div
              data-slot="meter-active-indicator"
              className={s.activeIndicator()}
              // A non-zero value is at least a dot, one thickness wide.
              style={{
                inlineSize: `${percentage}%`,
                minInlineSize: percentage > 0 ? thickness : 0,
              }}
            />
            <div
              data-slot="meter-remaining-track"
              className={s.remainingTrack()}
              // The gap only exists once there is an active indicator to be
              // separated from; at 0 % the track runs edge to edge.
              style={{
                insetInlineStart:
                  percentage > 0
                    ? `calc(max(${percentage}%, ${thickness}px) + ${GAP}px)`
                    : 0,
                insetInlineEnd: 0,
              }}
            />
            <div
              data-slot="meter-stop-indicator"
              className={s.stopIndicator()}
              // 4dp, centred in the track's rounded end: 0dp from the end at
              // 4dp thick, 2dp at 8dp, as Material's thick bar gives it.
              style={{
                height: stop,
                width: stop,
                insetInlineEnd: (thickness - stop) / 2,
              }}
            />
          </div>
        </>
      )}
    </AriaMeter>
  );
}

export default Meter;
