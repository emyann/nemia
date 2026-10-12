import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositoryQuery, runsQuery, startRun, type Place, type RunSummary, type Started, type WorkflowListing } from '../lib/api';
import { standingOf, titleOf } from '../lib/factory';
import { afterFor, ignoredRepoNote } from '../lib/inbox';
import { ContextPicker } from './ContextPicker';
import { runsMoved } from '@/lib/runWrites';

/**
 * A brief, the runs the new run waits on, the runs it reads as context (`ContextPicker`), and the button that starts a run of the
 * workflow with them: then the new run, linked to its page, or the api's refusal in full — the loader's, the CLI `start`'s
 * (`afterRefusal`'s, for a run it will not wait on, or `contextRefusal`'s, for one it will not read), or its own about the brief.
 *
 * Given a `card`, it starts that inbox card, as the CLI's `start <inbox>/<card>.md --brief <brief>` does: the brief is prefilled with the
 * card's body, to make into the work, and the start is refused in the package's words — a card not there, one started already. `onStarted`
 * is told of a start the api took, and whether its card left the inbox (`removed`, and `why` not), which the caller shows; the Workflows
 * page gives none, and says where the run is itself. `repo` is where the run starts, when the card names a repository: what the runs to
 * wait on are listed from. A card's start sits under the workflow it picks, with no rule of its own above it. `place` starts it in a
 * factory, on one of its repositories, which `repo` then is too.
 *
 * A team whose every step works in a folder runs on no repository, and the CLI's `start` refuses `--after` for one, since there is no
 * branch to wait on: no picker is drawn and nothing about a repository, and the start sends what the workflow takes of the picks
 * (`afterFor`), none for such a team. A card that names a repository for such a team is started all the same, its repository unread; the
 * package says so afterwards, and this form says it before, while the choice is still a person's (`ignoredRepoNote`). A start reads the
 * list of runs again alone (`exact`): a prefix would reach every run's decision, which is keyed by the run's state and read again under a
 * key of its own.
 *
 * A card's inbox is read again after any answer to its start. Taken, the card leaves it; refused, it may have left behind the page's back —
 * a 404 for a card dropped, a 409 for one started — and this form with it. So the caller given `onRefused` shows the refusal where it
 * outlives the form, told the api's words, and null when the start is asked again; the form then shows none of its own.
 */
export function StartRun({
  workflow,
  card,
  repo,
  place,
  onStarted,
  onRefused,
}: {
  workflow: WorkflowListing;
  card?: { name: string; body: string };
  repo?: string;
  place?: Place;
  onStarted?: (started: Started) => void;
  onRefused?: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [brief, setBrief] = useState(card?.body ?? '');
  const [after, setAfter] = useState<string[]>([]);
  const [context, setContext] = useState<string[]>([]);
  const inFolders = workflow.folderTeam;
  const ignored = ignoredRepoNote(workflow, repo);
  const start = useMutation({
    mutationFn: (asked: { brief: string; after: string[]; context: string[] }) =>
      startRun(
        {
          workflow: workflow.name,
          from: workflow.from,
          brief: asked.brief,
          ...(asked.after.length ? { after: asked.after } : {}),
          ...(asked.context.length ? { context: asked.context } : {}),
          ...(card ? { card: card.name } : {}),
        },
        place,
      ),
    onMutate: () => onRefused?.(null),
    onSuccess: (started) => {
      if (!card) {
        setBrief('');
        setAfter([]);
        setContext([]);
      }
      void runsMoved(queryClient);
      onStarted?.(started);
    },
    onError: (error) => onRefused?.(error.message),
    onSettled: () => {
      if (card) void queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
  const field = useId();

  return (
    <form
      aria-label={card ? `Start ${card.name}` : `Start a run of ${workflow.name}`}
      className={card ? 'space-y-2' : 'space-y-2 border-t border-outline-variant pt-4'}
      onSubmit={(event) => {
        event.preventDefault();
        start.mutate({ brief, after: afterFor(workflow, after), context });
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
        className="block w-full resize-y rounded border border-outline bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:border-on-surface-variant focus:outline-none"
      />
      {!inFolders && <AfterPicker selected={after} onChange={setAfter} repo={repo} />}
      <ContextPicker selected={context} onChange={setContext} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!brief.trim() || start.isPending}
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {start.isPending ? 'Starting…' : 'Start'}
        </button>
        <Where workflow={workflow} repo={repo} factory={place?.factory} card={!!card} />
      </div>
      {ignored && (
        <p data-ignored-repo className="text-xs text-yours">
          {ignored}
        </p>
      )}

      {start.isSuccess && <StartedLine id={start.data.id} after={start.variables.after} />}
      {start.isError && !onRefused && (
        <div data-refused className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
          <p className="text-sm font-medium text-on-failure-container">Not started. The api refused it:</p>
          <p className="font-mono text-xs whitespace-pre-wrap break-words text-on-failure-container">{start.error.message}</p>
        </div>
      )}
    </form>
  );
}

/**
 * That run `id` was started, linked to its page, and when its steps are filed: on the daemon's next pass, once each of `after` has
 * shipped.
 */
function StartedLine({ id, after }: { id: string; after: readonly string[] }) {
  return (
    <p className="text-sm" data-started={id}>
      Started{' '}
      <Link to="/runs/$runId" params={{ runId: id }} className="font-mono text-sm underline underline-offset-2">
        {id}
      </Link>
      . Nothing is filed until the daemon&apos;s next pass
      {after.length > 0 && (
        <>
          , and {after.join(' and ')} {after.length > 1 ? 'have' : 'has'} shipped
        </>
      )}
      .
    </p>
  );
}

/**
 * Where a start runs: in folders, for a team whose every step works in one, else on `repo` — this repository when none is given — and in
 * `factory` when one is named; from the workflow's folder; and, for a card, that it leaves the inbox.
 */
function Where({ workflow, repo, factory, card }: { workflow: WorkflowListing; repo?: string; factory?: string; card: boolean }) {
  return (
    <span className="min-w-0 text-xs text-muted-foreground">
      {workflow.folderTeam ? (
        'Works in folders it makes for each step'
      ) : (
        <>Runs in {repo ? <code className="font-mono break-all">{repo}</code> : 'this repository'}</>
      )}
      {factory && (
        <>
          {' '}
          in the factory <code className="font-mono">{factory}</code>
        </>
      )}
      , from <code className="font-mono break-all">{workflow.dir}</code>
      {card && ', and the card leaves the inbox'}.
    </span>
  );
}

/**
 * The runs a new run waits on (the CLI's `start --after`): every run on the repository a start runs in, in flight and finished, newest
 * first, each by its title and id, picked as many as it waits on. None is left out for a reason the board would have to work out — which
 * runs it may wait on is the package's to say (`afterRefusal`), and its refusal is shown with the start's. `repo` is that repository when
 * it is not the api's own: an inbox card's `repo:`. The runs are read as the page opens, not on the list's beat: a run started since is
 * listed on the next visit. A title wraps within its row, read whole, and no row runs past the card it is in, however long the title.
 */
export function AfterPicker({
  selected,
  onChange,
  repo,
}: {
  selected: readonly string[];
  onChange: (after: string[]) => void;
  repo?: string;
}) {
  const repository = useQuery(repositoryQuery);
  const runs = useQuery({ ...runsQuery, refetchInterval: false });
  const legend = useId();
  const error = repository.error ?? runs.error;
  const where = repo ?? repository.data?.repo;
  const onRepo = where && runs.data ? newestFirst(runs.data.filter((run) => run.repo === where)) : null;

  return (
    <fieldset aria-labelledby={legend} className="min-w-0 space-y-1.5">
      <legend id={legend} className="text-sm font-medium">
        After
      </legend>
      <p className="text-xs text-muted-foreground">
        Waits until it ships: nothing of it is filed until each has shipped, and it is handed what each concluded.
      </p>
      {error ? (
        <p className="text-xs text-failure">Could not list the runs to wait on: {error.message}</p>
      ) : !onRepo ? (
        <p className="text-xs text-muted-foreground">Reading the runs…</p>
      ) : !onRepo.length ? (
        <p className="text-xs text-muted-foreground">No run on this repository to wait on.</p>
      ) : (
        <ul aria-label="Runs to wait on" className="max-h-44 divide-y divide-outline-variant overflow-y-auto rounded border border-outline">
          {onRepo.map((run) => (
            <li key={run.id} data-run={run.id}>
              <label className="flex cursor-pointer items-baseline gap-2 px-2 py-1 text-sm hover:bg-accent">
                <input
                  type="checkbox"
                  value={run.id}
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
    </fieldset>
  );
}

const newestFirst = (runs: readonly RunSummary[]): RunSummary[] =>
  [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
