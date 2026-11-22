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
    // Disabled: content at 38% of on-surface, and no state layer, since a
    // disabled row answers neither hover nor press.
    isDisabled: {
      true: {
        base: "text-on-surface/38 cursor-default",
        stateLayer: "hidden",
        label: "text-on-surface/38",
        supportingText: "text-on-surface/38",
        shortcut: "text-on-surface/38",
        leadingIcon: "text-on-surface/38",
        trailingIcon: "text-on-surface/38",
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
 *
 * It draws the row and holds no state of its own: hover is CSS, and the
 * focus and pressed state layers read `data-focus-visible` and
 * `data-pressed` from the nearest ancestor that carries the class `group`.
 * Render it inside a React Aria item (`MenuItem`, `ListBoxItem`) whose
 * `className` includes `group`, as `Menu` and `SelectItem` do. `isFocused`,
 * `isHovered` and `isPressed` are accepted and not read.
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

  // The variants are given once, here: a slot called on a bare `styles()`
  // takes none of them, and a disabled row's label stayed at full colour.
  const s = styles({
    hasLeadingIcon: !!leadingIcon,
    hasTrailingIcon: !!trailingIcon,
    isDisabled,
    isSelected,
  });

  return (
    <div data-slot="menu-item-content" className={s.base({ className })}>
      <div data-slot="state-layer" className={s.stateLayer()} />
      <div className="relative flex w-full items-center">
        {leadingIcon && (
          <div className={s.leadingIcon()}>
            {renderIcon(leadingIcon)}
          </div>
        )}
        <div className={s.content()}>
          <Label className={s.label()} component="div" size="large">
            {label}
          </Label>
          {/* A space between the two lines, which the flex column does not
              draw: a `Select` shows its chosen row as its trigger's text, and
              without it that text runs "NeverAnyone with…", which the
              trigger's name ("Never Anyone with…") does not contain. */}
          {supportingText && " "}
          {supportingText && (
            <Body className={s.supportingText()} component="div">
              {supportingText}
            </Body>
          )}
        </div>
        {shortcut && (
          <Label className={s.shortcut()} component="div" size="large">
            {shortcut}
          </Label>
        )}
        {trailingIcon && (
          <div className={s.trailingIcon()}>
            {renderIcon(trailingIcon)}
          </div>
        )}
      </div>
    </div>
  );
}

export default MenuItem;
