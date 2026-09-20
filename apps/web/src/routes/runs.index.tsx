import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { StatusChip } from '../components/StatusChip';
import { WorkflowLink } from '../components/WorkflowLink';
import { runsQuery, type RunSummary } from '../lib/api';
import { spentTitle } from '../lib/cost';
import { inFlight, inFlightFirst, onYouOf, titleOf, toDecideOf, waitsOnYou } from '../lib/factory';

export const Route = createFileRoute('/runs/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(runsQuery),
  component: Runs,
  errorComponent: ({ error }) => (
    <p className="text-sm text-red-600">
      Could not load runs: {error instanceof Error ? error.message : String(error)}. Is the api running
      (<code>npm run dev</code>)?
    </p>
  ),
});

function Runs() {
  const { data: runs } = useSuspenseQuery(runsQuery);

  if (!runs.length) {
    return (
      <p className="text-sm text-neutral-500">
        No runs yet. Start one from <Link to="/workflows" className="underline underline-offset-2">Workflows</Link>, or with{' '}
        <code>npx wf start</code>.
      </p>
    );
  }

  // The runs still going on top, then those nobody has decided, then the rest, each newest first (`inFlightFirst`): the api lists them by
  // id. Under a heading each, in the Factory's words and counts, since no row says whether its run is in flight: without one, the first
  // finished row, newer than the last in flight, reads as a sort gone wrong.
  //
  // To decide between the two, as `wf ls` says it before who else a run waits on: a run at its result that nobody has decided is finished,
  // and would otherwise be a row among the finished with nothing to say it is the one row that is waiting for a person. In flight first all
  // the same, for a run that is somehow both: what still moves is not yet a result to decide.
  const ordered = inFlightFirst(runs);
  const flying = ordered.filter((run) => inFlight(run));
  const deciding = ordered.filter((run) => !inFlight(run) && toDecideOf(run) !== null);
  const finished = ordered.filter((run) => !inFlight(run) && toDecideOf(run) === null);

  return (
    <article className="space-y-8">
      {flying.length > 0 && <RunGroup group="in-flight" title="In flight" about="something of each still moves" runs={flying} />}
      {deciding.length > 0 && <RunGroup group="to-decide" title="To decide" about="each is at its result, and nobody has decided it" runs={deciding} />}
      {finished.length > 0 && <RunGroup group="finished" title="Finished" about="nothing of these moves any more" runs={finished} />}
    </article>
  );
}

/**
 * One group of rows, under a heading that says how many, what the group is and its order, and how many of them wait on you — in any of the
 * three: a run whose check refused while a sibling's session still works is in flight, and waits on you, and a run at its ending's gate
 * waits on you for the decision itself.
 */
function RunGroup({ group, title, about, runs }: { group: string; title: string; about: string; runs: RunSummary[] }) {
  const waiting = runs.filter(waitsOnYou).length;
  return (
    <section aria-label={title} data-group={group} className="space-y-1">
      <h2 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
        {title} <span data-count className="text-xs font-normal text-neutral-500">{runs.length}</span>
        <span className="text-xs font-normal text-neutral-500">
          {about}, newest first
          {waiting > 0 && <span className="text-amber-600"> · {waiting} waiting on you</span>}
        </span>
      </h2>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {runs.map((run) => (
          <RunRow key={run.id} run={run} />
        ))}
      </ul>
    </section>
  );
}

function RunRow({ run }: { run: RunSummary }) {
  const title = titleOf(run);
  const decide = toDecideOf(run);

  return (
    // The run's link, and beside it when it started and the workflow's link: side by side, since a link inside a link is not HTML.
    <li data-in-flight={inFlight(run)} className="-mx-2 flex items-start gap-4 rounded px-2 py-3 hover:bg-neutral-100 dark:hover:bg-neutral-900">
      <Link to="/runs/$runId" params={{ runId: run.id }} className="block min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-neutral-500">
          <span className="font-mono">{run.id}</span>
          {/* A folder run has no repository to name: where a git run's row says one, it says what it works in. */}
          <span title={run.repo ?? 'Its steps work in folders the run made'}>{run.repo ?? 'folders'}</span>
          {run.cancelledAt && <span className="text-amber-600">cancelled</span>}
          {/* As `wf ls` prints `→ waiting on you:` — the steps, `approve plan` for one at its gate, or for a run waiting on a run that never ships, what is yours to resolve. */}
          {waitsOnYou(run) && (onYouOf(run).length > 0 || run.waiting?.advice) && (
            <span data-waiting-on-you className="font-medium text-amber-600">
              waiting on you: {onYouOf(run).length ? onYouOf(run).join(', ') : run.waiting?.advice}
            </span>
          )}
        </p>
        {/* What there is to decide about its result, in `wf ls`'s words (`toDecideWords`): the ending step's gate with the command that
            approves it, or a branch nobody has merged. The step's own `approve <step>` is on this line, and not above it too. */}
        {decide && (
          <p data-to-decide={decide.kind} className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            to decide: {decide.said}
          </p>
        )}
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {run.steps.map((step) => (
            <li key={step.name} className="flex items-center gap-1.5">
              <span className="text-neutral-700 dark:text-neutral-300">{step.name}</span>
              <StatusChip status={step.status} runCancelled={run.cancelledAt !== null} note={step.note} />
            </li>
          ))}
        </ul>
      </Link>
      <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
        <time className="text-xs text-neutral-500" dateTime={run.createdAt}>
          {new Date(run.createdAt).toLocaleString()}
        </time>
        {/* What it has cost, as `wf ls` puts it on the run's line, once a cost was measured. */}
        {run.cost && (
          <span data-cost title={spentTitle(run.cost, "the run's tries")} className="font-mono text-xs">
            {run.cost.said}
          </span>
        )}
        <WorkflowLink dir={run.workflowDir} />
      </div>
    </li>
  );
}
