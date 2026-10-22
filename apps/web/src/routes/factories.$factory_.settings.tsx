import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FactoryInstruction } from '@/components/FactoryInstruction';
import { FactoryRules } from '@/components/FactoryRules';
import { FactoryTrust } from '@/components/FactoryTrust';
import { FactorySchedules } from '@/components/FactorySchedules';
import { FactoryServers } from '@/components/FactoryServers';
import { routeLink } from '@/components/routeLink';
import { LinkButton } from '@/components/ui/button';
import { factoriesQuery, factoryInstructionQuery, factoryRulesQuery, factoryServersQuery } from '@/lib/api';

/**
 * A factory's settings, at /factories/$factory/settings: `$factory_` draws it on its own, not inside the floor, which has no outlet for it.
 * It waits for the factories, then prefetches the rules, the instruction and the MCP servers of a factory a person made, each of which
 * says why it does not read in its own section; the default factory and a name no factory has ask for none. The servers are prefetched
 * because something that mounts beside the floor after its first render narrows a floor already fitted — and because that read spawns a
 * harness session, which the loader makes once per visit rather than on each render. The query never goes stale
 * (`factoryServersQuery`), so the loader reads it as stale on entering the page (`OPENED`) and the section's mount reads nothing again;
 * a preload, on a link's hover, reads none, since the page it would read for is not open.
 */
export const Route = createFileRoute('/factories/$factory_/settings')({
  loader: async ({ context, params, cause }) => {
    const factories = await context.queryClient.ensureQueryData(factoriesQuery);
    if (factories.some((f) => f.name === params.factory && !f.default))
      await Promise.all([
        context.queryClient.prefetchQuery(factoryRulesQuery(params.factory)),
        context.queryClient.prefetchQuery(factoryInstructionQuery(params.factory)),
        cause === 'preload'
          ? undefined
          : context.queryClient.prefetchQuery({ ...factoryServersQuery(params.factory), staleTime: OPENED[cause] }),
      ]);
  },
  component: SettingsPage,
  errorComponent: ({ error }) => (
    <p className="p-4 text-body-medium text-failure">
      Could not load the factories: {error instanceof Error ? error.message : String(error)}
    </p>
  ),
});

/**
 * How old the servers' states may be for the loader to keep them: none on entering the page, which reads them once, and any while the
 * page stays open (a search or a reload of the route's own), which leaves the read to Check again.
 */
const OPENED = { enter: 0, stay: Infinity } as const;

/** A button to a route, as the router draws its links (`routeLink`). */
const RouterLinkButton = routeLink(LinkButton);

/**
 * What a person sets of one factory: first, a place of it that is not trusted, with the line that trusts it (`FactoryTrust`); its rules,
 * what every agent hired into it is told (`FactoryRules`); its instruction, what Nemia is to
 * know about it (`FactoryInstruction`); then its schedules, shown as the factories' read answers them (`FactorySchedules`). The default
 * factory, and a name no factory has, have no settings to keep, and say so: neither the rules nor the instruction is read for them.
 */
function SettingsPage() {
  const { factory: name } = Route.useParams();
  const { data: factories } = useSuspenseQuery(factoriesQuery);
  const factory = factories.find((f) => f.name === name);
  return (
    <article data-factory-settings={name} className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div>
          <RouterLinkButton to="/factories/$factory" params={{ factory: name }} variant="ghost" size="sm" data-back-to-floor>
            ← Back to the floor
          </RouterLinkButton>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-title-large">{name}</h1>
          <p className="text-body-medium text-muted-foreground">This factory's settings.</p>
        </div>
      </header>
      {factory === undefined ? (
        <p data-no-factory={name} className="text-body-medium text-muted-foreground">
          No factory is named {name}: the factories are listed on the Factories page.
        </p>
      ) : factory.default ? (
        <p data-default-factory className="text-body-medium text-muted-foreground">
          The default factory has no file, so it keeps no settings: they are kept by the factories a person makes.
        </p>
      ) : (
        <>
          <FactoryTrust factory={factory} />
          <FactoryRules name={name} />
          <FactoryInstruction name={name} />
          <FactoryServers name={name} />
          <FactorySchedules factory={factory} />
        </>
      )}
    </article>
  );
}
