"use client";

import {
  GridList as AriaGridList,
  GridListItem as AriaGridListItem,
  type GridListItemProps,
  type GridListProps,
  type Selection,
} from "react-aria-components";
import { DragIndicatorIcon } from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { focusRing, tv } from "../utils";
import IconButton from "./IconButton";

// What a drag shows. The place between two rows where the drop will land is
// React Aria's drop indicator, which it renders unstyled: a 2dp line on
// `primary`. A row, or the whole list, that is dropped *onto* takes the
// drop zone's look: a `primary` outline and its 8% tint.
const dropLine =
  "[&_.react-aria-DropIndicator[data-drop-target]]:outline-1 [&_.react-aria-DropIndicator[data-drop-target]]:outline-solid [&_.react-aria-DropIndicator[data-drop-target]]:outline-primary";
const droppedOnto =
  "data-drop-target:outline-2 data-drop-target:-outline-offset-2 data-drop-target:outline-solid data-drop-target:outline-primary data-drop-target:bg-primary/8";

/**
 * The collection an MD3 list is built on: React Aria `GridList`, which gives
 * the rows their keyboard navigation, selection and actions. It draws
 * nothing of its own; render a `ListItem` inside each `GridListItem`.
 *
 * With `dragAndDropHooks` it shows where a drop will land: a `primary` line
 * between two rows, and a `primary` outline with its tint on a row, or on
 * the list, that is dropped onto.
 *
 * Spec: https://m3.material.io/components/lists/{overview,specs,guidelines,accessibility}
 */
export function GridList<T extends object>({
  children,
  ...props
}: GridListProps<T>) {
  return (
    <AriaGridList
      data-slot="grid-list"
      {...props}
      className={composeTailwindRenderProps(
        props.className,
        `relative overflow-auto ${dropLine} ${droppedOnto}`,
      )}
    >
      {children}
    </AriaGridList>
  );
}

const itemStyles = tv({
  base: [focusRing(), "group/grid-list-item", droppedOnto],
});

/**
 * One row of a `GridList`: React Aria's `GridListItem`, which gives the row
 * its focus, its selection, its action and its drag. It draws the kit's
 * focus ring and nothing else; put the row's look inside it (a `ListItem`,
 * or a `Card`, whose state layer follows the row's hover, focus, press and
 * drag). When its children are a string, that string is the row's
 * `textValue` for type-ahead; otherwise give `textValue` yourself.
 *
 * In a list that is dragged (`dragAndDropHooks` on the `GridList`), put a
 * `GridListDragHandle` in each row: the pointer drags the row from anywhere,
 * and the handle is how the keyboard and a screen reader pick it up.
 *
 * Spec: https://m3.material.io/components/lists/{overview,specs,guidelines,accessibility}
 */
export function GridListItem(props: GridListItemProps) {
  const { children, className, ...gridListItemProps } = props;

  const textValue = typeof children === "string" ? children : undefined;
  return (
    <AriaGridListItem
      data-slot="grid-list-item"
      textValue={textValue}
      {...gridListItemProps}
      className={composeTailwindRenderProps(className, itemStyles())}
    >
      {children}
    </AriaGridListItem>
  );
}

type GridListDragHandleProps = {
  /** The handle's accessible name. Default `"Drag"`: pass the word of the
   *  page's language, and the row's name with it where rows are many
   *  ("Drag Table A1"). */
  "aria-label"?: string;
  className?: string;
};

/**
 * The handle a row of a dragged list is picked up by: a standard icon button
 * in React Aria's `drag` slot, to put in a `ListItem`'s `leadingElement` or
 * `trailingElement`.
 *
 *   <GridListItem textValue={item.name}>
 *     <ListItem headline={item.name} trailingElement={<GridListDragHandle />} />
 *   </GridListItem>
 *
 * The pointer drags a row from anywhere on it, so the handle does not answer
 * the pointer. It is for the keyboard and for a screen reader: the arrow keys
 * reach it inside the row, Enter picks the row up, the arrows choose where it
 * goes, Enter drops it and Escape puts it back. Without one, a keyboard user
 * cannot move a row, and React Aria says so in the console.
 *
 * Material 3 does not describe a drag handle. Its lists have a dragged state
 * (https://m3.material.io/components/lists/specs), which the row's state
 * layer draws; the handle is a standard icon button
 * (https://m3.material.io/components/icon-buttons/specs).
 */
export function GridListDragHandle({
  "aria-label": label = "Drag",
  className,
}: GridListDragHandleProps) {
  return (
    <IconButton
      slot="drag"
      data-slot="grid-list-drag-handle"
      variant="standard"
      icon={DragIndicatorIcon}
      aria-label={label}
      className={className}
    />
  );
}

export type { GridListDragHandleProps, GridListItemProps, Selection };
