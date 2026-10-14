"use client";

import { useContext, useEffect, useRef } from "react";
import {
  Button as AriaButton,
  Text,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as AriaToastContent,
  UNSTABLE_ToastQueue as AriaToastQueue,
  UNSTABLE_ToastRegion as AriaToastRegion,
  UNSTABLE_ToastStateContext as AriaToastStateContext,
  type QueuedToast,
  type ToastRegionProps as AriaToastRegionProps,
} from "react-aria-components";

import { XIcon } from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { focusRing, tv } from "../utils";

/**
 * MD3 snackbar on React Aria `Toast`. A brief message about a process the
 * app performed, shown one at a time at the bottom of the screen, that
 * never interrupts what the user is doing.
 *
 *   // once, at the root of the app (a layout)
 *   <SnackbarRegion />
 *
 *   // anywhere, no hook needed — the queue lives outside React
 *   snackbar("Menu successfully updated");
 *   snackbar("Failed to copy link", { close: true });
 *   snackbar("Email archived", { action: { label: "Undo", onPress: undo } });
 *
 * Behaviour, per the spec: a snackbar without an action auto-dismisses
 * after 5 s (the React Aria accessibility minimum, inside MD3's 4–10 s);
 * a snackbar with an action stays until acted on or dismissed; timers
 * pause while the snackbar is hovered or focused; a new message replaces
 * the one on screen ("a snackbar with updated information can immediately
 * replace an outdated snackbar"); the region is a landmark (F6) and never
 * steals focus; Esc dismisses the focused snackbar. `timeout: null` keeps
 * any snackbar until dismissed; `close: true` adds the optional close icon
 * (on by default only when the snackbar does not auto-dismiss).
 *
 * The queue renders one snackbar at a time — MD3 never stacks them. Place
 * the region with `className` when the layout has a bottom navigation bar
 * or a FAB the snackbar must sit above (`bottom-20 sm:bottom-4`).
 *
 * Spec: https://m3.material.io/components/snackbar/{overview,specs,guidelines,accessibility}
 * — inverse-surface container, level 3 elevation, extra-small corners,
 * 48dp single line / 68dp two lines (body-medium, 14dp vertical padding),
 * 16dp leading padding, 8dp trailing next to the action or icon; the action
 * is a text button in inverse-primary (label-large) with an inverse-primary
 * state layer, the close icon 24dp in inverse-on-surface. Full width on
 * compact, 344–672dp centred on medium and up.
 * Deviations: React Aria marks each snackbar `role="alertdialog"` and the
 * message `role="alert"` (needed for NVDA to announce it) — the kit sets
 * `aria-live="polite"` on the message so it queues after the current
 * announcement instead of interrupting, as the accessibility page asks. A
 * long action is not moved to a third line: the text clamps to two lines and
 * the action stays trailing. The exit is instant (React Aria drives exit
 * motion through view transitions, which need global CSS the kit does not
 * ship); the entrance slides up with emphasized-decelerate.
 */
const styles = tv({
  slots: {
    region: [
      focusRing(),
      "fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center rounded-shape-extra-small",
      "sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2",
    ],
    base: [
      focusRing(),
      "flex w-full items-center gap-2 rounded-shape-extra-small bg-inverse-surface pl-4 shadow-elevation-3",
      "sm:w-auto sm:min-w-[344px] sm:max-w-[672px]",
      "animate-in fade-in-0 slide-in-from-bottom-2 duration-medium-2 ease-emphasized-decelerate",
    ],
    content: "flex min-w-0 grow items-center py-3.5",
    text: "line-clamp-2 text-body-medium font-body-medium text-inverse-on-surface",
    action: [
      focusRing(),
      "group/snackbar-action relative inline-flex h-10 shrink-0 items-center justify-center overflow-hidden rounded-shape-full px-3 text-label-large font-label-large text-inverse-primary",
    ],
    actionStateLayer: [
      "absolute inset-0 bg-inverse-primary opacity-0 transition-opacity pointer-events-none",
      "group-hover/snackbar-action:state-opacity-hover group-data-focus-visible/snackbar-action:state-opacity-focus group-data-pressed/snackbar-action:state-opacity-pressed",
    ],
    close: [
      focusRing(),
      "group/snackbar-close relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-shape-full text-inverse-on-surface",
    ],
    closeStateLayer: [
      "absolute inset-0 bg-inverse-on-surface opacity-0 transition-opacity pointer-events-none",
      "group-hover/snackbar-close:state-opacity-hover group-data-focus-visible/snackbar-close:state-opacity-focus group-data-pressed/snackbar-close:state-opacity-pressed",
    ],
  },
  variants: {
    hasTrailing: {
      true: { base: "pr-2" },
      false: { base: "pr-4" },
    },
  },
  defaultVariants: { hasTrailing: false },
});

/** The single optional action of a snackbar (MD3 allows one). */
export type SnackbarAction = {
  label: string;
  onPress: () => void;
};

/** What a queued snackbar shows. */
export type SnackbarContent = {
  /** The text label — one line ideally, two at most. */
  text: string;
  action?: SnackbarAction;
  /** Show the close icon button. */
  close?: boolean;
};

export type SnackbarOptions = {
  action?: SnackbarAction;
  /** Close icon; defaults to `true` when the snackbar does not auto-dismiss. */
  close?: boolean;
  /**
   * Auto-dismiss delay in ms. Defaults to 5000 without an action and to
   * `null` (stay until dismissed) with one.
   */
  timeout?: number | null;
  /** Called when the snackbar closes, by the user or the timer. */
  onClose?: () => void;
};

/** MD3 4–10 s; React Aria's accessibility minimum is 5 s. */
export const SNACKBAR_TIMEOUT = 5000;

/**
 * The app-wide queue: one snackbar visible at a time. Import it to build a
 * custom region or to `close(key)` a snackbar programmatically.
 */
export const snackbarQueue = new AriaToastQueue<SnackbarContent>({
  maxVisibleToasts: 1,
});

/**
 * Show a snackbar. Replaces the one on screen, if any. Returns its key and a
 * `close()` for programmatic dismissal (a "Processing…" message that ends
 * early, for instance).
 */
export function snackbar(text: string, options: SnackbarOptions = {}) {
  const { action, close, timeout, onClose } = options;
  const persistent =
    timeout === null || (timeout === undefined && action !== undefined);

  for (const visible of snackbarQueue.visibleToasts) {
    snackbarQueue.close(visible.key);
  }

  const key = snackbarQueue.add(
    { text, action, close: close ?? persistent },
    {
      timeout: persistent ? undefined : (timeout ?? SNACKBAR_TIMEOUT),
      onClose,
    },
  );

  return { key, close: () => snackbarQueue.close(key) };
}

export type SnackbarRegionProps = Omit<
  AriaToastRegionProps<SnackbarContent>,
  "queue" | "children" | "className"
> & {
  /** Another queue than the app-wide one. */
  queue?: AriaToastQueue<SnackbarContent>;
  className?: string;
};

/**
 * Where snackbars appear. Render it once, at the root of the app; it is a
 * landmark region (F6 reaches it from anywhere) labelled "Notifications".
 */
export function SnackbarRegion({
  queue = snackbarQueue,
  className,
  ...props
}: SnackbarRegionProps) {
  const s = styles();
  return (
    <AriaToastRegion
      data-slot="snackbar-region"
      {...props}
      queue={queue}
      className={composeTailwindRenderProps(className, s.region())}
    >
      {({ toast }) => <Snackbar toast={toast} />}
    </AriaToastRegion>
  );
}

export type SnackbarProps = {
  toast: QueuedToast<SnackbarContent>;
  className?: string;
};

/** One snackbar; rendered by `SnackbarRegion` for each queued message. */
export function Snackbar({ toast, className }: SnackbarProps) {
  const state = useContext(AriaToastStateContext);
  const ref = useRef<HTMLDivElement>(null);
  const { text, action, close } = toast.content;
  const s = styles({ hasTrailing: Boolean(action ?? close) });

  // Esc dismisses the focused snackbar (spec, "Keyboard navigation"). React
  // Aria's Toast takes no key handlers, so listen on the element itself.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        state?.close(toast.key);
      }
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [state, toast.key]);

  return (
    <AriaToast
      ref={ref}
      data-slot="snackbar"
      toast={toast}
      className={composeTailwindRenderProps(className, s.base())}
    >
      <AriaToastContent aria-live="polite" className={s.content()}>
        <Text slot="title" className={s.text()}>
          {text}
        </Text>
      </AriaToastContent>
      {action && (
        <AriaButton
          data-slot="snackbar-action"
          className={s.action()}
          onPress={() => {
            action.onPress();
            state?.close(toast.key);
          }}
        >
          <span data-slot="state-layer" className={s.actionStateLayer()} />
          <span className="relative">{action.label}</span>
        </AriaButton>
      )}
      {close && (
        <AriaButton
          slot="close"
          data-slot="snackbar-close"
          className={s.close()}
        >
          <span data-slot="state-layer" className={s.closeStateLayer()} />
          <XIcon size={24} className="relative" />
        </AriaButton>
      )}
    </AriaToast>
  );
}
