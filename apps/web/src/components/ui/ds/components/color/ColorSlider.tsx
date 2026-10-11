"use client";

import {
  ColorSlider as AriaColorSlider,
  ColorThumb,
  Label,
  SliderOutput,
  SliderTrack,
  type ColorSliderProps as AriaColorSliderProps,
} from "react-aria-components";

interface ColorSliderProps extends AriaColorSliderProps {
  label?: string;
}

export function ColorSlider(props: ColorSliderProps) {
  const { label, ...rest } = props;
  return (
    <AriaColorSlider
      data-slot="color-slider"
      {...rest}
      className="group grid max-w-[300px] grid-cols-[1fr_auto] gap-1 [grid-template-areas:'label_output'_'track_track']"
    >
      <Label className="[grid-area:label]">{label}</Label>
      <SliderOutput className="[grid-area:output]" />
      <SliderTrack className="rounded-shape-extra-small h-7 [grid-area:track]">
        <ColorThumb className="rounded-shape-full top-1/2 box-border h-5 w-5 border-2 border-white shadow-[0_0_0_1px_black,inset_0_0_0_1px_black] focus-visible:h-6 focus-visible:w-6" />
      </SliderTrack>
    </AriaColorSlider>
  );
}
