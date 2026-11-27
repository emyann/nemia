import { ComboBox, Input, Label as FieldLabel, ListBox, ListBoxItem, Popover } from 'react-aria-components';
import { Body, Label } from '@/components/ui/ds';
import { cn } from '@/lib/utils';
import { CutField } from './CutField';
import { CHOICE, CHOICES } from './CutSelect';
import { FIELD_LABEL } from './CutTextField';

/** A suggestion of a combo box: the key it is picked by, its words, and a note beside them (how many hold it). */
export type CutSuggestion = { id: string; label: string; hint?: string };

/**
 * A line of text with suggestions under it, in the look's one field, the cut field: the label above, the suggestions in a list beside
 * the field as the text is typed. `suggestions` is what the caller offers for `text` (it filters); picking one is `onPick`, and Enter
 * on text no suggestion is highlighted for is `onSubmit`, so a value no suggestion holds can be given.
 */
export function CutComboBox({
  label,
  text,
  onText,
  suggestions,
  onPick,
  onSubmit,
  placeholder,
  className,
}: {
  label: string;
  text: string;
  onText: (text: string) => void;
  suggestions: readonly CutSuggestion[];
  onPick: (id: string) => void;
  onSubmit: (text: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <ComboBox
      allowsCustomValue
      allowsEmptyCollection
      menuTrigger="focus"
      inputValue={text}
      onInputChange={onText}
      selectedKey={null}
      onSelectionChange={(key) => {
        if (key !== null) onPick(String(key));
      }}
      items={suggestions}
      className={cn('flex flex-col gap-1.5', className)}
    >
      <FieldLabel className={FIELD_LABEL}>
        <Label size="large" component="span">
          {label}
        </Label>
      </FieldLabel>
      <CutField>
        <Body size="medium" component="span" className="contents">
          <Input
            placeholder={placeholder}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.currentTarget.getAttribute('aria-activedescendant') === null && text.trim() !== '') {
                event.preventDefault();
                onSubmit(text.trim());
              }
            }}
            className="min-w-0 flex-1 bg-transparent py-2 pl-3.5 text-on-surface outline-none placeholder:text-on-surface-variant"
          />
        </Body>
      </CutField>
      <Popover className={CHOICES}>
        <ListBox className="max-h-72 overflow-auto outline-none">
          {(suggestion: CutSuggestion) => (
            <ListBoxItem id={suggestion.id} textValue={suggestion.label} className={CHOICE}>
              <Body size="medium" component="span" className="flex-1">
                {suggestion.label}
              </Body>
              {suggestion.hint && (
                <Body size="small" component="span" colorRole="on-surface-variant" className="font-mono">
                  {suggestion.hint}
                </Body>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}
