"use client";

import { type ReactNode } from "react";
import {
  Popover,
  PreviewTrigger as AriaPreviewTrigger,
  type Placement,
  type PreviewTriggerProps as AriaPreviewTriggerProps,
} from "react-aria-components";

import { tv } from "../utils";

/**
 * A preview: a non-modal popover that opens on hover, on focus and on long
 * press, and — unlike a tooltip — may hold interactive content.
 *
 *   <PreviewTrigger>
 *     <Link href="/products">12 products</Link>
 *     <PreviewCard className="w-96">…</PreviewCard>
 *   </PreviewTrigger>
 *
 * **Material 3 has no page for this component.** MD3 covers tooltips (plain
 * and rich) and menus; a hover-opened card of arbitrary content is not in the
 * system, so there is nothing to cite and `npm run md3 -- page …` will not
 * find it. The surface is drawn as a Material *container* rather than
 * invented: `surface-container-high` at `rounded-shape-medium` with
 * `shadow-elevation-2`, which is what the kit's `Menu` popover already uses,
 * and the same `data-entering` / `data-exiting` motion as every other overlay
 * here. The nearest thing MD3 *does* define is the **rich tooltip**
 * (https://m3.material.io/components/tooltips/guidelines) — reach for the
 * kit's `Tooltip variant="rich"` when the content is a title, a paragraph and
 * at most a link, and for this when it is a list, a form or anything the
 * reader has to interact with.
 *
 * Behaviour is React Aria's `PreviewTrigger`, which is the whole reason to
 * prefer it over a hand-rolled hover card: it opens on **focus** as well as
 * hover, so a keyboard reader gets the preview at all, and it long-presses on
 * touch, where hover does not exist. The trigger must be focusable — a link or
 * a button, not a `<span>`.
 *
 * Deviation: MD3's motion for an overlay of this kind is unspecified, so the
 * enter/exit reuses the kit's dialog timings (`duration-medium-2` in on
 * `ease-emphasized-decelerate`, `duration-short-4` out).
 */

const styles = tv({
  base: [
    "bg-surface-container-high text-on-surface rounded-shape-medium shadow-elevation-2",
    "max-w-[min(28rem,calc(100vw-2rem))] p-4 outline-hidden",
    "data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-entering:duration-medium-2 data-entering:ease-emphasized-decelerate",
    "data-exiting:animate-out data-exiting:fade-out-0 data-exiting:duration-short-4",
  ],
});

export type PreviewTriggerProps = AriaPreviewTriggerProps;

/**
 * Wraps exactly two children: a focusable trigger, then a `PreviewCard`.
 */
export function PreviewTrigger(props: PreviewTriggerProps) {
  return <AriaPreviewTrigger {...props} />;
}

export type PreviewCardProps = {
  children: ReactNode;
  /** Side of the trigger to open on. Default `bottom`. */
  placement?: Placement;
  /** Gap between trigger and card, in px. Default 8 (MD3's smallest space). */
  offset?: number;
  className?: string;
};

/** The popover surface. Must be the second child of a `PreviewTrigger`. */
export function PreviewCard({
  children,
  placement = "bottom",
  offset = 8,
  className,
}: PreviewCardProps) {
  return (
    <Popover
      data-slot="preview-card"
      placement={placement}
      offset={offset}
      className={styles({ className })}
    >
      {children}
    </Popover>
  );
}

export default PreviewTrigger;
