import type { ReactNode } from "react";

import { cn } from "../utils";

export type SkeletonProps = {
  /**
   * What the placeholder stands for: `text` is one line of text, as tall as
   * the line it replaces; `rectangle` is a block (a picture, a card, a
   * chart); `circle` is an avatar or an icon. Its size is a `className`.
   *
   * @default "text"
   */
  shape?: "text" | "rectangle" | "circle";
  className?: string;
};

/**
 * A placeholder for content that is loading: a quiet block the size and
 * shape of what will take its place, so the page does not jump when it
 * arrives. Size it with `className` (`w-40`, `h-48`, `size-10`).
 *
 *   <SkeletonGroup label="Loading orders" className="flex flex-col gap-3">
 *     <Skeleton className="w-1/2" />
 *     <Skeleton shape="rectangle" className="h-32" />
 *     <Skeleton shape="circle" className="size-10" />
 *   </SkeletonGroup>
 *
 * A `text` skeleton is one line: it takes the line height of the text
 * around it and draws a bar the height of its letters, so it stands where
 * the line will. Put it inside the type primitive it replaces
 * (`<Title><Skeleton className="w-32" /></Title>`) and the row keeps its
 * height. `rectangle` takes the medium corner, `circle` is round.
 *
 * It is hidden from a screen reader: a row of grey bars says nothing. Wrap
 * the placeholders of one region in `SkeletonGroup`, which says "Loading"
 * once. The pulse stops for a person who asked for reduced motion. Use it
 * where the shape of what loads is known; where it is not, or for an action
 * in progress, use `LoadingIndicator` or `ProgressIndicator`.
 *
 * Material 3 does not describe this component. Its colour is
 * `surface-container-highest`, the kit's choice: a quiet fill that reads on
 * `surface` and on the lower surface containers.
 */
export function Skeleton({ shape = "text", className }: SkeletonProps) {
  return (
    <span
      data-slot="skeleton"
      data-shape={shape}
      aria-hidden="true"
      className={cn(
        "bg-surface-container-highest block motion-safe:animate-pulse",
        shape === "text" &&
          "rounded-shape-extra-small my-[0.25lh] h-[0.5lh] w-full",
        shape === "rectangle" && "rounded-shape-medium w-full",
        shape === "circle" && "rounded-shape-full shrink-0",
        className,
      )}
    />
  );
}

export type SkeletonGroupProps = {
  /** What a screen reader hears once for the region. @default "Loading" */
  label?: string;
  className?: string;
  children: ReactNode;
};

/**
 * The placeholders of one region that is loading. It is a `status` that
 * says its `label` once ("Loading" unless you name what loads), and lays
 * out nothing: give it the layout of the content it stands for. Replace the
 * whole group with the content when it arrives.
 *
 * Material 3 does not describe this component.
 */
export function SkeletonGroup({
  label = "Loading",
  className,
  children,
}: SkeletonGroupProps) {
  return (
    <div data-slot="skeleton-group" role="status" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export default Skeleton;
