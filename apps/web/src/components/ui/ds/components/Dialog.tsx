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

/**
 * MD3 dialog, without its overlay: React Aria's `Dialog` around the kit's
 * `DialogContent`. It takes `DialogContent`'s props — a `title`, then an
 * `icon`, `supportingText` and `actions`, or `children` of your own in their
 * place, never both — and `role`. The `title` is always the dialog's
 * accessible name. It is drawn as the headline only without `children`:
 * with them the dialog shows what you pass and nothing else, so write the
 * headline yourself (`<Headline size="medium">`).
 *
 * It draws no scrim and opens nothing: render it inside a `Modal` or a
 * React Aria `DialogTrigger` and `Popover`, or use `ModalDialog`, which is
 * this inside the kit's modal with the open state, light-dismiss and the
 * full-screen variant handled.
 *
 * Spec: https://m3.material.io/components/dialogs/{overview,specs,guidelines,accessibility}
 */
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
