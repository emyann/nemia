"use client";

import {
  useContext,
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Button,
  ComboBox as AriaComboBox,
  type ComboBoxProps as AriaComboBoxProps,
  type ComboBoxRenderProps,
  ComboBoxStateContext,
  FieldError,
  Group,
  Input,
  type Key,
  Label,
  ListBox,
  Popover,
  Tag,
  TagGroup,
  TagList,
  Text,
  type ValidationResult,
} from "react-aria-components";

import {
  ChevronDownIcon,
  ErrorIcon,
  renderIcon,
  XIcon,
  type IconProp,
} from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { fieldStyles, type FieldVariantProps } from "./field-styles";
import { SelectItem } from "./Select";
import { focusRing, tv } from "../utils";

/**
 * MD3 text field with a menu (autocomplete) on React Aria `ComboBox`.
 * Typing filters the options; `selectionMode="multiple"` turns the field into
 * a chips field — every selected option becomes an input chip inline with the
 * caret, removable from its trailing icon or with Backspace on an empty input.
 *
 *   <ComboBox label="Category" items={categories}>
 *     {(c) => <ComboBoxItem id={c.id} label={c.name} />}
 *   </ComboBox>
 *   <ComboBox label="Categories" selectionMode="multiple" items={categories} …>
 *
 * Spec: text fields (the container —
 * https://m3.material.io/components/text-fields/{specs,guidelines,accessibility}:
 * 56dp container, 16dp padding / 12dp with icons, floating label, supporting
 * text 4dp below, error icon), chips (input chips "inline with the cursor in
 * a text field" — https://m3.material.io/components/chips/guidelines: 32dp,
 * 8dp corners, 16dp padding / 8dp beside an icon, trailing remove icon) and
 * menus (the autocomplete pattern —
 * https://m3.material.io/components/menus/guidelines#filtering: the list
 * filters as one types; baseline menu 4dp corners, 48dp items, a checkmark as
 * the second selection cue). Deviations: Backspace deletes the last chip
 * directly (the spec's intermediate "chip selected" step is not modelled);
 * chips wrap to new rows and the container grows (the spec's horizontally
 * scrolling variant is not offered); the chip's remove affordance is a 24dp
 * target inside the 32dp chip and the menu trigger a 40dp one — neither is
 * expanded to the 48dp touch target.
 *
 * The field itself is the shared `./field-styles.ts` module at
 * `kind="composite"` — the container holds the input *and* the chips, so it
 * carries the padding and grows past 56dp, and the label floats off
 * `data-populated` (set here: text typed or chips selected), `:focus-within`
 * or `data-open`. The outlined label notch uses `--md3-field-notch` like
 * `TextField`. Only the chips and the menu are styled locally, below.
 *
 * `items` may arrive after mount (a query), so two things are wired for it:
 * they are handed to the `ComboBox` as `defaultItems` *and* to the `ListBox`,
 * and the menu is allowed to open on an empty collection.
 * `defaultItems` is what invalidates the hidden collection React Aria builds
 * for the closed popover — the `ListBox`'s own `items` only reach it when the
 * children element changes too, so a memoised child would freeze the options
 * at whatever had loaded. `allowsEmptyCollection` is what keeps the
 * interaction: without it `state.open()`/`toggle()` are no-ops while the
 * collection is empty, so the chevron, ArrowDown and typing were all silently
 * swallowed until the options landed, and the menu closed itself again the
 * moment a filter matched nothing. The empty menu says so instead.
 *
 * A press on the menu trigger also takes the focus itself, with the scroll
 * suppressed — see `useTriggerPressWithoutScroll` below, the other half of
 * why the first press used to do nothing.
 */
const styles = fieldStyles;

/**
 * The pieces that are *not* the field container: the input chips (a chip is
 * its own Material component) and the menu the field opens. They stay here so
 * that re-theming fields, chips and menus are three independent edits.
 */
const comboBoxStyles = tv({
  slots: {
    trigger: [
      focusRing(),
      "-mr-2 ml-auto flex size-10 shrink-0 items-center justify-center rounded-shape-full text-on-surface-variant",
      "hover:bg-on-surface/8 data-pressed:bg-on-surface/10",
      "group-data-invalid/tf:text-error group-data-invalid/tf:group-hover/tfc:text-on-error-container group-data-invalid/tf:group-hover/tfc:group-focus-within/tfc:text-error group-data-disabled/tf:text-on-surface/38",
    ],
    chevron:
      "transition-transform duration-short-4 group-data-open/tf:rotate-180",
    chips: "contents",
    chip: [
      focusRing(),
      "flex h-8 items-center gap-2 rounded-shape-small border border-outline-variant bg-surface-container-low pl-3 pr-1 text-label-large font-label-large text-on-surface-variant transition-colors duration-short-4",
      "hover:bg-surface-container-high data-selected:border-transparent data-selected:bg-secondary-container data-selected:text-on-secondary-container",
      "group-data-disabled/tf:border-on-surface/12 group-data-disabled/tf:text-on-surface/38",
    ],
    chipRemove: [
      focusRing(),
      "flex size-6 items-center justify-center rounded-shape-full hover:bg-on-surface/8 data-pressed:bg-on-surface/10",
    ],
    popover: [
      "min-w-(--trigger-width) rounded-shape-extra-small bg-surface-container py-2 shadow-elevation-2",
      "data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-entering:duration-short-4 data-entering:ease-emphasized-decelerate",
      "data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95 data-exiting:duration-short-3",
    ],
    listBox: "max-h-[inherit] overflow-auto outline-none",
    // Same 48dp row as `MenuItem`, but inert: it is a message, not an option.
    emptyState:
      "flex min-h-[48px] items-center px-3 py-2 text-body-medium font-body-medium text-on-surface-variant",
  },
});

type SelectionMode = "single" | "multiple";

export type ComboBoxProps<
  T extends object,
  M extends SelectionMode = "single",
> = Omit<AriaComboBoxProps<T, M>, "className" | "children" | "defaultItems"> &
  Pick<FieldVariantProps, "variant"> & {
    label?: string;
    /** Helper text under the field; replaced by `errorMessage` when invalid. */
    supportingText?: ReactNode;
    errorMessage?: string | ((validation: ValidationResult) => string);
    leadingIcon?: IconProp;
    /** Only shown while the label is floated, like MD3. */
    placeholder?: string;
    /**
     * The options. May be empty at first and filled in by a query — the field
     * still opens, and fills in as they land. (`defaultItems` is spoken for:
     * this is what the component passes down as it.)
     */
    items?: Iterable<T>;
    children: ReactNode | ((item: T) => ReactNode);
    className?: string;
  };

export function ComboBox<T extends object, M extends SelectionMode = "single">(
  props: ComboBoxProps<T, M>,
) {
  const {
    label,
    supportingText,
    errorMessage,
    leadingIcon,
    placeholder,
    items,
    children,
    variant = "outlined",
    className,
    ...comboBoxProps
  } = props;
  const s = styles({
    variant,
    kind: "composite",
    hasLeadingIcon: !!leadingIcon,
  });
  const c = comboBoxStyles();
  const multiple = comboBoxProps.selectionMode === "multiple";

  return (
    <AriaComboBox
      data-slot="combo-box"
      data-variant={variant}
      {...comboBoxProps}
      // Uncontrolled (`defaultItems`, not `items`): React Aria only runs its
      // own "contains" filter while the item list is *not* controlled, and
      // typing to filter is the whole point of the component.
      defaultItems={items}
      allowsEmptyCollection
      className={composeTailwindRenderProps(className, s.base())}
    >
      {(renderProps) => (
        <Field
          styles={s}
          chipStyles={c}
          label={label}
          supportingText={supportingText}
          errorMessage={errorMessage}
          leadingIcon={leadingIcon}
          placeholder={placeholder}
          isRequired={!!comboBoxProps.isRequired}
          isInvalid={renderProps.isInvalid}
          multiple={multiple}
        >
          <Popover data-slot="combo-box-popover" className={c.popover()}>
            <ListBox
              data-slot="combo-box-list"
              items={items}
              renderEmptyState={() => (
                <EmptyOptions className={c.emptyState()} />
              )}
              className={c.listBox()}
            >
              {children}
            </ListBox>
          </Popover>
        </Field>
      )}
    </AriaComboBox>
  );
}

/**
 * Take the focus off the trigger press, without letting the browser scroll.
 *
 * React Aria focuses the input when the menu trigger is pressed, and a plain
 * `focus()` scrolls the element into view. If the field sits in a scroll
 * container — a side sheet, a dialog body — and is only partly visible, that
 * scroll fires a frame after the menu opened, and `useCloseOnScroll` (which
 * `useOverlayPosition` wires up, because a scrolled trigger would leave the
 * popover mispositioned) closes it again: the press looks like it did
 * nothing, and only a second press opens the menu. Claiming the focus first
 * with `preventScroll` leaves React Aria's own `focus()` a no-op.
 *
 * A native listener in the capture phase, because it has to run before the
 * trigger's own `onPointerDown` — React dispatches that when the event
 * bubbles back up to the root, by which point the focus has already moved.
 */
function useTriggerPressWithoutScroll(group: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = group.current;
    if (!el) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element)) return;
      if (!e.target.closest('[data-slot="combo-box-trigger"]')) return;
      el.querySelector("input")?.focus({ preventScroll: true });
    };
    el.addEventListener("pointerdown", onPointerDown, true);
    return () => el.removeEventListener("pointerdown", onPointerDown, true);
  }, [group]);
}

type FieldProps = {
  styles: ReturnType<typeof styles>;
  chipStyles: ReturnType<typeof comboBoxStyles>;
  label?: string;
  supportingText?: ReactNode;
  errorMessage?: string | ((validation: ValidationResult) => string);
  leadingIcon?: IconProp;
  placeholder?: string;
  isRequired: boolean;
  isInvalid: boolean;
  multiple: boolean;
  children: ReactNode;
};

/**
 * Everything that needs the combobox state: the label floats when the input
 * has text or chips are selected, Backspace on an empty input removes the
 * last chip, and the chip set writes back through `state.setValue`.
 */
function Field({
  styles: s,
  chipStyles: c,
  label,
  supportingText,
  errorMessage,
  leadingIcon,
  placeholder,
  isRequired,
  isInvalid,
  multiple,
  children,
}: FieldProps) {
  const state = useContext(ComboBoxStateContext);
  const selected = state?.selectedItems ?? [];
  const populated = (state?.inputValue ?? "") !== "" || selected.length > 0;
  const group = useRef<HTMLDivElement>(null);
  useTriggerPressWithoutScroll(group);

  // In multiple mode the value is the array of selected keys.
  const currentKeys = (): Key[] =>
    state && Array.isArray(state.value) ? (state.value as Key[]) : [];

  const removeKeys = (keys: Set<Key>) => {
    state?.setValue(currentKeys().filter((k) => !keys.has(k)));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!multiple || e.key !== "Backspace" || state?.inputValue !== "") return;
    const keys = currentKeys();
    if (keys.length === 0) return;
    e.preventDefault();
    state.setValue(keys.slice(0, -1));
  };

  return (
    <>
      {/* A Group makes React Aria size and anchor the popover to the whole
          field instead of the bare input. */}
      <Group
        ref={group}
        data-slot="combo-box-container"
        data-populated={populated || undefined}
        className={s.container()}
      >
        {leadingIcon && (
          <span data-slot="leading-icon" className={s.leadingIcon()}>
            {renderIcon(leadingIcon, 24)}
          </span>
        )}
        {multiple && selected.length > 0 && (
          <TagGroup
            data-slot="combo-box-chips"
            aria-label="Selected"
            onRemove={removeKeys}
            className={c.chips()}
          >
            <TagList items={selected} className={c.chips()}>
              {(item) => (
                <Tag
                  id={item.key}
                  textValue={item.textValue}
                  data-slot="input-chip"
                  className={c.chip()}
                >
                  {item.textValue}
                  <Button
                    slot="remove"
                    data-slot="chip-remove"
                    className={c.chipRemove()}
                  >
                    <XIcon size={18} />
                  </Button>
                </Tag>
              )}
            </TagList>
          </TagGroup>
        )}
        <Input
          data-slot="input"
          placeholder={placeholder ?? " "}
          onKeyDown={onKeyDown}
          className={s.input()}
        />
        {label && (
          <Label data-slot="label" className={s.label()}>
            {label}
            {isRequired && (
              <span aria-hidden="true" className="ml-0.5">
                *
              </span>
            )}
          </Label>
        )}
        {isInvalid && (
          <span
            data-slot="trailing-icon"
            role="img"
            aria-label="Error"
            className={s.trailingIcon()}
          >
            <ErrorIcon size={24} />
          </span>
        )}
        <Button
          data-slot="combo-box-trigger"
          aria-label="Show options"
          className={c.trigger()}
        >
          <ChevronDownIcon size={24} className={c.chevron()} />
        </Button>
        <span data-slot="state-layer" className={s.stateLayer()} />
        <span data-slot="active-indicator" className={s.indicator()} />
      </Group>
      <div data-slot="supporting-text" className={s.supporting()}>
        <div role="alert" className="contents">
          <FieldError>{errorMessage}</FieldError>
        </div>
        {supportingText && (
          <Text slot="description" className="group-data-invalid/tf:hidden">
            {supportingText}
          </Text>
        )}
      </div>
      {children}
    </>
  );
}

/**
 * What the menu shows instead of options. It opens on an empty collection now
 * (see the note at the top), so it has to say why it is empty: the field is
 * still waiting for its options, or the filter matched none of them.
 */
function EmptyOptions({ className }: { className: string }) {
  const state = useContext(ComboBoxStateContext);
  const filtering = (state?.inputValue ?? "") !== "";
  return (
    <div className={className}>{filtering ? "No matches" : "No options"}</div>
  );
}

/** An option row — the same `MenuItem`-backed row as `SelectItem`. */
export const ComboBoxItem = SelectItem;
export type { SelectItemProps as ComboBoxItemProps } from "./Select";
export type { ComboBoxRenderProps };

export default ComboBox;
