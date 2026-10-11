"use client";

import {
  type ColorSwatchProps,
  ColorSwatch as AriaColorSwatch,
} from "react-aria-components";

export function ColorSwatch(props: ColorSwatchProps) {
  return <AriaColorSwatch {...props} className="rounded-shape-full h-8 w-8" />;
}
