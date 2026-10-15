"use client";

import { useState, type ReactNode } from "react";
import {
  FieldError,
  Input,
  Label,
  Text,
  TextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  type ValidationResult,
} from "react-aria-components";

import { ErrorIcon, renderIcon, type IconProp } from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { fieldStyles, type FieldVariantProps } from "./field-styles";

const styles = fieldStyles;

export type TextFieldProps = Omit<AriaTextFieldProps, "className"> &
  Pick<FieldVariantProps, "variant"> & {
    label?: string;
    /** Helper text under the field; replaced by `errorMessage` when invalid. */
    supportingText?: ReactNode;
    errorMessage?: string | ((validation: ValidationResult) => string);
    leadingIcon?: IconProp;
    trailingIcon?: IconProp;
    /** Only shown while the label is floated, like MD3. */
    placeholder?: string;
    /** Text before the input, e.g. a currency symbol. */
    prefix?: string;
    /** Text after the input, e.g. a unit or an email domain. */
    suffix?: string;
    /** Render a `<textarea>` instead of an `<input>`. */
    multiline?: boolean;
    /** Show `n / maxLength` under the field. Needs `maxLength`. */
    showCharacterCount?: boolean;
    className?: string;
    inputClassName?: string;
  };

/**
 * MD3 text field on React Aria `TextField`: floating label, leading /
 * trailing icons, prefix / suffix text, supporting text swapped for the error
 * message, an error icon, and an optional character counter.
 *
 * Spec: https://m3.material.io/components/text-fields/{overview,specs,guidelines,accessibility}
 * — measurements, colour per state and the CSS-only floating label live with
 * the shared container styles in `./field-styles.ts` (also used by
 * `NumberField`, `PhoneField`, `Select` and `ComboBox`).
 *
 * Deliberate deviations:
 * - `multiline` is the growing "multi-line" field, from a 96dp floor, where
 *   the guidelines want a fixed-height, scrolling text area on the web. A
 *   long answer stays whole on screen and no scroll region nests inside a
 *   scrolling form; a true text area needs a height (`rows`) prop the
 *   component does not have.
 * - The required asterisk is `aria-hidden`, where the accessibility page
 *   wants it in the accessible name: React Aria already sets `aria-required`
 *   on the input, and screen readers would otherwise read "star" on top of
 *   "required".
 * - `prefix` and `suffix` are announced as their literal text after the
 *   label ("…, prefix €"). The spoken name the accessibility page asks for
 *   ("Euro") needs a prop per affix.
 * - No separate focus indicator. The token table has one beside the focused
 *   outline — a 3dp ring, `secondary` (`error` when invalid):
 *   `outlined-text-field.focus.indicator.outline.*`,
 *   `filled-text-field.focus.active-indicator.thickness`. The field shows
 *   focus with its `primary` outline or active indicator alone: a text input
 *   matches `:focus-visible` on every focus, a click included, so the ring
 *   would double the 3dp outline each time the field is used.
 * - A `trailingIcon` replaces the error icon instead of sitting beside it,
 *   so an invalid field with one loses that second error cue; the field has
 *   a single trailing slot.
 */
export function TextField(props: TextFieldProps) {
  const {
    label,
    supportingText,
    errorMessage,
    leadingIcon,
    trailingIcon,
    placeholder,
    prefix,
    suffix,
    multiline = false,
    showCharacterCount = false,
    variant = "outlined",
    className,
    inputClassName,
    onChange,
    ...fieldProps
  } = props;

  // Mirror the value length for the counter; React Aria owns the value.
  const [length, setLength] = useState(
    String(props.value ?? props.defaultValue ?? "").length,
  );

  const s = styles({
    variant,
    hasLeadingIcon: !!leadingIcon,
    hasTrailingIcon: !!trailingIcon,
    multiline,
  });

  const inputProps = {
    placeholder: placeholder ?? " ",
    className: s.input({
      className: [prefix && "pl-1", suffix && "pr-1", inputClassName]
        .filter(Boolean)
        .join(" "),
    }),
  };
  // The error icon is MD3's second, colour-independent error signal. A
  // consumer-provided trailing icon (e.g. a clear button) takes precedence.
  const showErrorIcon = !!props.isInvalid && !trailingIcon;

  return (
    <AriaTextField
      data-slot="text-field"
      data-variant={variant}
      {...fieldProps}
      onChange={(value) => {
        setLength(value.length);
        onChange?.(value);
      }}
      className={composeTailwindRenderProps(className, s.base())}
    >
      <div data-slot="text-field-container" className={s.container()}>
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
        {multiline ? (
          <TextArea data-slot="input" {...inputProps} />
        ) : (
          <Input data-slot="input" {...inputProps} />
        )}
        {suffix && (
          <span
            data-slot="suffix"
            className={s.affix({
              className: trailingIcon || showErrorIcon ? "" : "pr-4",
            })}
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
      </div>
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
        {showCharacterCount && props.maxLength !== undefined && (
          <span
            data-slot="character-count"
            className={s.counter()}
            aria-label={`character count: ${length} of ${props.maxLength}`}
          >
            {length} / {props.maxLength}
          </span>
        )}
      </div>
    </AriaTextField>
  );
}

export default TextField;
