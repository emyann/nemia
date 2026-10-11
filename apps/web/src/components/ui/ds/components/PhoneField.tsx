"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Button,
  FieldError,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
  Text,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  type ValidationResult,
} from "react-aria-components";
import * as RPN from "react-phone-number-input";
import flags from "react-phone-number-input/flags";

import { CheckIcon, ChevronDownIcon, ErrorIcon, GlobeIcon } from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { focusRing, tv } from "../utils";
import { fieldStyles, type FieldVariantProps } from "./field-styles";
import { MenuItem } from "./MenuItem";

/**
 * MD3 text field for phone numbers. The value is an E.164 string
 * (`"+33612345678"`) or `undefined` while empty; the input formats as you
 * type in international format (`+33 6 12 34 56 78`) and a country picker in
 * the leading slot — flag + chevron, opening a menu of countries with their
 * calling codes — pre-fills the calling code. Typing another `+` code in the
 * input switches the country back.
 *
 *   <PhoneField label="Phone" defaultCountry="FR" />
 *   <PhoneField label="Phone" value={phone} onChange={setPhone} />
 *
 * Behaviour comes from `react-phone-number-input` (parsing, formatting,
 * country detection, `libphonenumber-js` metadata); the field shell is React
 * Aria `TextField` (label, description, error, required / disabled wiring)
 * and the country picker a React Aria `Select`. Validate with the library's
 * `isValidPhoneNumber` / `isPossiblePhoneNumber` if a schema needs it.
 *
 * Spec: text fields —
 * https://m3.material.io/components/text-fields/{specs,guidelines,accessibility}
 * (container, floating label, supporting text and error icon are the shared
 * `./field-styles.ts`) and menus —
 * https://m3.material.io/components/menus/{specs,guidelines} for the country
 * list (48dp rows, a checkmark as the second selection cue, the calling code
 * in the trailing "shortcut" slot). Deviations: MD3 has no phone field; the
 * country picker is a 40dp icon-button-shaped trigger in the leading-icon
 * position (a leading icon that opens a menu is not in the spec), labelled
 * "Phone number country" per the accessibility page's rule for interactive
 * leading / trailing icons. Picking a country returns focus to the trigger
 * (React Aria's popover focus restoration) rather than jumping into the
 * input — the library's `focusInputOnCountrySelection` is off to avoid the
 * two fighting over focus.
 */
const styles = tv({
  slots: {
    container: "pl-1",
    input: "pl-3",
    label: "left-20",
    trigger: [
      focusRing(),
      "flex h-10 shrink-0 items-center gap-1 rounded-shape-full px-2 text-on-surface-variant transition-colors duration-short-4",
      "hover:bg-on-surface/8 data-pressed:bg-on-surface/10",
      "data-disabled:text-on-surface/38",
    ],
    flag: [
      "inline-flex h-4 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[2px]",
      "[&>svg]:h-full [&>svg]:w-full",
    ],
    chevron:
      "transition-transform duration-short-4 group-data-open/cs:rotate-180",
    popover: [
      "w-80 rounded-shape-extra-small bg-surface-container py-2 shadow-elevation-2",
      "data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-entering:duration-short-4 data-entering:ease-emphasized-decelerate",
      "data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95 data-exiting:duration-short-3",
    ],
    listBox: "max-h-[inherit] overflow-auto outline-none",
  },
});

export type PhoneFieldProps = Omit<
  AriaTextFieldProps,
  | "className"
  | "value"
  | "defaultValue"
  | "onChange"
  | "type"
  | "inputMode"
  | "pattern"
> &
  Pick<FieldVariantProps, "variant"> & {
    label?: string;
    /** Helper text under the field; replaced by `errorMessage` when invalid. */
    supportingText?: ReactNode;
    errorMessage?: string | ((validation: ValidationResult) => string);
    /** E.164 number, or `""` / `undefined` for empty (controlled). */
    value?: string;
    defaultValue?: string;
    /** E.164 number, or `undefined` once the field is emptied. */
    onChange?: (value: string | undefined) => void;
    /** Country pre-selected while the field is empty, e.g. `"FR"`. */
    defaultCountry?: RPN.Country;
    /** Restrict the picker to these countries. */
    countries?: RPN.Country[];
    /** Country names and the picker's label; defaults to English. */
    labels?: RPN.Labels;
    onCountryChange?: (country: RPN.Country | undefined) => void;
    /** Only shown while the label is floated, like MD3. */
    placeholder?: string;
    className?: string;
    inputClassName?: string;
  };

export function PhoneField(props: PhoneFieldProps) {
  const {
    label,
    supportingText,
    errorMessage,
    value: controlledValue,
    defaultValue,
    onChange,
    defaultCountry,
    countries,
    labels,
    onCountryChange,
    placeholder,
    variant = "outlined",
    className,
    inputClassName,
    onBlur,
    onFocus,
    ...fieldProps
  } = props;

  // The library is controlled-only; keep a local value when the consumer
  // does not pass one.
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const value = controlledValue !== undefined ? controlledValue : uncontrolled;

  const s = fieldStyles({ variant });
  const ps = styles();
  const showErrorIcon = !!props.isInvalid;

  return (
    <AriaTextField
      data-slot="phone-field"
      data-variant={variant}
      {...fieldProps}
      className={composeTailwindRenderProps(className, s.base())}
    >
      <RPN.default
        value={value}
        onChange={(next) => {
          setUncontrolled(next ?? "");
          onChange?.(next);
        }}
        onBlur={onBlur}
        onFocus={onFocus}
        international
        defaultCountry={defaultCountry}
        countries={countries}
        labels={labels}
        onCountryChange={onCountryChange}
        disabled={props.isDisabled}
        readOnly={props.isReadOnly}
        name={props.name}
        focusInputOnCountrySelection={false}
        containerComponent={FieldContainer}
        containerComponentProps={{
          className: s.container({ className: ps.container() }),
          after: (
            <>
              {label && (
                <Label
                  data-slot="label"
                  className={s.label({ className: ps.label() })}
                >
                  {label}
                  {props.isRequired && (
                    <span aria-hidden="true" className="ml-0.5">
                      *
                    </span>
                  )}
                </Label>
              )}
              <div data-slot="state-layer" className={s.stateLayer()} />
              <div data-slot="active-indicator" className={s.indicator()} />
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
            </>
          ),
        }}
        countrySelectComponent={CountrySelect}
        inputComponent={Input}
        numberInputProps={{
          "data-slot": "input",
          placeholder: placeholder ?? " ",
          className: s.input({
            className: [ps.input(), inputClassName].filter(Boolean).join(" "),
          }),
        }}
      />
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
    </AriaTextField>
  );
}

/* ---- pieces handed to react-phone-number-input ------------------------ */
/* Module-level so their identity is stable across renders — an inline
   component would remount the input on every keystroke. */

type FieldContainerProps = {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** Rendered after the picker and the input, so the label is the input's
      next sibling and the `peer` floating-label CSS applies. */
  after?: ReactNode;
};

function FieldContainer({
  className,
  style,
  children,
  after,
}: FieldContainerProps) {
  return (
    <div data-slot="phone-field-container" className={className} style={style}>
      {children}
      {after}
    </div>
  );
}

const INTERNATIONAL = "__international__";

type CountrySelectProps = {
  name?: string;
  "aria-label"?: string;
  value?: RPN.Country;
  onChange: (country?: RPN.Country) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  options: { value?: RPN.Country; label: string }[];
  disabled?: boolean;
  readOnly?: boolean;
};

function CountrySelect({
  value,
  onChange,
  onFocus,
  onBlur,
  options,
  disabled,
  readOnly,
  "aria-label": ariaLabel,
}: CountrySelectProps) {
  const ps = styles();
  const items = options.map((o) => ({
    id: o.value ?? INTERNATIONAL,
    country: o.value,
    label: o.label,
    code: o.value ? `+${RPN.getCountryCallingCode(o.value)}` : undefined,
  }));

  return (
    <AriaSelect
      data-slot="phone-field-country"
      aria-label={ariaLabel}
      selectedKey={value ?? INTERNATIONAL}
      onSelectionChange={(key) =>
        onChange(key === INTERNATIONAL ? undefined : (key as RPN.Country))
      }
      isDisabled={disabled || readOnly}
      onFocus={onFocus}
      onBlur={onBlur}
      className="group/cs flex shrink-0 self-center"
    >
      <Button data-slot="phone-field-country-trigger" className={ps.trigger()}>
        <CountryFlag
          country={value}
          title={items.find((i) => i.country === value)?.label}
          className={ps.flag()}
        />
        <ChevronDownIcon size={20} className={ps.chevron()} />
        <SelectValue className="sr-only">
          {({ selectedText }) => selectedText}
        </SelectValue>
      </Button>
      <Popover data-slot="phone-field-country-popover" className={ps.popover()}>
        <ListBox items={items} className={ps.listBox()}>
          {(item) => (
            <ListBoxItem textValue={item.label} className="group outline-none">
              {({ isSelected, isDisabled }) => (
                <MenuItem
                  label={item.label}
                  shortcut={item.code}
                  leadingIcon={
                    <CountryFlag
                      country={item.country}
                      title={item.label}
                      className={ps.flag()}
                    />
                  }
                  trailingIcon={
                    isSelected ? <CheckIcon size={24} /> : undefined
                  }
                  isSelected={isSelected}
                  isDisabled={isDisabled}
                />
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}

function CountryFlag({
  country,
  title,
  className,
}: {
  country?: RPN.Country;
  title?: string;
  className?: string;
}) {
  const Flag = country ? flags[country] : undefined;
  return (
    <span className={className} aria-hidden="true">
      {Flag ? <Flag title={title ?? country ?? ""} /> : <GlobeIcon size={20} />}
    </span>
  );
}

export default PhoneField;
