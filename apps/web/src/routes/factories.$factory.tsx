import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { RouteLink } from '@/components/AgentParts';
import { FactoryCanvas } from '@/components/FactoryCanvas';
import { LinkButton } from '@/components/ui/button';
import { routeLink } from '@/components/routeLink';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { daemonQuery, factoriesQuery, inboxQuery, quotaQuery, runsQuery, type Factory } from '@/lib/api';
import { repoName } from '@/lib/factory';
import { runsIn } from '@/lib/factories';

export const Route = createFileRoute('/factories/$factory')({
  /**
   * Waits for the factories and the runs, and prefetches the inbox for the queue's ghosts beside the floor, the quota, and whether a
   * daemon ticks over it, so the floor is fitted beside them with the first cards. A prefetch never throws: what cannot be read says so
   * over the floor, and the runs are drawn all the same.
   */
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(factoriesQuery),
      context.queryClient.ensureQueryData(runsQuery),
      context.queryClient.prefetchQuery(inboxQuery),
      context.queryClient.prefetchQuery(quotaQuery),
      context.queryClient.prefetchQuery(daemonQuery),
    ]),
  staticData: { fullBleed: true },
  component: FactoryPage,
  errorComponent: ({ error }) => (
    <p className="p-4 text-sm text-red-600">
      Could not load the factories and their runs: {error instanceof Error ? error.message : String(error)}. Is the api running (
      <code>npm run dev</code>)?
    </p>
  ),
});

/**
 * Inside a factory: its floor, the runs it holds and the cards queued in it (`FactoryCanvas`), under a line back to the Factories naming
 * it and its repositories, or why its file does not read. A name the api lists no factory by says so: no route of the api is asked about it.
 */
function FactoryPage() {
  const { factory: name } = Route.useParams();
  const { data: factories } = useSuspenseQuery(factoriesQuery);
  const { data: runs } = useSuspenseQuery(runsQuery);
  const factory = factories.find((f) => f.name === name);
  if (!factory) return <NoSuchFactory name={name} />;
  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col" data-factory={factory.name}>
      <FactoryLine factory={factory} />
      <div className="min-h-0 flex-1">
        <FactoryCanvas runs={runsIn(runs, factory)} factory={factory} />
      </div>
    </div>
  );
}

/** The line over a factory's floor: back to the Factories, the factory's name, and the repositories it works on, whole on hover. */
function FactoryLine({ factory }: { factory: Factory }) {
  return (
    <nav aria-label="Factory" className="flex items-center gap-2 border-b px-4 py-1.5 text-sm">
      <RouteLink
        to="/"
        className="flex items-center gap-1 text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
      >
        <ChevronLeft className="size-4" />
        Factories
      </RouteLink>
      <span className="text-muted-foreground">/</span>
      <h1 className="font-medium">{factory.name}</h1>
      <span className="truncate text-muted-foreground" title={factory.repos.join('\n')}>
        on {factory.repos.map(repoName).join(', ') || 'no repository'}
      </span>
      {factory.error && (
        <span className="truncate text-destructive" title={factory.error}>
          Its file does not read: {factory.error}
        </span>
      )}
    </nav>
  );
}

/** A button to a route, as the router draws its links (`routeLink`). */
const RouterLinkButton = routeLink(LinkButton);

/** A name no factory has: say so, and lead back to the Factories. */
function NoSuchFactory({ name }: { name: string }) {
  return (
    <div className="flex h-[calc(100svh-3rem)] items-center justify-center p-6">
      <Card className="w-full max-w-sm" data-no-factory={name}>
        <CardHeader>
          <CardTitle>No factory named {name}</CardTitle>
          <CardDescription>
            The factories are listed on the Factories page. Make one with <code>npx wf factory add {name} --repo &lt;path&gt;</code>.
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
