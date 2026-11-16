import React from "react";
import { tv, type VariantProps } from "../utils";
import { Body, Headline } from "../primitives/Typography";

const emptyState = tv({
  slots: {
    base: "m-auto p-8 bg-surface-container-highest border border-outline rounded-shape-medium flex flex-col items-center w-full max-w-lg",
    content: "flex flex-col items-center text-center",
    mediaContainer: "mb-8 flex items-center justify-center",
    textContainer: "mb-8",
    title: "mb-4",
    description: "mb-6 text-on-surface-variant",
    media: "text-primary",
    // The two actions sit 8dp apart, and stack where they do not fit.
    actionsContainer: "w-full flex flex-wrap justify-center gap-2",
  },
  variants: {
    size: {
      sm: {
        base: "p-6",
        media: "size-16",
        mediaContainer: "mb-6",
        textContainer: "mb-6",
      },
      md: { media: "size-32" },
      lg: {
        base: "p-10",
        media: "size-48",
        mediaContainer: "mb-10",
        textContainer: "mb-10",
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});

interface EmptyStateProps extends VariantProps<typeof emptyState> {
  title: string;
  description?: string;
  media?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
}

/**
 * What a list, a table or a page shows when it has nothing to show: optional
 * media, a title, a description and up to two actions, centred.
 *
 * It draws a box of its own: `surface-container-highest` with an `outline`
 * border and the medium corner, centred in what holds it (`m-auto`) and at
 * most `max-w-lg` wide. `size` (`sm`, `md` the default, `lg`) sets its
 * padding and its media together: 64dp, 128dp or 192dp, the same at every
 * window width, so `sm` suits a panel or a phone and `lg` an empty page. The
 * media is any SVG component, drawn on `primary`. The two actions sit 8dp
 * apart and stack where they do not fit. To draw
 * it bare inside a card or a table, pass
 * `className="border-0 bg-transparent"`.
 *
 * Material 3 does not describe this component. The title and the description
 * take MD3's type scale; the box takes a card's corner
 * (https://m3.material.io/components/cards/specs: the medium shape); the
 * actions are whatever the caller passes.
 */
export default function EmptyState(props: EmptyStateProps) {
  const {
    title,
    description,
    media: Media,
    action,
    secondaryAction,
    size,
    className,
  } = props;

  const {
    base,
    content,
    mediaContainer,
    textContainer,
    title: titleClass,
    description: descriptionClass,
    actionsContainer,
    media: mediaClass,
  } = emptyState({ size });

  return (
    <div data-slot="empty-state" className={base({ className })}>
      <div className={content()}>
        {Media && (
          <div className={mediaContainer()}>
            <Media className={mediaClass()} />
          </div>
        )}
        <div className={textContainer()}>
          <Headline size="medium" className={titleClass()}>
            {title}
          </Headline>
          {description && (
            <Body className={descriptionClass()}>{description}</Body>
          )}
        </div>
      </div>
      {(action || secondaryAction) && (
        <div className={actionsContainer()}>
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
