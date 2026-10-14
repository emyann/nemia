"use client";

import type { ReactNode } from "react";
import {
  Checkbox as AriaCheckbox,
  CheckboxGroup as AriaCheckboxGroup,
  type CheckboxGroupProps as AriaCheckboxGroupProps,
  type CheckboxProps as AriaCheckboxProps,
  composeRenderProps,
  FieldError,
  Label,
  Text,
  type ValidationResult,
} from "react-aria-components";

import { CheckIcon, MinusIcon } from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { tv } from "../utils";

/**
 * MD3 checkbox: an 18dp box with 2dp corners, a 40dp state layer inside a
 * 48dp touch target, selected / indeterminate / error / disabled states, and
 * an optional label that also toggles it. `CheckboxGroup` adds a group label,
 * supporting text and an error message.
 *
 * Spec: https://m3.material.io/components/checkbox/{overview,specs,guidelines,accessibility}
 */
const styles = tv({
  slots: {
    base: [
      // min-h-12 = the 48dp touch target (spec); the state layer stays 40dp.
      "group/cb inline-flex min-h-12 items-center gap-2 text-body-medium font-body-medium text-on-surface",
      "data-disabled:text-on-surface/38 data-disabled:pointer-events-none",
    ],
    // The 40px touch target that also hosts the state layer.
    target:
      "relative flex size-10 shrink-0 -m-2.5 items-center justify-center rounded-shape-full",
    stateLayer: [
      "absolute inset-0 rounded-shape-full opacity-0 transition-opacity",
      "group-hover/cb:state-opacity-hover group-data-focus-visible/cb:state-opacity-focus group-data-pressed/cb:state-opacity-pressed",
    ],
    box: [
      "flex size-[18px] items-center justify-center rounded-[2px] border-2 transition-colors duration-short-2",
      "group-data-focus-visible/cb:outline-none",
    ],
    icon: "size-[18px] text-on-primary",
  },
  variants: {
    isSelected: {
      false: {
        box: "border-on-surface-variant bg-transparent group-data-invalid/cb:border-error group-data-disabled/cb:border-on-surface/38",
        stateLayer:
          "bg-on-surface group-data-invalid/cb:bg-error group-data-pressed/cb:bg-primary",
      },
      true: {
        box: "border-primary bg-primary group-data-invalid/cb:border-error group-data-invalid/cb:bg-error group-data-disabled/cb:border-transparent group-data-disabled/cb:bg-on-surface/38",
        stateLayer:
          "bg-primary group-data-invalid/cb:bg-error group-data-pressed/cb:bg-on-surface",
        icon: "group-data-invalid/cb:text-on-error group-data-disabled/cb:text-surface",
      },
    },
  },
  defaultVariants: { isSelected: false },
});

export type CheckboxProps = Omit<
  AriaCheckboxProps,
  "className" | "children"
> & {
  children?: ReactNode;
  className?: string;
};

export function Checkbox({ children, className, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox
      data-slot="checkbox"
      {...props}
      className={composeTailwindRenderProps(className, styles().base())}
    >
      {composeRenderProps(
        children,
        (children, { isSelected, isIndeterminate }) => {
          const s = styles({ isSelected: isSelected || isIndeterminate });
          return (
            <>
              <span data-slot="checkbox-target" className={s.target()}>
                <span data-slot="state-layer" className={s.stateLayer()} />
                <span data-slot="checkbox-box" className={s.box()}>
                  {isIndeterminate ? (
                    <MinusIcon className={s.icon()} size={18} />
                  ) : isSelected ? (
                    <CheckIcon className={s.icon()} size={18} />
                  ) : null}
                </span>
              </span>
              {children}
            </>
          );
        },
      )}
    </AriaCheckbox>
  );
}

export type CheckboxGroupProps = Omit<
  AriaCheckboxGroupProps,
  "className" | "children"
> & {
  label?: string;
  supportingText?: ReactNode;
  errorMessage?: string | ((validation: ValidationResult) => string);
  children?: ReactNode;
  className?: string;
};

export function CheckboxGroup({
  label,
  supportingText,
  errorMessage,
  children,
  className,
  ...props
}: CheckboxGroupProps) {
  return (
    <AriaCheckboxGroup
      data-slot="checkbox-group"
      {...props}
      className={composeTailwindRenderProps(
        className,
        "group/cbg data-disabled:text-on-surface/38 flex flex-col gap-3",
      )}
    >
      {label && (
        <Label className="text-title-small font-title-small text-on-surface group-data-disabled/cbg:text-on-surface/38">
          {label}
        </Label>
      )}
      {children}
      {supportingText && (
        <Text
          slot="description"
          className="text-body-small font-body-small text-on-surface-variant group-data-invalid/cbg:hidden"
        >
          {supportingText}
        </Text>
      )}
      <FieldError className="text-body-small font-body-small text-error">
        {errorMessage}
      </FieldError>
    </AriaCheckboxGroup>
  );
}

export default Checkbox;
