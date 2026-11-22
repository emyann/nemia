import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FactoryProposals } from '@/components/factory/FactoryProposals';
import { factoriesQuery } from '@/lib/api/factories';
import { proposalsQuery } from '@/lib/api/proposals';

/**
 * A factory's proposals, at /factories/$factory/proposals: a place of its pane, named in the page's head. It waits for the factories, then
 * prefetches the proposals of a factory a person made, which never throws: what cannot be read says so on the page. The default factory,
 * and a name no factory has, ask for none.
 */
export const Route = createFileRoute('/factories/$factory_/proposals/')({
  loader: async ({ context, params }) => {
    const factories = await context.queryClient.ensureQueryData(factoriesQuery);
    if (factories.some((f) => f.name === params.factory && !f.default))
      await context.queryClient.prefetchQuery(proposalsQuery(params.factory));
  },
  component: ProposalsPage,
  errorComponent: ({ error }) => (
    <p className="p-4 text-body-medium text-failure">
      Could not load the factories: {error instanceof Error ? error.message : String(error)}
    </p>
  ),
});

/**
 * The factory's proposals (`FactoryProposals`); the default factory, which has none, and a name no factory has, each say so in one line.
 */
function ProposalsPage() {
  const { factory: name } = Route.useParams();
  const { data: factories } = useSuspenseQuery(factoriesQuery);
  const factory = factories.find((f) => f.name === name);
  return (
    <article data-proposals-page={name} className="mx-auto flex max-w-3xl flex-col gap-6">
      {factory === undefined ? (
        <p data-no-factory={name} className="text-body-medium text-on-surface-variant">
          No factory is named {name}: the factories are listed on the Factories page.
        </p>
      ) : factory.default ? (
        <p data-default-factory className="text-body-medium text-on-surface-variant">
          The default factory has no proposals: they are made in the factories a person makes.
        </p>
      ) : (
        <FactoryProposals factory={name} />
      )}
    </article>
  );
}
