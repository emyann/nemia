"use client";

import {
  ColorField as AriaColorField,
  Input,
  Label,
  type ColorFieldProps as AriaColorFieldProps,
  type ValidationResult,
} from "react-aria-components";
import { FieldError, Text } from "react-aria-components";

interface ColorFieldProps extends AriaColorFieldProps {
  label?: string;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
}

/**
 * A text field for a colour's value (hex by default), on React Aria `ColorField`.
 * A part of `ColorPicker`.
 *
 * Material 3 does not describe this component.
 */
export function ColorField(props: ColorFieldProps) {
  const { label, description, errorMessage, ...rest } = props;
  return (
    <AriaColorField
      data-slot="color-field"
      {...rest}
      className="text-on-surface flex flex-col"
    >
      {label && <Label>{label}</Label>}
      <Input className="rounded-shape-extra-small border-outline-variant bg-surface text-on-surface data-[invalid]:border-error data-[invalid]:text-error focus:outline-ring m-0 box-border w-full max-w-[12ch] border p-1 focus:outline-2 focus:-outline-offset-1" />
      {description && (
        <Text slot="description" className="text-on-surface-variant">
          {description}
        </Text>
      )}
      <FieldError className="text-error">{errorMessage}</FieldError>
    </AriaColorField>
  );
}
