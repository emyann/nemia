import { useId, useState } from 'react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { WorkflowCanvas } from '../components/WorkflowCanvas';
import { startRun, workflowsQuery, type WorkflowListing } from '../lib/api';

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
 * A brief, and the button that starts a run of the workflow with it: then the new run, linked to its page, or the api's
 * refusal in full — the loader's, `wf start`'s, or its own about the brief.
 */
function StartRun({ workflow }: { workflow: WorkflowListing }) {
  const queryClient = useQueryClient();
  const [brief, setBrief] = useState('');
  const start = useMutation({
    mutationFn: (asked: string) => startRun({ workflow: workflow.name, from: workflow.from, brief: asked }),
    onSuccess: () => {
      setBrief('');
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
        start.mutate(brief);
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
          . Nothing is filed until <code className="font-mono text-xs">wf tick</code> or <code className="font-mono text-xs">wf up</code> runs.
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
