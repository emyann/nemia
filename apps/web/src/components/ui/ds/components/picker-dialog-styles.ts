import { tv, type VariantProps } from "../utils";

/**
 * The MD3 picker dialog — the **style module** the modal date picker, the
 * modal date input, the full-screen date and range pickers and the time
 * picker render their shell from: `DatePicker`, `DateRangePicker` and
 * `TimePicker`. Fork it and every picker's dialog changes together; see the
 * README, "Retheming — the three layers", for what a style module may do.
 *
 * Spec: https://m3.material.io/components/date-pickers/specs and
 * https://m3.material.io/components/time-pickers/specs (token db 38.2.9):
 *
 * - **Container**: `surface-container-high`, elevation level 3, corner
 *   extra-large; 360dp wide for the modal date picker
 *   (`date-picker.modal.container.width`), 328dp for the modal date input
 *   (`date-input.modal.container.width`); the time picker's width is
 *   dynamic with 24dp padding. `layout: "fullscreen"` is the range
 *   selection's container: corner none, elevation level 0
 *   (`date-picker.modal.range-selection.container.*`).
 * - **Header**: supporting text in `label-large` (`label-medium` for the
 *   time picker's headline), `on-surface-variant`; the headline in
 *   `headline-large` (`title-large` for a range), `on-surface-variant` as
 *   the token table says (some figures draw it `on-surface`).
 * - **Divider**: `outline-variant`, 1dp.
 * - **Actions**: text buttons, right-aligned; the time picker's mode toggle
 *   sits at their left.
 */
export const pickerDialogStyles = tv({
  slots: {
    container: [
      "relative flex max-h-dvh flex-col overflow-hidden bg-surface-container-high text-on-surface outline-none",
      "rounded-shape-extra-large shadow-elevation-3",
    ],
    /** The full-screen picker's top bar: close (X) at the start, Save at the end. */
    topBar: "flex h-14 shrink-0 items-center justify-between gap-1 pl-1 pr-3",
    header: "flex shrink-0 flex-col",
    supporting:
      "text-label-large font-label-large text-on-surface-variant",
    headlineRow: "flex items-end justify-between gap-2",
    headline: "text-headline-large font-headline-large text-on-surface-variant",
    divider: "h-px shrink-0 bg-outline-variant",
    body: "flex min-h-0 flex-col",
    actions: "flex shrink-0 items-center justify-end gap-2",
    modeToggle: "",
  },
  variants: {
    kind: {
      date: {
        container: "w-90",
        header: "px-6 pb-3 pt-4",
        headlineRow: "min-h-12",
        actions: "px-3 pb-3 pt-2",
      },
      input: {
        container: "w-82",
        header: "px-6 pb-3 pt-4",
        headlineRow: "min-h-12",
        body: "px-6 pb-2 pt-4",
        actions: "px-3 pb-3 pt-2",
      },
      time: {
        container: "w-fit p-6",
        header: "pb-5",
        supporting: "text-label-medium font-label-medium",
        actions: "pt-6",
        modeToggle: "mr-auto -ml-3",
      },
    },
    layout: {
      dialog: {},
      fullscreen: {
        container:
          "h-dvh w-dvw rounded-none shadow-none",
        header: "pl-16 pr-3 pb-3 pt-1",
        headline: "text-title-large font-title-large",
        body: "flex-1",
      },
    },
  },
  defaultVariants: { kind: "date", layout: "dialog" },
});

export type PickerDialogVariantProps = VariantProps<typeof pickerDialogStyles>;
