"use client";

import { forwardRef } from "react";
import { focusRing, tv, type VariantProps } from "../utils";
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
      "relative inline-flex items-center justify-center rounded-shape-full text-sm font-medium transition-colors duration-short-4 overflow-hidden w-10 h-10 p-0",
    ],
    icon: "",
  },
  variants: {
    variant: {
      standard: {},
      filled: {},
      tonal: {},
      outlined: {},
    },
    isContained: {
      false: {},
      true: {},
    },
    isDisabled: {
      true: {
        base: "opacity-38 pointer-events-none",
      },
    },
    isSelected: {
      true: {},
      false: {},
    },
  },
  compoundVariants: [
    {
      isContained: false,
      variant: "standard",
      class: {
        base: "bg-transparent",
        icon: "text-on-surface-variant",
      },
    },
    {
      isContained: false,
      variant: "filled",
      class: {
        base: "bg-transparent",
        icon: "text-primary",
      },
    },
    {
      isContained: false,
      variant: "tonal",
      class: {
        base: "bg-transparent",
        icon: "text-secondary",
      },
    },
    {
      isContained: false,
      variant: "outlined",
      class: {
        base: "bg-transparent border border-outline",
        icon: "text-on-surface-variant",
      },
    },
    {
      isContained: true,
      variant: "standard",
      class: {
        base: "bg-surface-container-lowest shadow-elevation-1", // Added subtle elevation
        icon: "text-on-surface",
      },
    },
    {
      isContained: true,
      variant: "filled",
      class: {
        base: "bg-primary",
        icon: "text-on-primary",
      },
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
      class: {
        base: "bg-surface border border-outline",
        icon: "text-on-surface",
      },
    },
    // Selected state variants
    {
      isSelected: true,
      isContained: false,
      variant: "standard",
      class: {
        icon: "text-primary",
      },
    },
    {
      isSelected: true,
      isContained: false,
      variant: "filled",
      class: {
        icon: "text-primary",
      },
    },
    {
      isSelected: true,
      isContained: false,
      variant: "tonal",
      class: {
        icon: "text-secondary",
      },
    },
    {
      isSelected: true,
      isContained: true,
      variant: "standard",
      class: {
        base: "bg-secondary-container",
        icon: "text-on-secondary-container",
      },
    },
    {
      isSelected: true,
      isContained: true,
      variant: "filled",
      class: {
        base: "bg-primary",
        icon: "text-on-primary",
      },
    },
    {
      isSelected: true,
      isContained: true,
      variant: "tonal",
      class: {
        base: "bg-secondary-container",
        icon: "text-on-secondary-container",
      },
    },
  ],
  defaultVariants: {
    variant: "standard",
    isContained: false,
    isDisabled: false,
    isSelected: false,
  },
});

type BaseIconButtonProps = Omit<
  VariantProps<typeof styles>,
  "isDisabled" | "isSelected"
> & {
  icon: IconComponent;
  "aria-label": string;
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

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (props, ref) => {
    if (props.isToggle) {
      return <ToggleIconButton {...props} ref={ref} />;
    }
    return <StandardIconButton {...props} ref={ref} />;
  },
);

IconButton.displayName = "IconButton";

const StandardIconButton = forwardRef<
  HTMLButtonElement,
  StandardIconButtonProps
>((props, ref) => {
  const {
    className,
    isContained = false,
    variant = "standard",
    icon: Icon,
    "aria-label": ariaLabel,
    href,
    target,
    rel,
    routerOptions,
    download,
    ...buttonProps
  } = props;

  const { base, icon } = styles({ isContained, variant });

  const baseStyles = composeRenderProps(
    className,
    (className, renderProps: IconButtonRenderProps) =>
      base({ ...renderProps, className }),
  );

  const content = ({
    isPressed,
    isHovered,
    isFocusVisible,
  }: IconButtonRenderProps) => (
    <>
      <StateLayer
        color={getStateLayerColor(isContained, variant, false)}
        isPressed={isPressed}
        isHovered={isHovered}
        isFocusVisible={isFocusVisible}
      />
      <Icon className={icon()} size={24} />
    </>
  );

  // With `href` the icon button is a React Aria `Link` (a real `<a>`) with
  // the same anatomy and states — a "close" or "back" that navigates.
  if (href !== undefined) {
    const { isDisabled, onPress, onPressStart, onPressEnd, onPressChange } =
      buttonProps;
    return (
      <AriaLink
        data-slot="icon-button"
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
      isContained = false,
      variant = "standard",
      className,
      icon: Icon,
      isSelected = false,
      "aria-label": ariaLabel,
      ...toggleButtonProps
    } = props;

    const { base, icon } = styles({ isContained, variant, isSelected });

    const baseStyles = composeRenderProps(className, (className, renderProps) =>
      base({ ...renderProps, className }),
    );

    return (
      <AriaToggleButton
        data-slot="icon-button"
        {...toggleButtonProps}
        className={baseStyles}
        aria-label={ariaLabel}
        ref={ref}
      >
        {({ isPressed, isHovered, isSelected, isFocusVisible }) => (
          <>
            <StateLayer
              color={getStateLayerColor(isContained, variant, isSelected)}
              isPressed={isPressed}
              isHovered={isHovered}
              isFocusVisible={isFocusVisible}
            />
            <Icon className={icon({ isSelected })} size={24} />
          </>
        )}
      </AriaToggleButton>
    );
  },
);

ToggleIconButton.displayName = "ToggleIconButton";

function getStateLayerColor(
  isContained: boolean,
  variant: string,
  isSelected: boolean,
): StateLayerColor {
  if (isContained) {
    // The layer must tint with the content ("on-*") color: a primary-colored
    // layer over a bg-primary button would be invisible.
    switch (variant) {
      case "filled":
        return "on-primary";
      case "tonal":
        return "on-secondary-container";
      default:
        return "on-surface";
    }
  } else {
    if (isSelected) {
      return variant === "standard" ? "primary" : "on-surface-variant";
    } else {
      switch (variant) {
        case "filled":
          return "primary";
        case "tonal":
          return "secondary";
        default:
          return "on-surface-variant";
      }
    }
  }
}

export default IconButton;
export { IconButton };
