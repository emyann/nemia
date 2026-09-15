import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { StatusChip } from '../components/StatusChip';
import { WorkflowLink } from '../components/WorkflowLink';
import { runsQuery, type RunSummary } from '../lib/api';
import { spentTitle } from '../lib/cost';
import { titleOf, waitsOnYou } from '../lib/factory';

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

  return (
    <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
      {runs.map((run) => (
        <RunRow key={run.id} run={run} />
      ))}
    </ul>
  );
}

function RunRow({ run }: { run: RunSummary }) {
  const title = titleOf(run);

  return (
    // The run's link, and beside it when it started and the workflow's link: side by side, since a link inside a link is not HTML.
    <li className="-mx-2 flex items-start gap-4 rounded px-2 py-3 hover:bg-neutral-100 dark:hover:bg-neutral-900">
      <Link to="/runs/$runId" params={{ runId: run.id }} className="block min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-neutral-500">
          <span className="font-mono">{run.id}</span>
          <span>{run.repo}</span>
          {run.cancelledAt && <span className="text-amber-600">cancelled</span>}
          {/* As `wf ls` prints `→ waiting on you:` — the steps, or for a run waiting on a run that never ships, what is yours to resolve. */}
          {waitsOnYou(run) && (
            <span data-waiting-on-you className="font-medium text-amber-600">
              waiting on you: {run.waitingOnYou.length ? run.waitingOnYou.join(', ') : run.waiting?.advice}
            </span>
          )}
        </p>
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
