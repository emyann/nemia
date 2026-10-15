"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  Button,
  Disclosure as AriaDisclosure,
  DisclosureGroup as AriaDisclosureGroup,
  DisclosurePanel as AriaDisclosurePanel,
  Heading,
  type DisclosureGroupProps as AriaDisclosureGroupProps,
  type DisclosurePanelProps as AriaDisclosurePanelProps,
  type DisclosureProps as AriaDisclosureProps,
} from "react-aria-components";

import { ChevronDownIcon, renderIcon, type IconProp } from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { focusRing, tv } from "../utils";


/* -------------------------------------------------------------------------
   Styles
   ---------------------------------------------------------------------- */

const styles = tv({
  slots: {
    group: "w-full",
    base: "group/disclosure w-full",
    header: "m-0",
    trigger: [
      "group/disclosure-trigger relative isolate flex w-full items-center gap-4",
      "min-h-14 px-4 py-2 text-start",
      "cursor-pointer outline-none disabled:cursor-default",
    ],
    stateLayer:
      "pointer-events-none absolute inset-0 -z-10 bg-on-surface opacity-0 transition-opacity duration-short-4 group-hover/disclosure-trigger:state-opacity-hover group-data-focus-visible/disclosure-trigger:state-opacity-focus group-data-pressed/disclosure-trigger:state-opacity-pressed group-disabled/disclosure-trigger:opacity-0",
    leadingIcon:
      "size-6 shrink-0 text-on-surface-variant group-disabled/disclosure-trigger:text-on-surface/38",
    label:
      "min-w-0 flex-1 text-title-medium font-title-medium text-on-surface group-disabled/disclosure-trigger:text-on-surface/38",
    indicator: [
      "size-6 shrink-0 text-on-surface-variant",
      "transition-transform duration-medium-1 ease-standard",
      "group-data-expanded/disclosure:rotate-180",
      "group-disabled/disclosure-trigger:text-on-surface/38",
    ],
    panel:
      "h-(--disclosure-panel-height) overflow-hidden motion-safe:transition-[height] motion-safe:duration-medium-2 motion-safe:ease-standard",
    panelContent: "px-4 pt-1 pb-4 text-body-medium font-body-medium text-on-surface-variant",
  },
  variants: {
    variant: {
      // Rows on the surface they sit on, separated by hairlines — the list
      // reading, and what a group of related questions wants.
      plain: {
        group: "divide-y divide-outline-variant",
        trigger: "rounded-shape-extra-small",
      },
      // Each section in its own box — the card reading, for sections that are
      // not a single list.
      outlined: {
        group: "flex flex-col gap-2",
        base: "rounded-shape-medium border border-outline-variant overflow-hidden",
        trigger: "rounded-none",
      },
    },
  },
  defaultVariants: { variant: "plain" },
});

type DisclosureVariant = "plain" | "outlined";

/** A `DisclosureGroup` styles the rows inside it, so every `Disclosure` in a
    group reads its variant from here instead of being told twice. */
const VariantContext = createContext<DisclosureVariant>("plain");

/* -------------------------------------------------------------------------
   DisclosureGroup — the accordion
   ---------------------------------------------------------------------- */

export type DisclosureGroupProps = AriaDisclosureGroupProps & {
  /** `plain` (default) separates rows with hairlines; `outlined` boxes each. */
  variant?: DisclosureVariant;
  children: ReactNode;
};

export function DisclosureGroup({
  variant = "plain",
  className,
  children,
  ...props
}: DisclosureGroupProps) {
  const s = styles({ variant });

  return (
    <VariantContext.Provider value={variant}>
      <AriaDisclosureGroup
        data-slot="disclosure-group"
        data-variant={variant}
        {...props}
        className={composeTailwindRenderProps(className, s.group())}
      >
        {children}
      </AriaDisclosureGroup>
    </VariantContext.Provider>
  );
}

/* -------------------------------------------------------------------------
   Disclosure — one expandable section
   ---------------------------------------------------------------------- */

export type DisclosureProps = AriaDisclosureProps & {
  /** Overrides the variant a surrounding `DisclosureGroup` set. */
  variant?: DisclosureVariant;
  children: ReactNode;
};

/**
 * An expand/collapse section, and a group of them — what other systems call a
 * collapsible and an accordion. Behaviour is React Aria's `Disclosure` /
 * `DisclosureGroup`, so the trigger carries `aria-expanded` and
 * `aria-controls`, the panel is labelled by its trigger, Enter and Space
 * toggle it, and focus stays on the trigger.
 *
 *   <Disclosure>
 *     <DisclosureHeader>System requirements</DisclosureHeader>
 *     <DisclosurePanel>Details…</DisclosurePanel>
 *   </Disclosure>
 *
 *   <DisclosureGroup allowsMultipleExpanded defaultExpandedKeys={["a"]}>
 *     <Disclosure id="a"> … </Disclosure>
 *     <Disclosure id="b"> … </Disclosure>
 *   </DisclosureGroup>
 *
 * **Material 3 does not describe this component.** It has no page for it, so
 * there is no spec to cite.
 * M2 had an "expansion panel"; M3 dropped it and never replaced it, and
 * m3.material.io has no accordion, disclosure or expansion-panel entry —
 * `npm run md3 -- page …` will not find one. The anatomy here is therefore
 * assembled from MD3 parts rather than copied from a page, the same way
 * `Table` follows M2's data-table measurements on M3 roles:
 *
 * - the trigger is a **list row**: 56dp minimum height, 16dp side padding,
 *   `title-medium` label, `on-surface-variant` trailing icon
 *   (`https://m3.material.io/components/lists/specs`);
 * - it carries the standard **state layer** — `on-surface` at the
 *   `state-opacity-*` values — and the kit's `focusRing`, like every other
 *   pressable (`conventions.md`, "Interaction states");
 * - **`outline-variant` hairlines** separate the rows of a `plain` group, and
 *   box each row of an `outlined` one at `rounded-shape-medium`, which is the
 *   divider role and the card shape rather than anything invented here;
 * - the chevron turns 180° over `duration-medium-1` on `ease-standard`, and
 *   the panel's height transition runs `duration-medium-2` — MD3 motion
 *   tokens, no animation library.
 *
 * Deviations worth knowing: there is no MD3 "expanded" elevation change (the
 * spec has no opinion, and raising a row on expand fights the flat list it
 * lives in), and the panel animates height only where the reader allows
 * motion — React Aria measures the panel and publishes
 * `--disclosure-panel-height`, which is what the transition reads, and the
 * whole transition is behind `motion-safe:`.
 */
export function Disclosure({
  variant,
  className,
  children,
  ...props
}: DisclosureProps) {
  const inherited = useContext(VariantContext);
  const resolved = variant ?? inherited;
  const s = styles({ variant: resolved });

  return (
    <VariantContext.Provider value={resolved}>
      <AriaDisclosure
        data-slot="disclosure"
        data-variant={resolved}
        {...props}
        className={composeTailwindRenderProps(className, s.base())}
      >
        {children}
      </AriaDisclosure>
    </VariantContext.Provider>
  );
}

/* -------------------------------------------------------------------------
   Trigger and header
   ---------------------------------------------------------------------- */

export type DisclosureTriggerProps = {
  children: ReactNode;
  /** Leading icon, before the label. */
  icon?: IconProp;
  /** The turning chevron. Off when the trigger draws its own affordance. */
  showIndicator?: boolean;
  /** Rendered after the label and before the chevron — a count, a `Tag`.
      Keep it non-interactive: this is the inside of a `<button>`. */
  trailing?: ReactNode;
  className?: string;
};

/**
 * The pressable row. Use it directly when the header is not a heading — a
 * dashboard card's own title bar, say; otherwise prefer `DisclosureHeader`,
 * which wraps this in a `<Heading>` as the ARIA disclosure pattern asks.
 *
 * Its children end up inside a `<button>`, so they must not be interactive.
 */
export function DisclosureTrigger({
  children,
  icon,
  showIndicator = true,
  trailing,
  className,
}: DisclosureTriggerProps) {
  const s = styles({ variant: useContext(VariantContext) });

  return (
    <Button
      slot="trigger"
      data-slot="disclosure-trigger"
      className={focusRing({ className: s.trigger({ className }) })}
    >
      <span data-slot="state-layer" className={s.stateLayer()} />
      {icon ? renderIcon(icon, 24, s.leadingIcon()) : null}
      <span className={s.label()}>{children}</span>
      {trailing}
      {showIndicator ? <ChevronDownIcon className={s.indicator()} /> : null}
    </Button>
  );
}

export type DisclosureHeaderProps = DisclosureTriggerProps & {
  /** Heading level for the row, so the page's outline stays sane. Default 3. */
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Class for the `<Heading>`; `className` still styles the trigger. */
  headerClassName?: string;
};

/** A `<Heading>` whose only child is the trigger — the ARIA disclosure shape. */
export function DisclosureHeader({
  level = 3,
  headerClassName,
  ...props
}: DisclosureHeaderProps) {
  const s = styles();

  return (
    <Heading
      level={level}
      data-slot="disclosure-header"
      className={s.header({ className: headerClassName })}
    >
      <DisclosureTrigger {...props} />
    </Heading>
  );
}

/* -------------------------------------------------------------------------
   Panel
   ---------------------------------------------------------------------- */

export type DisclosurePanelProps = AriaDisclosurePanelProps & {
  /** Drop the panel's own 16dp padding when the content brings its own. */
  isUnstyled?: boolean;
  contentClassName?: string;
};

export function DisclosurePanel({
  isUnstyled = false,
  className,
  contentClassName,
  children,
  ...props
}: DisclosurePanelProps) {
  const s = styles({ variant: useContext(VariantContext) });

  return (
    <AriaDisclosurePanel
      data-slot="disclosure-panel"
      {...props}
      className={composeTailwindRenderProps(className, s.panel())}
    >
      <div
        data-slot="disclosure-panel-content"
        className={
          isUnstyled ? contentClassName : s.panelContent({ className: contentClassName })
        }
      >
        {children}
      </div>
    </AriaDisclosurePanel>
  );
}

export default Disclosure;
