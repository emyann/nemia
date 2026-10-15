"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  composeRenderProps,
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  type TabListProps as AriaTabListProps,
  type TabPanelProps as AriaTabPanelProps,
  type TabProps as AriaTabProps,
  type TabsProps as AriaTabsProps,
} from "react-aria-components";

import { Badge, badgeAccessibleText, type BadgeValue } from "./Badge";
import { renderIcon, type IconProp } from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { cn, focusRing, tv } from "../utils";
import { Title } from "../primitives/Typography";


const styles = tv({
  slots: {
    base: "flex flex-col",
    list: [
      "relative flex w-full items-stretch",
      // The 1dp divider under the row (`…navigation-tab.divider.*`), drawn on
      // the list so it runs the full width whether tabs fill it or scroll.
      "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-surface-variant",
    ],
    tab: [
      "group/tab relative isolate flex cursor-pointer items-stretch justify-center",
      "min-h-12 px-4 outline-none",
      "disabled:cursor-default",
    ],
    stateLayer:
      "pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-short-4 group-hover/tab:state-opacity-hover group-data-focus-visible/tab:state-opacity-focus group-data-pressed/tab:state-opacity-pressed group-disabled/tab:opacity-0",
    // Label and indicator share a grid so the primary indicator can be exactly
    // as wide as the content above it.
    content: "grid grid-rows-[1fr_auto] justify-items-center",
    labelRow: "row-start-1 flex items-center gap-2 self-center py-2",
    // The icon's box, which a badge on a stacked icon is anchored on.
    iconBox: "relative flex shrink-0",
    icon: "size-6 shrink-0",
    label: "whitespace-nowrap",
    indicator: "row-start-2 opacity-0 transition-opacity duration-short-4",
    panel: "outline-none py-4",
  },
  variants: {
    variant: {
      primary: {
        indicator: "h-[3px] w-full min-w-6 rounded-t-[3px] bg-primary",
      },
      secondary: {
        // Full-tab width and square, so it is positioned against the tab
        // rather than the label.
        indicator: "absolute inset-x-0 bottom-0 h-0.5 bg-primary",
      },
    },
    isSelected: { true: {}, false: {} },
    isDisabled: {
      true: {
        label: "text-on-surface/38",
        icon: "text-on-surface/38",
      },
    },
    hasStackedIcon: {
      true: {
        // `…with-icon-and-label-text.container.height`
        tab: "min-h-16",
        labelRow: "flex-col gap-1",
      },
    },
  },
  compoundVariants: [
    {
      variant: "primary",
      isSelected: true,
      class: {
        label: "text-primary",
        icon: "text-primary",
        indicator: "opacity-100",
        stateLayer: "bg-primary",
      },
    },
    {
      variant: "primary",
      isSelected: false,
      class: {
        label: "text-on-surface-variant",
        icon: "text-on-surface-variant",
        // `…inactive.pressed.state-layer.color` is `primary`, unlike hover and
        // focus, which are `on-surface`.
        stateLayer: "bg-on-surface group-data-pressed/tab:bg-primary",
      },
    },
    {
      variant: "secondary",
      isSelected: true,
      class: {
        label: "text-on-surface",
        icon: "text-on-surface",
        indicator: "opacity-100",
        stateLayer: "bg-on-surface",
      },
    },
    {
      variant: "secondary",
      isSelected: false,
      class: {
        label: "text-on-surface-variant",
        icon: "text-on-surface-variant",
        stateLayer: "bg-on-surface",
      },
    },
  ],
  defaultVariants: { variant: "primary", isSelected: false },
});

type TabsVariant = "primary" | "secondary";

/** Set once on `Tabs`; every `Tab` reads it rather than being told again. */
const VariantContext = createContext<TabsVariant>("primary");
/** `TabList` tells its tabs whether they share the width or size to content. */
const ScrollableContext = createContext(false);

/* ---------------------------------------------------------------------- */

export type TabsProps = AriaTabsProps & {
  /** `primary` is the only set on a screen; `secondary` is the level below
      one, and the spec asks for it to sit under the primary row. */
  variant?: TabsVariant;
  children: ReactNode;
};

/**
 * Material tabs — one row of destinations over the region they control.
 *
 *   <Tabs>
 *     <TabList aria-label="Time range">
 *       <Tab id="day">Today</Tab>
 *       <Tab id="week">This week</Tab>
 *     </TabList>
 *     <TabPanel id="day">…</TabPanel>
 *     <TabPanel id="week">…</TabPanel>
 *   </Tabs>
 *
 * Spec: https://m3.material.io/components/tabs/overview · .../specs ·
 * .../guidelines · .../accessibility
 *
 * **`primary` vs `secondary` is the spec's own split**, not a look: primary
 * tabs are the only set on a screen; secondary tabs are the second level,
 * always placed *below* a primary set, with a quieter indicator and the same
 * function. The measurements are the spec's — 48dp rows (64dp once a tab
 * stacks an icon over its label), a 24dp icon, a 1dp `surface-variant` divider
 * under the row, and an active indicator 3dp tall with rounded top corners and
 * a 24dp minimum length for primary, 2dp and square for secondary
 * (`md.comp.{primary,secondary}-navigation-tab.*`). Colours follow the tokens:
 * a primary set paints its active label, icon and indicator `primary` and its
 * inactive ones `on-surface-variant`; a secondary set paints the active label
 * `on-surface` and keeps the indicator `primary`.
 *
 * The primary indicator hugs its label rather than spanning the tab — that is
 * what "inset on each side, minimum length 24dp" means — so the label and the
 * indicator share a two-row grid inside the tab, and the indicator is the
 * width of the row above it. The secondary indicator spans the whole tab.
 *
 * Behaviour is React Aria's `Tabs`, which is what the accessibility page asks
 * for: arrows move between tabs, the selected tab is the only one in the tab
 * order, and each panel is labelled by its tab. Every tab is at least 48dp
 * tall, so nothing here goes under the 48×48 touch target the spec's
 * "avoid applying density" note protects.
 *
 * **Badges.** `badge` draws the kit's `Badge`: on the icon of a tab whose
 * icon is stacked over its label, and after the label, at the tab's trailing
 * edge, where the label follows the icon on one line or there is no icon (the
 * badge guidelines: a large badge must not overlap what follows the icon).
 * It is read after the tab's name ("Inbox, 3").
 *
 * Deviations: **no swipe** between panels (a pointer gesture the kit does not
 * own, and the spec itself warns it collides with other swipeable content).
 * Vertical orientation is React
 * Aria's, not Material's: the spec has horizontal tabs only, so a vertical set
 * gets the behaviour but keeps the horizontal anatomy.
 */
export function Tabs({
  variant = "primary",
  className,
  children,
  ...props
}: TabsProps) {
  const s = styles({ variant });

  return (
    <VariantContext.Provider value={variant}>
      <AriaTabs
        data-slot="tabs"
        data-variant={variant}
        {...props}
        className={composeTailwindRenderProps(className, s.base())}
      >
        {children}
      </AriaTabs>
    </VariantContext.Provider>
  );
}

export type TabListProps<T extends object> = AriaTabListProps<T> & {
  /**
   * Size tabs to their labels and scroll the row instead of dividing the
   * width equally. The spec's answer for a set that cannot fit — and for the
   * longer labels and larger counts that come with it.
   */
  isScrollable?: boolean;
};

export function TabList<T extends object>({
  isScrollable = false,
  className,
  ...props
}: TabListProps<T>) {
  const s = styles({ variant: useContext(VariantContext) });

  return (
    <ScrollableContext.Provider value={isScrollable}>
      <AriaTabList
        data-slot="tab-list"
        data-scrollable={isScrollable || undefined}
        {...props}
        className={composeTailwindRenderProps(
          className,
          s.list({
            className: isScrollable
              ? "overflow-x-auto"
              : // Fixed tabs divide the row into equal sections.
                "",
          }),
        )}
      />
    </ScrollableContext.Provider>
  );
}

export type TabProps = AriaTabProps & {
  /** Leading icon. Stacked above the label by default — the spec's 64dp row. */
  icon?: IconProp;
  /** `start` puts the icon inline with the label, 8dp before it, at 48dp. */
  iconPosition?: "top" | "start";
  /**
   * A badge: a count, a short status, or `true` for the small dot. On a
   * stacked icon it sits on the icon; otherwise after the label.
   */
  badge?: BadgeValue;
  /** What the badge says to a screen reader, when the count alone is not
      enough ("3 unread"). */
  badgeLabel?: string;
  children?: ReactNode;
};

export function Tab({
  icon,
  iconPosition = "top",
  badge,
  badgeLabel,
  className,
  children,
  ...props
}: TabProps) {
  const variant = useContext(VariantContext);
  const isScrollable = useContext(ScrollableContext);
  const hasStackedIcon = Boolean(icon) && iconPosition === "top";
  const badgeText = badgeAccessibleText(badge, badgeLabel);
  // The badge's words after the tab's name: on `aria-label` when the label is
  // plain text, else in a visually hidden span after it.
  const badgeName =
    badgeText !== undefined && typeof children === "string"
      ? `${children}, ${badgeText}`
      : undefined;

  const slotsFor = (isSelected: boolean, isDisabled: boolean) =>
    styles({ variant, isSelected, isDisabled, hasStackedIcon });

  return (
    <AriaTab
      data-slot="tab"
      aria-label={badgeName}
      {...props}
      className={composeRenderProps(className, (caller, renderProps) =>
        cn(
          focusRing({
            className: slotsFor(
              renderProps.isSelected,
              renderProps.isDisabled,
            ).tab({
              // Fixed tabs divide the row into equal sections; scrollable ones
              // size to their labels.
              className: isScrollable ? "shrink-0" : "flex-1",
            }),
          }),
          caller,
        ),
      )}
    >
      {({ isSelected, isDisabled }) => {
        const s = slotsFor(isSelected, isDisabled);

        return (
          <>
            <span data-slot="state-layer" className={s.stateLayer()} />
            <span className={s.content()}>
              <span className={s.labelRow()}>
                {icon ? (
                  <span className={s.iconBox()}>
                    {renderIcon(icon, 24, s.icon())}
                    {hasStackedIcon && badge !== undefined ? (
                      <Badge value={badge} anchored />
                    ) : null}
                  </span>
                ) : null}
                <Title size="small" component="span" className={s.label()}>
                  {children}
                  {badgeText !== undefined && badgeName === undefined ? (
                    <span className="sr-only">{`, ${badgeText}`}</span>
                  ) : null}
                </Title>
                {!hasStackedIcon && badge !== undefined ? (
                  <Badge value={badge} />
                ) : null}
              </span>
              <span data-slot="tab-indicator" className={s.indicator()} />
            </span>
          </>
        );
      }}
    </AriaTab>
  );
}

export type TabPanelProps = AriaTabPanelProps;

export function TabPanel({ className, ...props }: TabPanelProps) {
  const s = styles({ variant: useContext(VariantContext) });

  return (
    <AriaTabPanel
      data-slot="tab-panel"
      {...props}
      className={composeTailwindRenderProps(className, s.panel())}
    />
  );
}

export default Tabs;
