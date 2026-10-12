"use client";

import {
  ModalOverlay,
  Modal as AriaModal,
  type ModalOverlayProps as AriaModalOverlayProps,
} from "react-aria-components";
import { cn } from "../utils";

/**
 * Scrim + centering layer for dialogs.
 *
 * Enter/exit animation is pure CSS: React Aria sets `data-entering` /
 * `data-exiting` on the overlay and keeps it mounted until the exit animation
 * finishes, so no animation library and no `<AnimatePresence>` wrapper are
 * needed — render `<Modal isOpen>` and let it unmount normally.
 *
 * Animates through React Aria's `data-entering` / `data-exiting` attributes
 * (Tailwind's bare `data-*` variants) and `tw-animate-css` (`animate-in` /
 * `fade-in-0`). No Tailwind plugin is required.
 *
 * Spec (the scrim and where a dialog sits):
 * https://m3.material.io/components/dialogs/{specs,guidelines}
 */
export type ModalProps = AriaModalOverlayProps & {
  className?: string;
  /** Scale the panel on open, in addition to the scrim fade. Default true. */
  isAnimated?: boolean;
};

export function Modal(props: ModalProps) {
  const {
    children,
    className,
    isDismissable = true,
    isAnimated = true,
    ...modalProps
  } = props;

  return (
    <ModalOverlay
      data-slot="modal-overlay"
      {...modalProps}
      isDismissable={isDismissable}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-scrim/50 backdrop-blur-sm",
        "data-entering:animate-in data-entering:fade-in-0 data-entering:duration-medium-2",
        "data-exiting:animate-out data-exiting:fade-out-0 data-exiting:duration-short-4",
      )}
    >
      <AriaModal
        data-slot="modal"
        className={cn(
          isAnimated && [
            "data-entering:animate-in data-entering:zoom-in-95 data-entering:duration-medium-2 data-entering:ease-emphasized-decelerate",
            "data-exiting:animate-out data-exiting:zoom-out-95 data-exiting:duration-short-4",
          ],
          className,
        )}
      >
        {children}
      </AriaModal>
    </ModalOverlay>
  );
}

export default Modal;
