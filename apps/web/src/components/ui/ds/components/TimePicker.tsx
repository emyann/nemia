"use client";

import { DateFormatter, Time } from "@internationalized/date";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  Button as AriaButton,
  DateInput,
  DateSegment,
  Dialog,
  DialogTrigger,
  Radio,
  RadioGroup,
  TimeField,
  ToggleButton,
  useLocale,
} from "react-aria-components";

import { KeyboardIcon, ScheduleIcon } from "../icons";
import { focusRing, tv } from "../utils";
import { Button } from "./Button";
import { fieldStyles, type FieldVariantProps } from "./field-styles";
import IconButton from "./IconButton";
import Modal from "./Modal";
import { pickerDialogStyles } from "./picker-dialog-styles";

/**
 * MD3 time picker — a modal dialog that picks an hour and a minute, on a
 * clock dial or typed, opened from a text-field-shaped trigger (the shared
 * `./field-styles.ts` module at `kind="trigger"`). The value is an
 * `@internationalized/date` `Time`.
 *
 *   <TimePicker label="Alarm" defaultValue={new Time(7, 0)} />
 *   <TimePicker label="Start" hourCycle={24} defaultMode="input" />
 *
 * - **Dial** (`defaultMode="dial"`): the hour and minute selectors (96 by
 *   80dp, 114dp wide for a 24-hour vertical dial; `display-large`;
 *   `primary-container` when selected), the period selector (52 by 80dp
 *   stacked, 216 by 38dp in a row; `tertiary-container` when selected,
 *   1dp `outline`), and the 256dp `surface-container-highest` dial with
 *   its 48dp `primary` handle, 2dp track and 8dp centre. Press or drag on
 *   the dial; letting go of an hour moves on to the minutes.
 * - **Input** (`defaultMode="input"`, or the keyboard button): React Aria's
 *   `TimeField`, its hour and minute drawn as Material's 96 by 72dp boxes in
 *   `display-medium`, `primary-container` with a 2dp `primary` outline
 *   while focused, and labelled "Hour" and "Minute" below.
 * - **Layout**: `orientation="vertical"` (the default) stacks the dial
 *   under the selectors; `horizontal` sets it beside them, as Material's
 *   landscape layout does.
 * - **12 or 24 hours**: the locale's, or `hourCycle`. A 24-hour picker has
 *   no period selector; its dial carries 00–11 on the outer ring and 12–23
 *   on the inner, as Material's figure draws it.
 *
 * Cancel, Escape and a press outside drop the draft; OK commits it.
 *
 * Accessibility, as Material's page lists it: every number on the dial is a
 * tab stop that Space or Enter selects, named "Hour 7 of 12" or
 * "Minute 15 of 60" and pressed when it is the value; AM and PM are radios
 * in a radio group; the toggle is "Toggle input picker" or "Toggle dial
 * picker"; the input's fields are named "Hour" and "Minute". Strings are
 * `labels`, English by default.
 *
 * Deviations, by name:
 * - **The dial is built on React Aria Components and pointer events**, not
 *   on the `react-aria` hooks (`useMove`, `usePress`, `useFocusRing`): the
 *   numbers are `ToggleButton`s, which bring press, keyboard and focus, and
 *   the drag is the dial's own pointer capture, so the kit adds no
 *   dependency.
 * - **The input's fields are spin buttons**, React Aria's segments, where
 *   Material's table says text input: they take digits and arrow keys.
 * - **Material's prose and figure disagree on the 24-hour rings** (odd
 *   numbers outside, or 00–11 outside); the figure is followed.
 *
 * Spec: https://m3.material.io/components/time-pickers/{overview,specs,guidelines,accessibility}
 */

export type TimePickerLabels = {
  selectTime: string;
  enterTime: string;
  hour: string;
  minute: string;
  period: string;
  am: string;
  pm: string;
  toInput: string;
  toDial: string;
  cancel: string;
  ok: string;
  dialHour: (hour: number, total: number) => string;
  dialMinute: (minute: number) => string;
};

const defaultLabels: TimePickerLabels = {
  selectTime: "Select time",
  enterTime: "Enter time",
  hour: "Hour",
  minute: "Minute",
  period: "AM or PM",
  am: "AM",
  pm: "PM",
  toInput: "Toggle input picker",
  toDial: "Toggle dial picker",
  cancel: "Cancel",
  ok: "OK",
  dialHour: (hour, total) => `Hour ${hour} of ${total}`,
  dialMinute: (minute) => `Minute ${minute} of 60`,
};

export type TimePickerProps = Pick<FieldVariantProps, "variant"> & {
  /** The trigger field's label. */
  label?: string;
  supportingText?: ReactNode;
  value?: Time | null;
  defaultValue?: Time | null;
  onChange?: (value: Time) => void;
  /** The time the picker opens on with no value. Default: now. */
  placeholderValue?: Time;
  /** 12 or 24 hours. Default: the locale's. */
  hourCycle?: 12 | 24;
  defaultMode?: "dial" | "input";
  orientation?: "vertical" | "horizontal";
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  isDisabled?: boolean;
  labels?: Partial<TimePickerLabels>;
  className?: string;
};

const styles = tv({
  slots: {
    selectors: "flex items-center",
    selector: [
      focusRing(),
      "group/tps relative flex h-20 w-24 cursor-default items-center justify-center overflow-hidden rounded-shape-small",
      "bg-surface-container-highest text-display-large font-display-large text-on-surface",
      "data-selected:bg-primary-container data-selected:text-on-primary-container",
    ],
    separator:
      "flex w-6 justify-center text-display-large font-display-large text-on-surface",
    stateLayer: [
      "pointer-events-none absolute inset-0 bg-current opacity-0 transition-opacity",
      "group-data-hovered/tps:state-opacity-hover group-data-focus-visible/tps:state-opacity-focus group-data-pressed/tps:state-opacity-pressed",
    ],
    period:
      "flex shrink-0 overflow-hidden rounded-shape-small border border-outline",
    periodItem: [
      "group/tps relative flex flex-1 cursor-default items-center justify-center text-title-medium font-title-medium text-on-surface-variant outline-none",
      "data-selected:bg-tertiary-container data-selected:text-on-tertiary-container",
      "outline-3 -outline-offset-3 outline-ring data-focus-visible:outline-solid",
    ],
    dial: "relative size-64 shrink-0 touch-none select-none rounded-shape-full bg-surface-container-highest",
    number: [
      "pointer-events-none absolute flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-shape-full text-body-large font-body-large text-on-surface outline-none",
      "outline-3 outline-offset-2 outline-ring data-focus-visible:outline-solid",
      "data-selected:text-on-primary",
    ],
    handle:
      "pointer-events-none absolute size-12 -translate-x-1/2 -translate-y-1/2 rounded-shape-full bg-primary",
    track:
      "pointer-events-none absolute left-1/2 top-1/2 h-0.5 origin-left bg-primary",
    center:
      "pointer-events-none absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-shape-full bg-primary",
    inputBox: [
      "flex h-18 w-24 items-center justify-center rounded-shape-small bg-surface-container-highest text-display-medium font-display-medium text-on-surface caret-transparent outline-none tabular-nums",
      // A segment holds only text, so its hover layer is a flat gradient
      // over its container rather than an element of its own.
      "data-hovered:bg-linear-to-r data-hovered:from-on-surface/(--md-sys-state-hover-state-layer-opacity) data-hovered:to-on-surface/(--md-sys-state-hover-state-layer-opacity)",
      "data-focused:bg-primary-container data-focused:text-on-primary-container data-focused:outline-2 data-focused:outline-solid data-focused:-outline-offset-2 data-focused:outline-primary",
      "data-placeholder:text-on-surface-variant",
    ],
    inputLabel:
      "pt-1.5 text-body-small font-body-small text-on-surface-variant",
  },
  variants: {
    orientation: {
      vertical: { period: "ml-3 h-20 w-13 flex-col" },
      horizontal: { period: "mt-3 h-9.5 w-54" },
    },
    wide: { true: { selector: "w-28.5" } },
  },
});

type Mode = "dial" | "input";
type Part = "hour" | "minute";

export function TimePicker(props: TimePickerProps) {
  const {
    label,
    supportingText,
    value,
    defaultValue,
    onChange,
    placeholderValue,
    hourCycle: hourCycleProp,
    defaultMode = "dial",
    orientation = "vertical",
    isOpen,
    defaultOpen,
    onOpenChange,
    isDisabled,
    labels: labelsProp,
    variant = "outlined",
    className,
  } = props;
  const labels = { ...defaultLabels, ...labelsProp };
  const { locale } = useLocale();
  const hourCycle = hourCycleProp ?? localeHourCycle(locale);
  const [valueState, setValueState] = useState<Time | null>(
    defaultValue ?? null,
  );
  const current = value !== undefined ? value : valueState;
  const [openState, setOpenState] = useState(defaultOpen ?? false);
  const open = isOpen ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const commit = (time: Time) => {
    setValueState(time);
    onChange?.(time);
    setOpen(false);
  };

  const s = fieldStyles({ variant, kind: "trigger" });
  const labelId = useId();
  const valueId = useId();
  const shown = current ? formatTime(locale, current, hourCycle) : "";

  return (
    <div
      data-slot="time-picker"
      data-variant={variant}
      data-open={open || undefined}
      data-disabled={isDisabled || undefined}
      className={s.base({ class: className })}
    >
      <DialogTrigger isOpen={open} onOpenChange={setOpen}>
        <AriaButton
          data-slot="time-picker-trigger"
          data-populated={current ? true : undefined}
          isDisabled={isDisabled}
          aria-labelledby={`${labelId} ${valueId}`}
          className={s.container()}
        >
          <span id={valueId} className={s.input()}>
            {shown}
          </span>
          {label && (
            <span id={labelId} data-slot="label" className={s.label()}>
              {label}
            </span>
          )}
          <ScheduleIcon size={24} className={s.trailingIcon()} />
          <span data-slot="state-layer" className={s.stateLayer()} />
          <span data-slot="active-indicator" className={s.indicator()} />
        </AriaButton>
        <Modal>
          <TimeDialog
            initial={current ?? placeholderValue ?? nowTime()}
            hourCycle={hourCycle}
            defaultMode={defaultMode}
            orientation={orientation}
            labels={labels}
            onCancel={() => setOpen(false)}
            onConfirm={commit}
          />
        </Modal>
      </DialogTrigger>
      {supportingText && (
        <div data-slot="supporting-text" className={s.supporting()}>
          {supportingText}
        </div>
      )}
    </div>
  );
}

function TimeDialog({
  initial,
  hourCycle,
  defaultMode,
  orientation,
  labels,
  onCancel,
  onConfirm,
}: {
  initial: Time;
  hourCycle: 12 | 24;
  defaultMode: Mode;
  orientation: "vertical" | "horizontal";
  labels: TimePickerLabels;
  onCancel: () => void;
  onConfirm: (time: Time) => void;
}) {
  const [draft, setDraft] = useState<Time>(initial);
  // The input mode's value, null while a field is emptied.
  const [typed, setTyped] = useState<Time | null>(initial);
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [part, setPart] = useState<Part>("hour");
  const dialRef = useRef<HTMLDivElement>(null);
  const p = pickerDialogStyles({ kind: "time" });
  const t = styles({ orientation, wide: hourCycle === 24 && orientation === "vertical" });
  const horizontal = orientation === "horizontal" && mode === "dial";
  const time = mode === "input" ? typed : draft;

  const switchMode = () => {
    if (mode === "dial") setTyped(draft);
    else if (typed) setDraft(typed);
    setMode(mode === "dial" ? "input" : "dial");
  };
  const setHour = (hour: number) => setDraft(draft.set({ hour }));
  const setMinute = (minute: number) => setDraft(draft.set({ minute }));
  // A number picked by keyboard unmounts with the hours: focus moves to
  // the minutes' dial before the next key, not to the page.
  const focusDial = useRef(false);
  const toMinutes = (focus: boolean) => {
    focusDial.current = focus;
    setPart("minute");
  };
  useLayoutEffect(() => {
    if (!focusDial.current) return;
    focusDial.current = false;
    const dial = dialRef.current;
    (
      dial?.querySelector<HTMLElement>('[aria-pressed="true"]') ??
      dial?.querySelector<HTMLElement>("button")
    )?.focus();
  }, [part]);

  const period = hourCycle === 12 && (
    <PeriodSelector
      className={t.period({
        class: mode === "input" ? "h-18" : undefined,
      })}
      itemClassName={t.periodItem({
        class: orientation === "vertical" || mode === "input" ? "border-t border-outline first:border-t-0" : "border-l border-outline first:border-l-0",
      })}
      stateLayerClassName={t.stateLayer()}
      orientation={horizontal ? "horizontal" : "vertical"}
      value={(time ?? draft).hour >= 12 ? "pm" : "am"}
      onChange={(next) => {
        const base = time ?? draft;
        const hour = (base.hour % 12) + (next === "pm" ? 12 : 0);
        if (mode === "input") setTyped(base.set({ hour }));
        else setDraft(base.set({ hour }));
      }}
      labels={labels}
    />
  );

  return (
    <Dialog
      data-slot="time-picker-dialog"
      aria-label={mode === "dial" ? labels.selectTime : labels.enterTime}
      className={p.container()}
    >
      <div className={p.header()}>
        <span className={p.supporting()}>
          {mode === "dial" ? labels.selectTime : labels.enterTime}
        </span>
      </div>
      {mode === "dial" ? (
        <div
          className={
            horizontal ? "flex items-center gap-13" : "flex flex-col items-center gap-9"
          }
        >
          <div className={horizontal ? "flex flex-col" : "flex items-center"}>
            <div className={t.selectors()}>
              <ToggleButton
                data-slot="time-picker-hour"
                aria-label={`${labels.hour} ${pad(displayHour(draft.hour, hourCycle))}`}
                isSelected={part === "hour"}
                onChange={() => setPart("hour")}
                className={t.selector()}
              >
                <span className={t.stateLayer()} />
                <span className="relative">
                  {pad(displayHour(draft.hour, hourCycle))}
                </span>
              </ToggleButton>
              <span aria-hidden="true" className={t.separator()}>
                :
              </span>
              <ToggleButton
                data-slot="time-picker-minute"
                aria-label={`${labels.minute} ${pad(draft.minute)}`}
                isSelected={part === "minute"}
                onChange={() => setPart("minute")}
                className={t.selector()}
              >
                <span className={t.stateLayer()} />
                <span className="relative">{pad(draft.minute)}</span>
              </ToggleButton>
            </div>
            {period}
          </div>
          <ClockDial
            ref={dialRef}
            part={part}
            time={draft}
            hourCycle={hourCycle}
            labels={labels}
            styles={t}
            onHour={setHour}
            onMinute={setMinute}
            onHourDone={toMinutes}
          />
        </div>
      ) : (
        <div className="flex items-start">
          <TimeField
            data-slot="time-picker-input"
            aria-label={labels.enterTime}
            value={typed}
            onChange={setTyped}
            hourCycle={hourCycle}
            shouldForceLeadingZeros
            autoFocus
          >
            <DateInput className="flex items-start">
              {(segment) =>
                segment.type === "hour" || segment.type === "minute" ? (
                  <span className="flex flex-col">
                    <DateSegment segment={segment} className={t.inputBox()} />
                    <span aria-hidden="true" className={t.inputLabel()}>
                      {segment.type === "hour" ? labels.hour : labels.minute}
                    </span>
                  </span>
                ) : segment.type === "literal" && segment.text.includes(":") ? (
                  <DateSegment
                    segment={segment}
                    className={t.separator({ class: "h-18 items-center" })}
                  />
                ) : (
                  // The period is the radio group's; the rest is spacing.
                  <DateSegment segment={segment} className="hidden" />
                )
              }
            </DateInput>
          </TimeField>
          {period}
        </div>
      )}
      <div className={p.actions()}>
        <IconButton
          variant="standard"
          icon={mode === "dial" ? KeyboardIcon : ScheduleIcon}
          aria-label={mode === "dial" ? labels.toInput : labels.toDial}
          onPress={switchMode}
          className={p.modeToggle()}
        />
        <Button variant="text" onPress={onCancel}>
          {labels.cancel}
        </Button>
        <Button
          variant="text"
          onPress={() => {
            if (time) onConfirm(time);
          }}
        >
          {labels.ok}
        </Button>
      </div>
    </Dialog>
  );
}

function PeriodSelector({
  className,
  itemClassName,
  stateLayerClassName,
  orientation,
  value,
  onChange,
  labels,
}: {
  className: string;
  itemClassName: string;
  stateLayerClassName: string;
  orientation: "vertical" | "horizontal";
  value: "am" | "pm";
  onChange: (value: "am" | "pm") => void;
  labels: TimePickerLabels;
}) {
  return (
    <RadioGroup
      data-slot="time-picker-period"
      aria-label={labels.period}
      orientation={orientation}
      value={value}
      onChange={(next) => onChange(next as "am" | "pm")}
      className={className}
    >
      {(["am", "pm"] as const).map((id) => (
        <Radio key={id} value={id} className={itemClassName}>
          <span className={stateLayerClassName} />
          <span className="relative">{id === "am" ? labels.am : labels.pm}</span>
        </Radio>
      ))}
    </RadioGroup>
  );
}

/* ---- the dial ----------------------------------------------------------- */

/** Material's dial: 256dp, its labels on a 101dp ring, the 24-hour inner
    ring at 69dp. */
const DIAL = 256;
const OUTER = 101;
const INNER = 69;

function ClockDial({
  ref,
  part,
  time,
  hourCycle,
  labels,
  styles: t,
  onHour,
  onMinute,
  onHourDone,
}: {
  ref: Ref<HTMLDivElement>;
  part: Part;
  time: Time;
  hourCycle: 12 | 24;
  labels: TimePickerLabels;
  styles: ReturnType<typeof styles>;
  onHour: (hour: number) => void;
  onMinute: (minute: number) => void;
  onHourDone: (focus: boolean) => void;
}) {
  const dragging = useRef(false);
  const pm = time.hour >= 12;

  // Each label: its value, the text drawn, its ring and its twelfth.
  const marks =
    part === "minute"
      ? Array.from({ length: 12 }, (_, i) => ({
          value: i * 5,
          text: pad(i * 5),
          radius: OUTER,
          step: i,
          name: labels.dialMinute(i * 5),
        }))
      : hourCycle === 12
        ? Array.from({ length: 12 }, (_, i) => {
            const shown = i === 0 ? 12 : i;
            return {
              value: (i % 12) + (pm ? 12 : 0),
              text: String(shown),
              radius: OUTER,
              step: i,
              name: labels.dialHour(shown, 12),
            };
          })
        : Array.from({ length: 24 }, (_, i) => ({
            value: i,
            text: i === 0 ? "00" : String(i),
            radius: i < 12 ? OUTER : INNER,
            step: i % 12,
            name: labels.dialHour(i, 24),
          }));

  const selected = part === "minute" ? time.minute : time.hour;
  const angle =
    part === "minute" ? (time.minute / 60) * 360 : ((time.hour % 12) / 12) * 360;
  const handleRadius =
    part === "hour" && hourCycle === 24 && time.hour >= 12 ? INNER : OUTER;
  const at = (deg: number, r: number) => ({
    left: DIAL / 2 + r * Math.sin((deg * Math.PI) / 180),
    top: DIAL / 2 - r * Math.cos((deg * Math.PI) / 180),
  });
  const handle = at(angle, handleRadius);

  /** The value under the pointer: the nearest minute, or the nearest hour
      on the ring nearest the pointer. */
  const valueAt = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = DIAL / rect.width;
    const x = (e.clientX - rect.left - rect.width / 2) * scale;
    const y = (e.clientY - rect.top - rect.height / 2) * scale;
    const deg = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
    if (part === "minute") return Math.round(deg / 6) % 60;
    const twelfth = Math.round(deg / 30) % 12;
    if (hourCycle === 24)
      return Math.hypot(x, y) < (OUTER + INNER) / 2 ? twelfth + 12 : twelfth;
    return twelfth + (pm ? 12 : 0);
  };
  const pick = (value: number) =>
    part === "minute" ? onMinute(value) : onHour(value);

  return (
    <div
      ref={ref}
      data-slot="time-picker-dial"
      className={t.dial()}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        pick(valueAt(e));
      }}
      onPointerMove={(e) => {
        if (dragging.current) pick(valueAt(e));
      }}
      onPointerUp={() => {
        if (!dragging.current) return;
        dragging.current = false;
        if (part === "hour") onHourDone(false);
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <span className={t.center()} />
      <span
        className={t.track()}
        style={{
          width: handleRadius,
          transform: `rotate(${angle - 90}deg)`,
        }}
      />
      <span className={t.handle()} style={handle} />
      {marks.map((mark) => (
        <ToggleButton
          key={`${part}-${mark.value}`}
          data-slot="time-picker-dial-number"
          aria-label={mark.name}
          isSelected={mark.value === selected}
          onChange={() => {
            pick(mark.value);
            if (part === "hour") onHourDone(true);
          }}
          className={t.number()}
          style={at(mark.step * 30, mark.radius)}
        >
          {mark.text}
        </ToggleButton>
      ))}
    </div>
  );
}

/* ---- helpers ------------------------------------------------------------ */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function displayHour(hour: number, hourCycle: 12 | 24) {
  if (hourCycle === 24) return hour;
  return hour % 12 === 0 ? 12 : hour % 12;
}

function nowTime() {
  const now = new Date();
  return new Time(now.getHours(), now.getMinutes());
}

function localeHourCycle(locale: string): 12 | 24 {
  const cycle = new Intl.DateTimeFormat(locale, { hour: "numeric" })
    .resolvedOptions().hourCycle;
  return cycle === "h11" || cycle === "h12" ? 12 : 24;
}

function formatTime(locale: string, time: Time, hourCycle: 12 | 24) {
  return new DateFormatter(locale, {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: hourCycle === 12 ? "h12" : "h23",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, time.hour, time.minute)));
}

export default TimePicker;
