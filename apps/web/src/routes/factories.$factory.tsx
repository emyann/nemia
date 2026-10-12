import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FactoryCanvas } from '@/components/FactoryCanvas';
import { TemplateCard } from '@/components/TemplateCard';
import { LinkButton } from '@/components/ui/button';
import { routeLink } from '@/components/routeLink';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { factoriesQuery, inboxQuery, runsQuery, storeQuery } from '@/lib/api';
import { runsIn } from '@/lib/factories';

export const Route = createFileRoute('/factories/$factory')({
  /**
   * Waits for the factories and the runs, and prefetches the inbox for the queue's ghosts beside the floor, so the floor is fitted beside
   * them with the first cards. A prefetch never throws: what cannot be read says so over
   * the floor, and the runs are drawn all the same.
   */
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(factoriesQuery),
      context.queryClient.ensureQueryData(runsQuery),
      context.queryClient.prefetchQuery(inboxQuery),
    ]),
  staticData: { fullBleed: true },
  component: FactoryPage,
  errorComponent: ({ error }) => (
    <p className="p-4 text-sm text-failure">
      Could not load the factories and their runs: {error instanceof Error ? error.message : String(error)}. Is the api running (
      <code>npm run dev</code>)?
    </p>
  ),
});

/**
 * Inside a factory: its floor, the runs it holds and the cards queued in it (`FactoryCanvas`), the factory named in the sidebar's picker
 * (`FactoryPicker`), and above the floor the template it is made from, where it is (`TemplateCard`). A name the api lists no factory by
 * says so: no route of the api is asked about it.
 */
function FactoryPage() {
  const { factory: name } = Route.useParams();
  const { data: factories } = useSuspenseQuery(factoriesQuery);
  const { data: runs } = useSuspenseQuery(runsQuery);
  const factory = factories.find((f) => f.name === name);
  if (!factory) return <NoSuchFactory name={name} />;
  const above = factory.template ? <TemplateCard template={factory.template} /> : undefined;
  return <FactoryCanvas runs={runsIn(runs, factory)} factory={factory} above={above} />;
}

/** A button to a route, as the router draws its links (`routeLink`). */
const RouterLinkButton = routeLink(LinkButton);

/** A name no factory has: say so, how to make it (`fileFactory`, as the api answers it), and lead back to the Factories. */
function NoSuchFactory({ name }: { name: string }) {
  const { data: store } = useQuery(storeQuery);
  return (
    <div className="flex h-[calc(100svh-5rem)] items-center justify-center p-6">
      <Card className="w-full max-w-sm" data-no-factory={name}>
        <CardHeader>
          <CardTitle>No factory named {name}</CardTitle>
          <CardDescription>
            The factories are listed on the Factories page. Make one named {name} from the command line
            {store ? (
              <>
                {' '}
                with <code>{store.fileFactory}</code>
              </>
            ) : null}
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RouterLinkButton to="/" variant="outline" size="sm">
            Go to Factories
          </RouterLinkButton>
        </CardContent>
      </Card>
    </div>
  );
}
