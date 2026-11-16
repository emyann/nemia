"use client";

import { type ReactNode, useId } from "react";
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
  /** What is wrong, shown under the box while `isInvalid` and read with it:
   *  for a box that stands alone (a consent, "I accept the terms"). A set
   *  of boxes takes its message on `CheckboxGroup`. Pass it at every
   *  render, `""` while there is nothing to say: the box is drawn inside a
   *  wrapper whenever the prop is given, and a prop that comes and goes
   *  would remake the box and drop its focus. */
  errorMessage?: string;
};

/**
 * MD3 checkbox: an 18dp box with 2dp corners, a 40dp state layer inside a
 * 48dp touch target, selected / indeterminate / error / disabled states, and
 * an optional label that also toggles it. `CheckboxGroup` adds a group label,
 * supporting text and an error message.
 *
 * A box alone that must be ticked takes `isRequired`, `isInvalid` and its
 * own `errorMessage`:
 *
 *   <Checkbox isRequired isInvalid={!accepted}
 *     errorMessage={accepted ? "" : "Accept the terms to continue"}>
 *     I accept the terms
 *   </Checkbox>
 *
 * Spec: https://m3.material.io/components/checkbox/{overview,specs,guidelines,accessibility}
 */
export function Checkbox({
  children,
  className,
  errorMessage,
  ...props
}: CheckboxProps) {
  const errorId = useId();
  const hasField = errorMessage !== undefined;
  const showError = !!errorMessage && !!props.isInvalid;
  const box = (
    <AriaCheckbox
      data-slot="checkbox"
      {...props}
      aria-describedby={
        [props["aria-describedby"], showError && errorId]
          .filter(Boolean)
          .join(" ") || undefined
      }
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
  if (!hasField) return box;
  // The message is outside the label, so a press on it does not tick the
  // box, and under the label's text: 18dp of box and 8dp of gap in. The
  // wrapper stays while the message comes and goes, so the box is the same
  // element before and after and keeps the focus.
  return (
    <span data-slot="checkbox-field" className="inline-flex flex-col">
      {box}
      {showError && (
        <span
          id={errorId}
          data-slot="checkbox-error"
          className="text-body-small font-body-small text-error pl-[26px]"
        >
          {errorMessage}
        </span>
      )}
    </span>
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

/**
 * A set of `Checkbox`es with one name and one value: React Aria's
 * `CheckboxGroup`, the `value` an array of the selected checkboxes'
 * `value`s. It draws the group's `label` (`title-small`) above the boxes and,
 * under them, the `supportingText` (`body-small`, `on-surface-variant`), which
 * the `errorMessage` replaces while the group is invalid; both are read with
 * the group. Disabling the group disables every box and fades the label to
 * 38 %. The boxes stack 12dp apart.
 *
 * Spec: https://m3.material.io/components/checkbox/{overview,specs,guidelines,accessibility}
 */
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
