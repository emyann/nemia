"use client";

import * as React from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
  type ButtonRenderProps as AriaButtonRenderProps,
  Link as AriaLink,
  type LinkProps as AriaLinkProps,
  composeRenderProps,
} from "react-aria-components";
import { focusRing, tv, type VariantProps } from "../utils";
import { type IconComponent, SpinnerIcon } from "../icons";
import { Label } from "../primitives/Typography";

const styles = tv({
  slots: {
    base: [
      focusRing(),
      "group/button relative inline-flex items-center justify-center font-medium transition-all duration-short-4 overflow-hidden",
    ],
    stateLayer: [
      "absolute inset-0 transition pointer-events-none",
      "bg-primary opacity-0 group-hover/button:state-opacity-hover group-data-focus-visible/button:state-opacity-focus group-data-pressed/button:state-opacity-pressed group-data-dragging/button:state-opacity-dragged",
    ],
    icon: "",
    label: "grow",
  },
  variants: {
    variant: {
      filled: {
        base: "bg-primary text-on-primary rounded-shape-full",
        icon: "text-on-primary",
        label: "text-on-primary",
        stateLayer: "bg-on-primary",
      },
      outlined: {
        base: "border border-outline bg-transparent text-primary rounded-shape-full",
        icon: "text-primary",
        label: "text-primary",
      },
      text: {
        base: "bg-transparent text-primary rounded-shape-full",
        icon: "text-primary",
        label: "text-primary",
      },
      elevated: {
        base: "bg-surface-container-low text-primary shadow-elevation-1 rounded-shape-full",
        icon: "text-primary",
        label: "text-primary",
      },
      tonal: {
        base: "bg-secondary-container text-on-secondary-container rounded-shape-full",
        icon: "text-on-secondary-container",
        label: "text-on-secondary-container",
        stateLayer: "bg-on-secondary-container",
      },
      fab: {
        base: "bg-primary text-on-primary shadow-elevation-3 rounded-shape-full transition-shadow hover:shadow-elevation-4",
        icon: "text-on-primary",
        label: "text-on-primary",
        stateLayer: "bg-on-primary",
      },
    },
    size: {
      small: {
        base: "text-sm h-8 px-4",
        icon: "mr-2 text-sm",
      },
      medium: {
        base: "text-sm h-10 px-6",
        icon: "mr-2",
      },
      large: {
        base: "text-base h-12 px-8",
        icon: "mr-3",
      },
    },
    isDisabled: {
      true: {
        base: "opacity-38 pointer-events-none",
      },
    },
    // Colour role the button is drawn in. `error` is the kit's destructive
    // button: MD3 has none, so it is the same anatomy on the error pair
    // (filled = error / on-error, tonal = error-container, outlined and
    // text = error content). Reserve it for actions that delete or cancel.
    color: {
      primary: {},
      error: {},
    },
  },
  compoundVariants: [
    {
      color: "error",
      variant: "filled",
      class: {
        base: "bg-error text-on-error",
        icon: "text-on-error",
        label: "text-on-error",
        stateLayer: "bg-on-error",
      },
    },
    {
      color: "error",
      variant: "tonal",
      class: {
        base: "bg-error-container text-on-error-container",
        icon: "text-on-error-container",
        label: "text-on-error-container",
        stateLayer: "bg-on-error-container",
      },
    },
    {
      color: "error",
      variant: "outlined",
      class: {
        base: "border-error text-error",
        icon: "text-error",
        label: "text-error",
        stateLayer: "bg-error",
      },
    },
    {
      color: "error",
      variant: "text",
      class: {
        base: "text-error",
        icon: "text-error",
        label: "text-error",
        stateLayer: "bg-error",
      },
    },
    {
      color: "error",
      variant: "elevated",
      class: {
        base: "text-error",
        icon: "text-error",
        label: "text-error",
        stateLayer: "bg-error",
      },
    },
    // FAB sizes
    {
      variant: "fab",
      size: "small",
      class: { base: "w-10 h-10 p-0", icon: "mr-0" },
    },
    {
      variant: "fab",
      size: "medium",
      class: { base: "w-14 h-14 p-0", icon: "mr-0" },
    },
    {
      variant: "fab",
      size: "large",
      class: { base: "w-24 h-24 p-0", icon: "mr-0" },
    },
  ],
  defaultVariants: {
    variant: "filled",
    size: "medium",
    isDisabled: false,
    color: "primary",
  },
});

/** The interaction states the button styles read — common to React Aria's
 *  `Button` and `Link` render props, so one `className` fits both. */
type ButtonRenderProps = Pick<
  AriaButtonRenderProps,
  "isHovered" | "isPressed" | "isFocused" | "isFocusVisible" | "isDisabled"
>;

export type ButtonProps = Omit<AriaButtonProps, "className"> &
  Pick<
    AriaLinkProps,
    "href" | "target" | "rel" | "routerOptions" | "download"
  > &
  VariantProps<typeof styles> & {
    children?: React.ReactNode;
    /** Leading icon component, e.g. any lucide-react icon. */
    icon?: IconComponent;
    isLoading?: boolean;
    className?: string | ((renderProps: ButtonRenderProps) => string);
  };

/**
 * MD3 common button. Passing `variant="fab"` with children renders an
 * extended FAB. With `href` it is a React Aria `Link` — a real `<a>` routed
 * through the app's router provider — drawn exactly like the button, for
 * navigation that reads as an action ("Open app", "Skip"). `color="error"`
 * is the destructive button (see the styles).
 *
 * Spec: https://m3.material.io/components/buttons/{overview,specs,guidelines,accessibility};
 * the `fab` variant:
 * https://m3.material.io/components/floating-action-button/{overview,specs,guidelines,accessibility}
 * and https://m3.material.io/components/extended-fab/{overview,specs,guidelines,accessibility}
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => {
    const {
      className,
      children,
      isLoading,
      variant = "filled",
      size = "medium",
      color = "primary",
      icon: Icon,
      href,
      target,
      rel,
      routerOptions,
      download,
      ...buttonProps
    } = props;

    const isFab = variant === "fab";
    const isExtendedFab = isFab && children !== undefined;

    const { base, icon, label, stateLayer } = styles({ variant, size, color });

    const baseStyles = composeRenderProps(
      className,
      (className, renderProps: ButtonRenderProps) =>
        base({
          ...renderProps,
          className: `${className ?? ""} ${
            isExtendedFab
              ? "rounded-shape-large px-4 w-auto h-auto min-h-[56px] py-2"
              : ""
          }`.trim(),
        }),
    );

    const content = (
      <>
        <div data-slot="state-layer" className={stateLayer()} />
        <div className="relative flex items-center justify-center">
          {isLoading ? (
            <SpinnerIcon
              className={icon({
                className: `animate-spin ${isExtendedFab ? "mr-2" : ""}`,
              })}
              size={isFab ? 24 : 18}
            />
          ) : (
            Icon && (
              <Icon
                className={icon({ className: isExtendedFab ? "mr-2" : "" })}
                size={isFab ? 24 : 18}
              />
            )
          )}
          {(!isFab || isExtendedFab) && (
            <Label className={label()} size="large" component="span">
              {children}
            </Label>
          )}
        </div>
      </>
    );

    if (href !== undefined) {
      const { isDisabled, onPress, onPressStart, onPressEnd, onPressChange } =
        buttonProps;
      return (
        <AriaLink
          data-slot="button"
          data-variant={variant}
          data-size={size}
          data-color={color}
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
          // The public ref type stays the button's; an anchor is what lands
          // in it when `href` is set.
          ref={ref as unknown as React.Ref<HTMLAnchorElement>}
        >
          {content}
        </AriaLink>
      );
    }

    return (
      <AriaButton
        data-slot="button"
        data-variant={variant}
        data-size={size}
        data-color={color}
        {...buttonProps}
        className={baseStyles}
        ref={ref}
      >
        {content}
      </AriaButton>
    );
  },
);

Button.displayName = "Button";

export default Button;
export { Button };
