import { Label as FieldLabel, Text, TextArea, TextField, type TextFieldProps } from 'react-aria-components';
import { Body, Label } from '@/components/ui/ds';
import { cn } from '@/lib/utils';
import { CutField } from './CutField';
import { FIELD_LABEL } from './CutTextField';

/**
 * Several lines of text in the look's one field, the cut field: the label above it, the text area in the cut frame, `rows` tall where
 * it is given. The value, its change and the rest are React Aria's `TextField`'s.
 */
export function CutTextArea({
  label,
  description,
  placeholder,
  rows = 4,
  className,
  ...props
}: Omit<TextFieldProps, 'children' | 'className'> & {
  label: string;
  description?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <TextField {...props} className={cn('flex flex-col gap-1.5', className)}>
      <FieldLabel className={FIELD_LABEL}>
        <Label size="large" component="span">
          {label}
        </Label>
      </FieldLabel>
      <CutField>
        <Body size="medium" component="span" className="contents">
          <TextArea
            rows={rows}
            placeholder={placeholder}
            className="block w-full min-w-0 flex-1 resize-y bg-transparent py-2 pl-3.5 pr-3 text-on-surface outline-none placeholder:text-on-surface-variant"
          />
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
