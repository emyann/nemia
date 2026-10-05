import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { RouteLink } from '../components/AgentParts';
import { FactoryTags } from '../components/FactoryTag';
import { FavoriteStar } from '../components/FavoriteStar';
import { Markdown } from '../components/Markdown';
import { NewWorkflow } from '../components/NewWorkflow';
import { FromBadge, YoursFolder } from '../components/WorkflowParts';
import { factoriesQuery, storeQuery, workflowsQuery, type WorkflowListing } from '../lib/api';
import { factorySearch, offeredIn, workflowFactories } from '../lib/factories';

export const Route = createFileRoute('/workflows')({
  validateSearch: factorySearch,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(workflowsQuery),
      context.queryClient.ensureQueryData(storeQuery),
      context.queryClient.prefetchQuery(factoriesQuery),
    ]),
  component: WorkflowsPage,
  errorComponent: ({ error }) => (
    <p className="text-sm text-red-600">
      Could not load the workflows: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

const where = <code className="font-mono text-xs">workflows/</code>;

/**
 * Every workflow the repository carries, then yours: a card each, linked to its page — and yours made on the board, the one just made
 * opened on its page in its builder. With a factory picked in the address, `?factory=<name>`, only those it offers (`offeredIn`); one that
 * is in none says so, and how to show every factory's.
 */
function WorkflowsPage() {
  const { data: all } = useSuspenseQuery(workflowsQuery);
  const { data: store } = useSuspenseQuery(storeQuery);
  const { data: factories } = useQuery(factoriesQuery);
  const { factory } = Route.useSearch();
  const navigate = useNavigate();
  const workflows = all.filter(offeredIn(factory, factories));

  return (
    <article className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-neutral-500">
          A workflow is a folder of steps: this repository's under {where}, and yours under <YoursFolder />. Starting a run writes its
          record and files nothing: the daemon — this api, or the command line's — files its steps. Each has its page; yours are built
          there.
        </p>
        <NewWorkflow
          folder={store.workflows}
          onCreated={(name) =>
            void navigate({ to: '/workflows/$from/$workflow', params: { from: 'yours', workflow: name }, search: { build: true } })
          }
        />
      </div>
      {workflows.length === 0 && all.length > 0 && (
        <p data-filtered-out className="text-sm text-neutral-500">
          No workflow is in the factory <span className="font-mono">{factory}</span>.{' '}
          <Link to="/workflows" search={{}} replace className="underline underline-offset-2">
            Show every factory&apos;s
          </Link>
          .
        </p>
      )}
      {workflows.map((workflow) => (
        <WorkflowCard key={`${workflow.from}:${workflow.name}`} workflow={workflow} />
      ))}
      {all.length === 0 && (
        <p className="text-sm text-neutral-500">
          No workflows. Add a folder of steps under {where} in the repository —{' '}
          <code className="font-mono text-xs">workflows/dev/implement.md</code>, say — or under <YoursFolder />.
        </p>
      )}
    </article>
  );
}

/**
 * A workflow's card, compact: its name, linked to its page, which holds the rest — its README, its graph, its steps and a start, and for
 * one of yours its builder; its star, which puts it under Favorites, shown for one that does not read too; where it is read from; the
 * factories it is in (`workflowFactories`), each linked to its floor — nothing while they are unread or for one in none; its step count
 * and its description; or, for one that does not read, a line saying so.
 */
function WorkflowCard({ workflow }: { workflow: WorkflowListing }) {
  const { name, from, description, steps, error } = workflow;
  const { data: factories } = useQuery(factoriesQuery);
  return (
    <section
      aria-label={`Workflow ${name}`}
      data-from={from}
      className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-mono text-base font-semibold">
          <RouteLink
            to="/workflows/$from/$workflow"
            params={{ from, workflow: name }}
            className="rounded-sm underline decoration-neutral-300 underline-offset-2 outline-none hover:decoration-neutral-900 focus-visible:ring-2 focus-visible:ring-ring/50 dark:decoration-neutral-600 dark:hover:decoration-neutral-100"
          >
            {name}
          </RouteLink>
        </h2>
        <FavoriteStar favorite={{ kind: 'workflow', from, workflow: name }} name={from === 'yours' ? `${name} (yours)` : name} />
        <FromBadge from={from} />
        <FactoryTags names={workflowFactories(workflow, factories ?? [])} linked />
        {!error && (
          <span className="text-xs text-neutral-500">
            {steps.length} {steps.length === 1 ? 'step' : 'steps'}
          </span>
        )}
      </header>
      {description ? (
        <Markdown className="text-sm">{description}</Markdown>
      ) : (
        <p className="text-sm text-neutral-500">
          No description: the first paragraph of a <code className="font-mono text-xs">README.md</code> in the folder is one.
        </p>
      )}
      {error && (
        <p data-refusal className="text-xs text-red-700 dark:text-red-400">
          Does not read as a workflow, so it cannot start: its page says why.
        </p>
      )}
    </section>
  );
}
