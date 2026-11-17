import { Button, SearchBar } from '@/components/ui/ds';

/**
 * The filter over a whole list: the kit's search bar, named by its hint (`label`, "Filter workflows"), holding `text` and handing each
 * keystroke to `onText`; its own clear button and Escape empty it.
 */
export function ListFilter({ label, text, onText }: { label: string; text: string; onText: (text: string) => void }) {
  return <SearchBar data-list-filter placeholder={label} value={text} onChange={onText} className="max-w-120 shadow-none" />;
}

/**
 * What a filtered list says when the filter (`text`) keeps none of it: that nothing matches what was typed, and a press that clears the
 * filter (`onClear`).
 */
export function NothingMatches({ text, onClear }: { text: string; onClear: () => void }) {
  return (
    <div data-nothing-matches className="flex flex-wrap items-center gap-3">
      <p className="text-body-medium text-muted-foreground">
        Nothing matches <span className="font-mono text-foreground">{text.trim()}</span>.
      </p>
      <Button variant="outlined" onPress={onClear}>
        Clear the filter
      </Button>
    </div>
  );
}
