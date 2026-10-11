"use client";

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
  className?: string;
}

// Define Tailwind variants for styling
const styles = tv({
  slots: {
    root: "grid gap-2 grid-cols-[1fr_auto] [grid-template-areas:'label_output'_'track_track'] max-w-[300px]",
    label: "text-label-large text-on-surface [grid-area:label]",
    output: "text-label-large text-on-surface-variant [grid-area:output]",
    track: [
      "relative [grid-area:track] col-span-2",
      "h-8 w-full touch-none",
      // Track line
      "before:absolute before:top-1/2 before:-translate-y-1/2",
      "before:w-full before:h-[3px]",
      "before:bg-outline-variant",
      // Disabled state
      "group-data-[disabled]:before:bg-surface-variant",
    ],
    thumb: [
      "absolute top-1/2 -translate-y-1/2",
      "h-4 w-4 rounded-shape-full",
      "bg-primary border-2 border-surface",
      "focus-visible:outline-hidden focus-visible:ring-2",
      "focus-visible:ring-ring focus-visible:ring-offset-2",
      "group-data-[disabled]:bg-surface-variant",
      "group-data-[dragging]:bg-primary/90",
      "transition-colors",
    ],
  },
});

function Slider<T extends number | number[]>({
  label,
  thumbLabels,
  showOutput = true,
  className,
  ...props
}: SliderProps<T>) {
  const {
    root,
    label: labelStyles,
    output: outputStyles,
    track: trackStyles,
    thumb: thumbStyles,
  } = styles();

  return (
    <AriaSlider data-slot="slider" {...props} className={root({ className })}>
      {label && <Label className={labelStyles()}>{label}</Label>}
      {showOutput && (
        <SliderOutput className={outputStyles()}>
          {({ state }) =>
            state.values.map((_, i) => state.getThumbValueLabel(i)).join(" – ")
          }
        </SliderOutput>
      )}
      <SliderTrack data-slot="slider-track" className={trackStyles()}>
        {({ state }) =>
          state.values.map((_, i) => (
            <SliderThumb
              data-slot="slider-thumb"
              key={i}
              index={i}
              aria-label={thumbLabels?.[i]}
              className={thumbStyles()}
            />
          ))
        }
      </SliderTrack>
    </AriaSlider>
  );
}

export { Slider };
export type { SliderProps };
