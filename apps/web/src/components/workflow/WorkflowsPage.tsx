import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { RouteLink } from '../agent/AgentParts';
import { ListFilter, NothingMatches } from '../filter/ListFilter';
import { FactoryTags } from '../factory/FactoryTag';
import { Markdown } from '../markdown/Markdown';
import { NewWorkflow } from './NewWorkflow';
import { FromBadge, Unplaced, YoursFolder } from './WorkflowParts';
import { factoriesQuery } from '@/lib/api/factories';
import { storeQuery } from '@/lib/api/store';
import { workflowsInQuery, workflowsQuery, type PagePlace, type Place, type WorkflowListing } from '@/lib/api/workflows';
import { listPlace, workflowFactories } from '@/lib/factories';
import { workflowLink, workflowsLink } from '@/lib/factoryAddress';
import { matches, useFilterText } from '@/lib/listFilter';

const LINK = 'underline underline-offset-2';

/** The way out of a factory's list: the Workflows page with no factory picked. */
export const everyFactory = (
  <Link to="/workflows" search={{}} replace className={LINK}>
    Show every factory&apos;s
  </Link>
);

const folder = <code className="font-mono text-body-small">workflows/</code>;

/**
 * The workflows of the address's place (`listPlace`), a card each, linked to its page — and yours made on the board, the one just made
 * opened on its page in its builder. With no factory picked, or the default one, every workflow the repository carries, then yours; with
 * a factory's path, what the api lists in it on its repository, from the folders the api names; and where it lists
 * nowhere — several repositories and none named, no such factory, a file that does not read — why, with the way out (`Unplaced`). A
 * listed place is filtered by the address's `query` (`?q=`) as a person types, each keystroke handed to `onQuery`.
 */
export function WorkflowsPage({ place: address, query, onQuery }: { place: PagePlace; query: string; onQuery: (query: string) => void }) {
  const { data: store } = useSuspenseQuery(storeQuery);
  const { data: factories } = useQuery(factoriesQuery);
  const navigate = useNavigate();
  const where = listPlace(address, factories ?? []);
  const [text, setText] = useFilterText(query, onQuery);
  const filter = { text, onClear: () => setText('') };

  return (
    <article className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-body-medium text-muted-foreground">
          A workflow is a folder of steps:{' '}
          {where.kind === 'every' ? (
            <>
              yours, under <YoursFolder />. A repository&apos;s, under its {folder}, are listed in the factory that works on it.
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
            void navigate({ to: '/workflows/$from/$workflow', params: { from: 'user', workflow: name }, search: { build: true } })
          }
        />
      </div>
      {(where.kind === 'every' || where.kind === 'in') && <ListFilter label="Filter workflows" text={text} onText={setText} />}
      {where.kind === 'every' && <Every address={address} filter={filter} />}
      {where.kind === 'in' && <InFactory place={where.place} address={address} filter={filter} />}
      <Unplaced
        where={where}
        back={everyFactory}
        onRepo={(repo, name) => (
          <Link {...workflowsLink({ ...address, repo })} className={`font-mono ${LINK}`}>
            {name}
          </Link>
        )}
      />
    </article>
  );
}

/** The page's filter, as each list reads it: what it holds, and how it is cleared. */
type Filter = { text: string; onClear: () => void };

/** The workflows of `all` the filter keeps, by name and description. */
const kept = (all: readonly WorkflowListing[], { text }: Filter) => all.filter((one) => matches(text, one.name, one.description));

/**
 * Every workflow read with no factory that the filter keeps, each tagged with the factories it is in (`workflowFactories`), linked to
 * their floors — nothing while they are unread or for one in none; or, with none at all, how one is added; or, where the filter keeps
 * none, that nothing matches.
 */
function Every({ address, filter }: { address: PagePlace; filter: Filter }) {
  const { data: all } = useSuspenseQuery(workflowsQuery);
  const { data: factories } = useQuery(factoriesQuery);
  const shown = kept(all, filter);
  return (
    <>
      {all.length > 0 && shown.length === 0 && <NothingMatches {...filter} />}
      {shown.map((workflow) => (
        <WorkflowCard
          key={`${workflow.from}:${workflow.name}`}
          workflow={workflow}
          address={address.factory ? { factory: address.factory } : {}}
          tags={workflowFactories(workflow, factories ?? [])}
        />
      ))}
      {all.length === 0 && (
        <p className="text-body-medium text-muted-foreground">
          No workflows. Add a folder of steps under <YoursFolder /> — <code className="font-mono text-body-small">dev/implement.md</code>,
          say — or pick a factory to list its repository&apos;s.
        </p>
      )}
    </>
  );
}

/**
 * The workflows the api lists in `place`, a factory on one of its repositories, that the filter keeps, each tagged with that factory
 * alone and reached at `address`, the page's own; or, where the api lists none there, that no workflow is in the factory, and how to
 * show every factory's; or, where the filter keeps none, that nothing matches.
 */
function InFactory({ place, address, filter }: { place: Place; address: PagePlace; filter: Filter }) {
  const { data: listed } = useSuspenseQuery(workflowsInQuery(place));
  const shown = kept(listed, filter);
  return (
    <>
      {listed.length === 0 && (
        <p data-filtered-out className="text-body-medium text-muted-foreground">
          No workflow is in the factory <span className="font-mono">{place.factory}</span>. {everyFactory}.
        </p>
      )}
      {listed.length > 0 && shown.length === 0 && <NothingMatches {...filter} />}
      {shown.map((workflow) => (
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
            {...workflowLink(address, from, name)}
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
