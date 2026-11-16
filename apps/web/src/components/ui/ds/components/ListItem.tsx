import React from "react";
import { Body } from "../primitives/Typography";
import { focusRing, tv, type VariantProps } from "../utils";

const styles = tv({
  extend: focusRing,
  slots: {
    // The pointer's hand only inside a `GridListItem`, which is what makes
    // a row pressable: a row in a plain `ul` is read, not pressed.
    base: "w-full min-h-[56px] py-2 flex items-center relative overflow-hidden transition-colors duration-short-4 in-data-[slot=grid-list-item]:cursor-pointer",
    stateLayer: [
      "absolute inset-0 transition pointer-events-none",
      "bg-on-surface opacity-0 group-hover/grid-list-item:state-opacity-hover group-data-focus-visible/grid-list-item:state-opacity-focus group-data-pressed/grid-list-item:state-opacity-pressed group-data-dragging/grid-list-item:state-opacity-dragged",
    ],
    // min-w-0: a flex child is at least as wide as its text unless told
    // otherwise, and a headline cut to one line could not be cut.
    content: "flex min-w-0 flex-col justify-center grow",
    headline: "text-on-surface",
    supportingText: "text-on-surface-variant",
    leadingElement: "mr-4 flex items-center justify-center shrink-0",
    trailingElement: "ml-4 flex items-center justify-center shrink-0",
  },
  variants: {
    hasLeadingElement: {
      true: {
        base: "pl-4",
      },
      false: {
        base: "pl-4",
      },
    },
    hasTrailingElement: {
      true: {
        base: "pr-4",
      },
      false: {
        base: "pr-4",
      },
    },
    isDisabled: {
      true: {
        base: "text-on-surface/38 in-data-[slot=grid-list-item]:cursor-default",
        headline: "text-on-surface/38",
        supportingText: "text-on-surface-variant/38",
      },
    },
    // Material's selected list item: the container on secondary-container,
    // and every text and icon on it on on-secondary-container
    // (md.comp.list.list-item.selected.*).
    isSelected: {
      true: {
        base: "bg-secondary-container text-on-secondary-container",
        headline: "text-on-secondary-container",
        supportingText: "text-on-secondary-container",
      },
    },
    // Material's heights: 56dp for one line, 72dp for two.
    lines: {
      one: {},
      two: { base: "min-h-[72px]" },
    },
  },
  defaultVariants: {
    hasLeadingElement: false,
    hasTrailingElement: false,
    isDisabled: false,
    isSelected: false,
  },
});

export type ListItemProps = VariantProps<typeof styles> & {
  className?: string;
  headline: React.ReactNode;
  supportingText?: React.ReactNode;
  leadingElement?: React.ReactNode;
  trailingElement?: React.ReactNode;
  isDisabled?: boolean;
  isSelected?: boolean;
  // Interaction states forwarded from the parent `GridListItem` render props.
  // Styling is driven by the `group-*/grid-list-item` classes in `stateLayer`,
  // so these are accepted but not consumed directly.
  isHovered?: boolean;
  isPressed?: boolean;
  isFocused?: boolean;
};

/**
 * MD3 list item: a headline, optional supporting text, and a leading and a
 * trailing element. It draws the row; `GridListItem` gives it its behaviour.
 * In a plain `ul` or `li` it is a row that is read: no hover, no pointer's
 * hand, nothing to press.
 *
 *   <ListItem
 *     headline="Design principles"
 *     supportingText="Edited yesterday"
 *     leadingElement={<Avatar alt="Ada Martin" fallback="AM" />}
 *     trailingElement={<Label>12 MB</Label>}
 *   />
 *
 * `headline` is Material's label text, in body-large on `on-surface`;
 * `supportingText` is body-medium on `on-surface-variant`. Both are any
 * node, drawn in a `div`, and both wrap: to cut a long name to one line, pass
 * it wrapped (`<span className="block truncate">`) and give the list a
 * width. `leadingElement` and `trailingElement` are whatever a slot holds
 * (an icon, an avatar, a checkbox, text), 16dp from the text. The row is at
 * least 56dp high, 72dp with supporting text, with 16dp at each side.
 * `isDisabled` draws it at 38%, `isSelected` on `secondary-container` with
 * its text on `on-secondary-container`.
 *
 * Gaps: Material's three-line item (88dp, its content aligned to the top),
 * its overline, and the expressive list's segmented shapes are not built. `isHovered`, `isPressed` and
 * `isFocused` are accepted and not read: the state layer follows the
 * `GridListItem` around it.
 *
 * Spec: https://m3.material.io/components/lists/{overview,specs,guidelines,accessibility}
 */
export default function ListItem(props: ListItemProps) {
  const {
    className,
    headline,
    supportingText,
    leadingElement,
    trailingElement,
    isDisabled,
    isSelected,
  } = props;

  const lines = supportingText ? "two" : "one";
  const baseStyles = styles().base({
    className,
    hasLeadingElement: !!leadingElement,
    hasTrailingElement: !!trailingElement,
    isDisabled,
    isSelected,
    lines,
  });

  return (
    <div data-slot="list-item" className={baseStyles}>
      <div data-slot="state-layer" className={styles().stateLayer()} />
      <div className="relative flex w-full items-center">
        {leadingElement && (
          <div className={styles().leadingElement()}>{leadingElement}</div>
        )}
        <div className={styles().content()}>
          {/* Material's list item label text is body-large (16/24), in
              on-surface: md.comp.list.list-item.label-text. */}
          <Body
            size="large"
            className={styles({ isDisabled, isSelected }).headline()}
            component="div"
          >
            {headline}
          </Body>
          {supportingText && (
            <Body
              className={styles({ isDisabled, isSelected }).supportingText()}
              component="div"
            >
              {supportingText}
            </Body>
          )}
        </div>
        {trailingElement && (
          <div className={styles().trailingElement()}>{trailingElement}</div>
        )}
      </div>
    </div>
  );
}
