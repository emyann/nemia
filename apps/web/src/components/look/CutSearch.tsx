import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { ComboBox, Input, ListBox, ListBoxItem, Popover } from 'react-aria-components';
import { Body, IconButton } from '@/components/ui/ds';
import { cn } from '@/lib/utils';
import { CutField } from './CutField';
import { CutTag } from './CutTag';
import { CHOICE, CHOICES } from './CutSelect';
import type { CutSuggestion } from './CutComboBox';

/** A chip of the bar: what was picked, as its words say it, and the key that takes it away. */
export type CutChip = { id: string; label: string };

/** Whether the focus is somewhere a person types, where a `/` is a character. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * The search bar: the look's cut field with a magnifier, the chips of what was picked, and the words being typed, with suggestions in a
 * list beside it. `/`, pressed where nothing is typed, focuses it; Backspace on empty words takes the last chip off. Enter on words no
 * suggestion is highlighted for is `onSubmit`, which keeps them; picking a suggestion is `onPick`. The caller says what the suggestions
 * are for `text` and what a chip stands for.
 */
export function CutSearch({
  label,
  chips,
  onRemove,
  text,
  onText,
  suggestions,
  onPick,
  onSubmit,
  placeholder,
  className,
}: {
  label: string;
  chips: readonly CutChip[];
  onRemove: (id: string) => void;
  text: string;
  onText: (text: string) => void;
  suggestions: readonly CutSuggestion[];
  onPick: (id: string) => void;
  onSubmit: (text: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      event.preventDefault();
      input.current?.focus();
    };
    document.addEventListener('keydown', focus);
    return () => document.removeEventListener('keydown', focus);
  }, []);
  return (
    <ComboBox
      aria-label={label}
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
      className={cn('flex flex-col', className)}
    >
      <CutField data-search-bar="">
        <Body size="medium" component="span" className="flex flex-wrap items-center gap-2 py-1.5 pl-3.5 pr-4">
          <Search aria-hidden="true" size={16} className="shrink-0 text-on-surface-variant" />
          {chips.map((chip) => (
            <span key={chip.id} data-chip={chip.id} className="inline-flex">
              <CutTag edge>
                <span className="inline-flex items-center gap-1 pl-2 text-on-surface">
                  <Body size="small" component="span">
                    {chip.label}
                  </Body>
                  <IconButton size="xsmall" variant="standard" icon={X} aria-label={`Take off ${chip.label}`} onPress={() => onRemove(chip.id)} />
                </span>
              </CutTag>
            </span>
          ))}
          <Input
            ref={input}
            placeholder={chips.length === 0 ? placeholder : undefined}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && text === '' && chips.length > 0) {
                const last = chips.at(-1);
                if (last !== undefined) onRemove(last.id);
              }
              if (event.key === 'Enter' && event.currentTarget.getAttribute('aria-activedescendant') === null && text.trim() !== '') {
                event.preventDefault();
                onSubmit(text.trim());
              }
            }}
            className="min-w-32 flex-1 bg-transparent py-1 text-on-surface outline-none placeholder:text-on-surface-variant"
          />
        </Body>
      </CutField>
      <Popover className={CHOICES} placement="bottom start">
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
