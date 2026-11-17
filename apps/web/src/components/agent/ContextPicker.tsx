import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Checkbox, Tag } from '@/components/ui/ds';
import { concludedQuery } from '../../lib/api/runs.ts';
import type { RunView } from '../../lib/api/judged.ts';
import { standingOf, titleOf } from '../../lib/factory';
import { usePickerRuns } from '../../lib/pickerRuns.ts';
import { Markdown } from '../markdown/Markdown';
import { Reading, ReadingLines } from '@/components/look';
import { Skeleton } from '@/components/ui/ds';

/**
 * The runs a run reads as context (the CLI's `start --from`, a card's `from:`): the runs not finished, newest created first, then the
 * finished, newest finished first, a page of them and Show older for the next (`usePickerRuns`), each by its title and id, picked as many
 * as it reads. Reading is no wait: a run picked here holds nothing of the new run back. Which runs it may read is the
 * package's to say (`contextRefusal`), and its refusal is shown with the start's or the card's write. Each pick shows what it would hand
 * (`ConcludedPreview`). `label` names the list for a person and a page.
 */
export function ContextPicker({
  selected,
  onChange,
  label = 'Reads',
  disabled = false,
}: {
  selected: readonly string[];
  onChange: (context: string[]) => void;
  label?: string;
  disabled?: boolean;
}) {
  const runs = usePickerRuns();
  const legend = useId();
  const listed = runs.reading ? null : [...runs.open, ...runs.finished].map(listedOf);

  return (
    <fieldset aria-labelledby={legend} data-context-picker className="min-w-0 space-y-1.5">
      <legend id={legend} className="text-body-medium font-medium">
        {label}
      </legend>
      <p className="text-body-small text-muted-foreground">
        Reads what it concluded: it does not wait. A run still in flight hands what it has when the steps are filed, not landed, not judged.
      </p>
      {runs.error ? (
        <p className="text-body-small text-failure">Could not list the runs to read: {runs.error.message}</p>
      ) : !listed ? (
        <Reading label="Reading the runs…" className="divide-y divide-outline-variant rounded border border-outline">
          {[0, 1, 2].map((at) => (
            <div key={at} className="flex items-center gap-2 px-2 py-1 text-body-medium">
              <Skeleton shape="rectangle" className="size-4 rounded-none" />
              <Skeleton className="flex-1" />
              <Skeleton className="w-16" />
            </div>
          ))}
        </Reading>
      ) : !listed.length ? (
        <p className="text-body-small text-muted-foreground">No run to read.</p>
      ) : (
        <ul aria-label="Runs to read" className="max-h-44 divide-y divide-outline-variant overflow-y-auto rounded border border-outline">
          {listed.map((run) => (
            <li key={run.id} data-run={run.id}>
              <Checkbox
                value={run.id}
                isDisabled={disabled}
                isSelected={selected.includes(run.id)}
                onChange={(checked) => onChange(checked ? [...selected, run.id] : selected.filter((id) => id !== run.id))}
                className="flex w-full cursor-pointer px-2 hover:bg-accent"
              >
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span data-run-title className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]" title={run.title}>
                    {run.title}
                  </span>
                  <span className="hidden shrink-0 font-mono text-body-small text-muted-foreground @md/page:inline">{run.id}</span>
                  <span data-standing className="shrink-0 text-body-small text-muted-foreground" title={run.advice}>
                    {run.standing}
                  </span>
                </span>
              </Checkbox>
            </li>
          ))}
        </ul>
      )}
      {!runs.error && runs.more && <ShowOlder onPress={runs.older} />}
      {selected.map((id) => (
        <ConcludedPreview key={id} run={id} />
      ))}
    </fieldset>
  );
}

/**
 * What a picked run would hand, as the api answers it (`concludedQuery`): its section drawn as markdown, under its id, with a `not landed,
 * not judged` badge for a run that has not landed; or why it could not be read.
 */
export function ConcludedPreview({ run }: { run: string }) {
  const concluded = useQuery(concludedQuery(run));
  return (
    <section data-concluded={run} className="space-y-1 rounded border border-outline-variant p-2">
      <h4 className="flex flex-wrap items-center gap-2 text-body-small text-muted-foreground">
        <span>
          What <span className="font-mono">{run}</span> hands
        </span>
        {concluded.data && !concluded.data.landed && (
          <Tag variant="outlined" data-not-landed className="border-dashed">
            not landed, not judged
          </Tag>
        )}
      </h4>
      {concluded.error ? (
        <p className="text-body-small text-failure">Could not read what it concluded: {concluded.error.message}</p>
      ) : !concluded.data ? (
        <Reading label="Reading what it concluded…" className="rounded p-2">
          <ReadingLines widths={['w-full', 'w-5/6', 'w-1/2']} className="text-body-small" />
        </Reading>
      ) : (
        <Markdown level={5} className="max-h-60 overflow-y-auto rounded bg-muted/60 p-2 text-body-small">
          {concluded.data.section}
        </Markdown>
      )}
    </section>
  );
}

/** A run to read as the list draws it: its id, its title, where it stands in a word, and what to do about its wait on hover. */
type Listed = { id: string; title: string; standing: string; advice: string | undefined };

/** A run to read, as the list draws it. */
const listedOf = (run: RunView): Listed => ({ id: run.id, title: titleOf(run), standing: standingOf(run), advice: run.waiting?.advice });

/** Show older, under a picker's list: asks for the next, older page of the finished runs (`usePickerRuns`'s `older`). */
export function ShowOlder({ onPress }: { onPress: () => void }) {
  return (
    <Button variant="tonal" size="xsmall" data-picker-older onPress={onPress}>
      Show older
    </Button>
  );
}
