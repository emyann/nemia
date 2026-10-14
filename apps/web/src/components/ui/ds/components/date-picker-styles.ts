import { tv, type VariantProps } from "../utils";

/**
 * The MD3 calendar — the **style module** `DatePicker` and `DateRangePicker`
 * render their calendar from: the docked popover, the header with its menu
 * buttons, the weekday row, the day cell in every state, the year grid, the
 * month and year lists, and a range's month headings. Fork it and both
 * pickers change together; see the README, "Retheming — the three layers".
 *
 * Every interactive part is `group/dpi` (never nested), and its states come
 * from React Aria's attributes: `data-hovered`, `data-focus-visible`,
 * `data-pressed`, `data-selected`, `data-today`, `data-outside-month`,
 * `data-disabled`, `data-unavailable`, `data-selection-start` and
 * `data-selection-end`.
 *
 * Spec: https://m3.material.io/components/date-pickers/specs (token db
 * 38.2.9):
 *
 * - **Docked container**: 360dp wide, `surface-container-high`, corner
 *   large, elevation level 3; its header 64dp, its menu buttons 40dp tall,
 *   corner full, `label-large` in `on-surface-variant` with an 18dp icon,
 *   `on-surface` at 38 % when disabled.
 * - **Date**: a 48dp target holding a 40dp circle (`*.date.state-layer.*`),
 *   `body-large`. Unselected `on-surface` with an `on-surface-variant`
 *   state layer; today a 1dp `primary` outline with `primary` text and
 *   layer; selected `primary` with `on-primary`; a docked picker's
 *   outside-month date `on-surface` at 38 % (the modal shows none).
 * - **Range**: the in-range band is `secondary-container`, 40dp tall,
 *   with `on-secondary-container` text and an `on-primary-container` state
 *   layer (`date-picker.modal.range-selection.*`); the month subhead is
 *   `title-small` in `on-surface-variant`.
 * - **Weekdays**: `body-large`, `on-surface`.
 * - **Year**: 72 by 36dp, corner full, `body-large`; unselected
 *   `on-surface-variant`, selected `primary` with `on-primary`.
 * - **Docked menu**: list items 48dp, `body-large` `on-surface` with an
 *   `on-surface` state layer; the selected one on `surface-variant` with a
 *   24dp check.
 *
 * Disabled and unavailable dates are `on-surface` at 38 % and answer to no
 * pointer: Material lists them in its element states without a token, and
 * 38 % is its disabled content everywhere else.
 */
export const datePickerStyles = tv({
  slots: {
    /** The docked picker's popover. */
    popover: [
      "w-90 overflow-hidden rounded-shape-large bg-surface-container-high text-on-surface shadow-elevation-3 outline-none",
      "data-entering:animate-in data-entering:fade-in-0 data-entering:slide-in-from-top-2 data-entering:duration-medium-2 data-entering:ease-emphasized-decelerate",
      "data-exiting:animate-out data-exiting:fade-out-0 data-exiting:duration-short-3",
    ],
    calendar: "flex flex-col outline-none",
    header: "flex shrink-0 items-center",
    /** A menu button: "Jun ▾", "2026 ▾", or the modal's "June 2026 ▾". */
    menuButton: [
      "group/dpi relative inline-flex h-10 items-center gap-2 rounded-shape-full pl-2 pr-1 text-label-large font-label-large text-on-surface-variant outline-none",
      "outline-none outline-3 outline-offset-2 outline-ring data-focus-visible:outline-solid",
      "data-disabled:text-on-surface/38",
    ],
    menuIcon:
      "shrink-0 transition-transform duration-short-4 group-aria-expanded/dpi:rotate-180",
    /** Hover, focus and press for every interactive part but the date. */
    stateLayer: [
      "pointer-events-none absolute inset-0 rounded-[inherit] bg-on-surface-variant opacity-0 transition-opacity",
      "group-data-hovered/dpi:state-opacity-hover group-data-focus-visible/dpi:state-opacity-focus group-data-pressed/dpi:state-opacity-pressed",
      "group-data-disabled/dpi:hidden",
    ],
    grid: "border-collapse",
    weekday:
      "h-12 w-12 p-0 text-center text-body-large font-body-large text-on-surface",
    /** The 48dp target (React Aria's `CalendarCell`). */
    cell: [
      "group/dpi relative flex size-12 cursor-default items-center justify-center outline-none",
      "data-disabled:pointer-events-none data-unavailable:pointer-events-none",
    ],
    /** A range's band, behind the circle. */
    band: "hidden",
    /** The 40dp circle that carries the date. */
    day: [
      "relative flex size-10 items-center justify-center rounded-shape-full text-body-large font-body-large text-on-surface",
      "outline-none outline-3 outline-offset-2 outline-ring group-data-focus-visible/dpi:outline-solid",
      "group-data-today/dpi:border group-data-today/dpi:border-primary group-data-today/dpi:text-primary",
      "group-data-disabled/dpi:text-on-surface/38 group-data-unavailable/dpi:text-on-surface/38 group-data-today/dpi:group-data-disabled/dpi:border-on-surface/38",
    ],
    dayStateLayer: [
      "pointer-events-none absolute inset-0 rounded-shape-full bg-on-surface-variant opacity-0 transition-opacity",
      "group-data-today/dpi:bg-primary",
      "group-data-hovered/dpi:state-opacity-hover group-data-focus-visible/dpi:state-opacity-focus group-data-pressed/dpi:state-opacity-pressed",
    ],
    yearGrid: "grid grid-cols-3 content-start gap-x-6 gap-y-2 overflow-y-auto px-3 py-2 outline-none",
    year: [
      "group/dpi relative flex h-9 w-18 cursor-default items-center justify-center justify-self-center rounded-shape-full text-body-large font-body-large text-on-surface-variant outline-none",
      "outline-none outline-3 outline-offset-2 outline-ring data-focus-visible:outline-solid",
      "data-selected:bg-primary data-selected:text-on-primary",
    ],
    list: "overflow-y-auto py-2 outline-none",
    listItem: [
      "group/dpi relative flex h-12 cursor-default items-center gap-4 pl-4 pr-6 text-body-large font-body-large text-on-surface outline-none",
      "outline-none -outline-offset-3 outline-3 outline-ring data-focus-visible:outline-solid",
      "data-selected:bg-surface-variant",
    ],
    listIcon: "size-6 shrink-0",
    monthHeading:
      "px-6 pb-2 pt-4 text-title-small font-title-small text-on-surface-variant",
  },
  variants: {
    /** Docked shows the neighbouring months' dates; the modal leaves them blank. */
    outsideMonth: {
      shown: {
        day: "group-data-outside-month/dpi:text-on-surface/38",
      },
      hidden: {
        cell: "data-outside-month:invisible",
      },
    },
    range: {
      false: {
        day: "group-data-selected/dpi:border-0 group-data-selected/dpi:bg-primary group-data-selected/dpi:text-on-primary",
        dayStateLayer: "group-data-selected/dpi:bg-on-primary",
      },
      true: {
        band: [
          "absolute inset-x-0 top-1 block h-10 bg-secondary-container opacity-0",
          "group-data-selected/dpi:opacity-100",
          "group-data-selection-start/dpi:left-1/2 group-data-selection-end/dpi:right-1/2",
          "group-data-selection-start/dpi:group-data-selection-end/dpi:opacity-0",
        ],
        day: [
          "group-data-selected/dpi:text-on-secondary-container",
          "group-data-selection-start/dpi:border-0 group-data-selection-start/dpi:bg-primary group-data-selection-start/dpi:text-on-primary",
          "group-data-selection-end/dpi:border-0 group-data-selection-end/dpi:bg-primary group-data-selection-end/dpi:text-on-primary",
        ],
        dayStateLayer: [
          "group-data-selected/dpi:bg-on-primary-container",
          "group-data-selection-start/dpi:bg-on-primary group-data-selection-end/dpi:bg-on-primary",
        ],
      },
    },
  },
  defaultVariants: { outsideMonth: "hidden", range: false },
});

export type DatePickerVariantProps = VariantProps<typeof datePickerStyles>;
