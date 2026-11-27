import type { ReactNode } from 'react';
import { Input, Label as FieldLabel, Text, TextField, type TextFieldProps } from 'react-aria-components';
import { Body, Label } from '@/components/ui/ds';
import { cn } from '@/lib/utils';
import { CutField } from './CutField';

/** How a field's label is drawn: quiet, above the field, in the label face. */
export const FIELD_LABEL = 'text-on-surface-variant';

/**
 * A line of text in the look's one field, the cut field: its label above it, never floating, the control in the cut frame, and under
 * it a line of help where `description` is given. The value, its change, its name, `isRequired` and the rest are React Aria's
 * `TextField`'s. `end` is a control at the field's right end (`CutField`).
 */
export function CutTextField({
  label,
  hideLabel = false,
  description,
  placeholder,
  end,
  className,
  ...props
}: Omit<TextFieldProps, 'children' | 'className'> & {
  label: string;
  /** Whether the label is for a screen reader alone, where the field's place or its placeholder says what it is. */
  hideLabel?: boolean;
  description?: string;
  placeholder?: string;
  end?: ReactNode;
  className?: string;
}) {
  return (
    <TextField {...props} className={cn('flex flex-col gap-1.5', className)}>
      <FieldLabel className={hideLabel ? 'sr-only' : FIELD_LABEL}>
        <Label size="large" component="span">
          {label}
        </Label>
      </FieldLabel>
      <CutField end={end}>
        <Body size="medium" component="span" className="contents">
          <Input placeholder={placeholder} className="min-w-0 flex-1 bg-transparent py-2 pl-3.5 text-on-surface outline-none placeholder:text-on-surface-variant" />
        </Body>
      </CutField>
      {description && (
        <Text slot="description" className={FIELD_LABEL}>
          <Body size="small" component="span">
            {description}
          </Body>
        </Text>
      )}
    </TextField>
  );
}
