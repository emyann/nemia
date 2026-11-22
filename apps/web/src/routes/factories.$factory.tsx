import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FactoryCanvas } from '@/components/factory/FactoryCanvas';
import { routeLink } from '@/components/nav/routeLink';
import { Button, Card, CardContent, Title } from '@/components/ui/ds';
import { factoryPlacesQuery } from '@/lib/api/factories';
import { factoryInboxQuery } from '@/lib/api/inbox';
import { openRunsQuery } from '@/lib/api/runs';
import { storeQuery } from '@/lib/api/store';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

export const Route = createFileRoute('/factories/$factory')({
  /**
   * Waits for the factories as places (`factoryPlacesQuery`, the list alone, no factory's lines) and the factory's runs that are not
   * finished (`openRunsQuery`, its namespace its name, `default` the runs of no factory), and nothing more: the floor draws as soon as
   * those are read. It starts the factory's cards in play (`factoryInboxQuery`) for the queue's ghosts beside the floor without waiting on
   * them, so the page never waits on the inbox; the lane comes after, and the floor fits again as it comes (`FactoryCanvas`). A prefetch
   * never throws: what cannot be read says so over the floor, and the runs are drawn all the same.
   */
  loader: async ({ context, params }) => {
    void context.queryClient.prefetchQuery(factoryInboxQuery(params.factory));
    await Promise.all([
      context.queryClient.ensureQueryData(factoryPlacesQuery),
      context.queryClient.ensureQueryData(openRunsQuery(params.factory)),
    ]);
  },
  staticData: { fullBleed: true },
  component: FactoryPage,
  errorComponent: ({ error }) => <ReadTrouble what="the factories and their runs" error={error} className="p-4" />,
});

/**
 * Inside a factory: its floor alone, the strip over the runs it holds and the cards queued in it (`FactoryCanvas`), the factory named in
 * the top bar's picker (`FactoryPicker`). Nothing is drawn above the floor: the template the factory is made from is a section of its
 * Settings, and its proposals a page of their own (`/factories/$factory/proposals`). A name the api lists no factory by says so: no route
 * of the api is asked about it.
 */
function FactoryPage() {
  const { factory: name } = Route.useParams();
  const { data: factories } = useSuspenseQuery(factoryPlacesQuery);
  const { data: open } = useSuspenseQuery(openRunsQuery(name));
  const factory = factories.find((f) => f.name === name);
  if (!factory) return <NoSuchFactory name={name} />;
  return <FactoryCanvas open={open} factory={factory} />;
}

/** A button to a route, as the router draws its links (`routeLink`). */
const RouterLinkButton = routeLink(Button);

/** A name no factory has: say so, how to make it (`fileFactory`, as the api answers it), and lead back to the Factories. */
function NoSuchFactory({ name }: { name: string }) {
  const { data: store } = useQuery(storeQuery);
  return (
    <div className="flex h-[calc(100svh-var(--frame-top)-var(--frame-lines)-var(--frame-foot))] items-center justify-center p-6">
      <Card variant="outlined" className="w-full max-w-sm" classNames={{ content: 'gap-4' }} data-no-factory={name}>
        <CardContent
          headline={
            <Title size="medium" component="h2">
              No factory named {name}
            </Title>
          }
          supportingText={
            <>
              The factories are listed on the Factories page. Make one named {name} from the command line
              {store ? (
                <>
                  {' '}
                  with <code>{store.fileFactory}</code>
                </>
              ) : null}
              .
            </>
          }
          actions={
            <RouterLinkButton to="/" variant="outlined" size="xsmall">
              Go to Factories
            </RouterLinkButton>
          }
          classNames={{ header: 'mb-0', actions: 'mt-0 justify-start' }}
        />
      </Card>
    </div>
  );
}
