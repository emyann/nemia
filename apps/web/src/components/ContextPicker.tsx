import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { concludedQuery, runsQuery, type RunSummary } from '../lib/api';
import { standingOf, titleOf } from '../lib/factory';
import { Markdown } from './Markdown';

/**
 * The runs a run reads as context (the CLI's `start --from`, a card's `from:`): every run in the store, newest first, each by its title and
 * id, picked as many as it reads. Reading is no wait: a run picked here holds nothing of the new run back. Which runs it may read is the
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
  const runs = useQuery({ ...runsQuery, refetchInterval: false });
  const legend = useId();
  const listed = runs.data ? newestFirst(runs.data) : null;

  return (
    <fieldset aria-labelledby={legend} data-context-picker className="min-w-0 space-y-1.5">
      <legend id={legend} className="text-sm font-medium">
        {label}
      </legend>
      <p className="text-xs text-muted-foreground">
        Reads what it concluded: it does not wait. A run still in flight hands what it has when the steps are filed, not shipped, not
        judged.
      </p>
      {runs.error ? (
        <p className="text-xs text-red-700 dark:text-red-400">Could not list the runs to read: {runs.error.message}</p>
      ) : !listed ? (
        <p className="text-xs text-muted-foreground">Reading the runs…</p>
      ) : !listed.length ? (
        <p className="text-xs text-muted-foreground">No run to read.</p>
      ) : (
        <ul
          aria-label="Runs to read"
          className="max-h-44 divide-y divide-neutral-200 overflow-y-auto rounded border border-neutral-300 dark:divide-neutral-800 dark:border-neutral-700"
        >
          {listed.map((run) => (
            <li key={run.id} data-run={run.id}>
              <label className="flex cursor-pointer items-baseline gap-2 px-2 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900">
                <input
                  type="checkbox"
                  value={run.id}
                  disabled={disabled}
                  checked={selected.includes(run.id)}
                  onChange={(event) => onChange(event.target.checked ? [...selected, run.id] : selected.filter((id) => id !== run.id))}
                  className="translate-y-0.5 self-start"
                />
                <span data-run-title className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]" title={titleOf(run)}>
                  {titleOf(run)}
                </span>
                <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">{run.id}</span>
                <span data-standing className="shrink-0 text-[11px] text-muted-foreground" title={run.waiting?.advice}>
                  {standingOf(run)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {selected.map((id) => (
        <ConcludedPreview key={id} run={id} />
      ))}
    </fieldset>
  );
}

/**
 * What a picked run would hand, as the api answers it (`concludedQuery`): its section drawn as markdown, under its id, with a `not shipped,
 * not judged` badge for a run that has not shipped; or why it could not be read.
 */
export function ConcludedPreview({ run }: { run: string }) {
  const concluded = useQuery(concludedQuery(run));
  return (
    <section data-concluded={run} className="space-y-1 rounded border border-neutral-200 p-2 dark:border-neutral-800">
      <h4 className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          What <span className="font-mono">{run}</span> hands
        </span>
        {concluded.data && !concluded.data.shipped && (
          <Badge variant="outline" data-not-shipped className="border-amber-400 text-amber-800 dark:border-amber-700 dark:text-amber-300">
            not shipped, not judged
          </Badge>
        )}
      </h4>
      {concluded.error ? (
        <p className="text-xs text-red-700 dark:text-red-400">Could not read what it concluded: {concluded.error.message}</p>
      ) : !concluded.data ? (
        <p className="text-xs text-muted-foreground">Reading what it concluded…</p>
      ) : (
        <Markdown level={5} className="max-h-60 overflow-y-auto rounded bg-muted/60 p-2 text-xs">
          {concluded.data.section}
        </Markdown>
      )}
    </section>
  );
}

const newestFirst = (runs: readonly RunSummary[]): RunSummary[] =>
  [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
