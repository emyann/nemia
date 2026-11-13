import { useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { DEFAULT_NAMESPACE } from 'objects';
import { FactoriesCanvas } from '@/components/factory/FactoriesCanvas';
import { OverviewStrip } from '@/components/frame/OverviewStrip';
import { ceilingsQuery } from '@/lib/api/ceilings';
import { daemonQuery } from '@/lib/api/daemon';
import { factoriesQuery, type Factory } from '@/lib/api/factories';
import { quotaQuery } from '@/lib/api/quota';
import { finishedTodayQuery, openRunsQuery } from '@/lib/api/runs';
import { factorySearch, openBlocks } from '@/lib/factories';
import { dayStartOf } from '@/lib/strip';

/** The factories whose light answer the blocks read: each the api lists, and the default one, whose answer says whether it is shown. */
const answered = (factories: readonly Factory[]): string[] => [...new Set([...factories.map((f) => f.name), DEFAULT_NAMESPACE])];

export const Route = createFileRoute('/')({
  validateSearch: factorySearch,
  loaderDeps: ({ search }) => ({ factory: search.factory }),
  /**
   * Waits for the factories and the light answer of each, which the blocks count, for the strip's two reads of the factory in view (the
   * runs not finished, and those finished today), and for its caps, daemon and quota, so the strip has its height before the floor is
   * fitted under it.
   */
  loader: async ({ context, deps }) => {
    const client = context.queryClient;
    const strip = Promise.all([
      client.ensureQueryData(openRunsQuery(deps.factory)),
      client.ensureQueryData(finishedTodayQuery(deps.factory, dayStartOf(Date.now()))),
      client.prefetchQuery(ceilingsQuery),
      client.prefetchQuery(daemonQuery),
      client.prefetchQuery(quotaQuery),
    ]);
    const factories = await client.ensureQueryData(factoriesQuery);
    await Promise.all([strip, ...answered(factories).map((name) => client.ensureQueryData(openRunsQuery(name)))]);
  },
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
 * The Overview: the strip of the factory in view (`?factory=`), or of every factory, over every factory as a block each (`openBlocks`),
 * which fills the rest of the screen, each counted off its own light answer, the default one shown while its answer counts a run. Each
 * answer is read again on each event of the workflow feed.
 */
function Factories() {
  const { factory } = Route.useSearch();
  const { data: factories } = useSuspenseQuery(factoriesQuery);
  const names = answered(factories);
  const answers = useSuspenseQueries({ queries: names.map((name) => openRunsQuery(name)) });
  const opens = new Map(answers.map((answer, i) => [names[i], answer.data] as const));
  const fallback = opens.get(DEFAULT_NAMESPACE)?.counts;
  const held = fallback !== undefined && fallback.waiting + fallback.inFlight + fallback.finished > 0;
  return (
    <div className="flex min-h-[calc(100svh-var(--frame-top)-var(--frame-lines))] flex-col gap-6 pt-5 lg:h-[calc(100svh-var(--frame-top)-var(--frame-lines))]">
      <div className="px-6 max-md:px-3">
        <OverviewStrip factory={factory} />
      </div>
      <FactoriesCanvas blocks={openBlocks(factories, opens, held)} />
    </div>
  );
}
