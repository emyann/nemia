import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositoryQuery, runsQuery, startRun, type RunSummary, type Started, type WorkflowListing } from '../lib/api';
import { standingOf, titleOf } from '../lib/factory';

/**
 * A brief, the runs the new run waits on, and the button that starts a run of the workflow with them: then the new run, linked to
 * its page, or the api's refusal in full — the loader's, `wf start`'s (`afterRefusal`'s, for a run it will not wait on), or its own
 * about the brief.
 *
 * Given a `card`, it starts that inbox card, as `wf start <inbox>/<card>.md --brief <brief>` does: the brief is prefilled with the card's body,
 * to make into the work, and the start is refused in the package's words — a card not there, one started already. `onStarted` is told of a
 * start the api took; the Workflows page gives none, and says where the run is itself. `repo` is where the run starts, when the card names a
 * repository: what the runs to wait on are listed from.
 */
export function StartRun({ workflow, card, repo, onStarted }: {
  workflow: WorkflowListing;
  card?: { name: string; body: string };
  repo?: string;
  onStarted?: (started: Started) => void;
}) {
  const queryClient = useQueryClient();
  const [brief, setBrief] = useState(card?.body ?? '');
  const [after, setAfter] = useState<string[]>([]);
  const start = useMutation({
    mutationFn: (asked: { brief: string; after: string[] }) =>
      startRun({
        workflow: workflow.name,
        from: workflow.from,
        brief: asked.brief,
        ...(asked.after.length ? { after: asked.after } : {}),
        ...(card ? { card: card.name } : {}),
      }),
    onSuccess: (started) => {
      if (!card) {
        setBrief('');
        setAfter([]);
      }
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
      if (card) void queryClient.invalidateQueries({ queryKey: ['inbox'] });
      onStarted?.(started);
    },
  });
  const field = useId();

  return (
    <form
      aria-label={card ? `Start ${card.name}` : `Start a run of ${workflow.name}`}
      // A card's start sits under the workflow it picks, which has the rule above it.
      className={card ? 'space-y-2' : 'space-y-2 border-t border-neutral-200 pt-4 dark:border-neutral-800'}
      onSubmit={(event) => {
        event.preventDefault();
        start.mutate({ brief, after });
      }}
    >
      <label htmlFor={field} className="block text-sm font-medium">
        {card ? 'Brief' : 'Start a run'}
      </label>
      <textarea
        id={field}
        value={brief}
        onChange={(event) => setBrief(event.target.value)}
        rows={card ? 5 : 3}
        placeholder="What to do: the brief each step is told, under “What was asked for”."
        className="block w-full resize-y rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:text-neutral-500 dark:focus:border-neutral-400"
      />
      <AfterPicker selected={after} onChange={setAfter} repo={repo} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!brief.trim() || start.isPending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:disabled:hover:bg-neutral-100"
        >
          {start.isPending ? 'Starting…' : 'Start'}
        </button>
        <span className="min-w-0 text-xs text-neutral-500">
          Runs in {repo ? <code className="font-mono break-all">{repo}</code> : 'this repository'}, from <code className="font-mono break-all">{workflow.dir}</code>
          {card && ', and the card leaves the inbox'}.
        </span>
      </div>

      {start.isSuccess && (
        <p className="text-sm" data-started={start.data.id}>
          Started{' '}
          <Link to="/runs/$runId" params={{ runId: start.data.id }} className="font-mono text-sm underline underline-offset-2">
            {start.data.id}
          </Link>
          . Nothing is filed until <code className="font-mono text-xs">wf tick</code> or <code className="font-mono text-xs">wf up</code> runs
          {start.variables.after.length > 0 && <>, and {start.variables.after.join(' and ')} {start.variables.after.length > 1 ? 'have' : 'has'} shipped</>}.
          {start.data.removed === false && (
            <span data-kept className="block text-amber-700 dark:text-amber-400">
              The card is still in the inbox — {start.data.why}. It lists as started; Remove drops it.
            </span>
          )}
        </p>
      )}
      {start.isError && (
        <div data-refused className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Not started. The api refused it:</p>
          <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{start.error.message}</p>
        </div>
      )}
    </form>
  );
}

/**
 * The runs a new run waits on (`wf start --after`): every run on the repository a start runs in, in flight and finished, newest first,
 * each by its title and id, picked as many as it waits on. None is left out for a reason the board would have to work out — which runs it
 * may wait on is the package's to say (`afterRefusal`), and its refusal is shown with the start's. `repo` is that repository when it is not
 * the api's own: an inbox card's `repo:`.
 */
export function AfterPicker({ selected, onChange, repo }: { selected: readonly string[]; onChange: (after: string[]) => void; repo?: string }) {
  const repository = useQuery(repositoryQuery);
  // Read as the page opens, and not on the list's beat: a run started since is here on the next visit.
  const runs = useQuery({ ...runsQuery, refetchInterval: false });
  const legend = useId();
  const error = repository.error ?? runs.error;
  const where = repo ?? repository.data?.repo;
  const onRepo = where && runs.data ? newestFirst(runs.data.filter((run) => run.repo === where)) : null;

  return (
    <fieldset aria-labelledby={legend} className="space-y-1.5">
      <legend id={legend} className="text-sm font-medium">
        After
      </legend>
      <p className="text-xs text-neutral-500">
        The runs it waits on: nothing of it is filed until each has shipped, as <code className="font-mono">wf start --after</code> has it.
      </p>
      {error ? (
        <p className="text-xs text-red-700 dark:text-red-400">Could not list the runs to wait on: {error.message}</p>
      ) : !onRepo ? (
        <p className="text-xs text-neutral-500">Reading the runs…</p>
      ) : !onRepo.length ? (
        <p className="text-xs text-neutral-500">No run on this repository to wait on.</p>
      ) : (
        <ul
          aria-label="Runs to wait on"
          className="max-h-44 divide-y divide-neutral-200 overflow-y-auto rounded border border-neutral-300 dark:divide-neutral-800 dark:border-neutral-700"
        >
          {onRepo.map((run) => (
            <li key={run.id} data-run={run.id}>
              <label className="flex cursor-pointer items-baseline gap-2 px-2 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900">
                <input
                  type="checkbox"
                  value={run.id}
                  checked={selected.includes(run.id)}
                  onChange={(event) => onChange(event.target.checked ? [...selected, run.id] : selected.filter((id) => id !== run.id))}
                  className="translate-y-0.5 self-start"
                />
                <span className="min-w-0 flex-1 truncate" title={titleOf(run)}>
                  {titleOf(run)}
                </span>
                <span className="hidden shrink-0 font-mono text-[11px] text-neutral-500 sm:inline">{run.id}</span>
                <span data-standing className="shrink-0 text-[11px] text-neutral-500" title={run.waiting?.advice}>
                  {standingOf(run)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

const newestFirst = (runs: readonly RunSummary[]): RunSummary[] =>
  [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
