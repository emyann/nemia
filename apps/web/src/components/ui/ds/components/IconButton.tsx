"use client";

import { forwardRef } from "react";
import { focusRing, tv } from "../utils";
import type React from "react";
import {
  ToggleButton as AriaToggleButton,
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
  type ButtonRenderProps as AriaButtonRenderProps,
  Link as AriaLink,
  type LinkProps as AriaLinkProps,
  type ToggleButtonProps,
  composeRenderProps,
} from "react-aria-components";
import StateLayer, { type StateLayerColor } from "../primitives/StateLayer";
import { type IconComponent } from "../icons";

const styles = tv({
  slots: {
    base: [
      focusRing(),
      "relative inline-flex shrink-0 items-center justify-center rounded-shape-full text-sm font-medium transition-colors duration-short-4 p-0",
    ],
    icon: "inline-flex",
  },
  variants: {
    variant: {
      standard: {},
      filled: {},
      tonal: {},
      outlined: {
        base: "bg-transparent border border-outline-variant",
        icon: "text-on-surface-variant",
      },
    },
    // Width and height as a pair, never `size-*`: a caller's `h-8 w-8` then
    // wins through the merge. `xsmall` and `small` draw less than Material's
    // 48dp target, so a centred, invisible 48 by 48 `::before` answers for
    // them.
    size: {
      xsmall: {
        base: "w-8 h-8 before:absolute before:top-1/2 before:left-1/2 before:h-12 before:w-12 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
      },
      small: {
        base: "w-10 h-10 before:absolute before:top-1/2 before:left-1/2 before:h-12 before:w-12 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
      },
      medium: { base: "w-14 h-14" },
      large: { base: "w-24 h-24" },
      xlarge: { base: "w-34 h-34" },
    },
    isContained: {
      false: {},
      true: {},
    },
    // `none` is the default button; a toggle is `unselected` or `selected`.
    selection: {
      none: {},
      unselected: {},
      selected: {},
    },
    isDisabled: {
      true: {},
      false: {},
    },
  },
  compoundVariants: [
    {
      isContained: false,
      variant: "standard",
      class: { base: "bg-transparent", icon: "text-on-surface-variant" },
    },
    {
      isContained: false,
      variant: "filled",
      class: { base: "bg-transparent", icon: "text-primary" },
    },
    {
      isContained: false,
      variant: "tonal",
      class: { base: "bg-transparent", icon: "text-secondary" },
    },
    {
      isContained: true,
      variant: "standard",
      class: {
        base: "bg-surface-container-lowest shadow-elevation-1",
        icon: "text-on-surface",
      },
    },
    {
      isContained: true,
      variant: "filled",
      class: { base: "bg-primary", icon: "text-on-primary" },
    },
    {
      isContained: true,
      variant: "tonal",
      class: {
        base: "bg-secondary-container",
        icon: "text-on-secondary-container",
      },
    },
    {
      isContained: true,
      variant: "outlined",
      class: { base: "bg-surface", icon: "text-on-surface" },
    },
    // The outline's width follows the size.
    { variant: "outlined", size: "large", class: { base: "border-2" } },
    { variant: "outlined", size: "xlarge", class: { base: "border-3" } },
    // Toggle
    {
      selection: "unselected",
      isContained: true,
      variant: "filled",
      class: { base: "bg-surface-container", icon: "text-on-surface-variant" },
    },
    {
      selection: "selected",
      isContained: true,
      variant: "tonal",
      class: { base: "bg-secondary", icon: "text-on-secondary" },
    },
    {
      selection: "selected",
      variant: "outlined",
      class: {
        base: "bg-inverse-surface border-transparent",
        icon: "text-inverse-on-surface",
      },
    },
    {
      selection: "selected",
      isContained: false,
      variant: "standard",
      class: { icon: "text-primary" },
    },
    {
      selection: "selected",
      isContained: true,
      variant: "standard",
      class: {
        base: "bg-secondary-container",
        icon: "text-on-secondary-container",
      },
    },
    // Disabled: the icon at 38 %, a drawn container at 10 %
    // (`md.comp.icon-button.disabled.container.opacity`), never the whole
    // button dimmed.
    {
      isDisabled: true,
      class: { base: "pointer-events-none", icon: "text-on-surface/38" },
    },
    {
      isDisabled: true,
      isContained: true,
      class: { base: "bg-on-surface/10 shadow-none" },
    },
    {
      isDisabled: true,
      selection: "selected",
      variant: "outlined",
      class: { base: "bg-on-surface/10" },
    },
  ],
  defaultVariants: {
    variant: "standard",
    size: "small",
    isContained: false,
    selection: "none",
    isDisabled: false,
  },
});

type IconButtonVariant = "standard" | "filled" | "tonal" | "outlined";
type IconButtonSize = "xsmall" | "small" | "medium" | "large" | "xlarge";
type IconButtonSelection = "none" | "unselected" | "selected";

/** Material's icon size in each container (`md.comp.icon-button.<size>.icon.size`). */
const iconSizes: Record<IconButtonSize, number> = {
  xsmall: 20,
  small: 24,
  medium: 24,
  large: 32,
  xlarge: 40,
};

type BaseIconButtonProps = {
  /** The colour style. Default `standard`. */
  variant?: IconButtonVariant;
  /**
   * Material's five sizes: 32, 40, 56, 96 and 136 pixels square. Default
   * `small`, Material's.
   */
  size?: IconButtonSize;
  /**
   * Draws the container. Left out, `filled` and `tonal` draw theirs, as
   * Material's do, and `standard` and `outlined` draw none.
   */
  isContained?: boolean;
  icon: IconComponent;
  "aria-label": string;
  /** Classes for the named parts. */
  classNames?: {
    icon?: string;
  };
};

/** The states the styles read — common to React Aria `Button` and `Link`. */
type IconButtonRenderProps = Pick<
  AriaButtonRenderProps,
  "isHovered" | "isPressed" | "isFocused" | "isFocusVisible" | "isDisabled"
>;

type StandardIconButtonProps = BaseIconButtonProps &
  Omit<AriaButtonProps, "children" | "className"> &
  Pick<
    AriaLinkProps,
    "href" | "target" | "rel" | "routerOptions" | "download"
  > & {
    isToggle?: false;
    className?: string | ((renderProps: IconButtonRenderProps) => string);
  };

type ToggleIconButtonProps = BaseIconButtonProps &
  Omit<ToggleButtonProps, "children"> & {
    isToggle: true;
  };

type IconButtonProps = StandardIconButtonProps | ToggleIconButtonProps;

/**
 * MD3 icon button: a default button, a link with `href`, or a toggle with
 * `isToggle`, in Material's four colour styles (`variant`: standard, filled,
 * tonal, outlined) and five sizes (`size`).
 *
 * | `size` | container | icon | outlined outline |
 * | --- | --- | --- | --- |
 * | `xsmall` | 32dp | 20dp | 1dp |
 * | `small` (default) | 40dp | 24dp | 1dp |
 * | `medium` | 56dp | 24dp | 1dp |
 * | `large` | 96dp | 32dp | 2dp |
 * | `xlarge` | 136dp | 40dp | 3dp |
 *
 * Colours are Material's per style, for the default button, the unselected
 * toggle and the selected one. Disabled, the icon is `on-surface` at 38 % and
 * a drawn container `on-surface` at 10 %, the icon button's own token (other
 * components' disabled containers are at 12 %).
 *
 * **Target.** `xsmall` and `small` draw less than Material's 48 by 48 target,
 * so each answers over a centred, invisible 48 by 48 area: 8 pixels beyond an
 * `xsmall` button's edge, 4 beyond a `small` one's. Leave that much room
 * around it. Where two targets overlap, the later button in the document
 * answers in the overlap; in a `Table`'s dense row of 40 pixels, each button
 * so answers over at least 48 by 40. An ancestor that clips (`overflow-hidden`)
 * cuts the target at its edge.
 *
 * Parts, each with its `data-slot` and its key in `classNames`: `icon`
 * (`icon-button-icon`). The root is `data-slot="icon-button"` with
 * `data-variant` and `data-size`, and takes `className`.
 *
 * Gaps against Material's pages, by name:
 * - **Square shape**: every button here is round.
 * - **Shape morphs** when pressed and when selected.
 * - **Narrow and wide widths**: every size is square, Material's default
 *   width.
 * - **Tooltip on hover**: Material's web button shows its label in a tooltip.
 *   Not built in; wrap the button in a `TooltipTrigger`.
 * - **Filled icon when selected**: a selected toggle should show the filled
 *   version of its icon. The button draws the `icon` it is given; swap it
 *   from the toggle's state.
 * - **Button groups**: neighbours that answer to each other's press.
 * - **Filled as the default colour style**: see below.
 *
 * Not Material's:
 * - **`standard` is the default colour style**; Material's is filled. Say
 *   `variant` on a button that must not move when a later release takes
 *   Material's default.
 * - **`isContained`**: `isContained={false}` on `filled` or `tonal` draws only
 *   the icon, in `primary` or `secondary`; `isContained` on `standard` draws
 *   a `surface-container-lowest` container at elevation 1, and on `outlined`
 *   a `surface` one.
 *
 * Spec: https://m3.material.io/components/icon-buttons/{overview,specs,guidelines,accessibility}
 */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (props, ref) => {
    if (props.isToggle) {
      return <ToggleIconButton {...props} ref={ref} />;
    }
    return <StandardIconButton {...props} ref={ref} />;
  },
);

IconButton.displayName = "IconButton";

/** Material's filled and tonal buttons draw their container. */
function resolveContained(
  isContained: boolean | undefined,
  variant: IconButtonVariant,
) {
  return isContained ?? (variant === "filled" || variant === "tonal");
}

type IconButtonContentProps = {
  icon: IconComponent;
  variant: IconButtonVariant;
  size: IconButtonSize;
  isContained: boolean;
  selection: IconButtonSelection;
  className?: string;
} & Partial<IconButtonRenderProps>;

function IconButtonContent({
  icon: Icon,
  variant,
  size,
  isContained,
  selection,
  className,
  isPressed,
  isHovered,
  isFocusVisible,
  isDisabled,
}: IconButtonContentProps) {
  const { icon } = styles({ variant, size, isContained, selection, isDisabled });
  return (
    <>
      {/* The root does not clip, so that the target may reach beyond it: the
          layer takes the rounding itself. */}
      <StateLayer
        color={getStateLayerColor(isContained, variant, selection)}
        isPressed={isPressed}
        isHovered={isHovered}
        isFocusVisible={isFocusVisible}
        className="rounded-[inherit]"
      />
      <span data-slot="icon-button-icon" className={icon({ className })}>
        <Icon size={iconSizes[size]} />
      </span>
    </>
  );
}

const StandardIconButton = forwardRef<
  HTMLButtonElement,
  StandardIconButtonProps
>((props, ref) => {
  const {
    className,
    classNames,
    isContained: isContainedProp,
    variant = "standard",
    size = "small",
    icon,
    "aria-label": ariaLabel,
    href,
    target,
    rel,
    routerOptions,
    download,
    ...buttonProps
  } = props;
  const isContained = resolveContained(isContainedProp, variant);

  const baseStyles = composeRenderProps(
    className,
    (className, { isDisabled }: IconButtonRenderProps) =>
      styles({ variant, size, isContained, isDisabled }).base({ className }),
  );

  const content = (renderProps: IconButtonRenderProps) => (
    <IconButtonContent
      {...renderProps}
      icon={icon}
      variant={variant}
      size={size}
      isContained={isContained}
      selection="none"
      className={classNames?.icon}
    />
  );

  // With `href` the icon button is a React Aria `Link` (a real `<a>`) with
  // the same anatomy and states — a "close" or "back" that navigates.
  if (href !== undefined) {
    const { isDisabled, onPress, onPressStart, onPressEnd, onPressChange } =
      buttonProps;
    return (
      <AriaLink
        data-slot="icon-button"
        data-variant={variant}
        data-size={size}
        href={href}
        target={target}
        rel={rel}
        routerOptions={routerOptions}
        download={download}
        isDisabled={isDisabled}
        onPress={onPress}
        onPressStart={onPressStart}
        onPressEnd={onPressEnd}
        onPressChange={onPressChange}
        className={baseStyles}
        aria-label={ariaLabel}
        ref={ref as unknown as React.Ref<HTMLAnchorElement>}
      >
        {content}
      </AriaLink>
    );
  }

  return (
    <AriaButton
      data-slot="icon-button"
      data-variant={variant}
      data-size={size}
      {...buttonProps}
      className={baseStyles}
      aria-label={ariaLabel}
      ref={ref}
    >
      {content}
    </AriaButton>
  );
});

StandardIconButton.displayName = "StandardIconButton";

const ToggleIconButton = forwardRef<HTMLButtonElement, ToggleIconButtonProps>(
  (props, ref) => {
    const {
      isContained: isContainedProp,
      variant = "standard",
      size = "small",
      className,
      classNames,
      icon,
      isSelected,
      "aria-label": ariaLabel,
      ...toggleButtonProps
    } = props;
    const isContained = resolveContained(isContainedProp, variant);

    const baseStyles = composeRenderProps(
      className,
      (className, { isSelected, isDisabled }) =>
        styles({
          variant,
          size,
          isContained,
          isDisabled,
          selection: isSelected ? "selected" : "unselected",
        }).base({ className }),
    );

    return (
      <AriaToggleButton
        data-slot="icon-button"
        data-variant={variant}
        data-size={size}
        {...toggleButtonProps}
        // Only a controlled toggle hands `isSelected` on: `undefined` would
        // be read as uncontrolled anyway, and `false` must not be invented.
        {...(isSelected !== undefined ? { isSelected } : {})}
        className={baseStyles}
        aria-label={ariaLabel}
        ref={ref}
      >
        {(renderProps) => (
          <IconButtonContent
            {...renderProps}
            icon={icon}
            variant={variant}
            size={size}
            isContained={isContained}
            selection={renderProps.isSelected ? "selected" : "unselected"}
            className={classNames?.icon}
          />
        )}
      </AriaToggleButton>
    );
  },
);

ToggleIconButton.displayName = "ToggleIconButton";

// The layer tints with the content colour of the state it is drawn in: a
// primary-coloured layer over a `bg-primary` button would be invisible.
function getStateLayerColor(
  isContained: boolean,
  variant: IconButtonVariant,
  selection: IconButtonSelection,
): StateLayerColor {
  const isSelected = selection === "selected";
  if (variant === "outlined" && isSelected) return "inverse-on-surface";
  if (isContained) {
    switch (variant) {
      case "filled":
        return selection === "unselected" ? "on-surface-variant" : "on-primary";
      case "tonal":
        return isSelected ? "on-secondary" : "on-secondary-container";
      case "standard":
        return isSelected ? "on-secondary-container" : "on-surface";
      default:
        return "on-surface";
    }
  }
  switch (variant) {
    case "filled":
      return "primary";
    case "tonal":
      return "secondary";
    case "standard":
      return isSelected ? "primary" : "on-surface-variant";
    default:
      return "on-surface-variant";
  }
}

export default IconButton;
export { IconButton };
