import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CutField } from '@/components/look';
import { checkSelector } from '@/lib/api/inbox';

/**
 * The label filter of a list (Inbox, Runs): a selector in the Kubernetes spelling (`team=core`, `team in (core,web)`, `!draft`), written
 * to the address' `l` once the api reads it, and left off with the field empty. A selector the api refuses (a 422) is said in its words
 * under the field, and the address is not written.
 */
export function SelectorField({
  selector,
  onSelect,
  check = checkSelector,
}: {
  selector: string | undefined;
  onSelect: (selector: string | undefined) => void;
  check?: (selector: string) => Promise<unknown>;
}) {
  const [text, setText] = useState(selector ?? '');
  const [refused, setRefused] = useState<string | null>(null);
  return (
    <form
      data-selector-field
      className="flex max-w-xl flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        const typed = text.trim();
        if (typed === '') {
          setRefused(null);
          onSelect(undefined);
          return;
        }
        check(typed).then(
          () => {
            setRefused(null);
            onSelect(typed);
          },
          (error: unknown) => setRefused(error instanceof Error ? error.message : String(error)),
        );
      }}
    >
      <CutField>
        <div className="flex items-center gap-2 py-1 pr-1 pl-3.5">
          <input
            aria-label="Filter by labels"
            name="selector"
            value={text}
            placeholder="Filter by labels: team=core"
            onChange={(event) => setText(event.target.value)}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-body-medium text-on-surface outline-none placeholder:text-on-surface-variant"
          />
          <Button type="submit" size="sm" variant="secondary">
            Filter
          </Button>
        </div>
      </CutField>
      {refused === null ? null : (
        <p role="alert" data-selector-refused className="m-0 text-body-small text-failure">
          {refused}
        </p>
      )}
    </form>
  );
}
