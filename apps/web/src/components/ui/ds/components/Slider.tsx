"use client";

import { useEffect, useRef } from "react";
import { tv } from "../utils";
import {
  Label,
  Slider as AriaSlider,
  SliderOutput,
  SliderThumb,
  SliderTrack,
  type SliderProps as AriaSliderProps,
} from "react-aria-components";

// Define types for our slider props
interface SliderProps<T extends number | number[]> extends AriaSliderProps<T> {
  label?: string;
  thumbLabels?: string[];
  showOutput?: boolean;
  /** The value as words, where a number and `formatOptions` do not say it:
   *  a time ("1:05"), a size ("Large"). It is what the output draws and
   *  what a screen reader hears for the handle. */
  formatValue?: (value: number) => string;
  className?: string;
}

// Material's extra-small slider: a 16dp track with 8dp ends, a 4dp by 44dp
// handle with 6dp of air on each side, and a 4dp stop where the track ends.
const styles = tv({
  slots: {
    root: "group grid w-full gap-2 grid-cols-[1fr_auto] [grid-template-areas:'label_output'_'track_track']",
    label: "text-label-large font-label-large text-on-surface [grid-area:label]",
    output: "text-label-large font-label-large text-on-surface-variant [grid-area:output]",
    track: "relative [grid-area:track] col-span-2 h-11 w-full touch-none",
    // Clipped: with the handle at an end its segment has no width, and its
    // stop goes with it.
    segment: "absolute top-1/2 h-4 -translate-y-1/2 overflow-hidden",
    stop: "absolute top-1/2 size-1 -translate-y-1/2 rounded-shape-full",
    thumb: [
      // React Aria places the thumb: its own style centres it on both axes.
      "top-1/2 h-11 w-1 rounded-shape-full transition-[width,background-color] duration-short-2",
      // The handle is 4dp wide: a pointer gets 20dp around it.
      "before:absolute before:inset-y-0 before:-inset-x-2",
      // Material narrows the handle while it is held.
      "data-dragging:w-0.5",
      // Focus is on the hidden input inside the thumb, so the ring keys on
      // React Aria's attribute.
      "outline-none outline-3 outline-offset-2 outline-ring data-focus-visible:outline-solid",
    ],
  },
  variants: {
    isDisabled: {
      false: { thumb: "bg-[color:var(--md-comp-slider-active-handle-color,var(--md-sys-color-primary))]" },
      true: { thumb: "bg-on-surface/38" },
    },
    active: {
      true: { segment: "bg-[color:var(--md-comp-slider-active-track-color,var(--md-sys-color-primary))]", stop: "bg-[color:var(--md-comp-slider-active-stop-indicator-container-color,var(--md-sys-color-on-primary))]" },
      false: {
        segment: "bg-secondary-container",
        stop: "bg-on-secondary-container",
      },
    },
  },
  compoundVariants: [
    { isDisabled: true, active: true, class: { segment: "bg-on-surface/38" } },
    {
      isDisabled: true,
      active: false,
      class: { segment: "bg-on-surface/12", stop: "bg-on-surface/38" },
    },
  ],
  defaultVariants: { isDisabled: false },
});

// Half the handle and Material's 6dp beside it.
const GAP = 8;

/**
 * MD3 slider on React Aria `Slider`: one handle for a number, one per value
 * for an array (a range). The track is filled from its start to the handle,
 * or between the two handles of a range.
 *
 *   <Slider label="Volume" defaultValue={40} />
 *   <Slider label="Price" defaultValue={[20, 80]} thumbLabels={["From", "To"]} />
 *
 * It is as wide as what holds it: give it, or its container, a width
 * (`className="max-w-xs"`). `label` names it and `showOutput` writes the
 * value beside the label; with no `label`, pass `aria-label`. A range names
 * each handle with `thumbLabels`. The value is written by React Aria's
 * `formatOptions` (a percentage, a unit) or, where a number does not say
 * it, by `formatValue` (`(s) => "1:05"`).
 *
 * This is Material's extra-small slider: a 16dp track, the active part on
 * `primary` and the rest on `secondary-container`, a 4dp by 44dp handle
 * that narrows while held, and a stop where the track ends. Gaps: the
 * larger sizes (S to XL) and their inset icon, the value indicator that
 * rises from the handle (the value is written beside the label), the stops
 * of a stepped slider, and the centred and vertical configurations.
 *
 * Spec: https://m3.material.io/components/sliders/{overview,specs,guidelines,accessibility}
 */
function Slider<T extends number | number[]>({
  label,
  thumbLabels,
  showOutput = true,
  formatValue,
  className,
  ...props
}: SliderProps<T>) {
  const { root, label: labelStyles, output: outputStyles } = styles();

  const own = useRef<HTMLDivElement>(null);

  return (
    <AriaSlider
      data-slot="slider"
      {...props}
      ref={own}
      className={root({ className })}
    >
      {label && <Label className={labelStyles()}>{label}</Label>}
      {showOutput && (
        <SliderOutput className={outputStyles()}>
          {({ state }) =>
            state.values
              .map((value, i) =>
                formatValue ? formatValue(value) : state.getThumbValueLabel(i),
              )
              .join(" – ")
          }
        </SliderOutput>
      )}
      <SliderTrack data-slot="slider-track" className={styles().track()}>
        {({ state, isDisabled }) => {
          const at = state.values.map((_, i) => state.getThumbPercent(i));
          // One handle: the track is active up to it. Two: between them.
          const edges = [0, ...at, 1];
          const isRange = at.length > 1;
          return (
            <>
              {edges.slice(0, -1).map((start, i) => {
                const end = edges[i + 1] ?? 1;
                const active = isRange ? i > 0 && i < at.length : i === 0;
                const s = styles({ isDisabled, active });
                const first = i === 0;
                const last = i === edges.length - 2;
                return (
                  <div
                    key={i}
                    data-slot="slider-segment"
                    data-active={active || undefined}
                    className={s.segment()}
                    style={{
                      left: `calc(${start * 100}% + ${first ? 0 : GAP}px)`,
                      right: `calc(${(1 - end) * 100}% + ${last ? 0 : GAP}px)`,
                      borderRadius: `${first ? 8 : 2}px ${last ? 8 : 2}px ${last ? 8 : 2}px ${first ? 8 : 2}px`,
                    }}
                  >
                    {last && <div className={s.stop({ className: "right-1" })} />}
                    {first && isRange && (
                      <div className={s.stop({ className: "left-1" })} />
                    )}
                  </div>
                );
              })}
              {formatValue && (
                <SpokenValues
                  root={own}
                  values={state.values}
                  formatValue={formatValue}
                />
              )}
              {state.values.map((_, i) => (
                <SliderThumb
                  data-slot="slider-thumb"
                  key={i}
                  index={i}
                  aria-label={thumbLabels?.[i]}
                  className={styles({ isDisabled }).thumb()}
                />
              ))}
            </>
          );
        }}
      </SliderTrack>
    </AriaSlider>
  );
}

/** React Aria writes each handle's `aria-valuetext` from the number and
    gives no way to say it otherwise: written again here, after it, each
    time a value moves. Draws nothing. */
function SpokenValues({
  root,
  values,
  formatValue,
}: {
  root: React.RefObject<HTMLDivElement | null>;
  values: number[];
  formatValue: (value: number) => string;
}) {
  useEffect(() => {
    root.current?.querySelectorAll("input").forEach((input, i) => {
      const value = values[i];
      if (value !== undefined) {
        input.setAttribute("aria-valuetext", formatValue(value));
      }
    });
  });
  return null;
}

export { Slider };
export type { SliderProps };
