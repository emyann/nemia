import { useEffect, useRef, useState } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { FactoryTags } from '../components/FactoryTag';
import { Markdown } from '../components/Markdown';
import { NewWorkflow } from '../components/NewWorkflow';
import { StartRun } from '../components/StartRun';
import { WorkflowBuilder } from '../components/WorkflowBuilder';
import { WorkflowCanvas } from '../components/WorkflowCanvas';
import { factoriesQuery, workflowsQuery, type WorkflowListing } from '../lib/api';
import { factorySearch, offeredIn, workflowFactories } from '../lib/factories';
import { workflowAnchor } from '../lib/favorites';
import { specStep } from '../lib/bar';
import { useBar } from '../lib/useBar';

export const Route = createFileRoute('/workflows')({
  validateSearch: factorySearch,
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(workflowsQuery), context.queryClient.prefetchQuery(factoriesQuery)]),
  component: WorkflowsPage,
  errorComponent: ({ error }) => (
    <p className="text-sm text-red-600">
      Could not load the workflows: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

const where = <code className="font-mono text-xs">workflows/</code>;
const yours = <code className="font-mono text-xs">~/.agent-workflows/workflows/</code>;

/**
 * Every workflow the repository carries, then yours: a card each, drawn, and startable — and yours built on the board, the one just made
 * opened in its builder. With a factory picked in the address, `?factory=<name>`, only those it offers (`offeredIn`); one that is in none
 * says so, and how to show every factory's.
 */
function WorkflowsPage() {
  const { data: all } = useSuspenseQuery(workflowsQuery);
  const { data: factories } = useQuery(factoriesQuery);
  const { factory } = Route.useSearch();
  const [made, setMade] = useState<string | null>(null);
  const workflows = all.filter(offeredIn(factory, factories));

  return (
    <article className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-neutral-500">
          A workflow is a folder of steps: this repository's under {where}, and yours under {yours}. Starting a run writes its record as{' '}
          <code className="font-mono text-xs">wf start</code> does, and files nothing: <code className="font-mono text-xs">wf up</code>{' '}
          files its steps. Yours are built here too.
        </p>
        <NewWorkflow onCreated={setMade} />
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
        <WorkflowCard
          key={`${workflow.from}:${workflow.name}`}
          workflow={workflow}
          building={workflow.from === 'yours' && workflow.name === made}
        />
      ))}
      {all.length === 0 && (
        <p className="text-sm text-neutral-500">
          No workflows. Add a folder of steps under {where} in the repository —{' '}
          <code className="font-mono text-xs">workflows/dev/implement.md</code>, say — or under {yours}.
        </p>
      )}
    </article>
  );
}

/**
 * A workflow's card: what it is, the factories it is in (`workflowFactories`), each linked to its floor — nothing while they are unread or
 * for one in none — drawn, its steps' pages and a start — or, for one of yours, its builder in their place
 * (`WorkflowBuilder`). `building` opens it in the builder, as a workflow just made is. The repository's show none, and say why: the api
 * writes nothing into a checkout. The canvas inspects a step in the frame's bar and the builder edits one, never both on one card: Build
 * swaps the one for the other, and closes the bar where it shows a step of this workflow (`useBuilding`).
 */
function WorkflowCard({ workflow, building: opened = false }: { workflow: WorkflowListing; building?: boolean }) {
  const { name, from, dir, description, steps, error } = workflow;
  const [building, build, stopBuilding] = useBuilding(workflow, opened);
  const { data: factories } = useQuery(factoriesQuery);
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (opened) card.current?.scrollIntoView({ block: 'start' });
  }, [opened]);

  return (
    <section
      ref={card}
      id={workflowAnchor({ from, workflow: name })}
      aria-label={`Workflow ${name}`}
      data-from={from}
      className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="font-mono text-base font-semibold">{name}</h2>
          <FromBadge from={from} />
          <FactoryTags names={workflowFactories(workflow, factories ?? [])} linked />
          {!error && (
            <span className="text-xs text-neutral-500">
              {steps.length} {steps.length === 1 ? 'step' : 'steps'}
            </span>
          )}
          {from === 'yours' && !error && !building && (
            <button
              type="button"
              onClick={build}
              className="ml-auto rounded border border-neutral-300 px-2 py-0.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Build
            </button>
          )}
        </div>
        <p className="font-mono text-[11px] break-all text-neutral-500">{dir}</p>
        {from === 'repo' && (
          <p data-no-builder className="text-xs text-neutral-500">
            No builder: the board writes only yours, and nothing into this checkout. To build it, copy the folder into {yours}, build it
            there, and copy it back into the repository by hand.
          </p>
        )}
        {from === 'yours' && error && (
          <p data-no-builder className="text-xs text-neutral-500">
            No builder until the folder reads: the builder puts back the steps a folder reads as. Fix its files by hand first.
          </p>
        )}
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
      ) : building ? (
        <WorkflowBuilder workflow={workflow} onClose={stopBuilding} />
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

/** Where a workflow is read from, on its card: yours, or this repository's. */
function FromBadge({ from }: { from: WorkflowListing['from'] }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] leading-none font-medium ${
        from === 'yours'
          ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
      }`}
    >
      {from === 'yours' ? 'yours' : 'this repository'}
    </span>
  );
}

/**
 * Whether `workflow`'s card has its builder open — from the start where `opened` asks it of one of yours that reads — what Build does, and
 * what closes the builder. Build closes the frame's bar where it shows a step of `workflow`, which the builder is about to draft and whose
 * form the bar would cover, then opens the builder; a bar showing anything else stays.
 */
function useBuilding(workflow: WorkflowListing, opened: boolean): [building: boolean, build: () => void, stop: () => void] {
  const [building, setBuilding] = useState(opened && workflow.from === 'yours' && !workflow.error);
  const { open, close } = useBar();
  const build = () => {
    if (specStep(open, workflow.from, workflow.name) !== null) close();
    setBuilding(true);
  };
  return [building, build, () => setBuilding(false)];
}

/**
 * Each step's page — what it is told, and its keys explained — in the order a run runs them: as a double click on a block on the graph
 * opens it, by keyboard.
 */
function StepLinks({ workflow }: { workflow: WorkflowListing }) {
  return (
    <nav aria-label={`Steps of ${workflow.name}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
      <span className="text-neutral-500">Read a step:</span>
      {workflow.steps.map(({ name }) => (
        <Link
          key={name}
          to="/workflows/$from/$workflow/$step"
          params={{ from: workflow.from, workflow: workflow.name, step: name }}
          className="font-mono font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-900 dark:text-neutral-100 dark:decoration-neutral-600 dark:hover:decoration-neutral-100"
        >
          {name}
        </Link>
      ))}
    </nav>
  );
}
