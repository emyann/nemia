import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FactoryCanvas } from '@/components/FactoryCanvas';
import { daemonQuery, inboxQuery, quotaQuery, runsQuery } from '@/lib/api';

export const Route = createFileRoute('/')({
  /**
   * Waits for the runs, and prefetches the inbox for the queue's ghosts beside the floor, the quota, and whether a daemon ticks over it,
   * so the floor is fitted beside them with the first cards. A prefetch never throws: what cannot be read says so over the floor, and the
   * runs are drawn all the same.
   */
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(runsQuery),
      context.queryClient.prefetchQuery(inboxQuery),
      context.queryClient.prefetchQuery(quotaQuery),
      context.queryClient.prefetchQuery(daemonQuery),
    ]),
  staticData: { fullBleed: true },
  component: Factory,
  errorComponent: ({ error }) => (
    <p className="p-4 text-sm text-red-600">
      Could not load runs: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

/**
 * Every run in flight, a card each, and the queued cards beside them. `runsQuery` reads the runs again on each event of the workflow feed.
 */
function Factory() {
  const { data: runs } = useSuspenseQuery(runsQuery);
  return <FactoryCanvas runs={runs} />;
}
