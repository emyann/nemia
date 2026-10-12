"use client";

import {
  Button,
  type ColorPickerProps as AriaColorPickerProps,
  Dialog,
  DialogTrigger,
  Popover,
  ColorPicker as AriaColorPicker,
} from "react-aria-components";
import ColorArea from "./ColorArea";
import { ColorField } from "./ColorField";
import { ColorSlider } from "./ColorSlider";
import { ColorSwatch } from "./ColorSwatch";

// `children` is required upstream (react-aria-components >= 1.4 typed it as
// `ChildrenOrFunction<ColorPickerRenderProps>`); we keep it optional here and
// supply the dialog children via JSX, falling back to a default editor below.
interface ColorPickerProps extends Omit<AriaColorPickerProps, "children"> {
  label?: string;
  children?: React.ReactNode;
}

/**
 * A swatch button that opens a popover to edit a colour, on React Aria
 * `ColorPicker`. Without children the popover holds a `ColorArea`, a hue
 * `ColorSlider` and a hex `ColorField`; the trigger is a `ColorSwatch`.
 *
 * Material 3 does not describe this component. MD3 has no colour control;
 * this one and its four parts are the kit's own.
 */
export default function ColorPicker(props: ColorPickerProps) {
  const { label, children, ...rest } = props;
  return (
    <AriaColorPicker {...rest}>
      <DialogTrigger>
        <Button className="flex appearance-none items-center gap-2 rounded-shape-extra-small border-none bg-transparent p-0 align-middle text-body-large text-on-surface outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <ColorSwatch />
          <span>{label}</span>
        </Button>
        <Popover placement="top start" className="bg-surface-container">
          {/* Set the classname of popover */}
          <Dialog className="max-h-inherit box-border flex min-w-[192px] flex-col gap-2 overflow-auto p-4 outline-hidden">
            {children || (
              <>
                <ColorArea
                  colorSpace="hsb"
                  xChannel="saturation"
                  yChannel="brightness"
                />
                <ColorSlider colorSpace="hsb" channel="hue" />
                <ColorField label="Hex" />
              </>
            )}
          </Dialog>
        </Popover>
      </DialogTrigger>
    </AriaColorPicker>
  );
}
