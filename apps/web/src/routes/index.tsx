import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FactoriesCanvas } from '@/components/FactoriesCanvas';
import { factoriesQuery, runsQuery } from '@/lib/api';
import { factoryBlocks } from '@/lib/factories';

export const Route = createFileRoute('/')({
  /** Waits for the factories and the runs, which the blocks count. */
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(factoriesQuery), context.queryClient.ensureQueryData(runsQuery)]),
  staticData: { fullBleed: true },
  component: Factories,
  errorComponent: ({ error }) => (
    <p className="p-4 text-sm text-failure">
      Could not load the factories and their runs: {error instanceof Error ? error.message : String(error)}. Is the api running (
      <code>npm run dev</code>)?
    </p>
  ),
});

/** Every factory, a block each (`factoryBlocks`). `runsQuery` reads the runs again on each event of the workflow feed. */
function Factories() {
  const { data: factories } = useSuspenseQuery(factoriesQuery);
  const { data: runs } = useSuspenseQuery(runsQuery);
  return <FactoriesCanvas blocks={factoryBlocks(factories, runs)} />;
}
