"use client";

import { Dialog as AriaDialog } from "react-aria-components";
import DialogContent, { type DialogContentProps } from "./DialogContent";

type BaseDialogProps = {
  className?: string;
  /**
   * `alertdialog` for the interruption that needs an answer before anything
   * else can happen — a destructive confirmation, an error that blocks the
   * flow. It changes the ARIA role only: assistive technology announces the
   * dialog's content immediately instead of waiting to be read, and
   * `ModalDialog` stops light-dismissing so the choice has to be made.
   *
   * MD3 has no separate alert dialog. Its dialogs page covers one component
   * with two sizes (basic and full-screen); "alert" is a *use*, not a variant,
   * which is why this is a role rather than a `variant`
   * (https://m3.material.io/components/dialogs/guidelines).
   *
   * @default "dialog"
   */
  role?: "dialog" | "alertdialog";
};

type DialogProps = BaseDialogProps & DialogContentProps;

export function Dialog(props: DialogProps) {
  const { className, role = "dialog", ...contentProps } = props;

  return (
    <AriaDialog
      data-slot="dialog"
      data-role={role}
      role={role}
      className="outline-hidden"
      aria-label={contentProps.title}
    >
      <DialogContent {...contentProps} className={className} />
    </AriaDialog>
  );
}

export type { DialogProps };
