import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FactoryTags } from '../components/FactoryTag';
import { FavoriteStar } from '../components/FavoriteStar';
import { Markdown } from '../components/Markdown';
import { RemoveWorkflow } from '../components/RemoveWorkflow';
import { StartRun } from '../components/StartRun';
import { StepRows } from '../components/StepRows';
import { WorkflowBuilder } from '../components/WorkflowBuilder';
import { WorkflowCanvas } from '../components/WorkflowCanvas';
import { FromBadge, NoBuilder } from '../components/WorkflowParts';
import { factoriesQuery, storeQuery, workflowsQuery, type Factory, type PagePlace, type WorkflowListing } from '../lib/api';
import { pagePlaceOf } from '../lib/factories';
import { specStep, barOf } from '../lib/bar';
import { hiresInto, workflowFactories } from '../lib/factories';

/**
 * The page's search: `build`, while the builder of one of yours is open; and the place its steps' pages are read in, `factory` and `repo`,
 * as the Workflows list or a run reached it.
 */
const workflowSearch = (search: Record<string, unknown>): { build?: true } & PagePlace => ({
  ...(search.build === true || search.build === 'true' ? { build: true as const } : {}),
  ...pagePlaceOf(search),
});

/**
 * The page of a workflow, at /workflows/$from/$workflow: `workflows_` draws it on its own, not inside the Workflows page, which has no
 * outlet for it. `?build=true` opens the builder of one of yours.
 */
export const Route = createFileRoute('/workflows_/$from/$workflow')({
  validateSearch: workflowSearch,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(workflowsQuery),
      context.queryClient.ensureQueryData(storeQuery),
      context.queryClient.prefetchQuery(factoriesQuery),
    ]),
  component: WorkflowPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToWorkflows />
      <p className="text-sm text-red-600">Could not load this workflow: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

/**
 * One workflow: what it is, its star, the factories it is in, its README whole — the workflow level's instruction — then, for one that
 * reads, its graph, its steps a row each, and a start; for one that does not, the loader's refusal in their place. One of yours is built
 * here, its builder in place of the README, the graph, the rows and the start while `build` is in the address — the README is edited
 * there — and removed, which leaves for the Workflows page; the repository's says why it has neither.
 */
function WorkflowPage() {
  const { from, workflow: name } = Route.useParams();
  const { data: all } = useSuspenseQuery(workflowsQuery);
  const { build: building = false, ...place } = Route.useSearch();
  const navigate = useNavigate();
  const { data: factories } = useQuery(factoriesQuery);
  const workflow = all.find((w) => w.from === from && w.name === name);
  if (!workflow) return <NotListed from={from} name={name} />;
  const buildable = workflow.from === 'yours' && !workflow.error;
  const open = building && buildable;

  return (
    <article aria-label={`Workflow ${workflow.name}`} className="space-y-6">
      <BackToWorkflows />
      <WorkflowHeader
        workflow={workflow}
        onBuild={
          buildable && !open
            ? () =>
                void navigate({
                  to: '.',
                  search: (search) => ({
                    ...search,
                    build: true as const,
                    bar: specStep(barOf(search.bar), workflow.from, workflow.name) === null ? search.bar : undefined,
                  }),
                })
            : undefined
        }
        onRemoved={() => navigate({ to: '/workflows' })}
        removable={workflow.from === 'yours' && !open}
      />
      {!open && <Readme text={workflow.readme} />}
      {workflow.error ? (
        <Refused error={workflow.error} />
      ) : open ? (
        <WorkflowBuilder
          workflow={workflow}
          onClose={() => void navigate({ to: '.', search: (search) => ({ ...search, build: undefined }), replace: true })}
        />
      ) : (
        <>
          <WorkflowCanvas workflow={workflow} />
          <section className="space-y-2">
            <h2 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Steps</h2>
            <NotOffered workflow={workflow} factory={place.factory} factories={factories} />
            <StepRows workflow={workflow} place={place} hiring={hiresInto(workflow, place.factory, factories)} />
          </section>
          <StartRun workflow={workflow} />
        </>
      )}
    </article>
  );
}

/**
 * The workflow's head: its name, its star, which puts it under Favorites, where it is read from, the factories it is in, each linked to
 * its floor, its step count and its folder; Build where `onBuild` is given, Remove where `removable`, and why it has no builder.
 */
function WorkflowHeader({
  workflow,
  onBuild,
  onRemoved,
  removable,
}: {
  workflow: WorkflowListing;
  onBuild: (() => void) | undefined;
  onRemoved: () => Promise<void>;
  removable: boolean;
}) {
  const { name, from, dir, steps, error } = workflow;
  const { data: factories } = useQuery(factoriesQuery);
  return (
    <header className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="font-mono text-base font-semibold">{name}</h1>
        <FavoriteStar favorite={{ kind: 'workflow', from, workflow: name }} name={from === 'yours' ? `${name} (yours)` : name} />
        <FromBadge from={from} />
        <FactoryTags names={workflowFactories(workflow, factories ?? [])} linked />
        {!error && (
          <span className="text-xs text-neutral-500">
            {steps.length} {steps.length === 1 ? 'step' : 'steps'}
          </span>
        )}
        {(onBuild || removable) && <span aria-hidden className="ml-auto" />}
        {onBuild && (
          <button
            type="button"
            onClick={onBuild}
            className="rounded border border-neutral-300 px-2 py-0.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Build
          </button>
        )}
        {removable && <RemoveWorkflow workflow={workflow} onRemoved={onRemoved} />}
      </div>
      <p className="font-mono text-[11px] break-all text-neutral-500">{dir}</p>
      <NoBuilder workflow={workflow} />
    </header>
  );
}

/**
 * Once above the steps, where the factory picked is one in the store that does not offer the workflow: that it hires no one into its
 * steps until the workflow is attached to it.
 */
function NotOffered({
  workflow,
  factory,
  factories,
}: {
  workflow: WorkflowListing;
  factory: string | undefined;
  factories: readonly Factory[] | undefined;
}) {
  const named = factories?.find((f) => f.name === factory && !f.default);
  if (!named || hiresInto(workflow, factory, factories)) return null;
  return (
    <p data-not-offered={named.name} className="text-xs text-neutral-500">
      {named.name} does not offer {workflow.name}, so it hires no agent into its steps: attach the workflow to {named.name} first, and its
      steps can be hired into here.
    </p>
  );
}

/** The README whole, as the markdown it is written in, or that there is none. */
function Readme({ text }: { text: string | null }) {
  return (
    <section
      aria-label="README"
      className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <h2 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">README</h2>
      {text?.trim() ? (
        <Markdown className="text-sm">{text}</Markdown>
      ) : (
        <p className="text-sm text-neutral-500">
          No README: a <code className="font-mono text-xs">README.md</code> in the folder says what the workflow is for, its first paragraph
          its description.
        </p>
      )}
    </section>
  );
}

/** Why the folder does not read as a workflow, in the loader's words: it cannot start. */
function Refused({ error }: { error: string }) {
  return (
    <div className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
      <p className="text-sm font-medium text-red-800 dark:text-red-300">Does not read as a workflow, so it cannot start:</p>
      <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{error}</p>
    </div>
  );
}

/** A workflow the api does not list, here or no longer: said so, with the way back. */
function NotListed({ from, name }: { from: string; name: string }) {
  return (
    <div className="space-y-3">
      <BackToWorkflows />
      <p data-not-listed className="text-sm text-neutral-500">
        No workflow <span className="font-mono">{name}</span> is listed {from === 'yours' ? 'among yours' : "in this repository's"}: it may
        have been removed or renamed.
      </p>
    </div>
  );
}

function BackToWorkflows() {
  return (
    <Link to="/workflows" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
      ← Workflows
    </Link>
  );
}
