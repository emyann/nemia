import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
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
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="truncate font-medium">{title}</p>
        <time className="shrink-0 text-xs text-neutral-500" dateTime={run.createdAt}>
          {new Date(run.createdAt).toLocaleString()}
        </time>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-neutral-500">
        <span className="font-mono">{run.id}</span>
        <span>{run.repo}</span>
        <span>{run.steps.map((s) => s.name).join(' · ')}</span>
        {run.cancelledAt && <span className="text-amber-600">cancelled</span>}
      </p>
    </li>
  );
}
