import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FactoryCanvas } from '@/components/FactoryCanvas';
import { runsQuery } from '@/lib/api';

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(runsQuery),
  staticData: { fullBleed: true },
  component: Factory,
  errorComponent: ({ error }) => (
    <p className="p-4 text-sm text-red-600">
      Could not load runs: {error instanceof Error ? error.message : String(error)}. Is the api running
      (<code>npm run dev</code>)?
    </p>
  ),
});

/** Every run in flight, a card each. `runsQuery` reads the runs again every 5 s. */
function Factory() {
  const { data: runs } = useSuspenseQuery(runsQuery);
  return <FactoryCanvas runs={runs} />;
}
