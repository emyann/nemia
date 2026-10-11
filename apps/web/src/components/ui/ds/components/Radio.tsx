"use client";

import type { ReactNode } from "react";
import {
  composeRenderProps,
  FieldError,
  Label,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  type RadioGroupProps as AriaRadioGroupProps,
  type RadioProps as AriaRadioProps,
  Text,
  type ValidationResult,
} from "react-aria-components";

import { composeTailwindRenderProps } from "../render-props";
import { tv } from "../utils";

/**
 * MD3 radio button: a 20dp ring with a 10dp dot when selected, a 40dp state
 * layer inside a 48dp touch target. `RadioGroup` carries the label,
 * supporting text, error message and orientation.
 *
 * Spec: https://m3.material.io/components/radio-button/{overview,specs,guidelines,accessibility}
 * The guidelines caution against horizontal lists and recommend one option
 * pre-selected and five or fewer options; `orientation="horizontal"` exists
 * for the rare compact case, not as a default.
 */
const radioStyles = tv({
  slots: {
    base: [
      // min-h-12 = the 48dp touch target (spec); the state layer stays 40dp.
      "group/rd inline-flex min-h-12 items-center gap-2 text-body-medium text-on-surface",
      "data-disabled:text-on-surface/38 data-disabled:pointer-events-none",
    ],
    target:
      "relative flex size-10 shrink-0 -m-2.5 items-center justify-center rounded-shape-full",
    stateLayer: [
      "absolute inset-0 rounded-shape-full opacity-0 transition-opacity",
      "group-hover/rd:state-opacity-hover group-data-focus-visible/rd:state-opacity-focus group-data-pressed/rd:state-opacity-pressed",
    ],
    ring: "flex size-5 items-center justify-center rounded-shape-full border-2 transition-colors duration-short-2",
    dot: "size-2.5 rounded-shape-full transition-transform duration-short-2 ease-standard",
  },
  variants: {
    isSelected: {
      false: {
        ring: "border-on-surface-variant group-data-invalid/rd:border-error group-data-disabled/rd:border-on-surface/38",
        stateLayer:
          "bg-on-surface group-data-invalid/rd:bg-error group-data-pressed/rd:bg-primary",
        dot: "scale-0",
      },
      true: {
        ring: "border-primary group-data-invalid/rd:border-error group-data-disabled/rd:border-on-surface/38",
        stateLayer:
          "bg-primary group-data-invalid/rd:bg-error group-data-pressed/rd:bg-on-surface",
        dot: "scale-100 bg-primary group-data-invalid/rd:bg-error group-data-disabled/rd:bg-on-surface/38",
      },
    },
  },
  defaultVariants: { isSelected: false },
});

export type RadioProps = Omit<AriaRadioProps, "className" | "children"> & {
  children?: ReactNode;
  className?: string;
};

export function Radio({ children, className, ...props }: RadioProps) {
  return (
    <AriaRadio
      data-slot="radio"
      {...props}
      className={composeTailwindRenderProps(className, radioStyles().base())}
    >
      {composeRenderProps(children, (children, { isSelected }) => {
        const s = radioStyles({ isSelected });
        return (
          <>
            <span data-slot="radio-target" className={s.target()}>
              <span data-slot="state-layer" className={s.stateLayer()} />
              <span data-slot="radio-ring" className={s.ring()}>
                <span data-slot="radio-dot" className={s.dot()} />
              </span>
            </span>
            {children}
          </>
        );
      })}
    </AriaRadio>
  );
}

const groupStyles = tv({
  base: "group/rdg flex data-disabled:text-on-surface/38",
  variants: {
    orientation: {
      vertical: "flex-col gap-3",
      horizontal: "flex-row flex-wrap items-center gap-x-6 gap-y-3",
    },
  },
  defaultVariants: { orientation: "vertical" },
});

export type RadioGroupProps = Omit<
  AriaRadioGroupProps,
  "className" | "children"
> & {
  label?: string;
  supportingText?: ReactNode;
  errorMessage?: string | ((validation: ValidationResult) => string);
  children?: ReactNode;
  className?: string;
};

export function RadioGroup({
  label,
  supportingText,
  errorMessage,
  children,
  className,
  orientation = "vertical",
  ...props
}: RadioGroupProps) {
  return (
    <AriaRadioGroup
      data-slot="radio-group"
      orientation={orientation}
      {...props}
      className={composeTailwindRenderProps(
        className,
        groupStyles({ orientation }),
      )}
    >
      {label && (
        <Label className="text-title-small text-on-surface group-data-disabled/rdg:text-on-surface/38 w-full">
          {label}
        </Label>
      )}
      {children}
      {supportingText && (
        <Text
          slot="description"
          className="text-body-small text-on-surface-variant w-full group-data-invalid/rdg:hidden"
        >
          {supportingText}
        </Text>
      )}
      <FieldError className="text-body-small text-error w-full">
        {errorMessage}
      </FieldError>
    </AriaRadioGroup>
  );
}

export default Radio;
