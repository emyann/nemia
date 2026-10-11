"use client";

import type { ReactNode } from "react";
import {
  Button,
  FieldError,
  Group,
  Input,
  Label,
  NumberField as AriaNumberField,
  type NumberFieldProps as AriaNumberFieldProps,
  Text,
  type ValidationResult,
} from "react-aria-components";

import {
  ErrorIcon,
  MinusIcon,
  PlusIcon,
  renderIcon,
  type IconProp,
} from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { focusRing, tv } from "../utils";
import { fieldStyles, type FieldVariantProps } from "./field-styles";

/**
 * MD3 text field for numbers on React Aria `NumberField`. The value is a
 * `number` (`NaN` while empty), typed and shown in the user's locale —
 * `formatOptions` is `Intl.NumberFormat` (currency, percent, units, fraction
 * digits) and also decides which characters may be typed. On commit (blur,
 * Enter, a stepper) the value is clamped to `minValue` / `maxValue`, snapped
 * to `step` and rounded to the format's fraction digits; the default
 * `Intl` maximum is three, so pass `maximumFractionDigits` for anything finer.
 * Arrow keys, Page Up/Down and the scroll wheel step the value; `steppers`
 * adds a trailing − / + pair for pointer users.
 *
 *   <NumberField label="Price" formatOptions={{ style: "currency", currency: "EUR" }} />
 *   <NumberField label="Quantity" steppers minValue={1} maxValue={20} defaultValue={1} />
 *   <NumberField label="Latitude" formatOptions={{ maximumFractionDigits: 6 }} />
 *
 * `onChange` fires when the value is committed, not on every keystroke —
 * React Aria's contract, kept on purpose: a half-typed number has no value.
 *
 * Spec: text fields —
 * https://m3.material.io/components/text-fields/{specs,guidelines,accessibility}.
 * Container, floating label, icons, prefix / suffix, supporting text and the
 * error icon are the shared `./field-styles.ts` (same as `TextField`).
 * Deviations: MD3 has no number field or stepper, so the steppers are React
 * Aria's increment / decrement buttons drawn as 40dp trailing icon buttons
 * (icon 12dp from the edge, like a trailing icon), out of the tab order
 * (keyboard users have the arrow keys) and labelled "Increment" /
 * "Decrement" as the accessibility page asks of interactive trailing icons;
 * they keep the neutral icon colour in the error state so the error icon
 * stays the one colour-independent error signal.
 */
const stepperStyles = tv({
  slots: {
    steppers: "mr-1 flex shrink-0 items-center",
    stepper: [
      focusRing(),
      "flex size-10 shrink-0 items-center justify-center rounded-shape-full text-on-surface-variant transition-colors duration-short-4",
      "hover:bg-on-surface/8 data-pressed:bg-on-surface/10",
      "data-disabled:text-on-surface/38 data-disabled:hover:bg-transparent",
      "group-data-disabled/tf:text-on-surface/38",
    ],
  },
});

export type NumberFieldProps = Omit<AriaNumberFieldProps, "className"> &
  Pick<FieldVariantProps, "variant"> & {
    label?: string;
    /** Helper text under the field; replaced by `errorMessage` when invalid. */
    supportingText?: ReactNode;
    errorMessage?: string | ((validation: ValidationResult) => string);
    leadingIcon?: IconProp;
    trailingIcon?: IconProp;
    /** Only shown while the label is floated, like MD3. */
    placeholder?: string;
    /** Text before the input, e.g. a currency symbol not in `formatOptions`. */
    prefix?: string;
    /** Text after the input, e.g. a unit. */
    suffix?: string;
    /** Trailing − / + buttons. Keyboard users step with the arrow keys either way. */
    steppers?: boolean;
    className?: string;
    inputClassName?: string;
  };

export function NumberField(props: NumberFieldProps) {
  const {
    label,
    supportingText,
    errorMessage,
    leadingIcon,
    trailingIcon,
    placeholder,
    prefix,
    suffix,
    steppers = false,
    variant = "outlined",
    className,
    inputClassName,
    ...fieldProps
  } = props;

  const s = fieldStyles({
    variant,
    hasLeadingIcon: !!leadingIcon,
    hasTrailingIcon: !!trailingIcon || steppers,
  });
  const st = stepperStyles();

  // The error icon is MD3's second, colour-independent error signal. A
  // consumer-provided trailing icon takes precedence.
  const showErrorIcon = !!props.isInvalid && !trailingIcon;
  const hasTrailing = !!trailingIcon || showErrorIcon || steppers;

  return (
    <AriaNumberField
      data-slot="number-field"
      data-variant={variant}
      {...fieldProps}
      className={composeTailwindRenderProps(className, s.base())}
    >
      <Group data-slot="number-field-container" className={s.container()}>
        {leadingIcon && (
          <span data-slot="leading-icon" className={s.leadingIcon()}>
            {renderIcon(leadingIcon, 24)}
          </span>
        )}
        {prefix && (
          <span
            data-slot="prefix"
            className={s.affix({ className: leadingIcon ? "" : "pl-4" })}
          >
            {prefix}
          </span>
        )}
        <Input
          data-slot="input"
          placeholder={placeholder ?? " "}
          className={s.input({
            className: [prefix && "pl-1", suffix && "pr-1", inputClassName]
              .filter(Boolean)
              .join(" "),
          })}
        />
        {suffix && (
          <span
            data-slot="suffix"
            className={s.affix({ className: hasTrailing ? "" : "pr-4" })}
          >
            {suffix}
          </span>
        )}
        {label && (
          <Label data-slot="label" className={s.label()}>
            {label}
            {props.isRequired && (
              <span aria-hidden="true" className="ml-0.5">
                *
              </span>
            )}
            {(prefix || suffix) && (
              <span className="sr-only">
                {prefix ? `, prefix ${prefix}` : ""}
                {suffix ? `, suffix ${suffix}` : ""}
              </span>
            )}
          </Label>
        )}
        <div data-slot="state-layer" className={s.stateLayer()} />
        <div data-slot="active-indicator" className={s.indicator()} />
        {trailingIcon && (
          <span data-slot="trailing-icon" className={s.trailingIcon()}>
            {renderIcon(trailingIcon, 24)}
          </span>
        )}
        {showErrorIcon && (
          <span
            data-slot="trailing-icon"
            role="img"
            aria-label="Error"
            className={s.trailingIcon()}
          >
            <ErrorIcon size={24} />
          </span>
        )}
        {steppers && (
          <div data-slot="steppers" className={st.steppers()}>
            <Button slot="decrement" className={st.stepper()}>
              <MinusIcon size={24} />
            </Button>
            <Button slot="increment" className={st.stepper()}>
              <PlusIcon size={24} />
            </Button>
          </div>
        )}
      </Group>
      <div data-slot="supporting-text" className={s.supporting()}>
        {/* Live region so assistive tech announces the swapped-in error. */}
        <div role="alert" className="contents">
          <FieldError className={s.supportingText()}>{errorMessage}</FieldError>
        </div>
        {supportingText && (
          <Text
            slot="description"
            className={`${s.supportingText()} group-data-invalid/tf:hidden`}
          >
            {supportingText}
          </Text>
        )}
      </div>
    </AriaNumberField>
  );
}

export default NumberField;
