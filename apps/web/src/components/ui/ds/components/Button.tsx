"use client";

import * as React from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
  type ButtonRenderProps as AriaButtonRenderProps,
  Link as AriaLink,
  type LinkProps as AriaLinkProps,
  ToggleButton as AriaToggleButton,
  type ToggleButtonProps as AriaToggleButtonProps,
  composeRenderProps,
} from "react-aria-components";
import { focusRing, tv } from "../utils";
import { type IconComponent, SpinnerIcon } from "../icons";
import {
  ButtonGroupContext,
  type ButtonSize,
  connectedItemStyles,
  splitItemStyles,
  standardPressedButtonStyles,
} from "./ButtonGroup";

const styles = tv({
  slots: {
    base: [
      focusRing(),
      // The root does not clip, so that the target of the two smaller sizes
      // may reach beyond it: the state layer takes the rounding itself.
      "group/button relative inline-flex shrink-0 items-center justify-center transition-all duration-short-4 ease-standard",
    ],
    stateLayer: [
      "absolute inset-0 rounded-[inherit] transition pointer-events-none",
      "bg-primary opacity-0 group-hover/button:state-opacity-hover group-data-focus-visible/button:state-opacity-focus group-data-pressed/button:state-opacity-pressed group-data-dragging/button:state-opacity-dragged",
    ],
    content: "relative flex items-center justify-center",
    icon: "shrink-0",
    label: "grow",
  },
  variants: {
    variant: {
      filled: {
        base: "bg-primary text-on-primary hover:shadow-elevation-1",
        stateLayer: "bg-on-primary",
      },
      // `md.comp.button.outlined.*`: an outline-variant outline round
      // on-surface-variant content.
      outlined: {
        base: "border border-outline-variant bg-transparent text-on-surface-variant",
        stateLayer: "bg-on-surface-variant",
      },
      text: {
        base: "bg-transparent text-primary",
      },
      elevated: {
        base: "bg-surface-container-low text-primary shadow-elevation-1 hover:shadow-elevation-2",
      },
      tonal: {
        base: "bg-secondary-container text-on-secondary-container hover:shadow-elevation-1",
        stateLayer: "bg-on-secondary-container",
      },
      fab: {
        base: "bg-primary text-on-primary shadow-elevation-3 rounded-shape-full hover:shadow-elevation-4",
        stateLayer: "bg-on-primary",
      },
    },
    // `md.comp.button.<size>.*`: height, side padding, icon-to-label space
    // and label role. The FAB's sizes are its own (compounds below).
    size: {
      xsmall: {
        base: "h-8 px-3 before:absolute before:top-1/2 before:left-1/2 before:h-12 before:w-[max(100%,3rem)] before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
        content: "gap-1",
        label: "text-label-large font-label-large",
      },
      small: {
        base: "h-10 px-4 before:absolute before:top-1/2 before:left-1/2 before:h-12 before:w-[max(100%,3rem)] before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
        content: "gap-2",
        label: "text-label-large font-label-large",
      },
      medium: {
        base: "h-14 px-6",
        content: "gap-2",
        label: "text-title-medium font-title-medium",
      },
      large: {
        base: "h-24 px-12",
        content: "gap-3",
        label: "text-headline-small font-headline-small",
      },
      xlarge: {
        base: "h-34 px-16",
        content: "gap-4",
        label: "text-headline-large font-headline-large",
      },
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
      class: { base: "bg-error text-on-error", stateLayer: "bg-on-error" },
    },
    {
      color: "error",
      variant: "tonal",
      class: {
        base: "bg-error-container text-on-error-container",
        stateLayer: "bg-on-error-container",
      },
    },
    {
      color: "error",
      variant: ["outlined", "text", "elevated"],
      class: { base: "text-error", stateLayer: "bg-error" },
    },
    { color: "error", variant: "outlined", class: { base: "border-error" } },
    // The outline's width follows the size.
    { variant: "outlined", size: "large", class: { base: "border-2" } },
    { variant: "outlined", size: "xlarge", class: { base: "border-3" } },
    // Toggle colours, `md.comp.button.<variant>.(un)selected.*`.
    {
      variant: "filled",
      selection: "unselected",
      class: {
        base: "bg-surface-container text-on-surface-variant",
        stateLayer: "bg-on-surface-variant",
      },
    },
    {
      variant: "tonal",
      selection: "selected",
      class: { base: "bg-secondary text-on-secondary", stateLayer: "bg-on-secondary" },
    },
    {
      variant: "outlined",
      selection: "selected",
      class: {
        base: "bg-inverse-surface text-inverse-on-surface border-transparent",
        stateLayer: "bg-inverse-on-surface",
      },
    },
    {
      variant: "elevated",
      selection: "selected",
      class: { base: "bg-primary text-on-primary", stateLayer: "bg-on-primary" },
    },
    // FAB sizes: square, the icon alone.
    { variant: "fab", size: "small", class: { base: "w-10 h-10 p-0" } },
    { variant: "fab", size: "medium", class: { base: "w-14 h-14 p-0" } },
    { variant: "fab", size: "large", class: { base: "w-24 h-24 p-0" } },
    // Disabled (`md.comp.button.disabled.*`): content `on-surface` at 38 %,
    // a drawn container `on-surface` at 10 %, an outline at 12 %, no
    // elevation.
    {
      isDisabled: true,
      class: {
        base: "pointer-events-none bg-on-surface/10 text-on-surface/38 shadow-none",
      },
    },
    { isDisabled: true, variant: "text", class: { base: "bg-transparent" } },
    {
      isDisabled: true,
      variant: "outlined",
      class: { base: "bg-transparent border-on-surface/12" },
    },
  ],
  defaultVariants: {
    variant: "filled",
    size: "small",
    selection: "none",
    isDisabled: false,
    color: "primary",
  },
});

/**
 * Corners by shape and size (`md.comp.button.<size>.container.shape.*`,
 * `.pressed.container.shape`, `.selected.container.shape.*`): a pressed
 * button squares a little, a selected round one turns square and a selected
 * square one turns round. Written out: Tailwind sees only whole class names.
 */
const cornerStyles: Record<ButtonShape, Record<ButtonSize, string>> = {
  round: {
    xsmall:
      "rounded-shape-full data-pressed:rounded-shape-small data-selected:not-data-pressed:rounded-shape-medium",
    small:
      "rounded-shape-full data-pressed:rounded-shape-small data-selected:not-data-pressed:rounded-shape-medium",
    medium:
      "rounded-shape-full data-pressed:rounded-shape-medium data-selected:not-data-pressed:rounded-shape-large",
    large:
      "rounded-shape-full data-pressed:rounded-shape-large data-selected:not-data-pressed:rounded-shape-extra-large",
    xlarge:
      "rounded-shape-full data-pressed:rounded-shape-large data-selected:not-data-pressed:rounded-shape-extra-large",
  },
  square: {
    xsmall:
      "rounded-shape-medium data-pressed:rounded-shape-small data-selected:not-data-pressed:rounded-shape-full",
    small:
      "rounded-shape-medium data-pressed:rounded-shape-small data-selected:not-data-pressed:rounded-shape-full",
    medium:
      "rounded-shape-large data-pressed:rounded-shape-medium data-selected:not-data-pressed:rounded-shape-full",
    large:
      "rounded-shape-extra-large data-pressed:rounded-shape-large data-selected:not-data-pressed:rounded-shape-full",
    xlarge:
      "rounded-shape-extra-large data-pressed:rounded-shape-large data-selected:not-data-pressed:rounded-shape-full",
  },
};

/** `md.comp.button.<size>.icon.size`. */
const iconSizes: Record<ButtonSize, number> = {
  xsmall: 20,
  small: 20,
  medium: 24,
  large: 32,
  xlarge: 40,
};

type ButtonShape = "round" | "square";
type CommonVariant = "filled" | "outlined" | "text" | "elevated" | "tonal";
type FabSize = "small" | "medium" | "large";

/** The interaction states the button styles read — common to React Aria's
 *  `Button` and `Link` render props, so one `className` fits both. */
type ButtonRenderProps = Pick<
  AriaButtonRenderProps,
  "isHovered" | "isPressed" | "isFocused" | "isFocusVisible" | "isDisabled"
>;

type BaseButtonProps = {
  children?: React.ReactNode;
  /** Leading icon component, e.g. any lucide-react icon. With no children
   *  the button draws the icon alone, and takes an `aria-label`. */
  icon?: IconComponent;
  isLoading?: boolean;
  /**
   * `round` (default) or `square`, Material's two shapes. A FAB keeps its
   * own corners.
   */
  shape?: ButtonShape;
  color?: "primary" | "error";
  /** Classes for the named parts. */
  classNames?: { icon?: string; label?: string };
};

type CommonSizing =
  | {
      variant?: CommonVariant;
      /**
       * Material's five sizes: 32, 40, 56, 96 and 136 pixels tall. Default
       * `small` (40), Material's, or the size of the group the button is in.
       */
      size?: ButtonSize;
    }
  | {
      variant: "fab";
      /** The FAB's three sizes: 40, 56 (default) and 96 pixels square. */
      size?: FabSize;
    };

type StandardButtonProps = BaseButtonProps &
  CommonSizing &
  Omit<AriaButtonProps, "className" | "children"> &
  Pick<AriaLinkProps, "href" | "target" | "rel" | "routerOptions" | "download"> & {
    isToggle?: false;
    className?: string | ((renderProps: ButtonRenderProps) => string);
  };

type ToggleButtonProps = Omit<BaseButtonProps, "color"> &
  Omit<AriaToggleButtonProps, "className" | "children"> & {
    /** A toggle: `isSelected`/`defaultSelected`, `onChange`. A text button
     *  cannot toggle (Material gives it no selected state). */
    isToggle: true;
    variant?: Exclude<CommonVariant, "text">;
    size?: ButtonSize;
    className?:
      | string
      | ((renderProps: ButtonRenderProps & { isSelected: boolean }) => string);
  };

export type ButtonProps = StandardButtonProps | ToggleButtonProps;

/**
 * MD3 common button, in Material's five colour styles (`variant`: filled,
 * outlined, text, elevated, tonal), five sizes (`size`) and two shapes
 * (`shape`), as a button, a link with `href`, or a toggle with `isToggle`.
 * `variant="fab"` is the FAB, and with children the extended FAB.
 * `color="error"` is the destructive button (see the styles).
 *
 * | `size` | height | side padding | icon | icon–label | label | outline |
 * | --- | --- | --- | --- | --- | --- | --- |
 * | `xsmall` | 32dp | 12dp | 20dp | 4dp | label-large | 1dp |
 * | `small` (default) | 40dp | 16dp | 20dp | 8dp | label-large | 1dp |
 * | `medium` | 56dp | 24dp | 24dp | 8dp | title-medium | 1dp |
 * | `large` | 96dp | 48dp | 32dp | 12dp | headline-small | 2dp |
 * | `xlarge` | 136dp | 64dp | 40dp | 16dp | headline-large | 3dp |
 *
 * Corners: `round` is full; `square` is 12/12/16/28/28dp. Pressed, both
 * shapes take 8/8/12/16/16dp; selected, a round toggle turns square and a
 * square one round. Toggle colours are Material's per style: filled
 * unselected `surface-container` on `on-surface-variant`, selected
 * `primary`; tonal selected `secondary`; outlined selected `inverse-surface`;
 * elevated selected `primary`. Disabled, the content is `on-surface` at
 * 38 %, a drawn container `on-surface` at 10 %, an outline at 12 %.
 *
 * **Target.** `xsmall` and `small` are drawn under Material's 48dp target, so
 * each answers over an invisible area 48 pixels tall (and at least 48 wide)
 * centred on it. Leave that much room around it.
 *
 * In a `ButtonGroup` it takes the group's size where it sets none, and the
 * group's corners and pressed width.
 *
 * Parts, each with its `data-slot` and its key in `classNames`: `icon`
 * (`button-icon`), `label` (`button-label`). The root is
 * `data-slot="button"` with `data-variant`, `data-size` and `data-shape`,
 * and takes `className`.
 *
 * Deviations, by name:
 * - **Shape motion.** Material morphs corners on a spring (stiffness 1400,
 *   damping 0.9); here they ease with `ease-standard` over
 *   `duration-short-4`.
 * - **Widths.** Material's narrow, default and wide widths for icon-only
 *   buttons are not built; an icon-only button is as wide as its padding.
 *
 * Spec: https://m3.material.io/components/buttons/{overview,specs,guidelines,accessibility};
 * the `fab` variant:
 * https://m3.material.io/components/floating-action-button/{overview,specs,guidelines,accessibility}
 * and https://m3.material.io/components/extended-fab/{overview,specs,guidelines,accessibility}
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => {
    if (props.isToggle) return <ToggleCommonButton {...props} ref={ref} />;
    return <StandardButton {...props} ref={ref} />;
  },
);

Button.displayName = "Button";

/** The size, shape and group a button draws with. */
function useButtonLayout(
  variant: CommonVariant | "fab",
  sizeProp: ButtonSize | undefined,
  shape: ButtonShape,
) {
  const group = React.useContext(ButtonGroupContext);
  const isFab = variant === "fab";
  const size: ButtonSize = sizeProp ?? (isFab ? "medium" : group?.size ?? "small");
  const corners = isFab
    ? ""
    : group?.variant === "connected"
      ? connectedItemStyles[size]
      : group?.variant === "split"
        ? splitItemStyles[size]
        : `${cornerStyles[shape][size]} ${
          group?.variant === "standard" ? standardPressedButtonStyles[size] : ""
        }`;
  return { size, corners };
}

type ContentProps = {
  styleProps: Parameters<typeof styles>[0];
  size: ButtonSize;
  icon?: IconComponent;
  isLoading?: boolean;
  isFab: boolean;
  isExtendedFab: boolean;
  children?: React.ReactNode;
  classNames?: BaseButtonProps["classNames"];
};

function ButtonContent({
  styleProps,
  size,
  icon: Icon,
  isLoading,
  isFab,
  isExtendedFab,
  children,
  classNames,
}: ContentProps) {
  const { stateLayer, content, icon, label } = styles(styleProps);
  const iconSize = isFab ? 24 : iconSizes[size];
  const hasLabel = isExtendedFab || (!isFab && children !== undefined);
  return (
    <>
      <div data-slot="state-layer" className={stateLayer()} />
      <div className={content({ className: isExtendedFab ? "gap-2" : "" })}>
        {isLoading ? (
          <SpinnerIcon
            className={icon({ className: `animate-spin ${classNames?.icon ?? ""}` })}
            size={iconSize}
          />
        ) : (
          Icon && (
            <span data-slot="button-icon" className={icon({ className: `inline-flex ${classNames?.icon ?? ""}` })}>
              <Icon size={iconSize} />
            </span>
          )
        )}
        {hasLabel && (
          <span
            data-slot="button-label"
            className={label({
              className: `${isExtendedFab ? "text-label-large font-label-large" : ""} ${classNames?.label ?? ""}`,
            })}
          >
            {children}
          </span>
        )}
      </div>
    </>
  );
}

const StandardButton = React.forwardRef<HTMLButtonElement, StandardButtonProps>(
  (props, ref) => {
    const {
      className,
      classNames,
      children,
      isLoading,
      variant = "filled",
      size: sizeProp,
      shape = "round",
      color = "primary",
      icon,
      href,
      target,
      rel,
      routerOptions,
      download,
      ...buttonProps
    } = props;

    const isFab = variant === "fab";
    const isExtendedFab = isFab && children !== undefined;
    const { size, corners } = useButtonLayout(variant, sizeProp, shape);

    const baseStyles = composeRenderProps(
      className,
      (className, renderProps: ButtonRenderProps) =>
        styles({
          variant,
          size,
          color,
          isDisabled: renderProps.isDisabled,
        }).base({
          className: [
            corners,
            isExtendedFab
              ? "rounded-shape-large w-auto h-auto min-h-14 px-4 py-2"
              : "",
            className,
          ],
        }),
    );

    const content = (renderProps: ButtonRenderProps) => (
      <ButtonContent
        styleProps={{ variant, size, color, isDisabled: renderProps.isDisabled }}
        size={size}
        icon={icon}
        isLoading={isLoading}
        isFab={isFab}
        isExtendedFab={isExtendedFab}
        classNames={classNames}
      >
        {children}
      </ButtonContent>
    );

    const dataProps = {
      "data-slot": "button",
      "data-variant": variant,
      "data-size": size,
      "data-shape": isFab ? undefined : shape,
      "data-color": color,
    };

    if (href !== undefined) {
      const { isDisabled, onPress, onPressStart, onPressEnd, onPressChange } =
        buttonProps;
      return (
        <AriaLink
          {...dataProps}
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
          aria-label={buttonProps["aria-label"]}
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
      <AriaButton {...dataProps} {...buttonProps} className={baseStyles} ref={ref}>
        {content}
      </AriaButton>
    );
  },
);

StandardButton.displayName = "StandardButton";

const ToggleCommonButton = React.forwardRef<HTMLButtonElement, ToggleButtonProps>(
  (props, ref) => {
    const {
      className,
      classNames,
      children,
      isLoading,
      variant = "filled",
      size: sizeProp,
      shape = "round",
      icon,
      isSelected,
      ...toggleProps
    } = props;
    const { size, corners } = useButtonLayout(variant, sizeProp, shape);

    const baseStyles = composeRenderProps(
      className,
      (className, renderProps) =>
        styles({
          variant,
          size,
          isDisabled: renderProps.isDisabled,
          selection: renderProps.isSelected ? "selected" : "unselected",
        }).base({ className: [corners, className] }),
    );

    return (
      <AriaToggleButton
        data-slot="button"
        data-variant={variant}
        data-size={size}
        data-shape={shape}
        {...toggleProps}
        // Only a controlled toggle hands `isSelected` on: `undefined` would
        // be read as uncontrolled anyway, and `false` must not be invented.
        {...(isSelected !== undefined ? { isSelected } : {})}
        className={baseStyles}
        ref={ref}
      >
        {(renderProps) => (
          <ButtonContent
            styleProps={{
              variant,
              size,
              isDisabled: renderProps.isDisabled,
              selection: renderProps.isSelected ? "selected" : "unselected",
            }}
            size={size}
            icon={icon}
            isLoading={isLoading}
            isFab={false}
            isExtendedFab={false}
            classNames={classNames}
          >
            {children}
          </ButtonContent>
        )}
      </AriaToggleButton>
    );
  },
);

ToggleCommonButton.displayName = "ToggleCommonButton";

export default Button;
export { Button };
export type { ButtonSize };
