import type { ReactNode } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FactoryTags } from '../components/FactoryTag';
import { Markdown } from '../components/Markdown';
import { RemoveWorkflow } from '../components/RemoveWorkflow';
import { StartRun } from '../components/StartRun';
import { StepRows } from '../components/StepRows';
import { WorkflowBuilder } from '../components/WorkflowBuilder';
import { WorkflowCanvas } from '../components/WorkflowCanvas';
import { FromBadge, NoBuilder, Unplaced } from '../components/WorkflowParts';
import {
  factoriesQuery,
  storeQuery,
  workflowsInQuery,
  workflowsQuery,
  type Factory,
  type PagePlace,
  type Place,
  type WorkflowListing,
} from '../lib/api';
import { specStep, barOf } from '../lib/bar';
import { listPlace, pagePlaceOf, whyNotStarted, workflowFactories } from '../lib/factories';
import { loadWorkflowsIn } from '../lib/placed';

/**
 * The page's search: `build`, while the builder of one of yours is open; and the place the page and its steps' pages are read in,
 * `factory` and `repo`, as the Workflows list or a run reached it.
 */
const workflowSearch = (search: Record<string, unknown>): { build?: true } & PagePlace => ({
  ...(search.build === true || search.build === 'true' ? { build: true as const } : {}),
  ...pagePlaceOf(search),
});

/**
 * The page of a workflow, at /workflows/$from/$workflow: `workflows_` draws it on its own, not inside the Workflows page, which has no
 * outlet for it. `?build=true` opens the builder of one of yours. It is read in the address's place (`loadWorkflowsIn`), and one of yours
 * read in a factory loads the list read with none too, which its builder drafts from.
 */
export const Route = createFileRoute('/workflows_/$from/$workflow')({
  validateSearch: workflowSearch,
  loaderDeps: ({ search }) => ({ factory: search.factory, repo: search.repo }),
  loader: ({ context, deps, params }) =>
    Promise.all([
      loadWorkflowsIn(context.queryClient, deps),
      context.queryClient.ensureQueryData(storeQuery),
      params.from === 'yours' ? context.queryClient.prefetchQuery(workflowsQuery) : null,
    ]),
  component: WorkflowPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToWorkflows />
      <p className="text-body-medium text-failure">
        Could not load this workflow: {error instanceof Error ? error.message : String(error)}
      </p>
    </div>
  ),
});

/**
 * One workflow, read in the address's place (`listPlace`): with no factory, the folder the list read with none names (`Everywhere`); in a
 * named factory, the folder the api lists in it, its own where it shadows the repository's (`InFactory`); and where the factory lists
 * nowhere, why, with the way back (`Unplaced`).
 */
function WorkflowPage() {
  const { from, workflow: name } = Route.useParams();
  const search = Route.useSearch();
  const building = search.build ?? false;
  const address = pagePlaceOf(search);
  const { data: factories } = useQuery(factoriesQuery);
  const where = listPlace(address, factories ?? []);
  if (where.kind === 'every') return <Everywhere from={from} name={name} address={address} building={building} factories={factories} />;
  if (where.kind === 'in')
    return (
      <InFactory
        from={from}
        name={name}
        address={address}
        place={where.place}
        building={building}
        factory={factories?.find((f) => f.name === where.place.factory)}
      />
    );
  return (
    <div className="space-y-3">
      <BackToWorkflows place={address} />
      <Unplaced
        where={where}
        back={
          <Link to="/workflows" search={{}} className="underline underline-offset-2">
            Show every factory&apos;s
          </Link>
        }
        onRepo={(repo, label) => (
          <Link
            to="/workflows/$from/$workflow"
            params={{ from, workflow: name }}
            search={{ ...address, repo }}
            className="font-mono underline underline-offset-2"
          >
            {label}
          </Link>
        )}
      />
    </div>
  );
}

/** What both readings of a workflow's page are given: the workflow the address names, its place, and whether its builder is asked for. */
type Asked = { from: string; name: string; address: PagePlace; building: boolean };

/** The workflow `name` read from `from` with no factory, tagged with the factories it is in; or that none is listed by that name. */
function Everywhere({ from, name, address, building, factories }: Asked & { factories: readonly Factory[] | undefined }) {
  const { data: all } = useSuspenseQuery(workflowsQuery);
  const workflow = all.find((w) => w.from === from && w.name === name);
  if (!workflow) return <NotListed from={from} name={name} />;
  return (
    <Workflow
      workflow={workflow}
      own={workflow}
      address={address}
      building={building}
      tags={workflowFactories(workflow, factories ?? [])}
      start={<StartRun workflow={workflow} />}
    >
      <StepRows workflow={workflow} place={address} />
    </Workflow>
  );
}

/**
 * The workflow `name` read from `from` in `place`, as the api lists it there with the hires of `factory`, tagged with that factory alone:
 * its rows hire into its steps, and its start runs in the factory, on its repository, or says why it cannot (`whyNotStarted`). One of
 * yours is built and removed as the list read with no factory has it, since a builder drafts a folder as its files write it. One the
 * factory does not list says so (`NotOffered`).
 */
function InFactory({ from, name, address, place, building, factory }: Asked & { place: Place; factory: Factory | undefined }) {
  const { data: listed } = useSuspenseQuery(workflowsInQuery(place));
  const { data: plain } = useQuery({ ...workflowsQuery, enabled: from === 'yours' });
  const workflow = listed.find((w) => w.from === from && w.name === name);
  if (!workflow) return <NotOffered name={name} place={place} address={address} attach={factory?.commands.attach} />;
  const why = whyNotStarted(workflow);
  return (
    <Workflow
      workflow={workflow}
      own={from === 'yours' ? plain?.find((w) => w.from === from && w.name === name) : undefined}
      address={address}
      building={building}
      tags={[place.factory]}
      factory={place.factory}
      start={
        why === null ? (
          <StartRun workflow={workflow} repo={place.repo} place={place} />
        ) : (
          <p data-why-not className="text-body-medium whitespace-pre-wrap break-words text-yours">
            {why}
          </p>
        )
      }
    >
      <StepRows workflow={workflow} place={address} hiring />
    </Workflow>
  );
}

/**
 * The page of `workflow`: what it is, the factories in `tags`, its README whole — the workflow level's instruction — then, for
 * one that reads, its graph, `children`, its steps a row each, and `start`; for one that does not, the loader's refusal in their
 * place. `own` is the folder as the list read with no factory has it, which the board writes: where it is one of yours that reads, it is
 * built here, its builder in place of the README, the graph, the rows and the start while `building` — the README is edited there — and
 * removed, which leaves for the Workflows page; any other says why it has neither. `factory` is the named factory it is read in, none
 * with none.
 */
function Workflow({
  workflow,
  own,
  address,
  building,
  tags,
  factory,
  start,
  children,
}: {
  workflow: WorkflowListing;
  own: WorkflowListing | undefined;
  address: PagePlace;
  building: boolean;
  tags: readonly string[];
  factory?: string;
  start: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const buildable = own !== undefined && own.from === 'yours' && !own.error;
  const open = building && buildable;

  return (
    <article aria-label={`Workflow ${workflow.name}`} className="space-y-6">
      <BackToWorkflows place={address} />
      <WorkflowHeader
        workflow={workflow}
        tags={tags}
        factory={factory}
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
        onRemoved={() => navigate({ to: '/workflows', search: address })}
        removable={own !== undefined && own.from === 'yours' && !open ? own : undefined}
      />
      {!open && <Readme text={workflow.readme} />}
      {workflow.error ? (
        <Refused error={workflow.error} />
      ) : open ? (
        <WorkflowBuilder
          workflow={own}
          onClose={() => void navigate({ to: '.', search: (search) => ({ ...search, build: undefined }), replace: true })}
        />
      ) : (
        <>
          <WorkflowCanvas workflow={workflow} place={address} />
          <section className="space-y-2">
            <h2 className="text-label-medium text-muted-foreground uppercase">Steps</h2>
            {children}
          </section>
          {start}
        </>
      )}
    </article>
  );
}

/**
 * The workflow's head: its name, where it is read from, in `factory` when it is read in a named
 * one, the factories in `tags`, each linked to its floor, its step count and its folder, as the api names it; Build where `onBuild` is
 * given, Remove for `removable`, the folder the board removes, and why it has no builder.
 */
function WorkflowHeader({
  workflow,
  tags,
  factory,
  onBuild,
  onRemoved,
  removable,
}: {
  workflow: WorkflowListing;
  tags: readonly string[];
  factory: string | undefined;
  onBuild: (() => void) | undefined;
  onRemoved: () => Promise<void>;
  removable: WorkflowListing | undefined;
}) {
  const { name, from, dir, steps, error } = workflow;
  return (
    <header className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="font-mono text-body-large font-semibold">{name}</h1>
        <FromBadge from={from} factory={factory} />
        <FactoryTags names={tags} linked />
        {!error && (
          <span className="text-body-small text-muted-foreground">
            {steps.length} {steps.length === 1 ? 'step' : 'steps'}
          </span>
        )}
        {(onBuild || removable) && <span aria-hidden className="ml-auto" />}
        {onBuild && (
          <button
            type="button"
            onClick={onBuild}
            className="rounded border border-outline px-2 py-0.5 text-body-small font-medium hover:bg-accent"
          >
            Build
          </button>
        )}
        {removable && <RemoveWorkflow workflow={removable} onRemoved={onRemoved} />}
      </div>
      <p data-folder className="font-mono text-body-small break-all text-muted-foreground">
        {dir}
      </p>
      <NoBuilder workflow={workflow} factory={factory} />
    </header>
  );
}

/**
 * A workflow the factory of `place` does not list on its repository: said so, with the line that attaches one, `attach`, as the api
 * answers it on the factory, and the way back to the factory's workflows.
 */
function NotOffered({ name, place, address, attach }: { name: string; place: Place; address: PagePlace; attach: string | undefined }) {
  return (
    <div className="space-y-3">
      <BackToWorkflows place={address} />
      <p data-not-offered={place.factory} className="text-body-medium text-muted-foreground">
        {place.factory} does not offer {name} on <span className="font-mono text-body-small break-all">{place.repo}</span>, so nothing of it
        is read here and it hires no agent into its steps: attach the workflow to {place.factory} first
        {attach ? (
          <>
            {' '}
            with <code className="font-mono text-body-small">{attach}</code>
          </>
        ) : null}
        .
      </p>
    </div>
  );
}

/** The README whole, as the markdown it is written in, or that there is none. */
function Readme({ text }: { text: string | null }) {
  return (
    <section aria-label="README" className="space-y-2 rounded-lg border border-outline-variant bg-card p-4">
      <h2 className="text-label-medium text-muted-foreground uppercase">README</h2>
      {text?.trim() ? (
        <Markdown className="text-body-medium">{text}</Markdown>
      ) : (
        <p className="text-body-medium text-muted-foreground">
          No README: a <code className="font-mono text-body-small">README.md</code> in the folder says what the workflow is for, its first
          paragraph its description.
        </p>
      )}
    </section>
  );
}

/** Why the folder does not read as a workflow, in the loader's words: it cannot start. */
function Refused({ error }: { error: string }) {
  return (
    <div className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
      <p className="text-body-medium font-medium text-on-failure-container">Does not read as a workflow, so it cannot start:</p>
      <p className="font-mono text-body-small whitespace-pre-wrap break-words text-on-failure-container">{error}</p>
    </div>
  );
}

/** A workflow the api does not list, here or no longer: said so, with the way back. */
function NotListed({ from, name }: { from: string; name: string }) {
  return (
    <div className="space-y-3">
      <BackToWorkflows />
      <p data-not-listed className="text-body-medium text-muted-foreground">
        No workflow <span className="font-mono">{name}</span> is listed {from === 'yours' ? 'among yours' : "in this repository's"}: it may
        have been removed or renamed.
      </p>
    </div>
  );
}

/** Back to the Workflows page, in `place`, the place this page is read in. */
function BackToWorkflows({ place = {} }: { place?: PagePlace }) {
  return (
    <Link to="/workflows" search={place} className="text-body-medium text-muted-foreground hover:text-foreground">
      ← Workflows
    </Link>
  );
}
