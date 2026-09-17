import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FactoryCanvas } from '@/components/FactoryCanvas';
import { inboxQuery, runsQuery } from '@/lib/api';

export const Route = createFileRoute('/')({
  // The inbox too, for the queue's ghosts beside the floor: drawn with the first cards, the floor is fitted beside them. A prefetch, which never
  // throws: an inbox that cannot be read says so over the floor, and the runs are drawn all the same.
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(runsQuery), context.queryClient.prefetchQuery(inboxQuery)]),
  staticData: { fullBleed: true },
  component: Factory,
  errorComponent: ({ error }) => (
    <p className="p-4 text-sm text-red-600">
      Could not load runs: {error instanceof Error ? error.message : String(error)}. Is the api running
      (<code>npm run dev</code>)?
    </p>
  ),
});

/** Every run in flight, a card each, and the queued cards beside them. `runsQuery` reads the runs again every 5 s. */
function Factory() {
  const { data: runs } = useSuspenseQuery(runsQuery);
  return <FactoryCanvas runs={runs} />;
}
