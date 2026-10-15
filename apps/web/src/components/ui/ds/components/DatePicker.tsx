"use client";

import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import {
  Button as AriaButton,
  ButtonContext,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarStateContext,
  DateField,
  DateFieldContext,
  DateInput,
  DatePicker as AriaDatePicker,
  type DatePickerProps as AriaDatePickerProps,
  DatePickerStateContext,
  DateRangePicker as AriaDateRangePicker,
  type DateRangePickerProps as AriaDateRangePickerProps,
  DateRangePickerStateContext,
  DateSegment,
  type DateValue,
  Dialog,
  FieldError,
  FieldErrorContext,
  Group,
  GroupContext,
  Label,
  LabelContext,
  ListBox,
  ListBoxItem,
  Popover,
  Provider,
  RangeCalendar,
  RangeCalendarStateContext,
  Text,
  TextContext,
  useLocale,
  type ValidationResult,
} from "react-aria-components";
import { DateFormatter } from "@internationalized/date";

import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EditIcon,
  XIcon,
} from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { Button } from "./Button";
import { datePickerStyles } from "./date-picker-styles";
import { fieldStyles, type FieldVariantProps } from "./field-styles";
import IconButton from "./IconButton";
import Modal from "./Modal";
import { pickerDialogStyles } from "./picker-dialog-styles";


/** The words the pickers draw or announce, English by default. */
export type DatePickerLabels = {
  openCalendar: string;
  selectDate: string;
  selectRange: string;
  enterDate: string;
  enterRange: string;
  /** The modal headline before a date is picked. */
  noDate: string;
  date: string;
  startDate: string;
  endDate: string;
  cancel: string;
  ok: string;
  save: string;
  close: string;
  toInput: string;
  toCalendar: string;
  previousMonth: string;
  nextMonth: string;
  previousYear: string;
  nextYear: string;
  chooseMonth: string;
  chooseYear: string;
  months: string;
  years: string;
  unavailable: string;
  invalidRange: string;
};

const defaultLabels: DatePickerLabels = {
  openCalendar: "Open calendar",
  selectDate: "Select date",
  selectRange: "Select range",
  enterDate: "Enter date",
  enterRange: "Enter dates",
  noDate: "Selected date",
  date: "Date",
  startDate: "Start date",
  endDate: "End date",
  cancel: "Cancel",
  ok: "OK",
  save: "Save",
  close: "Close",
  toInput: "Switch to text input",
  toCalendar: "Switch to calendar",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  previousYear: "Previous year",
  nextYear: "Next year",
  chooseMonth: "Choose month",
  chooseYear: "Choose year",
  months: "Months",
  years: "Years",
  unavailable: "This date is unavailable",
  invalidRange: "The end date is before the start date",
};

type FieldProps = Pick<FieldVariantProps, "variant"> & {
  label?: string;
  /** Helper text under the field. Default: the date's format, "MM/DD/YYYY". */
  supportingText?: ReactNode;
  errorMessage?: string | ((validation: ValidationResult) => string);
  labels?: Partial<DatePickerLabels>;
  className?: string;
};

export type DatePickerProps<T extends DateValue> = Omit<
  AriaDatePickerProps<T>,
  "className" | "children"
> &
  FieldProps & {
    /** Material's variant. Default `docked`. */
    layout?: "docked" | "modal" | "fullscreen";
    /** What a modal picker opens on: the calendar, or the date input. */
    defaultMode?: "calendar" | "input";
  };

export type DateRangePickerProps<T extends DateValue> = Omit<
  AriaDateRangePickerProps<T>,
  "className" | "children"
> &
  FieldProps & {
    defaultMode?: "calendar" | "input";
  };

/** The calendar's constraints, handed to the draft calendar and fields. */
type Constraints = {
  minValue?: DateValue | null;
  maxValue?: DateValue | null;
  isDateUnavailable?: (date: DateValue) => boolean;
  firstDayOfWeek?: AriaDatePickerProps<DateValue>["firstDayOfWeek"];
  /** The month a calendar opens on with no value: the picker's
      `placeholderValue`, else today's. */
  defaultFocusedValue?: DateValue | null;
};

type Mode = "calendar" | "input";

/**
 * MD3 date pickers — `DatePicker` selects one date, `DateRangePicker` a
 * start and an end. Both are a segmented text field (the shared
 * `./field-styles.ts` module at `kind="segmented"`) whose calendar button
 * opens the picker; the value is an `@internationalized/date` value, as in
 * React Aria's `DatePicker` and `DateRangePicker`, which they are built on.
 *
 *   <DatePicker label="Date" defaultValue={parseDate("2026-06-15")} />
 *   <DatePicker label="Date" layout="modal" />
 *   <DateRangePicker label="Stay" />
 *
 * Material's variants, as `layout` and `defaultMode`:
 *
 * - **Docked** (`layout="docked"`, the default): the calendar in a popover
 *   under the field, with a month menu and a year menu, each between its
 *   previous and next buttons, and neighbouring months' dates at 38 %.
 * - **Modal** (`layout="modal"`): a 360dp dialog with supporting text, the
 *   picked date as headline, the switch to input (the pencil), a "June 2026"
 *   menu button that opens the year grid, and Cancel / OK.
 * - **Full screen** (`layout="fullscreen"`): the same in a dialog that
 *   covers the window, with a close (X) and Save, as Material recommends on
 *   compact windows. `DateRangePicker` is always full screen, as Material's
 *   range picker is, and lists its months in a vertical scroll.
 * - **Modal date input** (`defaultMode="input"`, or the pencil): a 328dp
 *   dialog holding an outlined date field (two for a range).
 *
 * Every picker holds a draft: the calendar and the input change it, OK or
 * Save commits it, and Cancel, Escape, the close button or a press outside
 * drop it. OK and Save are disabled while the draft is one the constraints
 * refuse (outside `minValue` / `maxValue`, unavailable, or a reversed or
 * half-typed range). Typing in the field itself commits as it is typed.
 *
 * Accessibility, as Material's page asks: the calendar button is the one way
 * into the picker and every segment of the field is a tab stop; the grid is
 * a `grid` whose cells announce the whole date ("Monday, June 15, 2026") and
 * whose weekdays are column headers; Page Up / Down move a month and
 * Shift + Page Up / Down a year (React Aria's); Shift + M and Shift + Y move
 * to the docked picker's month and year menus. The helper text gives the
 * date's format ("MM/DD/YYYY" in en-US) unless `supportingText` is set.
 *
 * Strings: `labels`, in English by default, for every word the pickers
 * draw or announce that React Aria does not translate itself.
 *
 * Deviations, by name:
 * - **Typed dates are segmented.** Material asks for free text formatted on
 *   Enter or blur, with no input mask, and for many formats accepted. The
 *   field is React Aria's segmented `DateInput`: each part is a spin button
 *   that takes digits and arrow keys in the locale's order, which reads the
 *   same to a screen reader before and after a value is typed, and accepts
 *   no other format.
 * - **The docked picker confirms.** Its anatomy draws Cancel and OK under
 *   the calendar, so a pick there is a draft as well.
 * - **No swipe** between months and no clear button: the arrows and the
 *   keyboard move months, and Material calls the clear button optional.
 * - **No tooltips**: Material shows a weekday's full name on hover, and an
 *   arrow's keyboard shortcut (Shift + Page Up for the previous year) on
 *   focus. The column headers carry the full weekday name for assistive
 *   technology (React Aria's); the shortcuts are React Aria's and are not
 *   shown. Wrap an arrow in the kit's `TooltipTrigger` where they should be.
 * - **Full screen** takes the range selection's tokens (corner none,
 *   elevation 0, a `title-large` headline) for both pickers.
 *
 * Spec: https://m3.material.io/components/date-pickers/{overview,specs,guidelines,accessibility}
 */
export function DatePicker<T extends DateValue>(props: DatePickerProps<T>) {
  const {
    label,
    supportingText,
    errorMessage,
    labels: labelsProp,
    variant = "outlined",
    layout = "docked",
    defaultMode = "calendar",
    className,
    ...pickerProps
  } = props;
  const labels = { ...defaultLabels, ...labelsProp };
  const s = fieldStyles({ variant, kind: "segmented" });
  const constraints: Constraints = {
    minValue: pickerProps.minValue,
    maxValue: pickerProps.maxValue,
    isDateUnavailable: pickerProps.isDateUnavailable,
    firstDayOfWeek: pickerProps.firstDayOfWeek,
    defaultFocusedValue: pickerProps.placeholderValue,
  };

  // The docked popover opens under the whole picker, its helper text
  // included, so it neither cuts that row in half nor hides it.
  const pickerRef = useRef<HTMLDivElement>(null);

  return (
    <AriaDatePicker
      ref={pickerRef}
      data-slot="date-picker"
      data-variant={variant}
      data-layout={layout}
      {...pickerProps}
      className={composeTailwindRenderProps(className, s.base())}
    >
      <SegmentedField styles={s} label={label} labels={labels} />
      <Supporting
        styles={s}
        supportingText={supportingText}
        errorMessage={errorMessage}
      />
      {layout === "docked" ? (
        <Popover
          data-slot="date-picker-popover"
          triggerRef={pickerRef}
          placement="bottom start"
          className={datePickerStyles().popover()}
        >
          <Dialog className="outline-none">
            <SingleSurface
              layout="docked"
              defaultMode="calendar"
              labels={labels}
              constraints={constraints}
            />
          </Dialog>
        </Popover>
      ) : (
        <PickerModal fullscreen={layout === "fullscreen"}>
          <SingleSurface
            layout={layout}
            defaultMode={defaultMode}
            labels={labels}
            constraints={constraints}
          />
        </PickerModal>
      )}
    </AriaDatePicker>
  );
}

export function DateRangePicker<T extends DateValue>(
  props: DateRangePickerProps<T>,
) {
  const {
    label,
    supportingText,
    errorMessage,
    labels: labelsProp,
    variant = "outlined",
    defaultMode = "calendar",
    className,
    ...pickerProps
  } = props;
  const labels = { ...defaultLabels, ...labelsProp };
  const s = fieldStyles({ variant, kind: "segmented" });
  const constraints: Constraints = {
    minValue: pickerProps.minValue,
    maxValue: pickerProps.maxValue,
    // The range's own test also takes the first press; the draft's
    // checks ask about one date at a time.
    isDateUnavailable: pickerProps.isDateUnavailable
      ? (date) => pickerProps.isDateUnavailable!(date, null)
      : undefined,
    firstDayOfWeek: pickerProps.firstDayOfWeek,
    defaultFocusedValue: pickerProps.placeholderValue,
  };

  return (
    <AriaDateRangePicker
      data-slot="date-range-picker"
      data-variant={variant}
      {...pickerProps}
      className={composeTailwindRenderProps(className, s.base())}
    >
      <SegmentedField styles={s} label={label} labels={labels} range />
      <Supporting
        styles={s}
        supportingText={supportingText}
        errorMessage={errorMessage}
        range
      />
      <PickerModal fullscreen>
        <RangeSurface
          defaultMode={defaultMode}
          labels={labels}
          constraints={constraints}
        />
      </PickerModal>
    </AriaDateRangePicker>
  );
}

/* ---- the field ---------------------------------------------------------- */

type FieldStyles = ReturnType<typeof fieldStyles>;

function SegmentedField({
  styles: s,
  label,
  labels,
  range,
}: {
  styles: FieldStyles;
  label?: string;
  labels: DatePickerLabels;
  range?: boolean;
}) {
  const segments = (slot?: "start" | "end") => (
    <DateInput slot={slot} className="flex">
      {(segment) => <DateSegment segment={segment} className={s.segment()} />}
    </DateInput>
  );

  return (
    <Group data-slot="date-picker-field" className={s.container()}>
      <span className={s.input()}>
        {range ? (
          <>
            {segments("start")}
            <span aria-hidden="true" className="px-1">
              –
            </span>
            {segments("end")}
          </>
        ) : (
          segments()
        )}
      </span>
      {label && (
        <Label data-slot="label" className={s.label()}>
          {label}
        </Label>
      )}
      <IconButton
        variant="standard"
        icon={CalendarIcon}
        aria-label={labels.openCalendar}
        className="ml-auto shrink-0"
        classNames={{ icon: s.trailingIcon() }}
      />
      <span data-slot="state-layer" className={s.stateLayer()} />
      <span data-slot="active-indicator" className={s.indicator()} />
    </Group>
  );
}

function Supporting({
  styles: s,
  supportingText,
  errorMessage,
  range,
}: {
  styles: FieldStyles;
  supportingText?: ReactNode;
  errorMessage?: FieldProps["errorMessage"];
  range?: boolean;
}) {
  const { locale } = useLocale();
  const pattern = datePattern(locale);
  return (
    <div data-slot="supporting-text" className={s.supporting()}>
      <FieldError>{errorMessage}</FieldError>
      <Text slot="description" className="group-data-invalid/tf:hidden">
        {supportingText ?? (range ? `${pattern} – ${pattern}` : pattern)}
      </Text>
    </div>
  );
}

/* ---- the dialog --------------------------------------------------------- */

/**
 * The picker's modal. The field's contexts stop here: the dialog's buttons,
 * labels and fields are its own, not the field's.
 */
function PickerModal({
  fullscreen,
  children,
}: {
  fullscreen?: boolean;
  children: ReactNode;
}) {
  return (
    <Modal isAnimated={!fullscreen}>
      <Provider
        values={[
          [ButtonContext, null],
          [GroupContext, null],
          [LabelContext, null],
          [TextContext, null],
          [DateFieldContext, null],
          [FieldErrorContext, null],
        ]}
      >
        {children}
      </Provider>
    </Modal>
  );
}

function SingleSurface({
  layout,
  defaultMode,
  labels,
  constraints,
}: {
  layout: "docked" | "modal" | "fullscreen";
  defaultMode: Mode;
  labels: DatePickerLabels;
  constraints: Constraints;
}) {
  const state = useContext(DatePickerStateContext)!;
  const { locale } = useLocale();
  const [draft, setDraft] = useState<DateValue | null>(state.value);
  const [mode, setMode] = useState<Mode>(defaultMode);
  // A draft the constraints refuse (a value given outside min / max, or a
  // date typed out of range) cannot be confirmed: OK and Save are disabled
  // until the draft is one that can.
  const invalid = draft != null && isOutside(draft, constraints);
  const commit = () => {
    if (invalid) return;
    if (draft) state.setValue(draft);
    state.close();
  };
  const cancel = () => state.close();

  if (layout === "docked") {
    return (
      <div data-slot="date-picker-docked" className="flex flex-col">
        <DockedCalendar
          value={draft}
          onChange={setDraft}
          labels={labels}
          constraints={constraints}
        />
        <Actions
          className={pickerDialogStyles().actions({ class: "px-3 pb-3 pt-2" })}
          labels={labels}
          onCancel={cancel}
          onConfirm={commit}
          canConfirm={!invalid}
        />
      </div>
    );
  }

  const fullscreen = layout === "fullscreen" && mode === "calendar";
  const p = pickerDialogStyles({
    kind: mode === "input" ? "input" : "date",
    layout: fullscreen ? "fullscreen" : "dialog",
  });
  const headline = draft
    ? formatter(locale, { weekday: "short", month: "short", day: "numeric" })
        .format(draft.toDate("UTC"))
    : mode === "input"
      ? labels.enterDate
      : labels.noDate;

  return (
    <Dialog data-slot="date-picker-dialog" className={p.container()}>
      {fullscreen && (
        <TopBar
          labels={labels}
          onClose={cancel}
          onSave={commit}
          canSave={!invalid}
          styles={p}
        />
      )}
      <div data-slot="date-picker-header" className={p.header()}>
        <span className={p.supporting()}>{labels.selectDate}</span>
        <div className={p.headlineRow()}>
          <span data-slot="date-picker-headline" className={p.headline()}>
            {headline}
          </span>
          <ModeToggle mode={mode} setMode={setMode} labels={labels} />
        </div>
      </div>
      <div className={p.divider()} />
      <div className={p.body()}>
        {mode === "calendar" ? (
          <ModalCalendar
            value={draft}
            onChange={setDraft}
            labels={labels}
            constraints={constraints}
          />
        ) : (
          <InputField
            label={labels.date}
            value={draft}
            onChange={setDraft}
            labels={labels}
            constraints={constraints}
            autoFocus
          />
        )}
      </div>
      {!fullscreen && (
        <Actions
          className={p.actions()}
          labels={labels}
          onCancel={cancel}
          onConfirm={commit}
          canConfirm={!invalid}
        />
      )}
    </Dialog>
  );
}

type Range = { start: DateValue; end: DateValue };

function RangeSurface({
  defaultMode,
  labels,
  constraints,
}: {
  defaultMode: Mode;
  labels: DatePickerLabels;
  constraints: Constraints;
}) {
  const state = useContext(DateRangePickerStateContext)!;
  const { locale } = useLocale();
  const initial =
    state.value?.start && state.value?.end
      ? { start: state.value.start, end: state.value.end }
      : null;
  const [draft, setDraft] = useState<Range | null>(initial);
  // What the input mode holds while a range is half typed.
  const [start, setStart] = useState<DateValue | null>(initial?.start ?? null);
  const [end, setEnd] = useState<DateValue | null>(initial?.end ?? null);
  // The first press of a range, before the second makes it a range.
  const [anchor, setAnchor] = useState<DateValue | null>(null);
  const [mode, setMode] = useState<Mode>(defaultMode);

  const reversed = start != null && end != null && end.compare(start) < 0;
  const outside = (range: { start: DateValue | null; end: DateValue | null }) =>
    (range.start != null && isOutside(range.start, constraints)) ||
    (range.end != null && isOutside(range.end, constraints));
  // As for one date: a range that cannot be committed (reversed, half
  // typed, or outside the constraints) disables OK and Save.
  const invalid =
    mode === "input"
      ? reversed || (start == null) !== (end == null) || outside({ start, end })
      : draft != null && outside(draft);
  const commit = () => {
    if (invalid) return;
    if (mode === "input") {
      if (start && end) state.setValue({ start, end });
    } else if (draft) {
      state.setValue(draft);
    }
    state.close();
  };
  const cancel = () => state.close();
  const switchMode = (next: Mode) => {
    // The two modes show one draft.
    if (next === "input") {
      setStart(draft?.start ?? null);
      setEnd(draft?.end ?? null);
    } else if (start && end && !reversed) {
      setDraft({ start, end });
    }
    setMode(next);
  };

  const fmt = formatter(locale, { month: "short", day: "numeric" });
  const shown =
    mode === "input"
      ? { start, end }
      : { start: anchor ?? draft?.start ?? null, end: anchor ? null : (draft?.end ?? null) };
  const headline = `${shown.start ? fmt.format(shown.start.toDate("UTC")) : labels.startDate} – ${
    shown.end ? fmt.format(shown.end.toDate("UTC")) : labels.endDate
  }`;
  const fullscreen = mode === "calendar";
  const p = pickerDialogStyles({
    kind: mode === "input" ? "input" : "date",
    layout: fullscreen ? "fullscreen" : "dialog",
  });

  return (
    <Dialog data-slot="date-range-picker-dialog" className={p.container()}>
      {fullscreen && (
        <TopBar
          labels={labels}
          onClose={cancel}
          onSave={commit}
          canSave={!invalid}
          styles={p}
        />
      )}
      <div data-slot="date-picker-header" className={p.header()}>
        <span className={p.supporting()}>
          {mode === "input" ? labels.enterRange : labels.selectRange}
        </span>
        <div className={p.headlineRow()}>
          <span
            data-slot="date-picker-headline"
            className={p.headline()}
          >
            {headline}
          </span>
          <ModeToggle mode={mode} setMode={switchMode} labels={labels} />
        </div>
      </div>
      <div className={p.divider()} />
      <div className={p.body()}>
        {mode === "calendar" ? (
          <MonthList
            value={draft}
            onChange={(range) => {
              setAnchor(null);
              setDraft(range);
            }}
            onAnchor={setAnchor}
            constraints={constraints}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <InputField
              label={labels.startDate}
              value={start}
              onChange={setStart}
              labels={labels}
              constraints={constraints}
              autoFocus
            />
            <InputField
              label={labels.endDate}
              value={end}
              onChange={setEnd}
              labels={labels}
              constraints={constraints}
              error={reversed ? labels.invalidRange : undefined}
            />
          </div>
        )}
      </div>
      {!fullscreen && (
        <Actions
          className={p.actions()}
          labels={labels}
          onCancel={cancel}
          onConfirm={commit}
          canConfirm={!invalid}
        />
      )}
    </Dialog>
  );
}

type DialogStyles = ReturnType<typeof pickerDialogStyles>;

function TopBar({
  labels,
  onClose,
  onSave,
  canSave,
  styles: p,
}: {
  labels: DatePickerLabels;
  onClose: () => void;
  onSave: () => void;
  canSave: boolean;
  styles: DialogStyles;
}) {
  return (
    <div data-slot="date-picker-top-bar" className={p.topBar()}>
      <IconButton
        variant="standard"
        icon={XIcon}
        aria-label={labels.close}
        onPress={onClose}
      />
      <Button variant="text" onPress={onSave} isDisabled={!canSave}>
        {labels.save}
      </Button>
    </div>
  );
}

function ModeToggle({
  mode,
  setMode,
  labels,
}: {
  mode: Mode;
  setMode: (mode: Mode) => void;
  labels: DatePickerLabels;
}) {
  return (
    <IconButton
      variant="standard"
      icon={mode === "calendar" ? EditIcon : CalendarIcon}
      aria-label={mode === "calendar" ? labels.toInput : labels.toCalendar}
      onPress={() => setMode(mode === "calendar" ? "input" : "calendar")}
      className="-mr-3 shrink-0"
    />
  );
}

function Actions({
  className,
  labels,
  onCancel,
  onConfirm,
  canConfirm,
}: {
  className: string;
  labels: DatePickerLabels;
  onCancel: () => void;
  onConfirm: () => void;
  canConfirm: boolean;
}) {
  return (
    <div data-slot="date-picker-actions" className={className}>
      <Button variant="text" onPress={onCancel}>
        {labels.cancel}
      </Button>
      <Button variant="text" onPress={onConfirm} isDisabled={!canConfirm}>
        {labels.ok}
      </Button>
    </div>
  );
}

/* ---- the calendars ------------------------------------------------------ */

type CalendarProps = {
  value: DateValue | null;
  onChange: (value: DateValue) => void;
  labels: DatePickerLabels;
  constraints: Constraints;
};

type View = "day" | "month" | "year";

/** The docked calendar: month and year menus, each between its arrows. */
function DockedCalendar({ value, onChange, labels, constraints }: CalendarProps) {
  const [view, setView] = useState<View>("day");
  const monthRef = useRef<HTMLButtonElement>(null);
  const yearRef = useRef<HTMLButtonElement>(null);
  const d = datePickerStyles({ outsideMonth: "shown" });

  return (
    <div
      className="contents"
      onKeyDown={(e) => {
        // Material's shortcuts to the two menus.
        if (!e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key === "M") monthRef.current?.focus();
        if (e.key === "Y") yearRef.current?.focus();
      }}
    >
    <Calendar<DateValue>
      slot={null}
      data-slot="date-picker-calendar"
      value={value}
      onChange={onChange}
      {...constraints}
      autoFocus
      className={d.calendar()}
    >
      <DockedHeader
        view={view}
        setView={setView}
        labels={labels}
        monthRef={monthRef}
        yearRef={yearRef}
      />
      {view === "day" && <DayGrid styles={d} />}
      {view === "month" && (
        <MonthMenu labels={labels} onDone={() => setView("day")} />
      )}
      {view === "year" && (
        <YearMenu labels={labels} onDone={() => setView("day")} />
      )}
    </Calendar>
    </div>
  );
}

function DockedHeader({
  view,
  setView,
  labels,
  monthRef,
  yearRef,
}: {
  view: View;
  setView: (view: View) => void;
  labels: DatePickerLabels;
  monthRef: RefObject<HTMLButtonElement | null>;
  yearRef: RefObject<HTMLButtonElement | null>;
}) {
  const state = useContext(CalendarStateContext)!;
  const { locale } = useLocale();
  const d = datePickerStyles();
  const focused = state.focusedDate;
  const asDate = focused.toDate("UTC");
  const prevYear = focused.subtract({ years: 1 }).set({ month: 12, day: 31 });
  const nextYear = focused.add({ years: 1 }).set({ month: 1, day: 1 });
  const day = view === "day";
  const arrows = day ? "" : "invisible";

  return (
    <div data-slot="date-picker-calendar-header" className={d.header({ class: "h-16 justify-between px-1" })}>
      <div className="flex items-center">
        <IconButton slot="previous" variant="standard" icon={ChevronLeftIcon} aria-label={labels.previousMonth} className={arrows} />
        <MenuButton
          ref={monthRef}
          label={`${labels.chooseMonth}, ${formatter(locale, { month: "long" }).format(asDate)}`}
          isOpen={view === "month"}
          isDisabled={view === "year"}
          onPress={() => setView(view === "month" ? "day" : "month")}
        >
          {formatter(locale, { month: "short" }).format(asDate)}
        </MenuButton>
        <IconButton slot="next" variant="standard" icon={ChevronRightIcon} aria-label={labels.nextMonth} className={arrows} />
      </div>
      <div className="flex items-center">
        <IconButton
          variant="standard"
          icon={ChevronLeftIcon}
          aria-label={labels.previousYear}
          slot={null}
          isDisabled={state.isInvalid(prevYear)}
          onPress={() => state.setFocusedDate(focused.subtract({ years: 1 }))}
          className={arrows}
        />
        <MenuButton
          ref={yearRef}
          label={`${labels.chooseYear}, ${focused.year}`}
          isOpen={view === "year"}
          isDisabled={view === "month"}
          onPress={() => setView(view === "year" ? "day" : "year")}
        >
          {formatter(locale, { year: "numeric" }).format(asDate)}
        </MenuButton>
        <IconButton
          variant="standard"
          icon={ChevronRightIcon}
          aria-label={labels.nextYear}
          slot={null}
          isDisabled={state.isInvalid(nextYear)}
          onPress={() => state.setFocusedDate(focused.add({ years: 1 }))}
          className={arrows}
        />
      </div>
    </div>
  );
}

function MenuButton({
  ref,
  label,
  isOpen,
  isDisabled,
  onPress,
  children,
}: {
  ref?: Ref<HTMLButtonElement>;
  label: string;
  isOpen: boolean;
  isDisabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const d = datePickerStyles();
  return (
    <AriaButton
      ref={ref}
      // Inside a calendar, whose button context holds only its arrows.
      slot={null}
      data-slot="date-picker-menu-button"
      aria-label={label}
      aria-expanded={isOpen}
      isDisabled={isDisabled}
      onPress={onPress}
      className={d.menuButton()}
    >
      <span className={d.stateLayer()} />
      <span className="relative">{children}</span>
      <ChevronDownIcon size={18} className={`relative ${d.menuIcon()}`} />
    </AriaButton>
  );
}

function DayGrid({
  styles: d,
  offset,
}: {
  styles: ReturnType<typeof datePickerStyles>;
  offset?: { months: number };
}) {
  return (
    <CalendarGrid
      data-slot="date-picker-grid"
      weekdayStyle="narrow"
      offset={offset}
      className={d.grid({ class: "mx-auto" })}
    >
      <CalendarGridHeader>
        {(day) => (
          <CalendarHeaderCell className={d.weekday()}>{day}</CalendarHeaderCell>
        )}
      </CalendarGridHeader>
      <CalendarGridBody>
        {(date) => (
          <CalendarCell
            data-slot="date-picker-day"
            date={date}
            className={d.cell()}
          >
            {({ formattedDate }) => (
              <>
                <span className={d.band()} />
                <span className={d.day()}>
                  <span className={d.dayStateLayer()} />
                  <span className="relative">{formattedDate}</span>
                </span>
              </>
            )}
          </CalendarCell>
        )}
      </CalendarGridBody>
    </CalendarGrid>
  );
}

/** The docked month menu: twelve list items, the shown one checked. */
function MonthMenu({
  labels,
  onDone,
}: {
  labels: DatePickerLabels;
  onDone: () => void;
}) {
  const state = useContext(CalendarStateContext)!;
  const { locale } = useLocale();
  const fmt = formatter(locale, { month: "long" });
  const focused = state.focusedDate;
  const months = Array.from({ length: 12 }, (_, i) => {
    const first = focused.set({ month: i + 1, day: 1 });
    const last = first.add({ months: 1 }).subtract({ days: 1 });
    return {
      id: i + 1,
      name: fmt.format(first.toDate("UTC")),
      disabled: state.isInvalid(first) && state.isInvalid(last),
    };
  });
  return (
    <MenuList
      label={labels.months}
      items={months}
      selected={focused.month}
      onSelect={(month) => {
        state.setFocusedDate(focused.set({ month }));
        state.setFocused(true);
        onDone();
      }}
    />
  );
}

/** The docked year menu: the years min to max, or a century each way. */
function YearMenu({
  labels,
  onDone,
}: {
  labels: DatePickerLabels;
  onDone: () => void;
}) {
  const state = useContext(CalendarStateContext)!;
  const focused = state.focusedDate;
  const years = yearsAround(state.focusedDate.year, state.minValue, state.maxValue);
  return (
    <MenuList
      label={labels.years}
      items={years.map((y) => ({ id: y, name: String(y), disabled: false }))}
      selected={focused.year}
      onSelect={(year) => {
        state.setFocusedDate(focused.set({ year }));
        state.setFocused(true);
        onDone();
      }}
    />
  );
}

function MenuList({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: { id: number; name: string; disabled: boolean }[];
  selected: number;
  onSelect: (id: number) => void;
}) {
  const d = datePickerStyles();
  return (
    <ListBox
      data-slot="date-picker-menu"
      aria-label={label}
      items={items}
      selectionMode="single"
      selectedKeys={[selected]}
      disabledKeys={items.filter((i) => i.disabled).map((i) => i.id)}
      // A press on the shown item deselects it: that, too, picks it.
      onSelectionChange={(keys) => {
        const [key] = [...(keys as Set<number>)];
        onSelect(key ?? selected);
      }}
      autoFocus
      className={d.list({ class: "h-84" })}
    >
      {(item) => (
        <ListBoxItem
          id={item.id}
          textValue={item.name}
          className={d.listItem()}
        >
          {({ isSelected }) => (
            <>
              <span className={d.stateLayer({ class: "bg-on-surface" })} />
              <span className={d.listIcon()}>
                {isSelected && <CheckIcon size={24} />}
              </span>
              <span className="relative">{item.name}</span>
            </>
          )}
        </ListBoxItem>
      )}
    </ListBox>
  );
}

/** The modal calendar: a "June 2026" menu button opening the year grid. */
function ModalCalendar({ value, onChange, labels, constraints }: CalendarProps) {
  const [view, setView] = useState<"day" | "year">("day");
  const d = datePickerStyles({ outsideMonth: "hidden" });

  return (
    <Calendar<DateValue>
      slot={null}
      data-slot="date-picker-calendar"
      value={value}
      onChange={onChange}
      {...constraints}
      autoFocus
      className={d.calendar({ class: "pb-2" })}
    >
      <ModalHeader view={view} setView={setView} labels={labels} />
      {view === "day" ? (
        <DayGrid styles={d} />
      ) : (
        <YearGrid labels={labels} onDone={() => setView("day")} />
      )}
    </Calendar>
  );
}

function ModalHeader({
  view,
  setView,
  labels,
}: {
  view: "day" | "year";
  setView: (view: "day" | "year") => void;
  labels: DatePickerLabels;
}) {
  const state = useContext(CalendarStateContext)!;
  const { locale } = useLocale();
  const d = datePickerStyles();
  const shown = formatter(locale, { month: "long", year: "numeric" }).format(
    state.focusedDate.toDate("UTC"),
  );
  const arrows = view === "day" ? "" : "invisible";
  return (
    <div data-slot="date-picker-calendar-header" className={d.header({ class: "h-14 justify-between pl-4 pr-3" })}>
      <MenuButton
        label={`${labels.chooseYear}, ${shown}`}
        isOpen={view === "year"}
        onPress={() => setView(view === "year" ? "day" : "year")}
      >
        {shown}
      </MenuButton>
      <div className="flex items-center">
        <IconButton slot="previous" variant="standard" icon={ChevronLeftIcon} aria-label={labels.previousMonth} className={arrows} />
        <IconButton slot="next" variant="standard" icon={ChevronRightIcon} aria-label={labels.nextMonth} className={arrows} />
      </div>
    </div>
  );
}

/** The modal year grid: 72 by 36 years, three to a row. */
function YearGrid({
  labels,
  onDone,
}: {
  labels: DatePickerLabels;
  onDone: () => void;
}) {
  const state = useContext(CalendarStateContext)!;
  const d = datePickerStyles();
  const focused = state.focusedDate;
  const years = yearsAround(focused.year, state.minValue, state.maxValue);
  const pick = (year: number) => {
    state.setFocusedDate(focused.set({ year }));
    state.setFocused(true);
    onDone();
  };
  return (
    <ListBox
      data-slot="date-picker-years"
      aria-label={labels.years}
      layout="grid"
      items={years.map((y) => ({ id: y }))}
      selectionMode="single"
      selectedKeys={[focused.year]}
      onSelectionChange={(keys) => {
        const [key] = [...(keys as Set<number>)];
        pick(key ?? focused.year);
      }}
      autoFocus
      className={d.yearGrid({ class: "h-84" })}
    >
      {(item) => (
        <ListBoxItem
          id={item.id}
          textValue={String(item.id)}
          className={d.year()}
        >
          <span className={d.stateLayer()} />
          <span className="relative">{item.id}</span>
        </ListBoxItem>
      )}
    </ListBox>
  );
}

/**
 * The range picker's months, one under the other in a scroll that goes both
 * ways. React Aria holds a window of `RANGE_MAX_MONTHS` months, set once on
 * open around the range's first month (or the placeholder's, or today's), and
 * bounded by `minValue` and `maxValue`. The list shows its own slice of that
 * window: thirteen months centred on that month, scrolled so it is on top.
 * The slice grows by a year, six months each way from the months it shows, as
 * the scroll nears either end, and the month in view stays where it was. It
 * is never re-centred on the focused date: React Aria would re-centre its
 * window on focus at every change of its visible duration, which is why the
 * duration never changes. The slice takes in the month the keyboard moves
 * focus to, and stops at the ends of React Aria's window.
 */
const RANGE_MONTHS = 13;
const RANGE_GROWTH = 12;
const RANGE_MAX_MONTHS = 121;

function MonthList({
  value,
  onChange,
  onAnchor,
  constraints,
}: {
  value: Range | null;
  onChange: (range: Range) => void;
  onAnchor: (date: DateValue | null) => void;
  constraints: Constraints;
}) {
  const d = datePickerStyles({ range: true, outsideMonth: "hidden" });

  return (
    <RangeCalendar<DateValue>
      slot={null}
      data-slot="date-range-picker-calendar"
      value={value}
      onChange={onChange}
      {...constraints}
      visibleDuration={{ months: RANGE_MAX_MONTHS }}
      pageBehavior="single"
      selectionAlignment="center"
      autoFocus
      className={d.calendar({ class: "min-h-0 flex-1" })}
    >
      <AnchorWatch onAnchor={onAnchor} />
      <WeekdayRow styles={d} />
      <MonthScroll styles={d} />
    </RangeCalendar>
  );
}

/** A month as a count of months, so that months compare and subtract. */
const monthIndex = (date: DateValue) => date.year * 12 + date.month - 1;

/** The slice the list shows, first and last month as `monthIndex`es. */
type Slice = { from: number; to: number };

function MonthScroll({
  styles: d,
}: {
  styles: ReturnType<typeof datePickerStyles>;
}) {
  const state = useContext(RangeCalendarStateContext)!;
  const scrollRef = useRef<HTMLDivElement>(null);
  // The month in view when the slice grew, and how far below the top of the
  // scroll it stood.
  const keep = useRef<{ month: string; top: number } | null>(null);
  const start = state.visibleRange.start;
  const lower = Math.max(
    monthIndex(start),
    state.minValue ? monthIndex(state.minValue) : -Infinity,
  );
  const upper = Math.min(
    monthIndex(state.visibleRange.end),
    state.maxValue ? monthIndex(state.maxValue) : Infinity,
  );
  const focused = monthIndex(state.focusedDate);
  const half = (RANGE_MONTHS - 1) / 2;

  // On open, thirteen months centred on the focused one, moved inside the
  // bounds and then cut to them.
  const [stored, setSlice] = useState<Slice>(() => {
    const shift =
      Math.max(0, lower - (focused - half)) - Math.max(0, focused + half - upper);
    return {
      from: Math.max(lower, focused - half + shift),
      to: Math.min(upper, focused + half + shift),
    };
  });
  // The slice takes in the focused month, and stays inside React Aria's
  // window when focus moves it.
  const slice = {
    from: Math.max(lower, Math.min(stored.from, focused)),
    to: Math.min(upper, Math.max(stored.to, focused)),
  };
  if (slice.from !== stored.from || slice.to !== stored.to) setSlice(slice);

  const key = (date: DateValue) => `${date.year}-${date.month}`;

  // On open, the focused month on top.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const section = el?.querySelector<HTMLElement>(
      `[data-month="${key(state.focusedDate)}"]`,
    );
    if (el && section) el.scrollTop = section.offsetTop;
    // Once, on open: later scrolls are the person's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After a growth, the month that was in view back where it was.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const kept = keep.current;
    if (!el || !kept) return;
    keep.current = null;
    const section = el.querySelector<HTMLElement>(`[data-month="${kept.month}"]`);
    if (section) el.scrollTop = section.offsetTop - kept.top;
  }, [slice.from, slice.to]);

  return (
    <div
      ref={scrollRef}
      data-slot="date-range-picker-months"
      className="relative min-h-0 flex-1 overflow-y-auto"
      onScroll={(e) => {
        const el = e.currentTarget;
        const nearTop = el.scrollTop < 200 && slice.from > lower;
        const nearEnd =
          el.scrollTop + el.clientHeight > el.scrollHeight - 200 &&
          slice.to < upper;
        if (!(nearTop || nearEnd) || keep.current) return;
        const inView = [...el.querySelectorAll<HTMLElement>("[data-month]")].find(
          (section) => section.offsetTop + section.offsetHeight > el.scrollTop,
        );
        if (inView)
          keep.current = {
            month: inView.dataset.month!,
            top: inView.offsetTop - el.scrollTop,
          };
        setSlice({
          from: Math.max(lower, slice.from - RANGE_GROWTH / 2),
          to: Math.min(upper, slice.to + RANGE_GROWTH / 2),
        });
      }}
    >
      {Array.from({ length: slice.to - slice.from + 1 }, (_, i) => {
        const offset = slice.from - monthIndex(start) + i;
        return (
          <RangeMonth
            key={key(start.add({ months: offset }))}
            offset={offset}
            styles={d}
          />
        );
      })}
    </div>
  );
}

function RangeMonth({
  offset,
  styles: d,
}: {
  offset: number;
  styles: ReturnType<typeof datePickerStyles>;
}) {
  const state = useContext(RangeCalendarStateContext)!;
  const { locale } = useLocale();
  const month = state.visibleRange.start.add({ months: offset });
  return (
    <section
      data-month={`${month.year}-${month.month}`}
      className="mx-auto w-fit"
    >
      <h3 className={d.monthHeading({ class: "px-3" })}>
        {formatter(locale, { month: "long", year: "numeric" }).format(month.toDate("UTC"))}
      </h3>
      <CalendarGrid
        data-slot="date-picker-grid"
        weekdayStyle="narrow"
        offset={{ months: offset }}
        className={d.grid()}
      >
        <CalendarGridHeader className="sr-only">
          {(day) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
        </CalendarGridHeader>
        <CalendarGridBody>
          {(date) => (
            <CalendarCell
              data-slot="date-picker-day"
              date={date}
              className={d.cell()}
            >
              {({ formattedDate }) => (
                <>
                  <span className={d.band()} />
                  <span className={d.day()}>
                    <span className={d.dayStateLayer()} />
                    <span className="relative">{formattedDate}</span>
                  </span>
                </>
              )}
            </CalendarCell>
          )}
        </CalendarGridBody>
      </CalendarGrid>
    </section>
  );
}

/** The one weekday row over the range's scroll; each grid keeps its own
    headers for assistive technology. */
function WeekdayRow({ styles: d }: { styles: ReturnType<typeof datePickerStyles> }) {
  const state = useContext(RangeCalendarStateContext)!;
  const { locale } = useLocale();
  const fmt = formatter(locale, { weekday: "narrow" });
  const days = state
    .getDatesInWeek(0, state.visibleRange.start)
    .map((date) => (date ? fmt.format(date.toDate("UTC")) : ""));
  return (
    <div aria-hidden="true" className="mx-auto flex w-fit shrink-0">
      {days.map((day, i) => (
        <span key={i} className={d.weekday({ class: "flex items-center justify-center" })}>
          {day}
        </span>
      ))}
    </div>
  );
}

/** Reports the first press of a range, which the headline shows. */
function AnchorWatch({ onAnchor }: { onAnchor: (date: DateValue | null) => void }) {
  const state = useContext(RangeCalendarStateContext)!;
  const anchor = state.anchorDate ?? null;
  useEffect(() => onAnchor(anchor), [anchor, onAnchor]);
  return null;
}

/* ---- the input mode ----------------------------------------------------- */

function InputField({
  label,
  value,
  onChange,
  labels,
  constraints,
  error,
  autoFocus,
}: {
  label: string;
  value: DateValue | null;
  onChange: (value: DateValue | null) => void;
  labels: DatePickerLabels;
  constraints: Constraints;
  error?: string;
  autoFocus?: boolean;
}) {
  const s = fieldStyles({ variant: "outlined", kind: "segmented" });
  const { locale } = useLocale();
  return (
    <DateField
      data-slot="date-picker-input"
      value={value}
      onChange={onChange}
      minValue={constraints.minValue}
      maxValue={constraints.maxValue}
      validate={(v) =>
        error ??
        (v && constraints.isDateUnavailable?.(v) ? labels.unavailable : null)
      }
      validationBehavior="aria"
      autoFocus={autoFocus}
      className={s.base({
        class: "[--md3-field-notch:var(--md-sys-color-surface-container-high)]",
      })}
    >
      <div className={s.container({ class: "pr-4" })}>
        <span className={s.input()}>
          <DateInput className="flex">
            {(segment) => (
              <DateSegment segment={segment} className={s.segment()} />
            )}
          </DateInput>
        </span>
        <Label className={s.label()}>{label}</Label>
        <span className={s.indicator()} />
      </div>
      <div className={s.supporting()}>
        <FieldError />
        <Text slot="description" className="group-data-invalid/tf:hidden">
          {datePattern(locale)}
        </Text>
      </div>
    </DateField>
  );
}

/* ---- helpers ------------------------------------------------------------ */

function isOutside(date: DateValue, c: Constraints) {
  return (
    (c.minValue != null && date.compare(c.minValue) < 0) ||
    (c.maxValue != null && date.compare(c.maxValue) > 0) ||
    !!c.isDateUnavailable?.(date)
  );
}

function yearsAround(
  year: number,
  min?: DateValue | null,
  max?: DateValue | null,
) {
  const from = min?.year ?? year - 100;
  const to = max?.year ?? year + 100;
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const formatters = new Map<string, DateFormatter>();

/** Dates are formatted in UTC from `toDate("UTC")`, so the day never moves
    with the viewer's time zone. */
function formatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = locale + JSON.stringify(options);
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new DateFormatter(locale, { ...options, timeZone: "UTC" });
    formatters.set(key, fmt);
  }
  return fmt;
}

/** The locale's numeric date as a pattern: "MM/DD/YYYY" in en-US. */
function datePattern(locale: string) {
  return formatter(locale, { year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(Date.UTC(2000, 0, 1)))
    .map((part) =>
      part.type === "year"
        ? "YYYY"
        : part.type === "month"
          ? "MM"
          : part.type === "day"
            ? "DD"
            : part.value,
    )
    .join("");
}

export default DatePicker;
