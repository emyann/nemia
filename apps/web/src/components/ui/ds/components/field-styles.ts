import { tv, type VariantProps } from "../utils";

/**
 * The MD3 field container — the **style module** every field in the kit renders
 * from: `TextField`, `NumberField`, `PhoneField`, `Select`, `ComboBox`,
 * `DatePicker` and `DateRangePicker`.
 * Fork this one file and every field in the app changes anatomy together; see
 * the README, "Retheming — the three layers", for what a style module is allowed to
 * do and what a kit update guarantees about it.
 *
 * Spec: https://m3.material.io/components/text-fields/{overview,specs,guidelines,accessibility}
 * — 56dp container (the outlined variant's 1dp outline is inside it, so its
 * input takes 15dp of vertical padding, not 16), 16dp side padding (12dp with icons, 16dp
 * icon→text), label vertically centred then floated, supporting text 4dp
 * below, counter 16dp from it, populated outlined label padded 4dp.
 *
 * Colour per state follows the page's token table: on hover the outline and
 * the outlined label turn `on-surface` (the filled label stays
 * `on-surface-variant` under its 8% state layer); focus is `primary` with a
 * 3dp outline (`outlined-text-field.focus.outline.width`), drawn inwards so
 * the box does not move, or a 2dp active indicator; an invalid field is
 * `error` at rest and focused, and its outline or indicator, label and
 * trailing icon turn `on-error-container` on hover.
 *
 * The table has a set per component — `*-text-field`, `*-select.text-field`
 * (`Select`), `*-autocomplete.text-field` (`ComboBox`) — and they differ in
 * four places, each followed per `kind`: the focused outline is 2dp for
 * autocomplete, 3dp for the other two; on hover the outlined label turns
 * `on-surface` for text field and select but not autocomplete, and the
 * filled label does for select only; a focused select turns its trailing
 * icon `primary` (the chevron, in `Select.tsx`).
 *
 * Deviation: the outlined select and autocomplete sets also carry an 8%
 * `on-surface` hover state layer (`outlined-select.text-field.hover.state-layer.*`).
 * The outlined variant draws none: its floated label sits on the outline over
 * an opaque notch, which a tinted container would show up as a patch.
 *
 * ## Groups and state
 *
 * The root element is `group/tf` and the container `group/tfc`; state comes
 * from the root's `data-disabled` / `data-invalid` / `data-open` and from the
 * container's `data-populated`. Every field must put `base` on the React Aria
 * root and `container` on the element that draws the box.
 *
 * ## The `kind` variant
 *
 * One MD3 anatomy, four ways of learning its state — the only real difference
 * between a typed field and a trigger field, so it is a variant here instead of
 * four copies of the container:
 *
 * - `text` — a real `<input>` / `<textarea>` **is** the field. Padding sits on
 *   the input so its whole box is a click target, the label floats with CSS
 *   alone (the input is a `peer` with a blank placeholder, so
 *   `:placeholder-shown` means "empty") and focus is `:focus-within`.
 *   `TextField`, `NumberField`, `PhoneField`.
 * - `composite` — the container holds an input **plus** other content (chips),
 *   so it carries the padding and can grow past 56dp. The label floats off
 *   `data-populated` on the container (the component computes it: text typed or
 *   chips selected), `:focus-within`, or `data-open`. `ComboBox`.
 * - `trigger` — the container **is** the React Aria `Button`. Padding sits on
 *   it, the label floats off `data-populated` / `data-open` only (a closed,
 *   merely-focused trigger keeps its resting label), and the focused look keys
 *   on `data-focus-visible` on the button rather than `:focus-within`, so
 *   picking an option with the mouse does not leave the field looking focused.
 *   `Select`.
 * - `segmented` — the container is a React Aria `Group` holding one or two
 *   `DateInput`s, rows of editable segments (month, day, year; hour, minute),
 *   and a trailing icon button. It carries the padding and stays 56dp. The
 *   label floats on `:focus-within`, `data-open`, or once any editable
 *   segment holds a value (`:has()` over React Aria's `data-type` and
 *   `data-placeholder`, so no component has to count segments: the selector
 *   is written out in each class, where Tailwind's scan can read it); until then
 *   the `input` slot is transparent, as a text field's placeholder is. Each
 *   segment renders with the `segment` slot. `DatePicker`,
 *   `DateRangePicker`.
 *
 * The outlined variant's label sits on the outline over a notch painted in
 * `--md3-field-notch` (defaults to `surface`); set that variable on any
 * ancestor whose background differs, e.g.
 * `[--md3-field-notch:var(--md-sys-color-surface-container-high)]` inside a
 * dialog.
 */
/**
 * Focus outranks hover on an invalid field. The hover rule stacks two
 * variants and so does the focus rule, which leaves the winner to stylesheet
 * order; these name all three states so the focused field keeps `error` with
 * the pointer resting on it. (`text` fields reach the same end through
 * `peer-focus`, which sorts after `group-hover`.)
 */
const FOCUSED_INVALID = {
  composite:
    "group-data-invalid/tf:group-hover/tfc:group-focus-within/tfc:text-error",
  trigger:
    "group-data-invalid/tf:group-hover/tfc:group-data-focus-visible/tfc:text-error",
};

export const fieldStyles = tv({
  slots: {
    base: "group/tf flex flex-col",
    container: [
      "group/tfc relative flex items-center transition-colors duration-short-4",
      "group-data-disabled/tf:pointer-events-none",
    ],
    input: [
      "peer min-w-0 flex-1 bg-transparent text-body-large font-body-large text-on-surface caret-primary outline-none",
      "placeholder:text-transparent focus:placeholder:text-on-surface-variant",
      "group-data-disabled/tf:text-on-surface/38",
      "group-data-invalid/tf:caret-error",
    ],
    label: [
      "pointer-events-none absolute z-10 origin-left text-body-large font-body-large text-on-surface-variant transition-all duration-short-4 ease-standard",
      "group-data-invalid/tf:text-error group-data-invalid/tf:group-hover/tfc:text-on-error-container group-data-invalid/tf:group-data-open/tf:text-error group-data-invalid/tf:group-hover/tfc:group-data-open/tf:text-error",
      "group-data-disabled/tf:text-on-surface/38",
    ],
    leadingIcon:
      "ml-3 shrink-0 text-on-surface-variant group-data-disabled/tf:text-on-surface/38",
    trailingIcon:
      "mr-3 shrink-0 text-on-surface-variant group-data-invalid/tf:text-error group-data-invalid/tf:group-hover/tfc:text-on-error-container group-data-disabled/tf:text-on-surface/38",
    affix:
      "shrink-0 text-body-large font-body-large text-on-surface-variant group-data-disabled/tf:text-on-surface/38",
    indicator: "",
    stateLayer: "",
    supporting:
      "flex gap-4 px-4 pt-1 text-body-small font-body-small text-on-surface-variant group-data-invalid/tf:text-error group-data-disabled/tf:text-on-surface/38",
    supportingText: "flex-1",
    counter: "ml-auto shrink-0 tabular-nums",
    segment: "",
  },
  variants: {
    variant: {
      filled: {
        container: [
          "rounded-t-shape-extra-small bg-surface-container-highest",
          "group-data-disabled/tf:bg-on-surface/4",
        ],
        label: "left-4 top-1/2 -translate-y-1/2",
        indicator: [
          "pointer-events-none absolute inset-x-0 bottom-0 h-px bg-on-surface-variant transition-all duration-short-4",
          "group-hover/tfc:bg-on-surface",
          "group-data-open/tf:h-0.5 group-data-open/tf:bg-primary",
          "group-data-invalid/tf:bg-error group-data-invalid/tf:group-hover/tfc:bg-on-error-container group-data-invalid/tf:group-data-open/tf:bg-error group-data-invalid/tf:group-hover/tfc:group-data-open/tf:bg-error",
          "group-data-disabled/tf:bg-on-surface/38",
        ],
        stateLayer:
          "pointer-events-none absolute inset-0 rounded-t-shape-extra-small bg-on-surface opacity-0 transition-opacity group-hover/tfc:state-opacity-hover",
      },
      outlined: {
        container: [
          "rounded-shape-extra-small border border-outline",
          "hover:border-on-surface",
          "group-data-open/tf:border-primary group-data-open/tf:outline group-data-open/tf:outline-3 group-data-open/tf:-outline-offset-3 group-data-open/tf:outline-primary",
          "group-data-invalid/tf:border-error group-data-invalid/tf:hover:border-on-error-container group-data-invalid/tf:group-data-open/tf:outline-error",
          "group-data-disabled/tf:border-on-surface/12",
        ],
        label: [
          "left-3 top-1/2 -translate-y-1/2 px-1",
          "group-hover/tfc:text-on-surface",
          "bg-[var(--md3-field-notch,var(--md-sys-color-surface))]",
        ],
        indicator: "hidden",
        stateLayer: "hidden",
      },
    },
    kind: {
      text: {},
      composite: {
        container: "min-h-14 w-full flex-wrap gap-2",
        input: "h-8 min-w-24",
        // The container grows with the chips, so the resting label is anchored
        // to the first 56dp row instead of the container's middle.
        label: "top-7",
        leadingIcon: "ml-0",
        trailingIcon: "mr-0",
      },
      segmented: {
        container: "h-14 w-full gap-1",
        // The row of segments; transparent while the label rests on it.
        input: [
          "flex items-center whitespace-nowrap tabular-nums opacity-0 transition-opacity duration-short-4",
          "group-focus-within/tfc:opacity-100 group-data-open/tf:opacity-100 group-has-[[data-type]:not([data-type=literal]):not([data-placeholder])]/tfc:opacity-100",
        ],
        // The segment with focus is marked in `primary-container`: Material
        // draws no segment, and a caret alone does not show which part a
        // typed digit lands in.
        segment: [
          "rounded-shape-extra-small px-px outline-none caret-transparent",
          "data-placeholder:text-on-surface-variant data-[type=literal]:px-0",
          "data-focused:bg-primary-container data-focused:text-on-primary-container",
          "group-data-invalid/tf:data-focused:bg-error-container group-data-invalid/tf:data-focused:text-on-error-container",
          "group-data-disabled/tf:text-on-surface/38",
        ],
        leadingIcon: "ml-0",
        trailingIcon: "-mr-2",
      },
      trigger: {
        container: "h-14 w-full gap-3 text-left outline-none",
        // The "input" slot is whatever displays the value — a `SelectValue`.
        input: "truncate data-placeholder:text-transparent",
        leadingIcon: "ml-0",
        trailingIcon: "mr-0",
      },
    },
    hasLeadingIcon: { true: {} },
    hasTrailingIcon: { true: {} },
    multiline: {
      true: {
        container: "items-start",
        input: "min-h-24 resize-y field-sizing-content",
        label: "top-4 translate-y-0",
      },
    },
  },
  compoundVariants: [
    // Padding, focus source and the label's float triggers, per anatomy.
    {
      variant: "filled",
      kind: "text",
      class: {
        input: "px-4 pt-6 pb-2",
        label: [
          "peer-focus:text-body-small peer-focus:font-body-small peer-not-placeholder-shown:text-body-small peer-not-placeholder-shown:font-body-small",
          "peer-focus:text-primary",
          "group-data-invalid/tf:peer-focus:text-error",
          "peer-focus:top-2 peer-focus:translate-y-0 peer-not-placeholder-shown:top-2 peer-not-placeholder-shown:translate-y-0",
        ],
        indicator:
          "peer-focus:h-0.5 peer-focus:bg-primary group-data-invalid/tf:peer-focus:bg-error",
        trailingIcon: "group-data-invalid/tf:peer-focus:text-error",
        stateLayer: "peer-focus:opacity-0",
      },
    },
    {
      variant: "outlined",
      kind: "text",
      class: {
        input: "px-4 py-3.75",
        container: [
          "focus-within:border-primary focus-within:outline focus-within:outline-3 focus-within:-outline-offset-3 focus-within:outline-primary",
          "group-data-invalid/tf:focus-within:outline-error",
        ],
        label: [
          "peer-focus:text-body-small peer-focus:font-body-small peer-not-placeholder-shown:text-body-small peer-not-placeholder-shown:font-body-small",
          "peer-focus:text-primary",
          "group-data-invalid/tf:peer-focus:text-error",
          "peer-focus:top-0 peer-not-placeholder-shown:top-0",
        ],
        trailingIcon: "group-data-invalid/tf:peer-focus:text-error",
      },
    },
    {
      variant: "filled",
      kind: "composite",
      class: {
        container: "px-4 pt-6 pb-2",
        label: [
          "group-focus-within/tfc:text-body-small group-focus-within/tfc:font-body-small group-data-open/tf:text-body-small group-data-open/tf:font-body-small group-data-populated/tfc:text-body-small group-data-populated/tfc:font-body-small",
          "group-focus-within/tfc:text-primary group-data-open/tf:text-primary",
          FOCUSED_INVALID.composite,
          "group-focus-within/tfc:top-2 group-focus-within/tfc:translate-y-0 group-data-open/tf:top-2 group-data-open/tf:translate-y-0 group-data-populated/tfc:top-2 group-data-populated/tfc:translate-y-0",
        ],
        indicator: [
          "group-focus-within/tfc:h-0.5 group-focus-within/tfc:bg-primary group-hover/tfc:group-focus-within/tfc:bg-primary",
          "group-data-invalid/tf:group-focus-within/tfc:bg-error group-data-invalid/tf:group-hover/tfc:group-focus-within/tfc:bg-error",
        ],
        trailingIcon: FOCUSED_INVALID.composite,
        stateLayer:
          "group-focus-within/tfc:opacity-0 group-hover/tfc:group-focus-within/tfc:opacity-0",
      },
    },
    {
      variant: "outlined",
      kind: "composite",
      class: {
        container: [
          "px-4 py-3",
          // The autocomplete set's focused outline is 2dp, not the text
          // field's 3dp.
          "focus-within:border-primary focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-primary",
          "group-data-open/tf:outline-2 group-data-open/tf:-outline-offset-2",
          "group-data-invalid/tf:focus-within:outline-error",
        ],
        label: [
          "group-focus-within/tfc:text-body-small group-focus-within/tfc:font-body-small group-data-open/tf:text-body-small group-data-open/tf:font-body-small group-data-populated/tfc:text-body-small group-data-populated/tfc:font-body-small",
          // …and its label keeps `on-surface-variant` on hover.
          "group-hover/tfc:text-on-surface-variant",
          "group-focus-within/tfc:text-primary group-data-open/tf:text-primary group-hover/tfc:group-focus-within/tfc:text-primary",
          FOCUSED_INVALID.composite,
          "group-focus-within/tfc:top-0 group-data-open/tf:top-0 group-data-populated/tfc:top-0",
        ],
        trailingIcon: FOCUSED_INVALID.composite,
      },
    },
    {
      variant: "filled",
      kind: "trigger",
      class: {
        container: "px-4 pt-6 pb-2",
        label: [
          "group-data-open/tf:text-body-small group-data-open/tf:font-body-small group-data-populated/tfc:text-body-small group-data-populated/tfc:font-body-small",
          // The select set turns the filled label `on-surface` on hover; the
          // text field's stays put.
          "group-hover/tfc:text-on-surface",
          "group-data-focus-visible/tfc:text-primary group-data-open/tf:text-primary",
          FOCUSED_INVALID.trigger,
          "group-data-open/tf:top-2 group-data-open/tf:translate-y-0 group-data-populated/tfc:top-2 group-data-populated/tfc:translate-y-0",
        ],
        indicator:
          "group-data-focus-visible/tfc:h-0.5 group-data-focus-visible/tfc:bg-primary group-data-invalid/tf:group-data-focus-visible/tfc:bg-error group-data-invalid/tf:group-hover/tfc:group-data-focus-visible/tfc:bg-error",
      },
    },
    {
      variant: "outlined",
      kind: "trigger",
      class: {
        container: [
          "px-4",
          "data-focus-visible:border-primary data-focus-visible:outline data-focus-visible:outline-3 data-focus-visible:-outline-offset-3 data-focus-visible:outline-primary",
          "group-data-invalid/tf:outline-error group-data-invalid/tf:data-focus-visible:outline-error",
          // `outline-none` above pins the outline style, so name it again.
          "data-focus-visible:outline-solid group-data-open/tf:outline-solid",
        ],
        label: [
          "group-data-open/tf:text-body-small group-data-open/tf:font-body-small group-data-populated/tfc:text-body-small group-data-populated/tfc:font-body-small",
          "group-data-focus-visible/tfc:text-primary group-data-open/tf:text-primary",
          FOCUSED_INVALID.trigger,
          "group-data-open/tf:top-0 group-data-populated/tfc:top-0",
        ],
      },
    },
    {
      variant: "filled",
      kind: "segmented",
      class: {
        container: "pl-4 pr-3 pt-6 pb-2",
        label: [
          "group-focus-within/tfc:text-body-small group-focus-within/tfc:font-body-small group-data-open/tf:text-body-small group-data-open/tf:font-body-small group-has-[[data-type]:not([data-type=literal]):not([data-placeholder])]/tfc:text-body-small group-has-[[data-type]:not([data-type=literal]):not([data-placeholder])]/tfc:font-body-small",
          "group-focus-within/tfc:text-primary group-data-open/tf:text-primary",
          FOCUSED_INVALID.composite,
          "group-focus-within/tfc:top-2 group-focus-within/tfc:translate-y-0 group-data-open/tf:top-2 group-data-open/tf:translate-y-0 group-has-[[data-type]:not([data-type=literal]):not([data-placeholder])]/tfc:top-2 group-has-[[data-type]:not([data-type=literal]):not([data-placeholder])]/tfc:translate-y-0",
        ],
        indicator: [
          "group-focus-within/tfc:h-0.5 group-focus-within/tfc:bg-primary group-hover/tfc:group-focus-within/tfc:bg-primary",
          "group-data-invalid/tf:group-focus-within/tfc:bg-error group-data-invalid/tf:group-hover/tfc:group-focus-within/tfc:bg-error",
        ],
        trailingIcon: FOCUSED_INVALID.composite,
        stateLayer:
          "group-focus-within/tfc:opacity-0 group-hover/tfc:group-focus-within/tfc:opacity-0",
      },
    },
    {
      variant: "outlined",
      kind: "segmented",
      class: {
        container: [
          "pl-4 pr-3",
          // The text field's 3dp focused outline.
          "focus-within:border-primary focus-within:outline focus-within:outline-3 focus-within:-outline-offset-3 focus-within:outline-primary",
          "group-data-invalid/tf:focus-within:outline-error",
        ],
        label: [
          "group-focus-within/tfc:text-body-small group-focus-within/tfc:font-body-small group-data-open/tf:text-body-small group-data-open/tf:font-body-small group-has-[[data-type]:not([data-type=literal]):not([data-placeholder])]/tfc:text-body-small group-has-[[data-type]:not([data-type=literal]):not([data-placeholder])]/tfc:font-body-small",
          "group-focus-within/tfc:text-primary group-data-open/tf:text-primary",
          FOCUSED_INVALID.composite,
          "group-focus-within/tfc:top-0 group-data-open/tf:top-0 group-has-[[data-type]:not([data-type=literal]):not([data-placeholder])]/tfc:top-0",
        ],
        trailingIcon: FOCUSED_INVALID.composite,
      },
    },
    // With a leading icon the label starts after the icon, and a composite
    // container tightens to the 12dp icon padding.
    { hasLeadingIcon: true, variant: "filled", class: { label: "left-13" } },
    { hasLeadingIcon: true, variant: "outlined", class: { label: "left-12" } },
    {
      hasLeadingIcon: true,
      kind: "composite",
      class: { container: "pl-3" },
    },
    // Multiline: the label rests at the top instead of the vertical middle.
    {
      multiline: true,
      variant: "filled",
      class: {
        label: "top-4 peer-focus:top-2 peer-not-placeholder-shown:top-2",
      },
    },
    {
      multiline: true,
      variant: "outlined",
      class: {
        label: "top-4 peer-focus:top-0 peer-not-placeholder-shown:top-0",
      },
    },
  ],
  defaultVariants: {
    variant: "outlined",
    kind: "text",
    hasLeadingIcon: false,
    hasTrailingIcon: false,
    multiline: false,
  },
});

export type FieldVariantProps = VariantProps<typeof fieldStyles>;
