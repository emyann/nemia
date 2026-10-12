"use client";

import {
  GridList as AriaGridList,
  GridListItem as AriaGridListItem,
  type GridListItemProps,
  type GridListProps,
  type Selection,
} from "react-aria-components";
import { tv } from "../utils";
import { focusRing } from "../utils";
import { composeTailwindRenderProps } from "../render-props";

/**
 * The collection an MD3 list is built on: React Aria `GridList`, which gives
 * the rows their keyboard navigation, selection and actions. It draws
 * nothing of its own; render a `ListItem` inside each `GridListItem`.
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
        "relative overflow-auto",
      )}
    >
      {children}
    </AriaGridList>
  );
}

const itemStyles = tv({
  base: [focusRing(), "group/grid-list-item"],
});

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

export type { GridListItemProps, Selection };
