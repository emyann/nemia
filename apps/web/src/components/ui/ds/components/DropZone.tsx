"use client";

import {
  DropZone as AriaDropZone,
  type DropZoneProps as AriaDropZoneProps,
} from "react-aria-components";

import { composeTailwindRenderProps } from "../render-props";
import { focusRing, tv } from "../utils";

const styles = tv({
  extend: focusRing,
  base: [
    "flex flex-col items-center justify-center gap-3 rounded-shape-medium border-2 border-dashed border-outline-variant bg-surface-container-low p-6 text-center text-body-medium font-body-medium text-on-surface-variant transition-colors duration-short-4",
    "data-drop-target:border-primary data-drop-target:bg-primary/8",
    "data-disabled:pointer-events-none data-disabled:opacity-38",
  ],
  variants: {
    variant: {
      // The box that is drawn, where files are dropped.
      outlined: "",
      // No box: an area of the page that already has its look (a list, a
      // pane) and only shows itself while files are over it.
      bare: "block gap-0 rounded-none border-transparent bg-transparent p-0 text-start text-inherit",
    },
  },
  defaultVariants: { variant: "outlined" },
});

export type DropZoneProps = Omit<AriaDropZoneProps, "className"> & {
  /** `outlined` (the default) draws the dashed box. `bare` draws nothing at
   *  rest: for an area that has its own look, such as a list files are
   *  dropped onto, which then shows the `primary` outline and tint only
   *  while something is over it. */
  variant?: "outlined" | "bare";
  className?: string;
};

/**
 * An area files, or anything dragged, are dropped onto: from the computer,
 * or from another part of the page. On React Aria `DropZone`.
 *
 *   <DropZone
 *     aria-label="Upload files"
 *     onDrop={async (e) => {
 *       const files = await Promise.all(
 *         e.items.filter(isFileDropItem).map((item) => item.getFile()),
 *       );
 *       upload(files);
 *     }}
 *   >
 *     <UploadIcon size={40} />
 *     Drop files here, or
 *     <FileTrigger onSelect={(list) => upload([...(list ?? [])])} allowsMultiple>
 *       <Button variant="tonal">Choose files</Button>
 *     </FileTrigger>
 *   </DropZone>
 *
 * It needs a name (`aria-label` or `aria-labelledby`): it is a button to a
 * screen reader, which is how a file copied to the clipboard is pasted into
 * it by the keyboard. Dropping is never the only way in: put a
 * `FileTrigger` in it, or beside it. `onDrop` gives the items;
 * `getDropOperation` refuses what the zone does not take (return `"cancel"`
 * for types it does not want); `isFileDropItem` is React Aria's.
 * `isDisabled` draws it at 38%. While something it accepts is over it, it
 * takes the `primary` outline and an 8% `primary` tint.
 *
 * Material 3 does not describe this component. What it borrows:
 *
 * - **The container**: https://m3.material.io/components/cards/specs — an
 *   outlined card's: the medium corner on `surface-container-low`, its
 *   outline dashed to say something is put here.
 * - **The state**: https://m3.material.io/foundations/interaction/states —
 *   the dragged-over state is a state layer of `primary` at the hover
 *   opacity, with the outline in `primary`.
 * - **The text**: https://m3.material.io/styles/typography/type-scale-tokens
 *   — body-medium on `on-surface-variant`.
 */
export function DropZone({ variant, className, ...props }: DropZoneProps) {
  return (
    <AriaDropZone
      data-slot="drop-zone"
      {...props}
      className={composeTailwindRenderProps(className, styles({ variant }))}
    />
  );
}
