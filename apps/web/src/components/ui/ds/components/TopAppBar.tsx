import { type ElementType, type HTMLAttributes, type ReactNode } from "react";

import { Headline, Label, Title } from "../primitives/Typography";
import { tv, type VariantProps } from "../utils";

const styles = tv({
  slots: {
    // `md.comp.app-bar.*.container.color` = surface, elevation 0, square.
    base: "bg-surface text-on-surface flex w-full flex-col justify-center",
    // The row that carries the leading action and the trailing actions. Always
    // 64dp — the small bar's whole height, and the top band of the taller ones.
    row: "flex h-16 shrink-0 items-center gap-1 px-1",
    leading: "flex shrink-0 items-center",
    // Holds the title on the single-row types.
    inlineTitle: "min-w-0 flex-1 px-3",
    actions: "flex shrink-0 items-center gap-1",
    // The title block of the two-row types, bottom-aligned with 16dp padding.
    stackedTitle: "flex flex-col justify-end px-4 pb-6",
    // The search app bar's search (`md.comp.app-bar.search.{leading,trailing}
    // -space`, `…container.color`, `…label.color`).
    search: [
      "flex min-w-0 flex-1 items-center px-2",
      "[&_[data-slot=search-bar]]:bg-surface-container [&_[data-slot=search-bar]]:shadow-none",
      "[&_[data-slot=search-view]]:bg-surface-container [&_[data-slot=search-view]]:shadow-none",
    ],
    title: "truncate",
    subtitle: "text-on-surface-variant truncate",
  },
  variants: {
    variant: {
      small: { base: "h-16" },
      // Both sides get the same minimum so a leading icon and a trailing one
      // balance and the title lands in the middle. With an uneven number of
      // actions it is centred in what is left, which is the honest fallback —
      // the spec's own configuration is one icon each side.
      "center-aligned": {
        base: "h-16",
        inlineTitle: "px-0 text-center",
        leading: "min-w-12 justify-start",
        actions: "min-w-12 justify-end",
      },
      // `md.comp.app-bar.medium.container.height`
      medium: { base: "h-28" },
      // `md.comp.app-bar.large.container.height`
      large: { base: "h-38" },
    },
  },
  defaultVariants: { variant: "small" },
});

/** Which type-scale role the title takes, per `…title.font`. */
const TITLE_SIZE = {
  small: { component: Title, size: "large" },
  "center-aligned": { component: Title, size: "large" },
  medium: { component: Headline, size: "small" },
  large: { component: Headline, size: "medium" },
} as const;

/** `…subtitle.font`, which differs per size the way the title does. */
const SUBTITLE_SIZE = {
  small: { component: Label, size: "medium" },
  "center-aligned": { component: Label, size: "medium" },
  medium: { component: Label, size: "large" },
  large: { component: Title, size: "medium" },
} as const;

export type TopAppBarProps = VariantProps<typeof styles> &
  Omit<HTMLAttributes<HTMLElement>, "title"> & {
    title: ReactNode;
    /** A second line under the title, at the spec's per-size type role. */
    subtitle?: ReactNode;
    /** The navigation action — a menu or back `IconButton`. */
    leading?: ReactNode;
    /** Trailing actions for this screen. Three at most, says the spec. A
        `Toolbar` here makes them one toolbar. */
    actions?: ReactNode;
    /** The search app bar: a `SearchView` or `SearchBar` in the title's
        place. The title stays, as a visually hidden heading. */
    search?: ReactNode;
    /** Heading level for the title. Default 1. */
    headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
    className?: string;
  };

/**
 * The top app bar — a leading navigation action, the screen's title, and the
 * actions that belong to that screen.
 *
 *   <TopAppBar
 *     title="Tables & QR"
 *     leading={
 *       <IconButton variant="standard" icon={MenuIcon} aria-label="Open navigation" />
 *     }
 *     actions={
 *       <IconButton variant="standard" icon={SearchIcon} aria-label="Search tables" />
 *     }
 *   />
 *
 * Spec: https://m3.material.io/components/app-bars/overview · .../specs ·
 * .../guidelines · .../accessibility
 *
 * Four types, all four the spec's baseline set:
 *
 * | `variant` | height | title | title type |
 * | --- | --- | --- | --- |
 * | `small` (default) | 64dp | leading-aligned, on the action row | `title-large` |
 * | `center-aligned` | 64dp | centred, on the action row | `title-large` |
 * | `medium` | 112dp | leading-aligned, on its own row below | `headline-small` |
 * | `large` | 152dp | leading-aligned, on its own row below | `headline-medium` |
 *
 * (`md.comp.app-bar.{small,medium,large}.container.height`,
 * `…{small,medium,large}.title.font`.) The container is `surface` at
 * elevation 0 with square corners, the leading and trailing icons are 24dp and
 * `on-surface-variant`, and the optional `subtitle` takes the spec's per-size
 * type — `label-medium`, `label-large`, `title-medium`.
 *
 * **The title is a real heading.** `headingLevel` (default 1, since an app
 * bar's title is usually the page's own) renders it as `h1`…`h6`, so a screen
 * reader's heading list has the screen's name in it rather than a styled div.
 *
 * **The bar is a `<header>`, so at document level it is the page's `banner`
 * landmark** — and a page may have only one. That matches the spec, which puts
 * one top app bar on a screen. A second bar belonging to a pane rather than
 * the page goes inside a `<section>`, `<main>` or `<article>`, which takes its
 * header out of the banner role; `aria-label` passes through for the rest.
 *
 * Presentational and server-safe: no React Aria, no `"use client"`. The
 * `leading` and `actions` slots take the interactive parts — pass
 * `IconButton`s, which bring their own client boundary. A screen that wants
 * its actions as Material's toolbar, with the arrow keys between them,
 * passes a `Toolbar` into `actions`; the bar does not make one itself.
 *
 * **The search app bar.** `search` puts a search where the title was, 8dp
 * from the leading and trailing elements (`md.comp.app-bar.search.*`): pass
 * the kit's `SearchView` (or `SearchBar`). The bar draws it on
 * `surface-container` with no shadow and its hint in `on-surface-variant`,
 * the search app bar's own colours, by its `data-slot`; another element is
 * passed through as it is. The title stays the page's heading, visually
 * hidden, so the heading list still names the screen. `search` makes the
 * bar one 64dp row whatever `variant` says: Material's search app bar is a
 * type of its own, not a medium or a large one.
 *
 * Deviations:
 * - **No on-scroll behaviour.** MD3's app bar changes elevation and, for the
 *   medium and large types, collapses to the small height as content scrolls
 *   under it. That needs a scroll container the kit does not own, so it is not
 *   implemented rather than half-implemented: the bar renders at one size, and
 *   an app that wants the collapse drives `variant` from its own scroll state.
 * - **The M3-Expressive "flexible" app bars are not implemented.** Expressive
 *   deprecates `medium` and `large` in favour of `medium-flexible` and
 *   `large-flexible` (112/120dp, with a two-line title). The kit follows the
 *   baseline token set throughout — the same choice `BottomNavigation` makes —
 *   so those two are what ship here.
 */
export function TopAppBar({
  variant = "small",
  title,
  subtitle,
  leading,
  actions,
  search,
  headingLevel = 1,
  className,
  ...rest
}: TopAppBarProps) {
  const hasSearch = search !== undefined && search !== null;
  const s = styles({ variant: hasSearch ? "small" : variant });
  const isStacked = !hasSearch && (variant === "medium" || variant === "large");

  const TitleText = TITLE_SIZE[variant].component;
  const SubtitleText = SUBTITLE_SIZE[variant].component;
  const heading = `h${headingLevel}` as ElementType;

  const titleBlock = (
    <>
      <TitleText
        component={heading as "h1"}
        size={TITLE_SIZE[variant].size}
        className={s.title()}
      >
        {title}
      </TitleText>
      {subtitle ? (
        <SubtitleText
          component="div"
          size={SUBTITLE_SIZE[variant].size}
          className={s.subtitle()}
        >
          {subtitle}
        </SubtitleText>
      ) : null}
    </>
  );

  return (
    <header
      data-slot="top-app-bar"
      data-variant={variant}
      {...rest}
      className={s.base({ className })}
    >
      <div className={s.row()}>
        <div data-slot="top-app-bar-leading" className={s.leading()}>
          {leading}
        </div>
        {/* On a stacked bar this row holds only the actions; the title moves
            below it, which is the whole difference between the types. */}
        {hasSearch ? (
          <>
            <div data-slot="top-app-bar-title" className="sr-only">
              {titleBlock}
            </div>
            <div data-slot="top-app-bar-search" className={s.search()}>
              {search}
            </div>
          </>
        ) : isStacked ? (
          <div className="flex-1" />
        ) : (
          <div data-slot="top-app-bar-title" className={s.inlineTitle()}>
            {titleBlock}
          </div>
        )}
        <div data-slot="top-app-bar-actions" className={s.actions()}>
          {actions}
        </div>
      </div>
      {isStacked ? (
        <div data-slot="top-app-bar-title" className={s.stackedTitle()}>
          {titleBlock}
        </div>
      ) : null}
    </header>
  );
}

export default TopAppBar;
