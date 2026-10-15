import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { RouteLink } from '../components/AgentParts';
import { FactoryTags } from '../components/FactoryTag';
import { Markdown } from '../components/Markdown';
import { NewWorkflow } from '../components/NewWorkflow';
import { FromBadge, Unplaced, YoursFolder } from '../components/WorkflowParts';
import { factoriesQuery, storeQuery, workflowsInQuery, workflowsQuery, type PagePlace, type Place, type WorkflowListing } from '../lib/api';
import { listPlace, pagePlaceOf, workflowFactories } from '../lib/factories';
import { loadWorkflowsIn } from '../lib/placed';

const LINK = 'underline underline-offset-2';

/** The way out of a factory's list: the Workflows page with no factory picked. */
const everyFactory = (
  <Link to="/workflows" search={{}} replace className={LINK}>
    Show every factory&apos;s
  </Link>
);

export const Route = createFileRoute('/workflows')({
  validateSearch: pagePlaceOf,
  loaderDeps: ({ search }) => ({ factory: search.factory, repo: search.repo }),
  loader: ({ context, deps }) => Promise.all([loadWorkflowsIn(context.queryClient, deps), context.queryClient.ensureQueryData(storeQuery)]),
  component: WorkflowsPage,
  errorComponent: ({ error }) => (
    <p className="text-body-medium text-failure">
      Could not load the workflows: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?{' '}
      {everyFactory}.
    </p>
  ),
});

const folder = <code className="font-mono text-body-small">workflows/</code>;

/**
 * The workflows of the address's place (`listPlace`), a card each, linked to its page — and yours made on the board, the one just made
 * opened on its page in its builder. With no factory picked, or the default one, every workflow the repository carries, then yours; with
 * a factory picked, `?factory=<name>`, what the api lists in it on its repository, from the folders the api names; and where it lists
 * nowhere — several repositories and none named, no such factory, a file that does not read — why, with the way out (`Unplaced`).
 */
function WorkflowsPage() {
  const address = pagePlaceOf(Route.useSearch());
  const { data: store } = useSuspenseQuery(storeQuery);
  const { data: factories } = useQuery(factoriesQuery);
  const navigate = useNavigate();
  const where = listPlace(address, factories ?? []);

  return (
    <article className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-body-medium text-muted-foreground">
          A workflow is a folder of steps:{' '}
          {where.kind === 'every' ? (
            <>
              this repository&apos;s under {folder}, and yours under <YoursFolder />.
            </>
          ) : (
            <>
              here, those the factory <span className="font-mono">{where.kind === 'in' ? where.place.factory : where.factory}</span> offers
              — its own, and those of yours, under <YoursFolder />, that it attaches.
            </>
          )}{' '}
          Starting a run writes its record and files nothing: the daemon — this api, or the command line&apos;s — files its steps. Each has
          its page; yours are built there.
        </p>
        <NewWorkflow
          folder={store.workflows}
          onCreated={(name) =>
            void navigate({ to: '/workflows/$from/$workflow', params: { from: 'yours', workflow: name }, search: { build: true } })
          }
        />
      </div>
      {where.kind === 'every' && <Every address={address} />}
      {where.kind === 'in' && <InFactory place={where.place} address={address} />}
      <Unplaced
        where={where}
        back={everyFactory}
        onRepo={(repo, name) => (
          <Link to="/workflows" search={{ ...address, repo }} className={`font-mono ${LINK}`}>
            {name}
          </Link>
        )}
      />
    </article>
  );
}

/**
 * Every workflow read with no factory, each tagged with the factories it is in (`workflowFactories`), linked to their floors — nothing
 * while they are unread or for one in none; or, with none at all, how one is added.
 */
function Every({ address }: { address: PagePlace }) {
  const { data: all } = useSuspenseQuery(workflowsQuery);
  const { data: factories } = useQuery(factoriesQuery);
  return (
    <>
      {all.map((workflow) => (
        <WorkflowCard
          key={`${workflow.from}:${workflow.name}`}
          workflow={workflow}
          address={address.factory ? { factory: address.factory } : {}}
          tags={workflowFactories(workflow, factories ?? [])}
        />
      ))}
      {all.length === 0 && (
        <p className="text-body-medium text-muted-foreground">
          No workflows. Add a folder of steps under {folder} in the repository —{' '}
          <code className="font-mono text-body-small">workflows/dev/implement.md</code>, say — or under <YoursFolder />.
        </p>
      )}
    </>
  );
}

/**
 * The workflows the api lists in `place`, a factory on one of its repositories, each tagged with that factory alone and reached at
 * `address`, the page's own; or, where the api lists none there, that no workflow is in the factory, and how to show every factory's.
 */
function InFactory({ place, address }: { place: Place; address: PagePlace }) {
  const { data: listed } = useSuspenseQuery(workflowsInQuery(place));
  return (
    <>
      {listed.length === 0 && (
        <p data-filtered-out className="text-body-medium text-muted-foreground">
          No workflow is in the factory <span className="font-mono">{place.factory}</span>. {everyFactory}.
        </p>
      )}
      {listed.map((workflow) => (
        <WorkflowCard
          key={`${workflow.from}:${workflow.name}`}
          workflow={workflow}
          address={address}
          tags={[place.factory]}
          factory={place.factory}
        />
      ))}
    </>
  );
}

/**
 * A workflow's card, compact: its name, linked to its page at `address`, which holds the rest — its README, its graph, its steps and a
 * start, and for one of yours its builder; where it is
 * read from, in `factory` when the list is a named factory's; the factories in `tags`, each linked to its floor; its step count and its
 * description; or, for one that does not read, a line saying so.
 */
function WorkflowCard({
  workflow,
  address,
  tags,
  factory,
}: {
  workflow: WorkflowListing;
  address: PagePlace;
  tags: readonly string[];
  factory?: string;
}) {
  const { name, from, description, steps, error } = workflow;
  return (
    <section
      aria-label={`Workflow ${name}`}
      data-from={from}
      className="space-y-2 rounded-lg border border-outline-variant bg-card p-4 shadow-sm"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-mono text-body-large font-semibold">
          <RouteLink
            to="/workflows/$from/$workflow"
            params={{ from, workflow: name }}
            search={address}
            className="rounded-sm underline decoration-outline underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {name}
          </RouteLink>
        </h2>
        <FromBadge from={from} factory={factory} />
        <FactoryTags names={tags} linked />
        {!error && (
          <span className="text-body-small text-muted-foreground">
            {steps.length} {steps.length === 1 ? 'step' : 'steps'}
          </span>
        )}
      </header>
      {description ? (
        <Markdown className="text-body-medium">{description}</Markdown>
      ) : (
        <p className="text-body-medium text-muted-foreground">
          No description: the first paragraph of a <code className="font-mono text-body-small">README.md</code> in the folder is one.
        </p>
      )}
      {error && (
        <p data-refusal className="text-body-small text-failure">
          Does not read as a workflow, so it cannot start: its page says why.
        </p>
      )}
    </section>
  );
}
