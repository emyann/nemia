import { focusRing, tv, type VariantProps } from "../utils";
import React from "react";
import { renderIcon, type IconProp } from "../icons";
import { Body, Label } from "../primitives/Typography";

const styles = tv({
  extend: focusRing,
  slots: {
    base: "group w-full min-h-[48px] py-2 px-3 flex items-center relative overflow-hidden transition-colors duration-short-4 cursor-pointer rounded-shape-extra-small",
    stateLayer: [
      "absolute inset-0 transition pointer-events-none",
      "bg-on-surface opacity-0 group-hover:state-opacity-hover group-data-focus-visible:state-opacity-focus group-data-pressed:state-opacity-pressed group-data-dragging:state-opacity-dragged",
    ],
    content: "flex flex-col justify-center grow",
    label: "text-on-surface",
    supportingText: "text-on-surface-variant",
    shortcut: "text-on-surface-variant ml-auto",
    leadingIcon:
      "mr-3 flex items-center justify-center shrink-0 text-on-surface-variant",
    trailingIcon:
      "ml-3 flex items-center justify-center shrink-0 text-on-surface-variant",
  },
  variants: {
    hasLeadingIcon: {
      true: {
        base: "pl-3",
      },
      false: {
        base: "pl-3",
      },
    },
    hasTrailingIcon: {
      true: {
        base: "pr-3",
      },
      false: {
        base: "pr-3",
      },
    },
    isDisabled: {
      true: {
        base: "text-on-surface/38 cursor-default",
        label: "text-on-surface/38",
        supportingText: "text-on-surface-variant/38",
        shortcut: "text-on-surface-variant/38",
      },
    },
    // Baseline menu spec: selected container = surface-container-highest,
    // text stays on-surface; callers add a second cue (checkmark).
    isSelected: {
      true: {
        base: "bg-surface-container-highest",
        stateLayer: "bg-on-surface",
      },
    },
  },
  defaultVariants: {
    hasLeadingIcon: false,
    hasTrailingIcon: false,
    isDisabled: false,
    isSelected: false,
  },
});

export type { IconProp };

export type MenuItemProps = VariantProps<typeof styles> & {
  label: React.ReactNode;
  supportingText?: React.ReactNode;
  shortcut?: React.ReactNode;
  leadingIcon?: IconProp;
  trailingIcon?: IconProp;
  isDisabled?: boolean;
  isSelected?: boolean;
  isPressed?: boolean;
  isHovered?: boolean;
  isFocused?: boolean;
  className?: string;
};

/**
 * MD3 (baseline) menu item: 48dp row, 12dp padding, 24dp icons in
 * on-surface-variant, text on-surface, selected container
 * surface-container-highest.
 * Spec: https://m3.material.io/components/menus/{overview,specs,guidelines,accessibility}
 * Deviation: the overview recommends the M3 Expressive *vertical menu*
 * (new shapes, standard / vibrant colour styles, gaps) for new designs and
 * keeps this baseline menu available; the kit follows the baseline token
 * set, and the vertical menu would be a new variant.
 */
export function MenuItem(props: MenuItemProps) {
  const {
    label,
    supportingText,
    shortcut,
    leadingIcon,
    trailingIcon,
    isDisabled,
    isSelected,
    className,
  } = props;

  const baseStyles = styles().base({
    className,
    hasLeadingIcon: !!leadingIcon,
    hasTrailingIcon: !!trailingIcon,
    isDisabled,
    isSelected,
  });

  return (
    <div data-slot="menu-item-content" className={baseStyles}>
      <div
        data-slot="state-layer"
        className={styles().stateLayer({ isSelected })}
      />
      <div className="relative flex w-full items-center">
        {leadingIcon && (
          <div className={styles().leadingIcon()}>
            {renderIcon(leadingIcon)}
          </div>
        )}
        <div className={styles().content()}>
          <Label className={styles().label()} component="div" size="large">
            {label}
          </Label>
          {supportingText && (
            <Body className={styles().supportingText()} component="div">
              {supportingText}
            </Body>
          )}
        </div>
        {shortcut && (
          <Label className={styles().shortcut()} component="div" size="large">
            {shortcut}
          </Label>
        )}
        {trailingIcon && (
          <div className={styles().trailingIcon()}>
            {renderIcon(trailingIcon)}
          </div>
        )}
      </div>
    </div>
  );
}

export default MenuItem;
