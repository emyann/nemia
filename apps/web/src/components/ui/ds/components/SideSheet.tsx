"use client";

import { useId, type ReactNode } from "react";
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay,
} from "react-aria-components";
import { cn, tv, type VariantProps } from "../utils";
import { XIcon } from "../icons";
import IconButton from "./IconButton";
import { Body, Title } from "../primitives/Typography";

const styles = tv({
  slots: {
    base: "min-w-[360px] bg-surface-container flex flex-col relative",
    header: "p-4 flex items-center justify-between",
    content: "grow overflow-y-auto p-4",
    footer: "p-4 border-t border-outline-variant",
  },
  variants: {
    variant: {
      standard: {
        base: "rounded-shape-large w-[360px]",
      },
      modal: {
        // The modal sheet *is* the dialog, and React Aria focuses a dialog on
        // open through its `tabIndex={-1}` — `outline-hidden` keeps the browser
        // from drawing a focus outline around the whole sheet. (This is also
        // why the slots no longer extend `focusRing`: its `focus-visible:ring`
        // would land on the sheet container, not on anything inside it.)
        base: "h-[var(--visual-viewport-height)] w-[calc(100%-56px)] sm:w-[560px] outline-hidden",
      },
    },
    align: {
      left: {},
      right: {},
    },
  },
  compoundVariants: [
    {
      variant: "modal",
      align: "left",
      class: { base: "rounded-r-shape-large" },
    },
    {
      variant: "modal",
      align: "right",
      class: { base: "rounded-l-shape-large" },
    },
  ],
  defaultVariants: {
    variant: "standard",
    align: "right",
  },
});

export type SideSheetProps = VariantProps<typeof styles> & {
  children: ReactNode;
  title?: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  className?: string;
  isOpen: boolean;
  align?: "left" | "right";
  /**
   * Modal only: the dialog's accessible name when `title` is not the right one
   * — or when there is no `title` at all. A string `title` already names the
   * sheet through `aria-labelledby`, so this is the exception, not the rule;
   * it wins over `title` when both are given.
   */
  "aria-label"?: string;
  modalProps?: {
    isDismissable?: boolean;
  };
};

/**
 * MD3 side sheet, in two forms:
 *  - `standard` sits inline in the layout and collapses its own width
 *    (a `grid-template-columns: 1fr → 0fr` transition, no JS animation);
 *  - `modal` floats over a scrim, animated by React Aria's entering/exiting
 *    states.
 * Neither needs an animation library.
 *
 * The modal form is a React Aria `ModalOverlay` + `Modal` + **`Dialog`**, the
 * same three the `NavigationDrawer`'s modal variant is built from. The
 * `Dialog` is not decoration: it is what gives the sheet its `dialog` role and
 * accessible name, moves focus into it on open, makes the overlay's
 * `FocusScope` contain Tab, gives Escape a focused overlay to close, and
 * returns focus to the trigger on close. Without it the sheet is a floating
 * panel the keyboard never reaches (#157). The standard form is inline
 * content, not an overlay, so it stays a plain element.
 */
export default function SideSheet(props: SideSheetProps) {
  const {
    children,
    title,
    onClose,
    footer,
    isOpen,
    variant,
    className,
    modalProps,
    align = "right",
    "aria-label": ariaLabel,
  } = props;

  const s = styles({ variant, align });
  // Names the modal sheet's dialog. `useId` rather than a slug of the title so
  // two sheets on one page cannot collide.
  const titleId = useId();
  // The overlay stays mounted while it animates out, and a caller that drops
  // the sheet's content the moment it closes (the admin shell does) leaves a
  // nameless dialog for the length of the exit. Name that one generically
  // rather than let React Aria warn about a sheet nobody can read any more —
  // an *open* sheet with neither a `title` nor an `aria-label` still gets the
  // warning, because that one is a real authoring mistake.
  const exitingLabel = !title && !isOpen ? "Side sheet" : undefined;

  const body = (
    <>
      {title && (
        <div className={s.header()}>
          {typeof title === "string" ? (
            <Title id={titleId} component="h2">
              {title}
            </Title>
          ) : (
            // `contents` so a caller's own title markup stays a direct flex
            // child of the header; the wrapper is only here to carry the id
            // the dialog is labelled by.
            <div id={titleId} className="contents">
              {title}
            </div>
          )}
          <IconButton aria-label="Close" icon={XIcon} onPress={onClose} />
        </div>
      )}
      <Body className={s.content()} component="div">
        {children}
      </Body>
      {footer && <div className={s.footer()}>{footer}</div>}
    </>
  );

  if (variant === "modal") {
    return (
      <ModalOverlay
        data-slot="side-sheet-overlay"
        isOpen={isOpen}
        isDismissable={modalProps?.isDismissable ?? true}
        onOpenChange={(open) => {
          if (!open) onClose?.();
        }}
        className={cn(
          "bg-scrim/50 fixed inset-0 z-50 backdrop-blur-sm",
          "data-entering:animate-in data-entering:fade-in-0 data-entering:duration-medium-2",
          "data-exiting:animate-out data-exiting:fade-out-0 data-exiting:duration-short-4",
        )}
      >
        <AriaModal
          className={cn(
            "fixed top-0 h-full w-fit",
            align === "left" ? "left-0" : "right-0",
            "data-entering:animate-in data-entering:duration-medium-2 data-entering:ease-emphasized-decelerate",
            "data-exiting:animate-out data-exiting:duration-short-4 data-exiting:ease-emphasized-accelerate",
            align === "left"
              ? "data-entering:slide-in-from-left data-exiting:slide-out-to-left"
              : "data-entering:slide-in-from-right data-exiting:slide-out-to-right",
          )}
        >
          {/* The dialog is the sheet itself rather than a wrapper around it:
              React Aria focuses the dialog element on open, so anything that
              asks "is focus inside the sheet?" — a test, a focus guard — has
              to be able to answer yes for the element that takes it. */}
          <AriaDialog
            data-slot="side-sheet"
            aria-label={ariaLabel ?? exitingLabel}
            aria-labelledby={!ariaLabel && title ? titleId : undefined}
            className={s.base({ className })}
          >
            {body}
          </AriaDialog>
        </AriaModal>
      </ModalOverlay>
    );
  }

  // Standard (inline) sheet: animate the track width with a grid transition so
  // the surrounding layout reflows smoothly and nothing is measured in JS.
  return (
    <div
      className={cn(
        "duration-medium-2 ease-emphasized grid transition-[grid-template-columns]",
        isOpen ? "grid-cols-[1fr]" : "grid-cols-[0fr]",
      )}
      aria-hidden={!isOpen}
      // The collapsed track is still in the DOM (that is what animates), so
      // `aria-hidden` alone would leave its buttons and links reachable by Tab
      // while invisible to a screen reader — axe's `aria-hidden-focus`.
      // `inert` takes the subtree out of both.
      inert={!isOpen}
    >
      <div className="overflow-hidden">
        <div data-slot="side-sheet" className={s.base({ className })}>
          {body}
        </div>
      </div>
    </div>
  );
}

export { SideSheet };
