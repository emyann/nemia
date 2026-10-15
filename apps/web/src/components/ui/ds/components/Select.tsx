"use client";

import { useContext, type ReactNode } from "react";
import {
  Button,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  type ListBoxItemProps,
  Popover,
  Select as AriaSelect,
  type SelectProps as AriaSelectProps,
  SelectStateContext,
  SelectValue,
  Text,
  type ValidationResult,
} from "react-aria-components";

import {
  CheckIcon,
  ChevronDownIcon,
  renderIcon,
  type IconProp,
} from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { fieldStyles, type FieldVariantProps } from "./field-styles";
import { MenuItem } from "./MenuItem";
import { tv } from "../utils";

const styles = fieldStyles;

/**
 * The menu the trigger opens — *not* the field container, so it stays here
 * rather than in `field-styles.ts`: an app re-theming its fields should not
 * have to fork the popover, and an app re-theming its menus should not have to
 * fork the field.
 */
const menuStyles = tv({
  slots: {
    chevron: [
      "shrink-0 text-on-surface-variant transition-transform duration-short-4 group-data-open/tf:rotate-180",
      // The select token set turns the trailing icon `primary` with focus.
      "group-data-focus-visible/tfc:text-primary group-data-open/tf:text-primary",
      "group-data-invalid/tf:group-data-focus-visible/tfc:text-error group-data-invalid/tf:group-data-open/tf:text-error",
      "group-data-invalid/tf:text-error group-data-invalid/tf:group-hover/tfc:text-on-error-container group-data-invalid/tf:group-hover/tfc:group-data-focus-visible/tfc:text-error group-data-invalid/tf:group-hover/tfc:group-data-open/tf:text-error group-data-disabled/tf:text-on-surface/38",
    ],
    popover: [
      "min-w-(--trigger-width) rounded-shape-extra-small bg-surface-container py-2 shadow-elevation-2",
      "data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-entering:duration-short-4 data-entering:ease-emphasized-decelerate",
      "data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95 data-exiting:duration-short-3",
    ],
    listBox: "max-h-[inherit] overflow-auto outline-none",
  },
});

export type SelectProps<T extends object> = Omit<
  AriaSelectProps<T>,
  "className" | "children"
> &
  Pick<FieldVariantProps, "variant"> & {
    label?: string;
    supportingText?: ReactNode;
    errorMessage?: string | ((validation: ValidationResult) => string);
    leadingIcon?: IconProp;
    items?: Iterable<T>;
    children: ReactNode | ((item: T) => ReactNode);
    className?: string;
  };

/**
 * MD3 exposed dropdown menu — a text-field-shaped trigger (filled or
 * outlined, floating label) that opens a menu of options. Built on React
 * Aria `Select` + `ListBox`; options render with the kit's `MenuItem`.
 *
 *   <Select label="Table" items={tables}>
 *     {(t) => <SelectItem id={t.id} label={t.name} />}
 *   </Select>
 *
 * The field itself is the shared `./field-styles.ts` module at
 * `kind="trigger"` — the container *is* the React Aria `Button`, so its
 * focused look keys on `data-focus-visible` and the label floats off
 * `data-populated` (set here from `SelectStateContext`) or `data-open`. The
 * outlined label notch uses `--md3-field-notch` like `TextField`. Only the
 * menu the trigger opens is styled locally, below.
 *
 * Spec: text field + menus —
 * https://m3.material.io/components/text-fields/specs (trigger anatomy) and
 * https://m3.material.io/components/menus/{specs,guidelines,accessibility}
 * (baseline menu: 4dp corners, 48dp items, a checkmark as the second
 * selection cue). Deviations: the spec says disabled items stay focusable;
 * React Aria's ListBox skips them (no `disabledBehavior` on ListBox in RAC
 * 1.20), so they are visible but not focusable. A closed trigger that merely
 * has keyboard focus keeps its resting label — MD3 floats the label on focus,
 * but there is nothing to type into until the menu opens.
 */
export function Select<T extends object>(props: SelectProps<T>) {
  const {
    label,
    supportingText,
    errorMessage,
    leadingIcon,
    items,
    children,
    variant = "outlined",
    className,
    ...selectProps
  } = props;
  const s = styles({ variant, kind: "trigger", hasLeadingIcon: !!leadingIcon });
  const m = menuStyles();

  return (
    <AriaSelect
      data-slot="select"
      data-variant={variant}
      {...selectProps}
      className={composeTailwindRenderProps(className, s.base())}
    >
      <Trigger
        styles={s}
        chevronClassName={m.chevron()}
        label={label}
        leadingIcon={leadingIcon}
      />
      <div data-slot="supporting-text" className={s.supporting()}>
        <FieldError>{errorMessage}</FieldError>
        {supportingText && (
          <Text slot="description" className="group-data-invalid/tf:hidden">
            {supportingText}
          </Text>
        )}
      </div>
      <Popover data-slot="select-popover" className={m.popover()}>
        <ListBox data-slot="select-list" items={items} className={m.listBox()}>
          {children}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}

/**
 * The trigger needs the select's state to tell the field container whether it
 * is populated, which is what floats the label.
 */
function Trigger({
  styles: s,
  chevronClassName,
  label,
  leadingIcon,
}: {
  styles: ReturnType<typeof styles>;
  chevronClassName: string;
  label?: string;
  leadingIcon?: IconProp;
}) {
  const state = useContext(SelectStateContext);
  const populated = (state?.selectedItems.length ?? 0) > 0;

  return (
    <Button
      data-slot="select-trigger"
      data-populated={populated || undefined}
      className={s.container()}
    >
      {leadingIcon && (
        <span data-slot="leading-icon" className={s.leadingIcon()}>
          {renderIcon(leadingIcon, 24)}
        </span>
      )}
      <SelectValue data-slot="select-value" className={s.input()} />
      {label && (
        <Label data-slot="label" className={s.label()}>
          {label}
        </Label>
      )}
      <ChevronDownIcon size={24} className={chevronClassName} />
      <span data-slot="state-layer" className={s.stateLayer()} />
      <span data-slot="active-indicator" className={s.indicator()} />
    </Button>
  );
}

export type SelectItemProps = Omit<
  ListBoxItemProps,
  "className" | "children"
> & {
  label: ReactNode;
  supportingText?: ReactNode;
  leadingIcon?: IconProp;
  trailingIcon?: IconProp;
  className?: string;
};

/** An option row, rendered with the kit's `MenuItem`. */
export function SelectItem({
  label,
  supportingText,
  leadingIcon,
  trailingIcon,
  className,
  ...props
}: SelectItemProps) {
  return (
    <ListBoxItem
      data-slot="select-item"
      textValue={typeof label === "string" ? label : props.textValue}
      {...props}
      className={composeTailwindRenderProps(className, "group outline-none")}
    >
      {({ isSelected, isDisabled }) => (
        <MenuItem
          label={label}
          supportingText={supportingText}
          leadingIcon={leadingIcon}
          // Checkmark = the recommended second selection cue besides color.
          trailingIcon={isSelected ? <CheckIcon size={24} /> : trailingIcon}
          isSelected={isSelected}
          isDisabled={isDisabled}
        />
      )}
    </ListBoxItem>
  );
}

export default Select;
