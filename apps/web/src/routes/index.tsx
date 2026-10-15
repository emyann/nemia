import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FactoriesCanvas } from '@/components/FactoriesCanvas';
import { OverviewStrip } from '@/components/OverviewStrip';
import { ceilingsQuery, daemonQuery, factoriesQuery, quotaQuery, runsQuery } from '@/lib/api';
import { factoryBlocks, factorySearch } from '@/lib/factories';

export const Route = createFileRoute('/')({
  validateSearch: factorySearch,
  /**
   * Waits for the factories and the runs, which the blocks and the strip count, and for the strip's caps, daemon and quota, so the strip
   * has its height before the floor is fitted under it.
   */
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(factoriesQuery),
      context.queryClient.ensureQueryData(runsQuery),
      context.queryClient.prefetchQuery(ceilingsQuery),
      context.queryClient.prefetchQuery(daemonQuery),
      context.queryClient.prefetchQuery(quotaQuery),
    ]),
  staticData: { fullBleed: true },
  component: Factories,
  errorComponent: ({ error }) => (
    <p className="p-4 text-body-medium text-failure">
      Could not load the factories and their runs: {error instanceof Error ? error.message : String(error)}. Is the api running (
      <code>npm run dev</code>)?
    </p>
  ),
});

/**
 * The Overview: the strip of the factory in view (`?factory=`), or of every factory, over every factory as a block each
 * (`factoryBlocks`), which fills the rest of the screen. `runsQuery` reads the runs again on each event of the workflow feed.
 */
function Factories() {
  const { factory } = Route.useSearch();
  const { data: factories } = useSuspenseQuery(factoriesQuery);
  const { data: runs } = useSuspenseQuery(runsQuery);
  return (
    <div className="flex min-h-[calc(100svh-var(--frame-top))] flex-col gap-6 pt-5 lg:h-[calc(100svh-var(--frame-top))]">
      <div className="px-6 max-md:px-3">
        <OverviewStrip factory={factory} />
      </div>
      <FactoriesCanvas blocks={factoryBlocks(factories, runs)} />
    </div>
  );
}
