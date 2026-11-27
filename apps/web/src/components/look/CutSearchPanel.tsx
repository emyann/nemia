import { useContext, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Collection, ComboBoxStateContext, Header, ListBox, ListBoxItem, ListBoxSection } from 'react-aria-components';
import { Body } from '@/components/ui/ds';
import { cn } from '@/lib/utils';
import { CHOICE } from './CutSelect';

/**
 * One line the search panel offers: the key it is picked by, its words, and what goes with them. `lead` is a mark before the words (a
 * state's dot); `words` are the typed letters its label shows in bold; `tail` is a short note after it in the mono face; `hint` is a
 * quiet count; `look: 'button'` draws it as a button; `keeps` leaves the panel open once it is picked.
 */
export type CutSearchItem = {
  id: string;
  label: string;
  hint?: string;
  lead?: ReactNode;
  words?: string;
  tail?: string;
  look?: 'button';
  keeps?: boolean;
};

/** A group of the search panel: its title, a note under the title, and its lines. */
export type CutSearchSection = { id: string; title?: string; note?: string; items: readonly CutSearchItem[] };

/**
 * `label` with the first place `words` occurs, whatever its case, in bold.
 */
function Marked({ label, words }: { label: string; words: string | undefined }) {
  const at = words === undefined || words === '' ? -1 : label.toLowerCase().indexOf(words.toLowerCase());
  if (words === undefined || at < 0) return label;
  return (
    <>
      {label.slice(0, at)}
      <b className="font-bold">{label.slice(at, at + words.length)}</b>
      {label.slice(at + words.length)}
    </>
  );
}

/** A line of the panel as a person reads it: its mark, its words with the typed letters in bold, its tail and its hint. */
function Line({ item }: { item: CutSearchItem }) {
  return (
    <>
      {item.lead}
      <Body size="medium" component="span" className={cn('min-w-0 flex-1', item.look === 'button' ? 'text-center' : 'truncate')}>
        <Marked label={item.label} words={item.words} />
      </Body>
      {item.tail && (
        <Body size="small" component="span" colorRole="on-surface-variant" className="font-mono">
          {item.tail}
        </Body>
      )}
      {item.hint && (
        <Body size="small" component="span" colorRole="on-surface-variant" className="font-mono">
          {item.hint}
        </Body>
      )}
    </>
  );
}

/** The keys the panel says it answers to, drawn at its foot while the panel is open. */
function Foot() {
  const open = useContext(ComboBoxStateContext)?.isOpen ?? false;
  if (!open) return null;
  return (
    <Body size="small" component="div" colorRole="on-surface-variant" className="flex gap-4 border-t border-outline-variant px-3 pt-2 pb-1">
      <span className="inline-flex items-center gap-1">
        <ArrowUp aria-hidden="true" size={12} />
        <ArrowDown aria-hidden="true" size={12} />
        <span className="sr-only">Arrow keys</span> to move
      </span>
      <span>Enter to pick</span>
      <span>Esc to close</span>
    </Body>
  );
}

/**
 * The panel of the search bar: its groups, each with its title and lines, and the keys it answers to at its foot. It is the
 * ComboBox's list, so ↑ ↓ move between the lines and Enter picks one.
 */
export function CutSearchPanel({ sections }: { sections: readonly CutSearchSection[] }) {
  return (
    <div className="flex flex-col">
      <ListBox items={sections} aria-label="Suggestions" className="max-h-80 overflow-auto outline-none">
        {(section: CutSearchSection) => (
          <ListBoxSection id={section.id} className="pb-1">
            {section.title && (
              <Header className="px-3 pt-2 pb-1">
                <Body size="small" component="span" colorRole="on-surface-variant" className="block uppercase tracking-wide">
                  {section.title}
                </Body>
                {section.note && (
                  <Body size="small" component="span" colorRole="on-surface-variant" className="block normal-case tracking-normal">
                    {section.note}
                  </Body>
                )}
              </Header>
            )}
            <Collection items={section.items}>
              {(item: CutSearchItem) => (
                <ListBoxItem
                  id={item.id}
                  textValue={item.label}
                  className={cn(CHOICE, item.look === 'button' && 'mx-3 my-1 rounded-shape-small border border-outline')}
                >
                  <Line item={item} />
                </ListBoxItem>
              )}
            </Collection>
          </ListBoxSection>
        )}
      </ListBox>
      <Foot />
    </div>
  );
}
