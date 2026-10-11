import React, { type ReactNode, useMemo } from "react";
import { focusRing, tv, type VariantProps } from "../utils";
import { Body, Headline } from "../primitives/Typography";

const styles = tv({
  extend: focusRing,
  slots: {
    base: "relative rounded-shape-large overflow-hidden transition-colors duration-short-4",
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
        base: "shadow-elevation-4 scale-105",
      },
    },
  },
  defaultVariants: {
    variant: "filled",
    elevation: "none",
    isDisabled: false,
    isDragged: false,
  },
});

type BaseCardProps = Omit<VariantProps<typeof styles>, "elevation"> & {
  children?: ReactNode;
  isDragged?: boolean;
  isDisabled?: boolean;
  className?: string;
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

export default function Card(props: CardProps) {
  const { children, variant, isDragged, isDisabled, className } = props;

  const elevation = useMemo(() => {
    if (variant === "elevated") {
      return props.elevation ?? "low";
    }
    return "none";
  }, [variant, props]);

  const s = styles({ variant, elevation, isDragged, isDisabled });

  const hasMedia = React.Children.toArray(children).some(
    (child) =>
      React.isValidElement<{ media?: unknown }>(child) &&
      "media" in child.props,
  );

  return (
    <div
      data-slot="card"
      data-variant={variant ?? "filled"}
      className={s.base({ className })}
    >
      <div data-slot="state-layer" className={s.stateLayer()} />
      <div className={s.content({ className: hasMedia ? "p-0" : "" })}>
        {children}
      </div>
    </div>
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
    className={fill ? `${className} absolute inset-0 h-full w-full` : className}
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
};

export function CardContent({
  headline,
  supportingText,
  media,
  mediaAlt = "",
  mediaAspectRatio = "auto",
  actions,
  renderImage = defaultImageRenderer,
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
          className={`${s.media()} ${aspectRatioClasses[mediaAspectRatio]} relative mb-0 overflow-hidden`}
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
      <div className={`${s.header()} ${media ? "p-4" : ""}`}>
        {headline && (
          <Headline size="medium" className={s.headline()} component="div">
            {headline}
          </Headline>
        )}
        {supportingText && (
          <Body className={s.supportingText()} component="div">
            {supportingText}
          </Body>
        )}
      </div>
      {actions && (
        <div className={`${s.actions()} ${media ? "px-4 pb-4" : ""}`}>
          {actions}
        </div>
      )}
    </>
  );
}
