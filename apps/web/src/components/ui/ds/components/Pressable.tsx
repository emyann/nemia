"use client";

import type { ReactNode } from "react";
import {
  Button as AriaButton,
  Link as AriaLink,
  type ButtonProps as AriaButtonProps,
  type LinkProps as AriaLinkProps,
} from "react-aria-components";

import { composeTailwindRenderProps } from "../render-props";
import { focusRing, tv } from "../utils";

const styles = tv({
  extend: focusRing,
  base: [
    "group/pressable rounded-shape-small relative inline-flex cursor-pointer items-center text-start text-inherit no-underline",
    "data-disabled:pointer-events-none data-disabled:cursor-default data-disabled:opacity-38",
  ],
});

const layer =
  "pointer-events-none absolute inset-0 rounded-[inherit] bg-current opacity-0 transition-opacity duration-short-4 group-hover/pressable:state-opacity-hover group-data-focus-visible/pressable:state-opacity-focus group-data-pressed/pressable:state-opacity-pressed";

type Common = {
  /** Whatever is pressed: an avatar, a card's content, a row of text. */
  children: ReactNode;
  className?: string;
};

export type PressableProps =
  | (Common & Omit<AriaButtonProps, "children" | "className"> & { href?: never })
  | (Common & Omit<AriaLinkProps, "children" | "className"> & { href: string });

/**
 * A button, or with `href` a link, that holds anything: an avatar that opens
 * a menu, a card pressed whole, a line of a transcript. It gives its content
 * what every pressable has (the keyboard, a name, the state layer on hover,
 * focus and press, the focus ring) and draws nothing else.
 *
 *   <Pressable aria-label="Account" onPress={openMenu} className="rounded-shape-full">
 *     <Avatar fallback="AM" />
 *   </Pressable>
 *
 *   <Pressable href="/help/invoices" className="rounded-shape-medium w-full p-4">
 *     <Title component="span">Send your first invoice</Title>
 *   </Pressable>
 *
 * Its shape is a `className`: the corner (`rounded-shape-full` around an
 * avatar), a padding, a width. The state layer takes that corner and the
 * colour of the text. Name it with `aria-label` where its content has no
 * text. Give it at least a 48dp target (`min-h-12 min-w-12`) where what it
 * holds is smaller.
 *
 * Use `Button`, `IconButton`, `Chip` or a `GridListItem` where one of them
 * is the control: they carry Material's shapes and sizes. This is for what
 * none of them holds. Do not put a control inside it: a button in a button
 * is reached by no keyboard.
 *
 * Material 3 does not describe this component. Its state layer and its
 * focus ring are those of https://m3.material.io/foundations/interaction/states.
 */
export function Pressable({ children, className, ...props }: PressableProps) {
  const content = (
    <>
      <span data-slot="state-layer" aria-hidden="true" className={layer} />
      {children}
    </>
  );
  if (props.href !== undefined) {
    return (
      <AriaLink
        data-slot="pressable"
        {...props}
        className={composeTailwindRenderProps(className, styles())}
      >
        {content}
      </AriaLink>
    );
  }
  return (
    <AriaButton
      data-slot="pressable"
      {...props}
      className={composeTailwindRenderProps(className, styles())}
    >
      {content}
    </AriaButton>
  );
}

export default Pressable;
