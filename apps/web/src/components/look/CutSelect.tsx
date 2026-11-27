import { ChevronDown } from 'lucide-react';
import { Button, Label as FieldLabel, ListBox, ListBoxItem, Popover, Select, SelectValue } from 'react-aria-components';
import { Body, Label } from '@/components/ui/ds';
import { cn } from '@/lib/utils';
import { CutField } from './CutField';
import { FIELD_LABEL } from './CutTextField';

/** What a choice of a select is: the key it is picked by, and its words. */
export type CutChoice = { id: string; label: string };

/** The surface a select or a combo box opens its choices on, and a choice in it. */
export const CHOICES = 'min-w-(--trigger-width) overflow-auto rounded-shape-extra-small bg-surface-container py-2 shadow-elevation-2';
export const CHOICE = 'flex min-h-10 cursor-default items-center gap-2 px-3 py-1.5 text-on-surface outline-none data-focused:bg-on-surface/8 data-selected:bg-secondary-container';

/**
 * One choice among a few, in the look's one field, the cut field: the label above it, the chosen word in the field with a chevron, and
 * the choices in a list on a surface beside it. `value` is the id chosen, `''` for none, and `onChange` is given the id picked.
 */
export function CutSelect({
  label,
  choices,
  value,
  onChange,
  placeholder = 'Choose',
  isDisabled,
  className,
}: {
  label: string;
  choices: readonly CutChoice[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      selectedKey={value === '' ? null : value}
      onSelectionChange={(key) => onChange(key === null ? '' : String(key))}
      placeholder={placeholder}
      isDisabled={isDisabled}
      className={cn('flex flex-col gap-1.5', className)}
    >
      <FieldLabel className={FIELD_LABEL}>
        <Label size="large" component="span">
          {label}
        </Label>
      </FieldLabel>
      <CutField>
        <Body size="medium" component="span" className="contents">
          <Button className="flex w-full min-w-0 items-center gap-2 bg-transparent py-2 pl-3.5 pr-4 text-left text-on-surface outline-none data-disabled:text-on-surface/38">
            <SelectValue className="min-w-0 flex-1 truncate data-placeholder:text-on-surface-variant" />
            <ChevronDown aria-hidden="true" size={16} className="shrink-0 text-on-surface-variant" />
          </Button>
        </Body>
      </CutField>
      <Popover className={CHOICES}>
        <ListBox className="max-h-72 overflow-auto outline-none">
          {choices.map((choice) => (
            <ListBoxItem key={choice.id} id={choice.id} textValue={choice.label} className={CHOICE}>
              <Body size="medium" component="span">
                {choice.label}
              </Body>
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}
