import { useState } from 'react';
import { Body, Button } from '@/components/ui/ds';
import { CutTextField } from '@/components/look';
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
      <CutTextField
        hideLabel
        label="Filter by labels"
        name="selector"
        value={text}
        placeholder="Filter by labels: team=core"
        onChange={setText}
        end={
          <Button type="submit" size="xsmall" variant="tonal">
            Filter
          </Button>
        }
      />
      {refused === null ? null : (
        <Body size="small" role="alert" data-selector-refused className="m-0 text-failure">
          {refused}
        </Body>
      )}
    </form>
  );
}
