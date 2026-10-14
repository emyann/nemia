"use client";

import { forwardRef, useContext } from "react";
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
import {
  ButtonGroupContext,
  type ButtonSize,
  connectedItemStyles,
  standardPressedIconButtonStyles,
} from "./ButtonGroup";
import { Badge, badgeAccessibleText, type BadgeValue } from "./Badge";

const styles = tv({
  slots: {
    base: [
      focusRing(),
      "relative inline-flex shrink-0 items-center justify-center rounded-shape-full transition-all duration-short-4 ease-standard p-0",
    ],
    // Positioned, so a badge is anchored on the icon's corner.
    icon: "relative inline-flex",
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
    variant: "filled",
    size: "small",
    isContained: false,
    selection: "none",
    isDisabled: false,
  },
});

type IconButtonVariant = "standard" | "filled" | "tonal" | "outlined";
type IconButtonSize = ButtonSize;
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
  /** The colour style. Default `filled`, Material's. */
  variant?: IconButtonVariant;
  /**
   * Material's five sizes: 32, 40, 56, 96 and 136 pixels square. Default
   * `small`, Material's, or the size of the group the button is in.
   */
  size?: IconButtonSize;
  /**
   * Draws the container. Left out, `filled` and `tonal` draw theirs, as
   * Material's do, and `standard` and `outlined` draw none.
   */
  isContained?: boolean;
  icon: IconComponent;
  "aria-label": string;
  /**
   * A badge on the icon: a count, a short status, or `true` for the small
   * dot. Its words are joined to `aria-label` ("Notifications, 3").
   */
  badge?: BadgeValue;
  /** What the badge says to a screen reader, when the count alone is not
      enough ("3 unread"). */
  badgeLabel?: string;
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
 * cuts the target at its edge: a `Table` does, so a button in its last row
 * answers down to the table's edge and no further.
 *
 * In a `ButtonGroup` it takes the group's size where it sets none, and the
 * group's corners (connected) or pressed width (standard).
 *
 * **Badge.** `badge` draws the kit's `Badge` on the icon's top trailing
 * corner, and its words follow the label in the button's name ("Notifications,
 * 3"; "Notifications, New notification" for `badge` true), as Material's
 * badges page asks. Material suggests the small badge where room is tight, as
 * in an app bar.
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
 *
 * Not Material's:
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

/** The size an icon button draws at, and what its group adds. */
function useGroupLayout(sizeProp: IconButtonSize | undefined) {
  const group = useContext(ButtonGroupContext);
  const size = sizeProp ?? group?.size ?? "small";
  const groupStyles =
    group?.variant === "connected"
      ? connectedItemStyles[size]
      : group?.variant === "standard"
        ? standardPressedIconButtonStyles[size]
        : "";
  return { size, groupStyles };
}

/** The button's name with its badge's words after it. */
function nameWithBadge(
  ariaLabel: string,
  badge: BadgeValue | undefined,
  badgeLabel: string | undefined,
) {
  const text = badgeAccessibleText(badge, badgeLabel);
  return text === undefined ? ariaLabel : `${ariaLabel}, ${text}`;
}

/** Material's filled and tonal buttons draw their container. */
function resolveContained(
  isContained: boolean | undefined,
  variant: IconButtonVariant,
) {
  return isContained ?? (variant === "filled" || variant === "tonal");
}

type IconButtonContentProps = {
  icon: IconComponent;
  badge?: BadgeValue;
  variant: IconButtonVariant;
  size: IconButtonSize;
  isContained: boolean;
  selection: IconButtonSelection;
  className?: string;
} & Partial<IconButtonRenderProps>;

function IconButtonContent({
  icon: Icon,
  badge,
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
        {badge !== undefined ? <Badge value={badge} anchored /> : null}
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
    variant = "filled",
    size: sizeProp,
    icon,
    badge,
    badgeLabel,
    "aria-label": label,
    href,
    target,
    rel,
    routerOptions,
    download,
    ...buttonProps
  } = props;
  const isContained = resolveContained(isContainedProp, variant);
  const { size, groupStyles } = useGroupLayout(sizeProp);
  const ariaLabel = nameWithBadge(label, badge, badgeLabel);

  const baseStyles = composeRenderProps(
    className,
    (className, { isDisabled }: IconButtonRenderProps) =>
      styles({ variant, size, isContained, isDisabled }).base({
        className: [groupStyles, className],
      }),
  );

  const content = (renderProps: IconButtonRenderProps) => (
    <IconButtonContent
      {...renderProps}
      icon={icon}
      badge={badge}
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
      variant = "filled",
      size: sizeProp,
      className,
      classNames,
      icon,
      badge,
      badgeLabel,
      isSelected,
      "aria-label": label,
      ...toggleButtonProps
    } = props;
    const isContained = resolveContained(isContainedProp, variant);
    const { size, groupStyles } = useGroupLayout(sizeProp);
    const ariaLabel = nameWithBadge(label, badge, badgeLabel);

    const baseStyles = composeRenderProps(
      className,
      (className, { isSelected, isDisabled }) =>
        styles({
          variant,
          size,
          isContained,
          isDisabled,
          selection: isSelected ? "selected" : "unselected",
        }).base({ className: [groupStyles, className] }),
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
            badge={badge}
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
