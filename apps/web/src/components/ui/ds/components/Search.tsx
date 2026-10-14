"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Autocomplete,
  Button as AriaButton,
  Collection,
  Dialog,
  DialogTrigger,
  Header,
  Input,
  type Key,
  ListBox,
  ListBoxItem,
  type ListBoxItemProps,
  ListBoxSection,
  type ListBoxSectionProps,
  Modal,
  ModalOverlay,
  Popover,
  SearchField,
  type SearchFieldProps,
  useFilter,
} from "react-aria-components";

import { ArrowBackIcon, renderIcon, SearchIcon, XIcon, type IconProp } from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { cn, focusRing, tv } from "../utils";

/**
 * Material 3 search: the search bar, and the search view it opens, where
 * suggestions and results are listed as one types.
 *
 *   <SearchBar placeholder="Search messages" onSubmit={run} />
 *
 *   <SearchView placeholder="Search messages" onAction={open}>
 *     <SearchViewSection title="Recent">
 *       <SearchViewItem id="plants" label="Plants" leadingIcon={History} />
 *     </SearchViewSection>
 *   </SearchView>
 *
 * Spec: https://m3.material.io/components/search/overview · .../specs ·
 * .../guidelines · .../accessibility
 *
 * **`SearchBar`** is React Aria's `SearchField` drawn as Material's bar
 * (`md.comp.search-bar.*`): 56dp, fully rounded, `surface-container-high` at
 * elevation 3, `body-large` text in `on-surface` over an `on-surface-variant`
 * hint, a leading search icon in `on-surface` (or the caller's `leading`, a
 * menu or back `IconButton`), and `trailing` for one or two icon buttons or a
 * 30dp avatar. Hover and press lay `on-surface` over it at the state
 * opacities, and keyboard focus draws the kit's `focusRing()`. It is the
 * `searchbox` role, named by its hint ("Search messages"), as the
 * accessibility page asks; Enter calls `onSubmit`, and Escape, or the clear
 * button that appears once there is text, empties it.
 *
 * **`SearchView`** is the bar a person opens to search: a `DialogTrigger`
 * whose trigger is drawn as the bar, opening a `Dialog` that holds React
 * Aria's `Autocomplete` (a `SearchField` and a `ListBox` of `SearchViewItem`
 * and `SearchViewSection`). Typing filters the list (`filter`, by default a
 * case- and accent-blind "contains"), the arrow keys move through it while
 * the caret stays in the field, Enter on a highlighted item calls `onAction`
 * and on none calls `onSubmit` with the query; both close the view. Escape
 * empties the field, a second Escape closes the view, as does the back
 * button, and the focus returns to the bar. A polite live region says how
 * many results the list holds as it changes ("3 results", "No results"),
 * which is the accessibility page's "the screen reader must announce the
 * change".
 *
 * `layout` is Material's two layouts. `"docked"` (default) opens over the bar
 * in a popover as wide as it, at least 240dp and at most two thirds of the
 * window high, over a scrim. `"full-screen"` fills the window. Material
 * swaps from full screen in a compact window to docked from a medium one;
 * the app chooses, by the window it knows.
 *
 * `variant` is Material's two styles. `"divided"` (default) is the baseline
 * view: one container, `surface-container-high` with extra-large corners
 * docked and none full screen, its header 56dp docked and 72dp full screen,
 * and an `outline` divider between the header and the list. `"contained"`
 * is the expressive one: the header stays a 56dp pill, and the list is a
 * container of its own 2dp below it, medium corners, docked; full screen, the
 * pill sits 12dp from the edges on `surface-container-low`.
 *
 * Parts, by `data-slot`: `search-bar` (the bar's root), `search-view` (the
 * closed view's bar), `search-view-trigger`, `search-view-dialog`,
 * `search-view-header`, `search-view-list`, `search-view-item`,
 * `search-view-section`.
 *
 * Deviations:
 * - **Width.** The bar takes its container's width up to Material's 720dp;
 *   the 360dp minimum is the layout's to keep, so a bar in a narrow pane
 *   still fits.
 * - **Motion.** The expressive bar's widening on focus and the view's spring
 *   are not drawn: the view fades in, as the kit's other overlays do.
 * - **Predictive back** is Android's gesture and is not the web's.
 */
const barStyles = tv({
  slots: {
    base: [
      focusRing(),
      "group/search-bar relative isolate flex h-14 w-full max-w-180 min-w-0 items-center gap-1 rounded-shape-full bg-surface-container-high px-1 text-on-surface shadow-elevation-3",
      "has-[input[data-focus-visible]]:outline-solid",
    ],
    // `md.comp.search-bar.{hover,pressed}.state-layer.*`.
    stateLayer:
      "pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-on-surface opacity-0 transition-opacity duration-short-4 group-hover/search-bar:state-opacity-hover group-active/search-bar:state-opacity-pressed",
    // A 48dp box: the leading icon, or a 40dp icon button's target.
    leading: "flex size-12 shrink-0 items-center justify-center text-on-surface",
    input: [
      "h-full min-w-0 flex-1 bg-transparent px-1 text-body-large font-body-large text-on-surface outline-none",
      "placeholder:text-on-surface-variant [&::-webkit-search-cancel-button]:hidden",
    ],
    hint: "min-w-0 flex-1 truncate px-1 text-start text-body-large font-body-large text-on-surface-variant",
    trailing: "flex shrink-0 items-center text-on-surface-variant",
    clear: [
      focusRing(),
      "relative flex size-12 shrink-0 items-center justify-center rounded-shape-full text-on-surface-variant",
      "before:absolute before:inset-1 before:rounded-shape-full before:bg-on-surface-variant before:opacity-0 before:transition-opacity before:content-['']",
      "hover:before:state-opacity-hover data-pressed:before:state-opacity-pressed",
    ],
  },
});

const viewStyles = tv({
  slots: {
    // The docked popover holds the scrim behind the view: a fixed layer that
    // lets a click through to React Aria's own dismiss underlay.
    popover: [
      "w-(--trigger-width) outline-none",
      "before:pointer-events-none before:fixed before:inset-0 before:bg-scrim/32 before:content-['']",
      "data-entering:animate-in data-entering:fade-in-0 data-entering:duration-medium-2 data-entering:ease-emphasized-decelerate",
      "data-exiting:animate-out data-exiting:fade-out-0 data-exiting:duration-short-4 data-exiting:ease-emphasized-accelerate",
    ],
    overlay: [
      "fixed inset-0 z-50",
      "data-entering:animate-in data-entering:fade-in-0 data-entering:duration-medium-2 data-entering:ease-emphasized-decelerate",
      "data-exiting:animate-out data-exiting:fade-out-0 data-exiting:duration-short-4 data-exiting:ease-emphasized-accelerate",
    ],
    modal: "fixed inset-0 flex",
    dialog: "relative flex flex-col text-on-surface outline-none",
    header: "flex shrink-0 items-center gap-1 px-1",
    back: [
      focusRing(),
      "relative flex size-12 shrink-0 items-center justify-center rounded-shape-full text-on-surface",
      "before:absolute before:inset-1 before:rounded-shape-full before:bg-on-surface before:opacity-0 before:transition-opacity before:content-['']",
      "hover:before:state-opacity-hover data-pressed:before:state-opacity-pressed",
    ],
    field: "group/search-bar flex h-full min-w-0 flex-1 items-center",
    results: "flex min-h-0 flex-1 flex-col",
    list: "min-h-0 flex-1 overflow-y-auto py-2 outline-none",
    empty:
      "flex min-h-14 items-center px-4 text-body-large font-body-large text-on-surface-variant",
  },
  variants: {
    layout: {
      docked: {
        // `md.comp.search-view.docked.*`; height 240dp to 2/3 of the window.
        dialog: "max-h-[66vh]",
      },
      "full-screen": {
        dialog: "h-full w-full",
      },
    },
    variant: {
      divided: {
        // One container; the header and the list split by an `outline` line.
        dialog: "bg-surface-container-high",
        header: "border-b border-outline",
      },
      contained: {
        header: "rounded-shape-full bg-surface-container-high",
      },
    },
  },
  compoundVariants: [
    {
      layout: "docked",
      variant: "divided",
      class: {
        dialog: "min-h-60 overflow-hidden rounded-shape-extra-large shadow-elevation-3",
        // `…docked.header.container.height`
        header: "h-14",
      },
    },
    {
      layout: "full-screen",
      variant: "divided",
      // `…full-screen.header.container.height`, square corners.
      class: { header: "h-18" },
    },
    {
      layout: "docked",
      variant: "contained",
      class: {
        // `…contained.docked.bar-results.gap` 2dp, `…results.shape` medium.
        dialog: "gap-0.5",
        header: "h-14 shadow-elevation-3",
        results:
          "min-h-44 overflow-hidden rounded-shape-medium bg-surface-container-high shadow-elevation-3",
      },
    },
    {
      layout: "full-screen",
      variant: "contained",
      class: {
        // `…contained.background.color`, the pill 12dp from the edges.
        dialog: "bg-surface-container-low pt-2",
        header: "mx-3 h-14",
      },
    },
  ],
  defaultVariants: { layout: "docked", variant: "divided" },
});

const itemStyles = tv({
  slots: {
    base: [
      "group/search-item relative isolate flex min-h-14 cursor-pointer items-center gap-4 px-4 py-2 outline-none",
      "outline-3 -outline-offset-2 outline-ring data-focus-visible:outline-solid",
      "data-disabled:cursor-default",
    ],
    stateLayer:
      "pointer-events-none absolute inset-0 -z-10 bg-on-surface opacity-0 transition-opacity duration-short-4 group-hover/search-item:state-opacity-hover group-data-focused/search-item:state-opacity-focus group-data-pressed/search-item:state-opacity-pressed",
    leading:
      "flex shrink-0 items-center justify-center text-on-surface-variant group-data-disabled/search-item:text-on-surface/38",
    content: "flex min-w-0 flex-1 flex-col",
    label:
      "truncate text-body-large font-body-large text-on-surface group-data-disabled/search-item:text-on-surface/38",
    supporting:
      "truncate text-body-medium font-body-medium text-on-surface-variant group-data-disabled/search-item:text-on-surface/38",
    trailing:
      "flex shrink-0 items-center text-on-surface-variant group-data-disabled/search-item:text-on-surface/38",
    section: "flex flex-col",
    sectionTitle:
      "px-4 pt-4 pb-2 text-title-small font-title-small text-on-surface-variant",
  },
});

/* ---------------------------------------------------------------------- */

export type SearchBarProps = Omit<SearchFieldProps, "children" | "className"> & {
  /** The hinted text ("Search messages"), which is also the field's name. */
  placeholder?: string;
  /** Before the text: a menu or back `IconButton`. Default: a search icon. */
  leading?: ReactNode;
  /** After the text: one or two icon buttons, or a 30dp avatar. */
  trailing?: ReactNode;
  className?: string;
};

export function SearchBar({
  placeholder,
  leading,
  trailing,
  className,
  "aria-label": ariaLabel,
  ...props
}: SearchBarProps) {
  const s = barStyles();

  return (
    <SearchField
      data-slot="search-bar"
      aria-label={ariaLabel ?? (props["aria-labelledby"] ? undefined : placeholder)}
      {...props}
      className={composeTailwindRenderProps(className, s.base())}
    >
      <span data-slot="state-layer" className={s.stateLayer()} />
      <span data-slot="search-bar-leading" className={s.leading()}>
        {leading ?? <SearchIcon size={24} />}
      </span>
      <Input placeholder={placeholder} className={s.input()} />
      <ClearButton className={s.clear()} />
      {trailing ? (
        <span data-slot="search-bar-trailing" className={s.trailing()}>
          {trailing}
        </span>
      ) : null}
    </SearchField>
  );
}

/** The field's own clear button, shown once there is text. Inside a
    `SearchField`, React Aria wires its press to clearing the field. */
function ClearButton({ className }: { className: string }) {
  return (
    <AriaButton
      data-slot="search-bar-clear"
      aria-label="Clear search"
      className={cn(className, "group-data-empty/search-bar:hidden")}
    >
      <XIcon size={24} className="relative" />
    </AriaButton>
  );
}

/* ---------------------------------------------------------------------- */

export type SearchViewProps<T extends object> = {
  /** The hinted text ("Search messages"): the bar's and the field's name. */
  placeholder: string;
  /** `docked` (default) opens over the bar; `full-screen` fills the window. */
  layout?: "docked" | "full-screen";
  /** `divided` (default, baseline) or `contained` (expressive). */
  variant?: "divided" | "contained";
  /** The suggestions or results, for a `children` function. */
  items?: Iterable<T>;
  /** `SearchViewItem`s and `SearchViewSection`s, or a function of an item. */
  children: ReactNode | ((item: T) => ReactNode);
  /** An item was chosen, by Enter or a press. The view closes. */
  onAction?: (key: Key) => void;
  /** Enter with no item highlighted: run the query. The view closes. */
  onSubmit?: (value: string) => void;
  /** Controlled query. */
  inputValue?: string;
  /** Uncontrolled starting query. */
  defaultInputValue?: string;
  onInputChange?: (value: string) => void;
  /** Which items match the query. Default: the item's text contains it,
      ignoring case and accents. Pass `() => true` for results the app has
      already filtered. */
  filter?: (textValue: string, inputValue: string) => boolean;
  /** Controlled: whether the view is open. */
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** The closed bar's leading icon. Default: a search icon. */
  leading?: ReactNode;
  /** The closed bar's trailing icon buttons or avatar. */
  trailing?: ReactNode;
  /** The list's name. Default "Results". */
  resultsLabel?: string;
  /** What the list says when nothing matches. Default "No results". */
  emptyState?: ReactNode;
  className?: string;
};

export function SearchView<T extends object>({
  placeholder,
  layout = "docked",
  variant = "divided",
  items,
  children,
  onAction,
  onSubmit,
  inputValue,
  defaultInputValue = "",
  onInputChange,
  filter,
  isOpen,
  defaultOpen = false,
  onOpenChange,
  leading,
  trailing,
  resultsLabel = "Results",
  emptyState = "No results",
  className,
}: SearchViewProps<T>) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = isOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (isOpen === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const [ownValue, setOwnValue] = useState(defaultInputValue);
  const value = inputValue ?? ownValue;
  const setValue = (next: string) => {
    if (inputValue === undefined) setOwnValue(next);
    onInputChange?.(next);
  };

  const { contains } = useFilter({ sensitivity: "base" });
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bar = barStyles();
  const s = viewStyles({ layout, variant });

  const view = (
    <Dialog
      data-slot="search-view-dialog"
      aria-label={placeholder}
      className={s.dialog()}
    >
      <Autocomplete
        inputValue={value}
        onInputChange={setValue}
        filter={filter ?? contains}
        // Enter runs the query unless an item was highlighted with the arrows.
        disableAutoFocusFirst
      >
        <div data-slot="search-view-header" className={s.header()}>
          {/* Outside the field: inside it, the field's own button context
              would make this a second clear button. */}
          <AriaButton
            aria-label="Back"
            onPress={() => setOpen(false)}
            className={s.back()}
          >
            <ArrowBackIcon size={24} className="relative rtl:-scale-x-100" />
          </AriaButton>
          <SearchField
            aria-label={placeholder}
            autoFocus
            onSubmit={(query) => {
              // Enter on a highlighted item is that item's: Autocomplete
              // presses it, and the query is not run as well.
              if (inputRef.current?.getAttribute("aria-activedescendant"))
                return;
              onSubmit?.(query);
              setOpen(false);
            }}
            className={s.field()}
          >
            <Input
              ref={inputRef}
              placeholder={placeholder}
              className={bar.input()}
            />
            <ClearButton className={bar.clear()} />
          </SearchField>
        </div>
        <Results
          className={s.results()}
          listClassName={s.list()}
          emptyClassName={s.empty()}
          label={resultsLabel}
          emptyState={emptyState}
          query={value}
          items={items}
          onAction={(key) => {
            onAction?.(key);
            setOpen(false);
          }}
        >
          {children}
        </Results>
      </Autocomplete>
    </Dialog>
  );

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <div
        ref={barRef}
        data-slot="search-view"
        data-layout={layout}
        data-variant={variant}
        className={cn(
          bar.base(),
          // Keyboard focus on the trigger rings the whole bar.
          "has-[[data-slot=search-view-trigger][data-focus-visible]]:outline-solid",
          className,
        )}
      >
        <span data-slot="state-layer" className={bar.stateLayer()} />
        <AriaButton
          data-slot="search-view-trigger"
          // The visible query is in the name, after the hint it answers.
          aria-label={value ? `${placeholder}: ${value}` : placeholder}
          className="flex h-full min-w-0 flex-1 cursor-text items-center gap-1 outline-none"
        >
          <span className={bar.leading()}>
            {leading ?? <SearchIcon size={24} />}
          </span>
          <span
            className={cn(bar.hint(), value ? "text-on-surface" : undefined)}
          >
            {value || placeholder}
          </span>
        </AriaButton>
        {trailing ? (
          <span data-slot="search-bar-trailing" className={bar.trailing()}>
            {trailing}
          </span>
        ) : null}
      </div>
      {layout === "docked" ? (
        <Popover
          data-slot="search-view-popover"
          triggerRef={barRef}
          placement="bottom start"
          // Over the bar: the header takes the bar's place.
          offset={-56}
          shouldFlip={false}
          className={s.popover()}
        >
          {view}
        </Popover>
      ) : (
        <ModalOverlay isDismissable className={s.overlay()}>
          <Modal className={s.modal()}>{view}</Modal>
        </ModalOverlay>
      )}
    </DialogTrigger>
  );
}

/** The list, and the live region that says how many results it holds. */
function Results<T extends object>({
  className,
  listClassName,
  emptyClassName,
  label,
  emptyState,
  query,
  items,
  onAction,
  children,
}: {
  className: string;
  listClassName: string;
  emptyClassName: string;
  label: string;
  emptyState: ReactNode;
  query: string;
  items?: Iterable<T>;
  onAction: (key: Key) => void;
  children: ReactNode | ((item: T) => ReactNode);
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");

  // Counted from the rendered options once the filter has run, so it is
  // right whatever `filter` and `children` are.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      // An empty list holds its empty state, in an option of its own.
      const list = listRef.current;
      const count =
        !list || list.hasAttribute("data-empty")
          ? 0
          : list.querySelectorAll('[role="option"]').length;
      setMessage(
        count === 0 ? "No results" : `${count} ${count === 1 ? "result" : "results"}`,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [query, items]);

  return (
    <div className={className}>
      <ListBox
        ref={listRef}
        data-slot="search-view-list"
        aria-label={label}
        items={items}
        selectionMode="none"
        onAction={onAction}
        renderEmptyState={() => <div className={emptyClassName}>{emptyState}</div>}
        className={listClassName}
      >
        {children}
      </ListBox>
      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

export type SearchViewItemProps = Omit<ListBoxItemProps, "children" | "className"> & {
  /** The suggestion or result. */
  label: ReactNode;
  /** A second line under it. */
  supportingText?: ReactNode;
  /** A 24dp icon (a clock for a recent search) or an avatar. */
  leadingIcon?: IconProp;
  /** At the end: an icon, a count, an action's glyph. */
  trailing?: ReactNode;
  className?: string;
};

/** One suggestion or result: Material's list item, 56dp, in the view. */
export function SearchViewItem({
  label,
  supportingText,
  leadingIcon,
  trailing,
  className,
  textValue,
  ...props
}: SearchViewItemProps) {
  const s = itemStyles();

  return (
    <ListBoxItem
      data-slot="search-view-item"
      textValue={textValue ?? (typeof label === "string" ? label : undefined)}
      {...props}
      className={cn(s.base(), className)}
    >
      <span data-slot="state-layer" className={s.stateLayer()} />
      {leadingIcon ? (
        <span className={s.leading()}>{renderIcon(leadingIcon, 24)}</span>
      ) : null}
      <span className={s.content()}>
        <span className={s.label()}>{label}</span>
        {supportingText ? (
          <span className={s.supporting()}>{supportingText}</span>
        ) : null}
      </span>
      {trailing ? <span className={s.trailing()}>{trailing}</span> : null}
    </ListBoxItem>
  );
}

export type SearchViewSectionProps<T extends object> = Omit<
  ListBoxSectionProps<T>,
  "className"
> & {
  /** The group's label: "Recent", "Contacts", "Suggestions". */
  title?: ReactNode;
  className?: string;
};

/** A group of suggestions under a label; groups are Material's gaps. */
export function SearchViewSection<T extends object>({
  title,
  children,
  items,
  className,
  ...props
}: SearchViewSectionProps<T>) {
  const s = itemStyles();

  return (
    <ListBoxSection
      data-slot="search-view-section"
      {...props}
      className={cn(s.section(), className)}
    >
      {title ? <Header className={s.sectionTitle()}>{title}</Header> : null}
      <Collection items={items}>{children}</Collection>
    </ListBoxSection>
  );
}

export default SearchView;
