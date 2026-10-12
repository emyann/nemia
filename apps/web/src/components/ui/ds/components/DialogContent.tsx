import React, { type JSX } from "react";
import { tv, type VariantProps } from "../utils";
import { renderIcon, type IconProp } from "../icons";
import { Body, Headline } from "../primitives/Typography";
import Button from "./Button";

export const styles = tv({
  slots: {
    base: "bg-surface-container-high rounded-shape-extra-large p-6 min-w-[280px] w-full shadow-elevation-3 outline-hidden relative overflow-hidden",
    header: "mb-4",
    icon: "text-secondary",
    // No weight here: the headline this styles is `Headline`, which carries
    // MD3's regular weight for the role. It used to read `font-medium` and
    // still rendered at 400, because tailwind-merge classified the primitive's
    // `font-regular` as a *family* and kept both classes — with `.font-regular`
    // emitted later, so it won the cascade. That is fixed in `twMergeConfig`
    // (utils.ts), which would have turned every dialog title 500.
    title: "text-on-surface",
    supportingText: "text-on-surface-variant",
    actions: "mt-6 flex justify-end space-x-2",
  },
  variants: {
    hasIcon: {
      true: {
        header: "flex items-center space-x-4",
      },
    },
  },
  defaultVariants: {
    hasIcon: false,
  },
});

export type { IconProp };

type ActionConfig = {
  label: string;
  onPress?: () => void;
  isLoading?: boolean;
};

type Actions = {
  confirm: ActionConfig;
  cancel: ActionConfig;
};

type BaseDialogContentProps = VariantProps<typeof styles> & {
  title: string;
  className?: string;
  isHovered?: boolean;
  isFocused?: boolean;
};

type StructuredDialogContentProps = BaseDialogContentProps & {
  icon?: IconProp;
  supportingText?: string | React.ReactNode;
  actions?: JSX.Element | Actions;
  children?: never;
};

type ChildrenDialogContentProps = BaseDialogContentProps & {
  icon?: never;
  supportingText?: never;
  actions?: never;
  children: React.ReactNode;
};

export type DialogContentProps =
  | StructuredDialogContentProps
  | ChildrenDialogContentProps;

/**
 * What an MD3 dialog holds: an optional icon, the headline, supporting text
 * and the actions, or children of your own under the headline.
 *
 * Spec: https://m3.material.io/components/dialogs/{overview,specs,guidelines,accessibility}
 */
export function DialogContent(props: DialogContentProps) {
  const { className } = props;

  const {
    base,
    header,
    icon: iconStyles,
    title: titleStyles,
    supportingText: supportingTextStyles,
    actions: actionsStyles,
  } = styles({ hasIcon: "icon" in props && !!props.icon });

  const renderActions = () => {
    if ("actions" in props && props.actions) {
      if (React.isValidElement(props.actions)) {
        return props.actions;
      }

      const { confirm, cancel } = props.actions as Actions;

      return (
        <>
          <Button
            variant="text"
            onPress={cancel.onPress}
            isLoading={cancel.isLoading}
          >
            {cancel.label}
          </Button>
          <Button onPress={confirm.onPress} isLoading={confirm.isLoading}>
            {confirm.label}
          </Button>
        </>
      );
    }
    return null;
  };

  return (
    <div data-slot="dialog-content" className={base({ className })}>
      {"children" in props ? (
        props.children
      ) : (
        <>
          <div className={header()}>
            {props.icon && (
              <div className={iconStyles()}>{renderIcon(props.icon)}</div>
            )}
            <Headline size="medium" className={titleStyles()}>
              {props.title}
            </Headline>
          </div>
          {props.supportingText && (
            <Body className={supportingTextStyles()}>
              {props.supportingText}
            </Body>
          )}
          {props.actions && (
            <div className={actionsStyles()}>{renderActions()}</div>
          )}
        </>
      )}
    </div>
  );
}

export default DialogContent;
