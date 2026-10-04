import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { FactoryTag } from '../components/FactoryTag';
import { StatusChip } from '../components/StatusChip';
import { StartedFrom } from '../components/TryTag';
import { runsQuery, type RunSummary } from '../lib/api';
import { spentTitle } from '../lib/cost';
import { inFlight, inFlightFirst, onYouOf, runClock, titleOf, toDecideOf, waitsOnYou } from '../lib/factory';
import { factoryOf, factorySearch, shownIn } from '../lib/factories';
import { useNow } from '../lib/useNow';

export const Route = createFileRoute('/runs/')({
  validateSearch: factorySearch,
  loader: ({ context }) => context.queryClient.ensureQueryData(runsQuery),
  component: Runs,
  errorComponent: ({ error }) => (
    <p className="text-sm text-red-600">
      Could not load runs: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

/**
 * Every run, in three groups under a heading each, in the Factory's words and counts: the runs still going, then those at their result
 * that nobody has decided, then the rest, each newest first (`inFlightFirst`) where the api lists them by id. No row says whether its run
 * is in flight, so without the headings the first finished row, newer than the last in flight, would read as a sort gone wrong. A run to
 * decide is a group of its own, as `wf ls` says it before who else a run waits on, and not a row among the finished that nothing marks as
 * waiting for a person; a run that is somehow both in flight and to decide is in flight, since what still moves is not yet a result to
 * decide. Every row reads how long its run has been at work against one clock for the page (`useNow`), not in the render.
 *
 * Every factory's runs are listed, each tagged with its own; the factory the sidebar picks, kept in the address as `?factory=<name>` so it
 * survives a reload, the list's poll and a link, keeps only its own, and one that keeps none says so and how to show every factory's.
 */
function Runs() {
  const { data: runs } = useSuspenseQuery(runsQuery);
  const { factory } = Route.useSearch();
  const now = useNow(60_000);

  if (!runs.length) {
    return (
      <p className="text-sm text-neutral-500">
        No runs yet. Start one from{' '}
        <Link to="/workflows" className="underline underline-offset-2">
          Workflows
        </Link>
        , or with <code>npx wf start</code>.
      </p>
    );
  }

  const ordered = inFlightFirst(shownIn(runs, factory));
  const flying = ordered.filter((run) => inFlight(run));
  const deciding = ordered.filter((run) => !inFlight(run) && toDecideOf(run) !== null);
  const finished = ordered.filter((run) => !inFlight(run) && toDecideOf(run) === null);

  return (
    <article className="space-y-8">
      {!ordered.length && (
        <p data-filtered-out className="text-sm text-neutral-500">
          No run of the factory <span className="font-mono">{factory}</span>.{' '}
          <Link to="/runs" search={{}} replace className="underline underline-offset-2">
            Show every factory&apos;s
          </Link>
          .
        </p>
      )}
      {flying.length > 0 && <RunGroup group="in-flight" title="In flight" about="something of each still moves" runs={flying} now={now} />}
      {deciding.length > 0 && (
        <RunGroup group="to-decide" title="To decide" about="each is at its result, and nobody has decided it" runs={deciding} now={now} />
      )}
      {finished.length > 0 && (
        <RunGroup group="finished" title="Finished" about="nothing of these moves any more" runs={finished} now={now} />
      )}
    </article>
  );
}

/**
 * One group of rows, under a heading that says how many, what the group is and its order, and how many of them wait on you — in any of the
 * three: a run whose check refused while a sibling's session still works is in flight, and waits on you, and a run at its ending's gate
 * waits on you for the decision itself.
 */
function RunGroup({ group, title, about, runs, now }: { group: string; title: string; about: string; runs: RunSummary[]; now: number }) {
  const waiting = runs.filter(waitsOnYou).length;
  return (
    <section aria-label={title} data-group={group} className="space-y-1">
      <h2 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
        {title}{' '}
        <span data-count className="text-xs font-normal text-neutral-500">
          {runs.length}
        </span>
        <span className="text-xs font-normal text-neutral-500">
          {about}, newest first
          {waiting > 0 && <span className="text-amber-600"> · {waiting} waiting on you</span>}
        </span>
      </h2>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {runs.map((run) => (
          <RunRow key={run.id} run={run} now={now} />
        ))}
      </ul>
    </section>
  );
}

/**
 * One run's row. Its link carries the run's title and id; the factory it is in, `default` for one naming none, as plain text since the
 * row is a link; where it works, its repository or, for a folder run, which has none, `folders`;
 * whether it is cancelled; whether `wf prune` gave back its worktrees, and its files when asked, with what it removed and kept on hover;
 * what waits on you, as `wf ls` prints it: the steps, `approve plan` for one at its gate, or for a run waiting on a run that never ships,
 * what is yours to resolve; a person's hold (`wf hold`) in `wf ls`'s word, with how to lift it on hover, amber once only a person lifts it;
 * what there is to decide about its result, in `wf ls`'s words (`toDecideWords`): the ending step's gate with the command that approves it,
 * or a branch nobody has merged, the step's own `approve <step>` on this line alone; why the run is not judged, a task it reads that does
 * not read (`RunSummary.unreadable`); and each step's state. Beside the link, since a link inside a link is not HTML: when it was created,
 * which orders the list; the card's clock (`runClock`), how long it took or has been at work, with its start, its end and the wall time
 * on hover; what it has cost, as `wf ls` puts it on the run's line, once a cost was measured; the tokens its sessions used, their split
 * on hover, once one measured any; and the workflow it was started from.
 */
function RunRow({ run, now }: { run: RunSummary; now: number }) {
  const title = titleOf(run);
  const decide = toDecideOf(run);
  const clock = runClock(run, now, !inFlight(run));

  return (
    <li
      data-in-flight={inFlight(run)}
      className="-mx-2 flex items-start gap-4 rounded px-2 py-3 hover:bg-neutral-100 dark:hover:bg-neutral-900"
    >
      <Link to="/runs/$runId" params={{ runId: run.id }} className="block min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-neutral-500">
          <span className="font-mono">{run.id}</span>
          <FactoryTag name={factoryOf(run)} />
          <span title={run.repo ?? 'Its steps work in folders the run made'}>{run.repo ?? 'folders'}</span>
          {run.cancelledAt && <span className="text-amber-600">cancelled</span>}
          {run.pruned && (
            <span data-pruned title={run.pruned.said}>
              pruned
            </span>
          )}
          {waitsOnYou(run) && (onYouOf(run).length > 0 || run.waiting?.advice) && (
            <span data-waiting-on-you className="font-medium text-amber-600">
              waiting on you: {onYouOf(run).length ? onYouOf(run).join(', ') : run.waiting?.advice}
            </span>
          )}
          {run.holding && (
            <span
              data-holding={run.holding.onYou ? 'on-you' : 'on-runs'}
              title={run.holding.advice}
              className={`font-mono ${run.holding.onYou ? 'font-medium text-amber-600' : 'text-violet-700 dark:text-violet-400'}`}
            >
              {run.holding.word}
            </span>
          )}
        </p>
        {decide && (
          <p data-to-decide={decide.kind} className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            to decide: {decide.said}
          </p>
        )}
        {run.unreadable && (
          <p data-unreadable className="mt-1 text-xs font-medium break-words text-red-700 dark:text-red-400">
            {run.unreadable}
          </p>
        )}
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {run.steps.map((step) => (
            <li key={step.name} className="flex items-center gap-1.5">
              <span className="text-neutral-700 dark:text-neutral-300">{step.name}</span>
              <StatusChip status={step.status} runCancelled={run.cancelledAt !== null} runHeld={run.holding != null} note={step.note} />
            </li>
          ))}
        </ul>
      </Link>
      <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
        <time className="text-xs text-neutral-500" dateTime={run.createdAt}>
          {new Date(run.createdAt).toLocaleString()}
        </time>
        <span data-clock title={clock.title} className="font-mono text-xs text-neutral-500">
          {clock.words}
        </span>
        {run.cost && (
          <span data-cost title={spentTitle(run.cost, "the run's tries")} className="font-mono text-xs">
            {run.cost.said}
          </span>
        )}
        {run.tokens && (
          <span data-tokens title={run.tokens.split} className="font-mono text-xs">
            {run.tokens.said}
          </span>
        )}
        <StartedFrom run={run} />
      </div>
    </li>
  );
}
