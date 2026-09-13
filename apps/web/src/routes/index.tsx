import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { StatusChip } from '../components/StatusChip';
import { runsQuery, type RunSummary } from '../lib/api';

export const Route = createFileRoute('/')({
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
        No runs yet. Start one with <code>npx wf start</code>.
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
  const title = run.brief.split('\n')[0]?.replace(/^#+\s*/, '') || run.id;

  return (
    <li>
      <Link
        to="/runs/$runId"
        params={{ runId: run.id }}
        className="-mx-2 block rounded px-2 py-3 hover:bg-neutral-100 dark:hover:bg-neutral-900"
      >
        <div className="flex items-baseline justify-between gap-4">
          <p className="truncate font-medium">{title}</p>
          <time className="shrink-0 text-xs text-neutral-500" dateTime={run.createdAt}>
            {new Date(run.createdAt).toLocaleString()}
          </time>
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-neutral-500">
          <span className="font-mono">{run.id}</span>
          <span>{run.repo}</span>
          {run.cancelledAt && <span className="text-amber-600">cancelled</span>}
          {run.waitingOnYou.length > 0 && (
            <span className="font-medium text-amber-600">waiting on you: {run.waitingOnYou.join(', ')}</span>
          )}
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {run.steps.map((step) => (
            <li key={step.name} className="flex items-center gap-1.5">
              <span className="text-neutral-700 dark:text-neutral-300">{step.name}</span>
              <StatusChip status={step.status} runCancelled={run.cancelledAt !== null} />
            </li>
          ))}
        </ul>
      </Link>
    </li>
  );
}
