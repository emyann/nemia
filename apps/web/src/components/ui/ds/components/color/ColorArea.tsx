"use client";

import {
  ColorArea as AriaColorArea,
  ColorThumb,
  type ColorAreaProps,
} from "react-aria-components";

/**
 * The two-dimensional surface a colour is picked on, on React Aria `ColorArea`.
 * A part of `ColorPicker`.
 *
 * Material 3 does not describe this component.
 */
export default function ColorArea(props: ColorAreaProps) {
  return (
    <AriaColorArea
      data-slot="color-area"
      {...props}
      className="rounded-shape-medium bg-surface-container-low h-48 w-48 shrink-0"
    >
      <ColorThumb className="rounded-shape-full border-surface focus-visible:ring-primary box-border h-5 w-5 border-2 shadow-[0_0_0_1px_var(--md-sys-color-outline),inset_0_0_0_1px_var(--md-sys-color-outline)] focus-visible:h-6 focus-visible:w-6 focus-visible:ring-2" />
    </AriaColorArea>
  );
}
