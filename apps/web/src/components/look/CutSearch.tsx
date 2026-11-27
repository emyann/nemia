import { useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { Search, X } from 'lucide-react';
import { ComboBox, ComboBoxStateContext, Input, Popover } from 'react-aria-components';
import { Body, IconButton } from '@/components/ui/ds';
import { CutField } from './CutField';
import { CutTag } from './CutTag';
import { CHOICES } from './CutSelect';
import { CutSearchPanel, type CutSearchSection } from './CutSearchPanel';

/** A chip of the bar: what was picked, as its words say it, and the key that takes it away. */
export type CutChip = { id: string; label: string };

/** Whether the focus is somewhere a person types, where a `/` is a character. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** The `/` that focuses the bar: pressed on the page where nothing is typed, it puts the focus in `input`. */
function useSlashFocus(input: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      event.preventDefault();
      input.current?.focus();
    };
    document.addEventListener('keydown', focus);
    return () => document.removeEventListener('keydown', focus);
  }, [input]);
}

/** One chip of the bar: its words on the look's cut tag, and the key that takes it off. */
function SearchChip({ chip, onRemove }: { chip: CutChip; onRemove: (id: string) => void }) {
  return (
    <span data-chip={chip.id} className="inline-flex">
      <CutTag edge>
        <span className="inline-flex items-center gap-1 pl-2 text-on-surface">
          <Body size="small" component="span">
            {chip.label}
          </Body>
          <IconButton size="xsmall" variant="standard" icon={X} aria-label={`Take off ${chip.label}`} onPress={() => onRemove(chip.id)} />
        </span>
      </CutTag>
    </span>
  );
}

/**
 * The bar's input: its keys (`keyed`), and the suggestions closed once the words are kept, since a person who pressed Enter has finished
 * choosing and an open list hides the rest of the bar from a screen reader. A pick that keeps the panel open (`reopen`) opens it again as
 * the ComboBox closes it.
 */
function BarInput({
  input,
  placeholder,
  bar,
  reopen,
  onReopened,
  onChoose,
}: {
  input: RefObject<HTMLInputElement | null>;
  placeholder: string | undefined;
  bar: Parameters<typeof keyed>[1];
  reopen: boolean;
  onReopened: () => void;
  onChoose: (id: string) => void;
}) {
  const state = useContext(ComboBoxStateContext);
  const kept = useRef(false);
  const open = state?.isOpen ?? false;
  useEffect(() => {
    if (open && kept.current) state?.close();
    if (!open && reopen) {
      onReopened();
      state?.open(null, 'manual');
    }
  }, [open, state, reopen, onReopened]);
  return (
    <Input
      ref={input}
      placeholder={placeholder}
      onChange={() => {
        kept.current = false;
      }}
      onKeyDown={(event) => {
        const focused = state?.selectionManager.focusedKey;
        if (event.key === 'Enter' && state?.isOpen && focused !== null && focused !== undefined) {
          event.preventDefault();
          onChoose(String(focused));
          state.close();
          return;
        }
        if (!keyed(event, bar)) return;
        kept.current = true;
        state?.close();
      }}
      className="min-w-0 flex-1 bg-transparent py-1 text-on-surface outline-none placeholder:text-on-surface-variant"
    />
  );
}

/**
 * What a key does in the bar: Backspace on empty words takes the last chip off; Enter on words no suggestion is highlighted for keeps
 * them, which is what it answers true for.
 * @param event The key pressed in the bar's input.
 * @param bar What the bar holds: its words, its chips, and what it does to take one off or keep the words.
 */
function keyed(
  event: ReactKeyboardEvent<HTMLInputElement>,
  bar: { text: string; chips: readonly CutChip[]; onRemove: (id: string) => void; onSubmit: (text: string) => void },
) {
  const last = bar.chips.at(-1);
  if (event.key === 'Backspace' && bar.text === '' && last !== undefined) {
    bar.onRemove(last.id);
    return false;
  }
  if (event.key === 'Enter' && event.currentTarget.getAttribute('aria-activedescendant') === null && bar.text.trim() !== '') {
    event.preventDefault();
    bar.onSubmit(bar.text.trim());
    return true;
  }
  return false;
}

/**
 * What a pick does: it is `onPick`, and a line that keeps the panel open (`keeps`) has it open again (`reopen`, cleared by `reopened`);
 * `picking` is true for the moment the ComboBox resets the input after a pick, which the caller does not take as typing.
 * @param sections The groups the panel holds.
 * @param onPick What picking a line does, given its id.
 */
function usePicks(sections: readonly CutSearchSection[], onPick: (id: string) => void) {
  const picking = useRef(false);
  const [reopen, setReopen] = useState(false);
  const reopened = useCallback(() => setReopen(false), []);
  const choose = (id: string) => {
    picking.current = true;
    queueMicrotask(() => {
      picking.current = false;
    });
    setReopen(sections.some((section) => section.items.some((item) => item.id === id && item.keeps)));
    onPick(id);
  };
  return { picking, reopen, reopened, choose };
}

/**
 * The search bar: the look's cut field with a magnifier, the chips of what was picked, and the words being typed, with suggestions in a
 * panel of groups under it, open as soon as it has the focus. `/`, pressed where nothing is typed, focuses it; Backspace on empty words
 * takes the last chip off; the clear button, drawn once there is a chip or text, is `onClear`. ↑ ↓ move in the panel and Enter picks a
 * line (`onPick`); Enter on words no line is highlighted for is `onSubmit`, which keeps them. The caller says what the panel holds for
 * `text` and what a chip stands for.
 */
export function CutSearch({
  label,
  chips,
  onRemove,
  text,
  onText,
  sections,
  onPick,
  onSubmit,
  onClear,
  placeholder,
  className,
}: {
  label: string;
  chips: readonly CutChip[];
  onRemove: (id: string) => void;
  text: string;
  onText: (text: string) => void;
  sections: readonly CutSearchSection[];
  onPick: (id: string) => void;
  onSubmit: (text: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const { picking, reopen, reopened, choose } = usePicks(sections, onPick);
  useSlashFocus(input);
  return (
    <div ref={bar} className={className}>
      <CutField>
        <Body size="medium" component="span" className="flex flex-wrap items-center gap-2 py-1.5 pl-3.5 pr-4">
          <Search aria-hidden="true" size={16} className="shrink-0 text-on-surface-variant" />
          {chips.map((chip) => (
            <SearchChip key={chip.id} chip={chip} onRemove={onRemove} />
          ))}
          <ComboBox
            aria-label={label}
            allowsCustomValue
            allowsEmptyCollection
            menuTrigger="focus"
            inputValue={text}
            onInputChange={(value) => {
              if (!picking.current || value !== '') onText(value);
            }}
            selectedKey={null}
            onSelectionChange={(key) => {
              if (key !== null) choose(String(key));
            }}
            items={sections}
            className="flex min-w-32 flex-1"
          >
            <BarInput
              input={input}
              placeholder={chips.length === 0 ? placeholder : undefined}
              bar={{ text, chips, onRemove, onSubmit }}
              reopen={reopen}
              onReopened={reopened}
              onChoose={choose}
            />
            <Popover className={CHOICES} placement="bottom start" triggerRef={bar}>
              <CutSearchPanel sections={sections} />
            </Popover>
          </ComboBox>
          {onClear && (chips.length > 0 || text !== '') && (
            <IconButton size="xsmall" variant="standard" icon={X} aria-label="Clear everything" onPress={onClear} />
          )}
        </Body>
      </CutField>
    </div>
  );
}
