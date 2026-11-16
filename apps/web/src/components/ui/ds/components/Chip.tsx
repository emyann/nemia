"use client";

import { cn, focusRing, tv, type VariantProps } from "../utils";
import {
  Button,
  type ButtonProps,
  type ButtonRenderProps,
  Link,
  type LinkProps,
  ToggleButton,
  ToggleButtonGroup,
  type ToggleButtonGroupProps,
  type ToggleButtonProps,
  composeRenderProps,
} from "react-aria-components";
import {
  type FocusEventHandler,
  type ReactNode,
  type JSX,
  type Ref,
  useId,
} from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  type IconComponent,
  XIcon,
} from "../icons";
import { Label } from "../primitives/Typography";

const styles = tv({
  slots: {
    base: [
      focusRing(),
      "group/chip h-8 rounded-shape-small border border-outline-variant inline-flex items-center relative overflow-hidden transition-colors duration-short-4",
    ],
    stateLayer: [
      "absolute inset-0 transition pointer-events-none",
      "opacity-0 group-hover/chip:state-opacity-hover group-data-focus-visible/chip:state-opacity-focus group-data-pressed/chip:state-opacity-pressed group-data-dragging/chip:state-opacity-dragged",
    ],
    icon: "px-2",
    checkIcon: "px-2",
  },
  variants: {
    variant: {
      assist: {
        base: "bg-surface-container-low text-on-surface",
        stateLayer: "bg-on-surface",
      },
      filter: {
        base: "bg-surface-container-low text-on-surface-variant",
        stateLayer: "bg-on-surface-variant",
      },
      input: {
        base: "bg-surface-container-low text-on-surface-variant hover:bg-secondary-container hover:text-on-secondary-container hover:border-on-secondary-container focus:bg-secondary-container focus:text-on-secondary-container focus:border-on-secondary-container",
        icon: "text-on-surface-variant group-hover:text-on-secondary-container group-focus:text-on-secondary-container",
        stateLayer: "bg-on-secondary-container",
      },
    },
    hasLeadingIcon: {
      true: {
        base: "pl-0",
      },
      false: {
        base: "pl-4",
      },
    },
    hasTrailingIcon: {
      true: {
        base: "pr-0",
      },
      false: {
        base: "pr-4",
      },
    },
    isSelected: {
      true: "",
      false: "",
    },
    isDisabled: {
      true: {
        base: "border-on-surface/12 text-on-surface/38 bg-on-surface/12",
        icon: "text-on-surface/38",
      },
    },
  },
  compoundVariants: [
    {
      isSelected: true,
      class: {
        base: "border-secondary-container border-0 text-on-secondary-container bg-secondary-container",
        icon: "text-on-secondary-container",
      },
    },
    {
      hasLeadingIcon: true,
      isSelected: false,
      class: {
        icon: "text-primary",
      },
    },
    {
      variant: "filter",
      hasLeadingIcon: false,
      isSelected: false,
      class: {
        icon: "text-on-surface-variant",
      },
    },
    {
      isDisabled: true,
      isSelected: true,
      class: {
        base: "bg-on-surface/12 border-0",
      },
    },
    {
      variant: "input",
      isSelected: true,
      class: {
        base: "bg-secondary-container text-on-secondary-container border-on-secondary-container",
        icon: "text-on-secondary-container",
      },
    },
    {
      variant: "filter",
      isSelected: true,
      class: {
        base: "pl-0", // Remove left padding when selected (checkbox is showing)
      },
    },
  ],
  defaultVariants: {
    variant: "assist",
    isDisabled: false,
    hasLeadingIcon: false,
    isSelected: false,
  },
});

type BaseChipProps = Omit<
  VariantProps<typeof styles>,
  "isDisabled" | "hasIcon"
> & {
  children: ReactNode;
};

/** The interaction states an assist chip's styles read — common to React
 *  Aria's `Button` and `Link` render props, so one `className` fits both. */
type AssistChipRenderProps = Pick<
  ButtonRenderProps,
  "isHovered" | "isPressed" | "isFocused" | "isFocusVisible" | "isDisabled"
>;

type AssistChipProps = BaseChipProps &
  Omit<ButtonProps, "children" | "className"> &
  Pick<LinkProps, "href" | "target" | "rel" | "routerOptions" | "download"> & {
    variant?: "assist";
    icon?: IconComponent;
    className?: string | ((renderProps: AssistChipRenderProps) => string);
  };

type FilterChipProps = BaseChipProps &
  Omit<ToggleButtonProps, "children"> & {
    variant: "filter";
    icon?: IconComponent;
    hasTrailingIcon?: boolean;
  };

type InputChipProps = BaseChipProps &
  Omit<ButtonProps, "children"> & {
    variant: "input";
    icon?: IconComponent;
    /** Makes the chip removable: it draws the remove icon. With no `onPress`
     *  the whole chip is the remove control, named "Remove <its text>"; with
     *  one, the icon is a second button of that name beside the chip's own.
     *  Either way Backspace or Delete on the chip removes it. */
    onRemove?: () => void;
    /** The word before the chip's text in the remove control's name.
     *  Default `"Remove"`: pass the word of the page's language. */
    removeLabel?: string;
  };

type ChipProps = AssistChipProps | FilterChipProps | InputChipProps;

/**
 * MD3 chips — assist (`Button`), filter (`ToggleButton`) and input
 * (`Button` + remove action) in one component keyed by `variant`. Filter
 * chips group into a `ChipGroup` (single or multi-select set).
 *
 *   <ChipGroup label="Days" selectionMode="multiple">
 *     <Chip id="mon" variant="filter">Mon</Chip>
 *   </ChipGroup>
 *
 * An input chip with `onRemove` is removable, by Material's accessibility
 * page. Alone, the whole chip is one button named "Remove <its text>": a
 * press, Space or Enter removes it. With an `onPress` of its own it is two
 * buttons, the chip's and "Remove <its text>". Backspace or Delete on either
 * removes it too. `removeLabel` is the word "Remove", for another language.
 *
 *   <Chip variant="input" onRemove={() => remove(tag)}>{tag}</Chip>
 *
 * The chip that is removed held the focus: move it, to the next chip or to
 * the field the chips belong to. In the two-button form the chip is a
 * `span` around the two: `className` is a string there, and every other
 * prop (`id`, `aria-label`, a ref) is the first button's.
 *
 * Spec: https://m3.material.io/components/chips/{overview,specs,guidelines,accessibility}
 * — 32dp container, 8dp corners, 18dp icons, 16dp padding (8dp next to an
 * icon), secondary-container when selected with a leading check.
 * Deviations: the container is the hit area (32dp, no 48dp expansion — the
 * a11y page only asks not to go *below* the default); the outline uses
 * `outline-variant` (the spec's default) rather than the `outline` role the
 * a11y page offers as one way to signal interactivity — use a labelled
 * `ChipGroup` for that instead. Of the overview's four variants the kit
 * has three: there is no *suggestion* chip (an assist chip is the nearest),
 * and no elevated configuration — chips stay at the default level 0.
 */
function Chip(props: ChipProps): JSX.Element | null {
  switch (props.variant) {
    case "filter":
      return <FilterChip {...props} />;
    case "input":
      return <InputChip {...props} />;
    case "assist":
    default:
      return <AssistChip {...props} />;
  }
}

export default Chip;

/**
 * Assist chip. With `href` it is a React Aria `Link` (a real `<a>`, routed
 * through the app's router provider) with the same anatomy and states —
 * MD3's assist chips may open a destination ("Directions", "Edit") as well
 * as run an action.
 */
function AssistChip({
  className,
  children,
  icon: Icon,
  href,
  target,
  rel,
  routerOptions,
  download,
  ...buttonProps
}: AssistChipProps) {
  const baseStyles = composeRenderProps(
    className,
    (className, renderProps: AssistChipRenderProps) =>
      styles({
        ...renderProps,
        className,
        variant: "assist",
        hasLeadingIcon: !!Icon,
      }).base(),
  );

  const content = (renderProps: { isDisabled: boolean }) => (
    <>
      <div
        data-slot="state-layer"
        className={styles().stateLayer({ variant: "assist" })}
      />

      <div className="relative flex items-center">
        {Icon && (
          <div
            className={styles({
              ...renderProps,
              variant: "assist",
              hasLeadingIcon: !!Icon,
            }).icon()}
          >
            <Icon size={18} />
          </div>
        )}
        <Label className="grow text-inherit" size="large" component="span">
          {children}
        </Label>
      </div>
    </>
  );

  if (href !== undefined) {
    const { isDisabled, onPress, onPressStart, onPressEnd, onPressChange } =
      buttonProps;
    return (
      <Link
        data-slot="chip"
        data-variant="assist"
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
      >
        {({ isDisabled }) => content({ isDisabled })}
      </Link>
    );
  }

  return (
    <Button
      data-slot="chip"
      data-variant="assist"
      {...buttonProps}
      className={baseStyles}
    >
      {({ isDisabled }) => content({ isDisabled })}
    </Button>
  );
}

function FilterChip(props: FilterChipProps) {
  const {
    className,
    children,
    icon: Icon,
    hasTrailingIcon,
    ...toggleButtonProps
  } = props;

  const baseStyles = composeRenderProps(className, (className, renderProps) => {
    const hasLeadingIcon = !!Icon;
    return styles({
      ...renderProps,
      className,
      variant: "filter",
      hasLeadingIcon,
      hasTrailingIcon,
    }).base();
  });

  return (
    <ToggleButton
      data-slot="chip"
      data-variant="filter"
      {...toggleButtonProps}
      className={baseStyles}
    >
      {({ isSelected, isPressed, isHovered: _h, ...renderProps }) => (
        <>
          <div
            data-slot="state-layer"
            className={styles().stateLayer({ variant: "filter" })}
          />
          <div className="relative flex items-center">
            {isSelected ? (
              <div
                className={styles({
                  variant: "filter",
                  isSelected,
                  ...renderProps,
                }).checkIcon()}
              >
                <CheckIcon size={18} className="text-on-secondary-container" />
              </div>
            ) : Icon ? (
              <div
                className={styles({
                  variant: "filter",
                  isSelected,
                  ...renderProps,
                }).icon()}
              >
                <Icon size={18} />
              </div>
            ) : null}
            <Label className="grow text-inherit" size="large" component="span">
              {children}
            </Label>
            {hasTrailingIcon && (
              <div
                className={styles({
                  variant: "filter",
                  isSelected,
                  hasTrailingIcon: true,
                  ...renderProps,
                }).icon()}
              >
                {isPressed ? (
                  <ChevronUpIcon
                    size={18}
                    className="text-on-surface-variant"
                  />
                ) : (
                  <ChevronDownIcon
                    size={18}
                    className="text-on-surface-variant"
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </ToggleButton>
  );
}

function InputChip({
  className,
  children,
  icon: Icon,
  onRemove,
  removeLabel = "Remove",
  ...buttonProps
}: InputChipProps) {
  const variants = {
    variant: "input" as const,
    hasLeadingIcon: !!Icon,
    hasTrailingIcon: !!onRemove,
  };
  const id = useId();
  const labelId = `${id}-label`;
  const removeId = `${id}-remove`;
  // Material: "Remove {chip content}". The name is the word, then the
  // chip's own text wherever it is drawn, so content that is not a string
  // is still said.
  const removeName = {
    id: removeId,
    "aria-label": removeLabel,
    "aria-labelledby": `${removeId} ${labelId}`,
  };
  // Material: Backspace or Delete removes the focused input chip.
  const removeByKey = onRemove
    ? (e: {
        key: string;
        preventDefault: () => void;
        continuePropagation: () => void;
      }) => {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          onRemove();
        } else {
          e.continuePropagation();
        }
      }
    : undefined;

  const leading = (renderProps: { isDisabled?: boolean }) =>
    Icon && (
      <div className={styles({ variant: "input", ...renderProps }).icon()}>
        <Icon size={18} />
      </div>
    );
  const label = (
    <Label
      id={labelId}
      className="grow text-inherit"
      size="large"
      component="span"
    >
      {children}
    </Label>
  );

  // A chip that is also pressed has two actions, and Material asks for two
  // focusable elements: the chip's own, then its remove button. Each draws
  // its own state layer and focus ring.
  if (onRemove && buttonProps.onPress) {
    const { isDisabled } = buttonProps;
    const part = focusRing({
      className:
        "group/part relative flex h-full items-center rounded-shape-small text-inherit -outline-offset-2",
    });
    const partLayer = cn(
      "pointer-events-none absolute inset-0 bg-on-secondary-container opacity-0 transition",
      "group-hover/part:state-opacity-hover group-data-focus-visible/part:state-opacity-focus group-data-pressed/part:state-opacity-pressed",
    );
    return (
      <span
        data-slot="chip"
        data-variant="input"
        data-disabled={isDisabled || undefined}
        className={cn(
          styles({ ...variants, isDisabled }).base(),
          !isDisabled &&
            "focus-within:border-on-secondary-container focus-within:bg-secondary-container focus-within:text-on-secondary-container",
          typeof className === "string" && className,
        )}
      >
        <Button
          {...buttonProps}
          data-slot="chip-action"
          onKeyDown={removeByKey}
          // The chip's own 16dp is the button's, so its focus ring and its
          // state layer reach the chip's edge.
          className={cn(part, !Icon && "-ml-4 pl-4")}
        >
          <span data-slot="state-layer" className={partLayer} />
          {leading({ isDisabled })}
          {label}
        </Button>
        <Button
          {...removeName}
          data-slot="chip-remove"
          isDisabled={isDisabled}
          onPress={onRemove}
          onKeyDown={removeByKey}
          className={cn(part, styles({ variant: "input", isDisabled }).icon())}
        >
          <span data-slot="state-layer" className={partLayer} />
          <XIcon size={18} />
        </Button>
      </span>
    );
  }

  const baseStyles = composeRenderProps(className, (className, renderProps) =>
    styles({ ...renderProps, className, ...variants }).base(),
  );

  // With no action of its own, a removable chip is one focusable element:
  // pressing it removes it, and it is named for that.
  return (
    <Button
      data-slot="chip"
      data-variant="input"
      {...buttonProps}
      // After the chip's own props: an `onPress` left undefined must not
      // take the remove away.
      {...(onRemove
        ? {
            onPress: onRemove,
            onKeyDown: removeByKey,
            ...(buttonProps["aria-label"] || buttonProps["aria-labelledby"]
              ? {}
              : removeName),
          }
        : {})}
      className={baseStyles}
    >
      {({ isPressed: _p, isHovered: _h, ...renderProps }) => (
        <>
          <div
            data-slot="state-layer"
            className={styles().stateLayer({ variant: "filter" })}
          />
          <div className="relative flex items-center">
            {leading(renderProps)}
            {label}
            {onRemove && (
              <div
                className={styles({ variant: "input", ...renderProps }).icon()}
              >
                <XIcon size={18} />
              </div>
            )}
          </div>
        </>
      )}
    </Button>
  );
}

export type ChipGroupProps = Omit<
  ToggleButtonGroupProps,
  "className" | "children"
> & {
  /** Visible label — the spec's preferred way to show a chip set is interactive. */
  label?: string;
  supportingText?: ReactNode;
  errorMessage?: string;
  isInvalid?: boolean;
  /** Fires when focus leaves any chip in the set (form "touched" tracking). */
  onBlur?: FocusEventHandler<HTMLDivElement>;
  /** One row that scrolls sideways where the chips do not fit, in place of
   *  wrapping onto more rows: a filter row on a phone. Material's
   *  guidelines: "Chip sets can be scrolled horizontally", and past two
   *  rows of wrapping they ask for it. */
  isScrollable?: boolean;
  /** The group's element: to scroll it into view, or to find a chip in it
   *  and give it the focus. */
  ref?: Ref<HTMLDivElement>;
  children?: ReactNode;
  className?: string;
};

/**
 * A set of filter chips with one shared selection (React Aria
 * `ToggleButtonGroup`): `selectionMode="multiple"` renders a `toolbar` of
 * `aria-pressed` buttons, `"single"` a `radiogroup` — arrow keys move
 * between chips either way, as the a11y page asks. Chips wrap onto new rows
 * with 8dp gaps; the group is labelled and described for assistive
 * technology, and `errorMessage` replaces `supportingText` when invalid.
 */
export function ChipGroup({
  label,
  supportingText,
  errorMessage,
  isInvalid = false,
  isDisabled = false,
  onBlur,
  isScrollable = false,
  ref,
  children,
  className,
  ...props
}: ChipGroupProps) {
  const labelId = useId();
  const messageId = useId();
  const showError = isInvalid && !!errorMessage;
  const message = showError ? errorMessage : supportingText;

  return (
    <div
      data-slot="chip-group"
      data-invalid={isInvalid || undefined}
      data-disabled={isDisabled || undefined}
      onBlur={onBlur}
      ref={ref}
      className={cn("flex min-w-0 flex-col gap-2", className)}
    >
      {label && (
        <span
          id={labelId}
          className={cn(
            "text-title-small font-title-small",
            isDisabled ? "text-on-surface/38" : "text-on-surface",
          )}
        >
          {label}
        </span>
      )}
      <ToggleButtonGroup
        aria-labelledby={label ? labelId : undefined}
        aria-describedby={message ? messageId : undefined}
        {...props}
        isDisabled={isDisabled}
        className={cn(
          "flex gap-2 data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-start",
          // Room around the row for a chip's focus ring, which the
          // scrolling would cut.
          isScrollable
            ? "-m-1.5 flex-nowrap overflow-x-auto p-1.5 [&>*]:shrink-0"
            : "flex-wrap",
        )}
      >
        {children}
      </ToggleButtonGroup>
      {message && (
        <span
          id={messageId}
          role={showError ? "alert" : undefined}
          className={cn(
            "text-body-small font-body-small",
            showError
              ? "text-error"
              : isDisabled
                ? "text-on-surface/38"
                : "text-on-surface-variant",
          )}
        >
          {message}
        </span>
      )}
    </div>
  );
}
