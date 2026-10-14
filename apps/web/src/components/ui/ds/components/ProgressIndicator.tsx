"use client";

import { type ReactNode } from "react";
import {
  Label,
  ProgressBar as AriaProgressBar,
  type ProgressBarProps as AriaProgressBarProps,
} from "react-aria-components";

import { composeTailwindRenderProps } from "../render-props";
import { tv } from "../utils";

/**
 * Progress indicators — the linear bar and the circular ring, each determinate
 * or indeterminate, on React Aria's `ProgressBar` so the `progressbar` role,
 * `aria-valuenow` / `aria-valuetext` and the locale-formatted value label come
 * from the behaviour layer.
 *
 *   <ProgressIndicator label="Uploading menu" value={62} showValue />
 *   <ProgressIndicator label="Loading activity" isIndeterminate />
 *   <ProgressIndicator variant="circular" label="Saving" value={40} />
 *   <ProgressIndicator variant="circular" aria-label="Loading" isIndeterminate size={24} />
 *
 * Spec: https://m3.material.io/components/progress-indicators/overview ·
 * .../specs · .../guidelines · .../accessibility
 *
 * Anatomy is the spec's three parts — active indicator, track, stop indicator.
 * The active indicator and the stop indicator are `primary`
 * (`md.comp.progress-indicator.active-indicator.color`,
 * `…stop-indicator.color`), the track is `secondary-container`
 * (`…track.color`), and every end is `rounded-shape-full`
 * (`…active-indicator.shape` = circular). Defaults are the baseline tokens:
 * 4dp thickness (`…linear.track.thickness`, `…circular.active-indicator.
 * thickness`), a 4dp gap between the active indicator and the track
 * (`…track-active-indicator-space`), a 4dp stop indicator flush with the
 * trailing end (`…linear.stop-indicator.size`, trailing space 0dp), and a 40dp
 * circle (`…circular.size`). `size` and `thickness` are props because the spec
 * makes both configurable — circles range 24–240dp — so a 20dp spinner fits
 * inside a button and a 240dp one fits a desktop empty state.
 *
 * The **stop indicator** is drawn on the determinate linear indicator only, as
 * the spec requires: it marks the end of the track, and it is not used for
 * indeterminate or circular indicators.
 *
 * Accessibility: this is a visual cue, so it needs a name that says what is
 * loading — "Loading news article", not "Loading". Pass `label` for a visible
 * one (a React Aria `Label`, wired through `aria-labelledby`) or `aria-label`
 * when the surrounding copy already says it. Without either, the role has no
 * accessible name and axe fails the story.
 *
 * Deviations from the spec, all for the same reason — the kit ships no
 * animation library and every component must survive being copied into another
 * project as one file:
 *
 * - **The wavy active indicator is not implemented.** M3 Expressive offers
 *   flat and wavy; the kit ships flat, which is the spec default.
 * - **The indeterminate circle rotates at a constant sweep angle** instead of
 *   growing and shrinking as it turns. The grow/shrink cycle needs keyframes
 *   parameterised by each instance's circumference; a constant arc on
 *   Tailwind's own `animate-spin` reads the same and costs no CSS.
 * - **The indeterminate linear sweep is one segment**, not the spec's two, and
 *   it is the one thing here that needs a keyframe. It ships as a `<style>`
 *   element inside this file rather than a token or a dependency, so a copied
 *   component carries its own motion; React de-duplicates it by `href`, so a
 *   page with twenty progress bars still emits one rule. Both animations
 *   respect `prefers-reduced-motion`.
 */
const styles = tv({
  slots: {
    base: "flex w-full flex-col gap-2",
    header: "flex items-baseline justify-between gap-2",
    label: "text-label-large font-label-large text-on-surface",
    value: "text-label-medium font-label-medium text-on-surface-variant tabular-nums",
    track: "relative w-full overflow-hidden rounded-shape-full",
    activeIndicator:
      "absolute inset-y-0 left-0 rounded-shape-full bg-primary transition-[width] duration-medium-2 ease-standard",
    remainingTrack:
      "absolute inset-y-0 rounded-shape-full bg-secondary-container",
    stopIndicator:
      "absolute top-1/2 right-0 -translate-y-1/2 rounded-shape-full bg-primary",
    circle: "shrink-0",
  },
  variants: {
    variant: {
      linear: {},
      circular: { base: "inline-flex w-auto flex-col items-center" },
    },
  },
  defaultVariants: { variant: "linear" },
});

/** The one keyframe the kit cannot express in Tailwind's own utilities.
    Rendered with `href` + `precedence` so React hoists it into `<head>` and
    emits it once however many indicators are on the page. */
const SWEEP_STYLE = `
@keyframes md3-progress-linear-sweep {
  from { transform: translateX(-100%); }
  to   { transform: translateX(400%); }
}
.md3-progress-linear-sweep {
  animation: md3-progress-linear-sweep 1500ms
    var(--md-sys-motion-easing-standard, cubic-bezier(0.2, 0, 0, 1)) infinite;
}
@media (prefers-reduced-motion: reduce) {
  .md3-progress-linear-sweep { animation: none; width: 100%; }
}
`;

/** MD3 baseline: 4dp track and active-indicator thickness. */
const THICKNESS = 4;
/** MD3 baseline: 4dp between the active indicator and the track. */
const GAP = 4;
/** MD3 baseline: a 40dp circle. */
const CIRCLE_SIZE = 40;
/** The share of the circumference the indeterminate arc occupies. */
const ARC = 0.25;
/** The share of the track the indeterminate linear segment occupies. */
const SEGMENT = 0.25;

export type ProgressIndicatorProps = Omit<AriaProgressBarProps, "children"> & {
  /** `linear` (default) fills the width it is given; `circular` is a ring. */
  variant?: "linear" | "circular";
  /** A visible label. Prefer it over `aria-label` where there is room — the
      spec asks the label to name what is loading. */
  label?: ReactNode;
  /** Show the formatted value beside the label (determinate linear only). */
  showValue?: boolean;
  /** Circle diameter in px. Spec range 24–240; default 40. Circular only. */
  size?: number;
  /** Track and active-indicator thickness in px; default 4. */
  thickness?: number;
  className?: string;
};

export function ProgressIndicator({
  variant = "linear",
  label,
  showValue = false,
  size = CIRCLE_SIZE,
  thickness = THICKNESS,
  className,
  ...props
}: ProgressIndicatorProps) {
  const s = styles({ variant });

  return (
    <AriaProgressBar
      data-slot="progress-indicator"
      data-variant={variant}
      {...props}
      className={composeTailwindRenderProps(className, s.base())}
    >
      {({ percentage, valueText, isIndeterminate }) => (
        <>
          <style href="md3-progress-indicator" precedence="medium">
            {SWEEP_STYLE}
          </style>
          {variant === "circular" ? (
            <>
              <Circle
                size={size}
                thickness={thickness}
                percentage={isIndeterminate ? undefined : (percentage ?? 0)}
              />
              {label ? <Label className={s.label()}>{label}</Label> : null}
            </>
          ) : (
            <>
              {(label || (showValue && !isIndeterminate)) && (
                <div className={s.header()}>
                  {label ? (
                    <Label className={s.label()}>{label}</Label>
                  ) : (
                    <span />
                  )}
                  {showValue && !isIndeterminate && (
                    <span className={s.value()}>{valueText}</span>
                  )}
                </div>
              )}
              <Bar
                classes={s}
                thickness={thickness}
                percentage={isIndeterminate ? undefined : (percentage ?? 0)}
              />
            </>
          )}
        </>
      )}
    </AriaProgressBar>
  );
}

/** The linear track: active indicator, a 4dp gap, the remaining track, and —
    determinate only — the stop indicator flush with the trailing end. */
function Bar({
  classes,
  thickness,
  percentage,
}: {
  classes: ReturnType<typeof styles>;
  thickness: number;
  percentage: number | undefined;
}) {
  const indeterminate = percentage === undefined;

  return (
    <div
      data-slot="progress-track"
      className={classes.track({
        className: indeterminate ? "bg-secondary-container" : undefined,
      })}
      style={{ height: thickness }}
    >
      {indeterminate ? (
        <div
          data-slot="progress-active-indicator"
          className={classes.activeIndicator({
            className: "md3-progress-linear-sweep transition-none",
          })}
          style={{ width: `${SEGMENT * 100}%` }}
        />
      ) : (
        <>
          <div
            data-slot="progress-active-indicator"
            className={classes.activeIndicator()}
            style={{ width: `${percentage}%` }}
          />
          <div
            data-slot="progress-remaining-track"
            className={classes.remainingTrack()}
            // The 4dp gap only exists once there is an active indicator to be
            // separated from; at 0 % the track runs edge to edge.
            style={{
              left: percentage > 0 ? `calc(${percentage}% + ${GAP}px)` : 0,
              right: 0,
            }}
          />
          <div
            data-slot="progress-stop-indicator"
            className={classes.stopIndicator()}
            style={{ height: thickness, width: thickness }}
          />
        </>
      )}
    </div>
  );
}

/** The circular ring. The `-90°` turn lives on a `<g>` rather than the `<svg>`
    so `animate-spin` owns the element's own transform. */
function Circle({
  size,
  thickness,
  percentage,
}: {
  size: number;
  thickness: number;
  percentage: number | undefined;
}) {
  const indeterminate = percentage === undefined;
  const center = size / 2;
  const radius = Math.max((size - thickness) / 2, 0);
  const circumference = 2 * Math.PI * radius;

  const activeLength = indeterminate
    ? circumference * ARC
    : (circumference * percentage) / 100;
  // The same 4dp track/active-indicator space as the linear bar, taken off
  // both ends of the remaining arc.
  const trackLength = Math.max(circumference - activeLength - GAP * 2, 0);

  return (
    <svg
      data-slot="progress-circle"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      aria-hidden="true"
      className={
        indeterminate ? "shrink-0 animate-spin motion-reduce:animate-none" : "shrink-0"
      }
    >
      <g transform={`rotate(-90 ${center} ${center})`}>
        {!indeterminate && (
          <circle
            data-slot="progress-remaining-track"
            cx={center}
            cy={center}
            r={radius}
            className="stroke-secondary-container"
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${trackLength} ${Math.max(circumference - trackLength, 0)}`}
            strokeDashoffset={-(activeLength + GAP)}
          />
        )}
        <circle
          data-slot="progress-active-indicator"
          cx={center}
          cy={center}
          r={radius}
          className="stroke-primary"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${activeLength} ${Math.max(circumference - activeLength, 0)}`}
        />
      </g>
    </svg>
  );
}

export default ProgressIndicator;
