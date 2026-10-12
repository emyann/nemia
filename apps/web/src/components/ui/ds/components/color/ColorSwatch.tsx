"use client";

import {
  type ColorSwatchProps,
  ColorSwatch as AriaColorSwatch,
} from "react-aria-components";

/**
 * A square showing one colour, on React Aria `ColorSwatch`.
 * A part of `ColorPicker`.
 *
 * Material 3 does not describe this component.
 */
export function ColorSwatch(props: ColorSwatchProps) {
  return <AriaColorSwatch {...props} className="rounded-shape-full h-8 w-8" />;
}
