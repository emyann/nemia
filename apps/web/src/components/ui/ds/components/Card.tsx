import React, { type ReactNode } from "react";
import { cn, focusRing, tv, type VariantProps } from "../utils";
import { Body, Headline } from "../primitives/Typography";

const styles = tv({
  extend: focusRing,
  slots: {
    base: "relative rounded-shape-medium overflow-hidden transition-colors duration-short-4",
    stateLayer: [
      "absolute inset-0 transition pointer-events-none",
      "bg-on-surface opacity-0 group-hover/grid-list-item:state-opacity-hover group-data-focus-visible/grid-list-item:state-opacity-focus group-data-pressed/grid-list-item:state-opacity-pressed group-data-dragging/grid-list-item:state-opacity-dragged",
    ],
    content: "flex flex-col p-4",
    media: "w-full mb-4",
    header: "mb-2",
    headline: "text-on-surface mb-1",
    supportingText: "text-on-surface-variant",
    actions: "mt-4 flex justify-end",
  },
  variants: {
    variant: {
      filled: {
        base: "bg-surface-container-highest",
      },
      outlined: {
        base: "bg-surface border border-outline-variant",
      },
      elevated: {
        base: "bg-surface-container-low",
      },
    },
    elevation: {
      none: "",
      low: "shadow-elevation-1",
      medium: "shadow-elevation-2",
      high: "shadow-elevation-3",
    },
    isDisabled: {
      true: {
        base: "opacity-38 cursor-default",
      },
    },
    isDragged: {
      true: {
        stateLayer: "state-opacity-dragged",
      },
    },
  },
  compoundVariants: [
    // Material's dragged elevations: level 4 for an elevated card, level 3
    // for a filled or an outlined one.
    {
      isDragged: true,
      variant: "elevated",
      class: { base: "shadow-elevation-4" },
    },
    {
      isDragged: true,
      variant: ["filled", "outlined"],
      class: { base: "shadow-elevation-3" },
    },
  ],
  defaultVariants: {
    variant: "filled",
    elevation: "none",
    isDisabled: false,
    isDragged: false,
  },
});

/**
 * What the root takes of HTML: every attribute that places a card and names
 * it (`id`, `role`, `style`, `title`, `lang`, `hidden`, every `aria-*` and
 * `data-*`), and nothing that makes it operated: no event handler, no
 * `tabIndex`.
 */
type CardRootProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  keyof React.DOMAttributes<HTMLElement> | "tabIndex"
>;

type BaseCardProps = Omit<VariantProps<typeof styles>, "elevation"> &
  CardRootProps & {
    children?: ReactNode;
    /** The root's element. A card that is one of a list is an `li`. */
    component?: "div" | "section" | "article" | "li";
    ref?: React.Ref<HTMLElement>;
    isDragged?: boolean;
    isDisabled?: boolean;
    /** Classes for the card's container. */
    className?: string;
    /** Classes for the named parts. */
    classNames?: {
      content?: string;
      stateLayer?: string;
    };
    // Interaction states forwarded from the parent `GridListItem` render props.
    // Styling is driven by the `group-*/grid-list-item` classes in `stateLayer`,
    // so these are accepted but not consumed directly.
    isHovered?: boolean;
    isPressed?: boolean;
    isFocused?: boolean;
  };

type FilledCardProps = BaseCardProps & { variant?: "filled" };
type OutlinedCardProps = BaseCardProps & { variant?: "outlined" };
type ElevatedCardProps = BaseCardProps & {
  variant?: "elevated";
  elevation?: "low" | "medium" | "high";
};

export type CardProps = FilledCardProps | OutlinedCardProps | ElevatedCardProps;

/**
 * MD3 card: elevated, filled or outlined. A container, and no more: it holds
 * actions (buttons, links) and is not one itself.
 *
 * **The root** is a `div`, or the `section`, `article` or `li` named by
 * `component`. It takes `ref`, `className`, and what places a card and names
 * it: `id`, `role`, `style`, every `aria-*` and `data-*` attribute. It
 * refuses, at the type, every event handler and `tabIndex`: a card that is
 * pressed needs a state layer, a focus indicator, a role and a keyboard path,
 * which is Material's directly actionable card (a gap, below). Interaction
 * comes from a parent `GridListItem`, whose hover, focus, press and drag the
 * state layer follows.
 *
 * Parts, each with its `data-slot` and its key in `classNames`. On `Card`:
 * `content` (`card-content`), `stateLayer` (`state-layer`). On `CardContent`:
 * `media` (`card-media`), `header` (`card-header`), `headline`
 * (`card-headline`), `supportingText` (`card-supporting-text`), `actions`
 * (`card-actions`). The root is `data-slot="card"` with `data-variant`.
 *
 * Gaps against Material's pages, by name:
 * - **Directly actionable card**: a card that is itself a button or a link,
 *   with its ripple, its focus indicator and its tab stop. Not built.
 * - **Hovered elevation**: Material raises an actionable card by one level on
 *   hover. Inside a `GridListItem` the state layer answers; the shadow does
 *   not move.
 * - **Subhead** and **dividers** in `CardContent`: Material's anatomy has a
 *   subhead between headline and supporting text. Compose them as children.
 * - **Disabled colours**: Material fades the container and the outline
 *   apart (38 % and 12 %); `isDisabled` draws the whole card at 38 %.
 *
 * Not Material's: `elevation="medium" | "high"` on an elevated card.
 * Material's elevated card rests at level 1, which is the default.
 *
 * Spec: https://m3.material.io/components/cards/{overview,specs,guidelines,accessibility}
 */
export default function Card(props: CardProps) {
  const {
    children,
    variant,
    isDragged,
    isDisabled,
    className,
    classNames,
    component: Component = "div",
    ref,
    ...rest
  } = props;
  // What is the card's own never reaches the DOM: the states a parent
  // `GridListItem` forwards, and `elevation`, which is on one member of the
  // union only.
  const rootProps: CardRootProps & {
    elevation?: "low" | "medium" | "high";
    isHovered?: boolean;
    isPressed?: boolean;
    isFocused?: boolean;
  } = { ...rest };
  const asked = rootProps.elevation;
  delete rootProps.elevation;
  delete rootProps.isHovered;
  delete rootProps.isPressed;
  delete rootProps.isFocused;
  const elevation = variant === "elevated" ? (asked ?? "low") : "none";

  const s = styles({ variant, elevation, isDragged, isDisabled });

  const hasMedia = React.Children.toArray(children).some(
    (child) =>
      React.isValidElement<{ media?: unknown }>(child) &&
      "media" in child.props,
  );

  return (
    <Component
      {...rootProps}
      // One ref type for four elements: each is an HTMLElement.
      ref={ref as React.Ref<never>}
      data-slot="card"
      data-variant={variant ?? "filled"}
      className={s.base({ className })}
    >
      <div
        data-slot="state-layer"
        className={s.stateLayer({ className: classNames?.stateLayer })}
      />
      <div
        data-slot="card-content"
        className={s.content({
          className: cn(hasMedia && "p-0", classNames?.content),
        })}
      >
        {children}
      </div>
    </Component>
  );
}

export { Card };

/**
 * How a string `media` src becomes an element. The default is a plain `<img>`
 * so the kit stays framework-free; pass `nextImageRenderer` from
 * `../adapters/next` (or your own) to use an optimizing image component.
 */
export type ImageRenderer = (args: {
  src: string;
  alt: string;
  fill: boolean;
  className: string;
}) => ReactNode;

const defaultImageRenderer: ImageRenderer = ({ src, alt, fill, className }) => (
  <img
    src={src}
    alt={alt}
    className={cn(className, fill && "absolute inset-0 h-full w-full")}
  />
);

export type CardContentProps = {
  headline?: ReactNode;
  supportingText?: ReactNode;
  media?: string | ReactNode;
  mediaAlt?: string;
  mediaAspectRatio?: "16:9" | "4:3" | "1:1" | "auto";
  actions?: ReactNode;
  renderImage?: ImageRenderer;
  /** Classes for the named parts. */
  classNames?: {
    media?: string;
    header?: string;
    headline?: string;
    supportingText?: string;
    actions?: string;
  };
};

export function CardContent({
  headline,
  supportingText,
  media,
  mediaAlt = "",
  mediaAspectRatio = "auto",
  actions,
  renderImage = defaultImageRenderer,
  classNames,
}: CardContentProps) {
  const s = styles();

  const aspectRatioClasses = {
    "16:9": "aspect-video",
    "4:3": "aspect-[4/3]",
    "1:1": "aspect-square",
    auto: "",
  };

  return (
    <>
      {media && (
        <div
          data-slot="card-media"
          className={s.media({
            className: cn(
              aspectRatioClasses[mediaAspectRatio],
              "relative overflow-hidden",
              classNames?.media,
            ),
          })}
        >
          {typeof media === "string"
            ? renderImage(
                mediaAspectRatio === "auto"
                  ? {
                      src: media,
                      alt: mediaAlt,
                      fill: false,
                      className: "h-auto w-full",
                    }
                  : {
                      src: media,
                      alt: mediaAlt,
                      fill: true,
                      className: "object-cover",
                    },
              )
            : media}
        </div>
      )}
      <div
        data-slot="card-header"
        className={s.header({
          className: cn(media && "p-4", classNames?.header),
        })}
      >
        {headline && (
          <Headline
            size="medium"
            component="div"
            data-slot="card-headline"
            className={s.headline({ className: classNames?.headline })}
          >
            {headline}
          </Headline>
        )}
        {supportingText && (
          <Body
            component="div"
            data-slot="card-supporting-text"
            className={s.supportingText({
              className: classNames?.supportingText,
            })}
          >
            {supportingText}
          </Body>
        )}
      </div>
      {actions && (
        <div
          data-slot="card-actions"
          className={s.actions({
            className: cn(media && "px-4 pb-4", classNames?.actions),
          })}
        >
          {actions}
        </div>
      )}
    </>
  );
}
