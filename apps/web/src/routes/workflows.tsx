import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Markdown } from '../components/Markdown';
import { StartRun } from '../components/StartRun';
import { WorkflowCanvas } from '../components/WorkflowCanvas';
import { workflowsQuery, type WorkflowListing } from '../lib/api';

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
        <Markdown className="text-sm">{description}</Markdown>
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
          <StepLinks workflow={workflow} />
          <StartRun workflow={workflow} />
        </>
      )}
    </section>
  );
}

/** Each step's page — what its agent is told, and its keys explained — in the order a run runs them: as a block on the graph opens it, by keyboard. */
function StepLinks({ workflow }: { workflow: WorkflowListing }) {
  return (
    <nav aria-label={`Steps of ${workflow.name}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
      <span className="text-neutral-500">Read a step:</span>
      {workflow.steps.map(({ name }) => (
        <Link
          key={name}
          to="/workflows/$from/$workflow/steps/$step"
          params={{ from: workflow.from, workflow: workflow.name, step: name }}
          className="font-mono font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-900 dark:text-neutral-100 dark:decoration-neutral-600 dark:hover:decoration-neutral-100"
        >
          {name}
        </Link>
      ))}
    </nav>
  );
}
