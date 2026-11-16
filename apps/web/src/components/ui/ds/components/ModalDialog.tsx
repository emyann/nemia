"use client";

import { Dialog, type DialogProps } from "./Dialog";
import Modal from "./Modal";
import { cn } from "../utils";

type BaseModalDialogProps = {
  isOpen?: boolean;
  onClose?: () => void;
  variant?: "basic" | "fullscreen";
};

export type ModalDialogProps = BaseModalDialogProps & DialogProps;

/**
 * A dialog in a modal overlay. Open/close transitions are CSS-driven through
 * React Aria's entering/exiting states — render it unconditionally and drive
 * it with `isOpen`.
 *
 * `role="alertdialog"` also turns light-dismiss off: an alert dialog asks a
 * question that has to be answered, so clicking the scrim must not count as an
 * answer. Escape still closes, which is the platform contract for any modal.
 *
 * While an action of `actions` is loading, nothing dismisses the dialog:
 * not the scrim, not Escape. Close it when the request ends.
 * That holds with content of its own too: give `children` and `actions`
 * together, and the form or the list sits between the headline and the two
 * buttons (see `DialogContent`).
 *
 * The basic dialog keeps 16dp from the window's edges and is at most 560dp
 * wide, Material's maximum; `className` gives another (`max-w-sm`).
 *
 * Spec: https://m3.material.io/components/dialogs/{overview,specs,guidelines,accessibility}
 */
export function ModalDialog(props: ModalDialogProps) {
  const { isOpen, onClose, variant = "basic", ...dialogProps } = props;
  const { actions } = dialogProps;
  const isPending =
    !!actions &&
    "confirm" in actions &&
    !!(actions.confirm.isLoading || actions.cancel.isLoading);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
      isDismissable={dialogProps.role !== "alertdialog" && !isPending}
      isKeyboardDismissDisabled={isPending}
      isAnimated={variant !== "fullscreen"}
      className={
        variant === "fullscreen" ? "flex items-center justify-center" : "mx-4"
      }
    >
      <Dialog
        {...dialogProps}
        className={cn(
          variant === "fullscreen" && "max-w-none",
          dialogProps.className,
        )}
      />
    </Modal>
  );
}

export default ModalDialog;
