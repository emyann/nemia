"use client";

import { Dialog, type DialogProps } from "./Dialog";
import Modal from "./Modal";

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
 */
export function ModalDialog(props: ModalDialogProps) {
  const { isOpen, onClose, variant = "basic", ...dialogProps } = props;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
      isDismissable={dialogProps.role !== "alertdialog"}
      isAnimated={variant !== "fullscreen"}
      className={
        variant === "fullscreen"
          ? "flex items-center justify-center"
          : undefined
      }
    >
      <Dialog {...dialogProps} />
    </Modal>
  );
}

export default ModalDialog;
