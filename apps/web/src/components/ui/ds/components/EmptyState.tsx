import React from "react";
import { tv, type VariantProps } from "../utils";
import { Body, Headline } from "../primitives/Typography";

const emptyState = tv({
  slots: {
    base: "m-auto p-8 bg-surface-container-highest border border-outline rounded-lg flex flex-col items-center w-full max-w-lg",
    content: "flex flex-col items-center text-center",
    mediaContainer: "mb-8 flex items-center justify-center",
    textContainer: "mb-8",
    title: "mb-4",
    description: "mb-6 text-on-surface-variant",
    actionsContainer: "w-full flex justify-center",
  },
  variants: {
    size: {
      sm: {
        base: "p-6",
        mediaContainer: "mb-6",
        textContainer: "mb-6",
      },
      md: {},
      lg: {
        base: "p-10",
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
 * Material 3 does not describe this component. The title and the description
 * take MD3's type scale; the actions are whatever the caller passes.
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
  } = emptyState({ size });

  return (
    <div data-slot="empty-state" className={base({ className })}>
      <div className={content()}>
        {Media && (
          <div className={mediaContainer()}>
            <Media className="text-primary h-32 w-32 sm:h-40 sm:w-40 md:h-48 md:w-48 lg:h-56 lg:w-56 xl:h-64 xl:w-64" />
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
