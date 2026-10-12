import React from "react";
import { Body, Title } from "../primitives/Typography";
import { focusRing, tv, type VariantProps } from "../utils";

const styles = tv({
  extend: focusRing,
  slots: {
    base: "w-full min-h-[56px] py-2 flex items-center relative overflow-hidden transition-colors duration-short-4 cursor-pointer",
    stateLayer: [
      "absolute inset-0 transition pointer-events-none",
      "bg-on-surface opacity-0 group-hover/grid-list-item:state-opacity-hover group-data-focus-visible/grid-list-item:state-opacity-focus group-data-pressed/grid-list-item:state-opacity-pressed group-data-dragging/grid-list-item:state-opacity-dragged",
    ],
    content: "flex flex-col justify-center grow",
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
        base: "text-on-surface/38 cursor-default",
        headline: "text-on-surface/38",
        supportingText: "text-on-surface-variant/38",
      },
    },
    isSelected: {
      true: {
        base: "bg-primary-container",
      },
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

  const baseStyles = styles().base({
    className,
    hasLeadingElement: !!leadingElement,
    hasTrailingElement: !!trailingElement,
    isDisabled,
    isSelected,
  });

  return (
    <div data-slot="list-item" className={baseStyles}>
      <div data-slot="state-layer" className={styles().stateLayer()} />
      <div className="relative flex w-full items-center">
        {leadingElement && (
          <div className={styles().leadingElement()}>{leadingElement}</div>
        )}
        <div className={styles().content()}>
          <Title
            size="large"
            className={styles({ isDisabled }).headline()}
            component="div"
          >
            {headline}
          </Title>
          {supportingText && (
            <Body
              className={styles({ isDisabled }).supportingText()}
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
