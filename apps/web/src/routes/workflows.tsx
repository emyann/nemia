import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { WorkflowCanvas } from '../components/WorkflowCanvas';
import { repositoryQuery, runsQuery, startRun, workflowsQuery, type RunSummary, type WorkflowListing } from '../lib/api';
import { inFlight, titleOf } from '../lib/factory';

export const Route = createFileRoute('/workflows')({
  loader: ({ context }) => context.queryClient.ensureQueryData(workflowsQuery),
  component: WorkflowsPage,
  errorComponent: ({ error }) => (
    <p className="text-sm text-red-600">
      Could not load the workflows: {error instanceof Error ? error.message : String(error)}. Is the api running
      (<code>npm run dev</code>)?
    </p>
  ),
});

const where = <code className="font-mono text-xs">workflows/</code>;
const yours = <code className="font-mono text-xs">~/.agent-workflows/workflows/</code>;

/** Every workflow the repository carries, then yours: a card each, drawn, and startable. */
function WorkflowsPage() {
  const { data: workflows } = useSuspenseQuery(workflowsQuery);

  return (
    <article className="space-y-6">
      <p className="text-sm text-neutral-500">
        A workflow is a folder of steps: this repository's under {where}, and yours under {yours}. Starting a run writes its
        record as <code className="font-mono text-xs">wf start</code> does, and files nothing: <code className="font-mono text-xs">wf up</code> files its steps.
      </p>
      {workflows.length ? (
        workflows.map((workflow) => <WorkflowCard key={`${workflow.from}:${workflow.name}`} workflow={workflow} />)
      ) : (
        <p className="text-sm text-neutral-500">
          No workflows. Add a folder of steps under {where} in the repository — <code className="font-mono text-xs">workflows/dev/implement.md</code>, say — or under {yours}.
        </p>
      )}
    </article>
  );
}

function WorkflowCard({ workflow }: { workflow: WorkflowListing }) {
  const { name, from, dir, description, steps, error } = workflow;

  return (
    <section
      aria-label={`Workflow ${name}`}
      data-from={from}
      className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="font-mono text-base font-semibold">{name}</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] leading-none font-medium ${
              from === 'yours'
                ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
                : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
            }`}
          >
            {from === 'yours' ? 'yours' : 'this repository'}
          </span>
          {!error && (
            <span className="text-xs text-neutral-500">
              {steps.length} {steps.length === 1 ? 'step' : 'steps'}
            </span>
          )}
        </div>
        <p className="font-mono text-[11px] break-all text-neutral-500">{dir}</p>
      </header>

      {description ? (
        <p className="text-sm leading-relaxed">{description}</p>
      ) : (
        <p className="text-sm text-neutral-500">
          No description: the first paragraph of a <code className="font-mono text-xs">README.md</code> in the folder is one.
        </p>
      )}

      {error ? (
        <div className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Does not read as a workflow, so it cannot start:</p>
          <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{error}</p>
        </div>
      ) : (
        <>
          <WorkflowCanvas workflow={workflow} />
          <StartRun workflow={workflow} />
        </>
      )}
    </section>
  );
}

/**
 * A brief, the runs the new run waits on, and the button that starts a run of the workflow with them: then the new run, linked to
 * its page, or the api's refusal in full — the loader's, `wf start`'s (`afterRefusal`'s, for a run it will not wait on), or its own
 * about the brief.
 */
function StartRun({ workflow }: { workflow: WorkflowListing }) {
  const queryClient = useQueryClient();
  const [brief, setBrief] = useState('');
  const [after, setAfter] = useState<string[]>([]);
  const start = useMutation({
    mutationFn: (asked: { brief: string; after: string[] }) =>
      startRun({ workflow: workflow.name, from: workflow.from, brief: asked.brief, ...(asked.after.length ? { after: asked.after } : {}) }),
    onSuccess: () => {
      setBrief('');
      setAfter([]);
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });
  const field = useId();

  return (
    <form
      aria-label={`Start a run of ${workflow.name}`}
      className="space-y-2 border-t border-neutral-200 pt-4 dark:border-neutral-800"
      onSubmit={(event) => {
        event.preventDefault();
        start.mutate({ brief, after });
      }}
    >
      <label htmlFor={field} className="block text-sm font-medium">
        Start a run
      </label>
      <textarea
        id={field}
        value={brief}
        onChange={(event) => setBrief(event.target.value)}
        rows={3}
        placeholder="What to do: the brief each step is told, under “What was asked for”."
        className="block w-full resize-y rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:text-neutral-500 dark:focus:border-neutral-400"
      />
      <AfterPicker selected={after} onChange={setAfter} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!brief.trim() || start.isPending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:disabled:hover:bg-neutral-100"
        >
          {start.isPending ? 'Starting…' : 'Start'}
        </button>
        <span className="text-xs text-neutral-500">
          Runs in this repository, from <code className="font-mono">{workflow.dir}</code>.
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
 * may wait on is the package's to say (`afterRefusal`), and its refusal is shown with the start's.
 */
function AfterPicker({ selected, onChange }: { selected: readonly string[]; onChange: (after: string[]) => void }) {
  const repository = useQuery(repositoryQuery);
  // Read as the page opens, and not on the list's beat: a run started since is here on the next visit.
  const runs = useQuery({ ...runsQuery, refetchInterval: false });
  const legend = useId();
  const error = repository.error ?? runs.error;
  const onRepo = repository.data && runs.data ? newestFirst(runs.data.filter((run) => run.repo === repository.data.repo)) : null;

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
                <span className="shrink-0 text-[11px] text-neutral-500">{runWord(run)}</span>
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

/** Where a run stands, as the Factory has it: called off, in flight, or finished. */
const runWord = (run: RunSummary): string => (run.cancelledAt ? 'cancelled' : inFlight(run) ? 'in flight' : 'finished');
