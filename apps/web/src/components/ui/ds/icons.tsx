import React from "react";

/**
 * The kit takes icons structurally, not from a specific icon library. Any
 * component accepting `size` and `className` fits — every `lucide-react`,
 * `react-feather` or hand-written SVG component already does — so consumers
 * pass their own set and the kit ships no icon dependency.
 */
export type IconComponent = React.ComponentType<{
  size?: number;
  className?: string;
}>;

/** An icon slot: either an already-rendered node or a component to render. */
export type IconProp = React.ReactNode | IconComponent;

/** Render an `IconProp` at the given size, whichever form it arrived in. */
export function renderIcon(
  icon: IconProp,
  size = 24,
  className?: string,
): React.ReactNode {
  if (icon === null || icon === undefined || icon === false) return null;
  if (React.isValidElement(icon)) return icon;
  if (isIconComponent(icon)) {
    const Icon = icon;
    return <Icon size={size} className={className} />;
  }
  return icon as React.ReactNode;
}

/** Function components, plus the `forwardRef` / `memo` exotic components
    that libraries like lucide-react export (objects carrying `$$typeof`,
    not functions). A React *element* also has `$$typeof`; callers check
    `isValidElement` first. */
function isIconComponent(icon: unknown): icon is IconComponent {
  if (typeof icon === "function") return true;
  return (
    typeof icon === "object" &&
    icon !== null &&
    "$$typeof" in icon &&
    !React.isValidElement(icon)
  );
}

type SvgProps = { size?: number; className?: string };

function Svg({
  size = 24,
  className,
  children,
}: SvgProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* The handful of glyphs the components need for their own affordances —
   a chip's remove button, a filter chip's check, a button's loading spinner.
   Kept minimal and overridable rather than pulling in an icon package. */

export function CheckIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

/** MD3 "error" glyph: circle with an exclamation mark. */
export function ErrorIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </Svg>
  );
}

export function MinusIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
    </Svg>
  );
}

export function PlusIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </Svg>
  );
}

export function XIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  );
}

/** The search bar's leading glyph: a magnifier. */
export function SearchIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </Svg>
  );
}

/** Back: an arrow pointing to the leading edge. Mirror it in a
    right-to-left page (`rtl:-scale-x-100`). */
export function ArrowBackIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </Svg>
  );
}

export function UserIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Svg>
  );
}

/** Globe: the phone field's "international" (no country) state. */
export function GlobeIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Svg>
  );
}

/** Picture frame: the image field's empty state. */
export function ImageIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </Svg>
  );
}

/** Upload arrow: the image field's choose / replace buttons. */
export function UploadIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v12" />
      <path d="m17 8-5-5-5 5" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    </Svg>
  );
}

export function ChevronDownIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function ChevronUpIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <path d="m18 15-6-6-6 6" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <path d="m15 18-6-6 6-6" />
    </Svg>
  );
}

export function ChevronRightIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

/** Calendar: a date field's picker button, and the date pickers' way back
    from input to the calendar. */
export function CalendarIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </Svg>
  );
}

/** Pencil: the modal date picker's switch to date input. */
export function EditIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  );
}

/** Clock: the time picker's switch to the dial, and its field's button. */
export function ScheduleIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Svg>
  );
}

/** Keyboard: the time picker's switch to time input. */
export function KeyboardIcon(props: SvgProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M10 13h4M7 16h10" />
    </Svg>
  );
}

export function SpinnerIcon({ size = 24, className }: SvgProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
