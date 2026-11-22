import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FactoryCostLines } from '@/components/factory/FactoryCostLines';
import { FactoryDelegations } from '@/components/factory/FactoryDelegations';
import { FactoryHome } from '@/components/factory/FactoryHome';
import { FactoryInstruction } from '@/components/factory/FactoryInstruction';
import { FactoryRules } from '@/components/factory/FactoryRules';
import { TemplateCard } from '@/components/factory/TemplateCard';
import { FactoryTrust } from '@/components/factory/FactoryTrust';
import { FactoryTriggers } from '@/components/factory/FactoryTriggers';
import { FactoryServers } from '@/components/factory/FactoryServers';
import { FactoryVolumes } from '@/components/factory/FactoryVolumes';
import { LibraryAdds } from '@/components/library/LibraryAdds';
import { TextLink } from '@/components/look';
import { factoryLevel, Trail } from '@/components/nav/Trail';
import { delegationsQuery } from '@/lib/api/proposals';
import { factoriesQuery, factoryInstructionQuery, factoryRulesQuery, factoryServersQuery } from '@/lib/api/factories';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/**
 * A factory's settings, at /factories/$factory/settings: `$factory_` draws it on its own, not inside the floor, which has no outlet for it.
 * It waits for the factories, then prefetches the rules, the instruction, the delegations and the MCP servers of a factory a person made,
 * each of which says why it does not read in its own section; the default factory and a name no factory has ask for none. The servers are
 * prefetched because something that mounts beside the floor after its first render narrows a floor already fitted — and because that read
 * spawns a harness session, which the loader makes once per visit rather than on each render. The query never goes stale
 * (`factoryServersQuery`), so the loader reads it as stale on entering the page (`OPENED`) and the section's mount reads nothing again; a
 * preload, on a link's hover, reads none, since the page it would read for is not open.
 */
export const Route = createFileRoute('/factories/$factory_/settings')({
  loader: async ({ context, params, cause }) => {
    const factories = await context.queryClient.ensureQueryData(factoriesQuery);
    if (factories.some((f) => f.name === params.factory && !f.default))
      await Promise.all([
        context.queryClient.prefetchQuery(factoryRulesQuery(params.factory)),
        context.queryClient.prefetchQuery(factoryInstructionQuery(params.factory)),
        context.queryClient.prefetchQuery(delegationsQuery(params.factory)),
        cause === 'preload'
          ? undefined
          : context.queryClient.prefetchQuery({ ...factoryServersQuery(params.factory), staleTime: OPENED[cause] }),
      ]);
  },
  component: SettingsPage,
  errorComponent: ({ error }) => <ReadTrouble what="the factories" error={error} className="p-4" />,
});

/**
 * How old the servers' states may be for the loader to keep them: none on entering the page, which reads them once, and any while the
 * page stays open (a search or a reload of the route's own), which leaves the read to Check again.
 */
const OPENED = { enter: 0, stay: Infinity } as const;

/**
 * What a person sets of one factory: first, the template it is made from, where it has one, read-only (`TemplateCard`); the line that opens
 * their own session in its home, where it has one (`FactoryHome`); then a place of it that is not trusted, with the line that trusts it
 * (`FactoryTrust`); the folders its runs reach beside its repositories, each with its two switches and the line that takes it back
 * (`FactoryVolumes`); the cost line it sets per workflow it offers, which a gate whose caps pass it says (`FactoryCostLines`); its rules,
 * what every agent hired into it is told (`FactoryRules`); the agents it lets approve its proposals (`FactoryDelegations`); its
 * instruction, what Nemia is to know about it (`FactoryInstruction`); then its triggers, its schedules among them as the factories' read
 * answers them (`FactoryTriggers`). The default factory, and a name no factory has, have no settings to keep, and say so: neither the rules
 * nor the instruction is read for them. Its head says where it is: the factory, leading to its floor, then Settings.
 */
function SettingsPage() {
  const { factory: name } = Route.useParams();
  const { data: factories } = useSuspenseQuery(factoriesQuery);
  const factory = factories.find((f) => f.name === name);
  return (
    <article data-factory-settings={name} className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Trail levels={[...factoryLevel(name), { name: 'Settings' }]} />
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
          {factory.template ? <TemplateCard template={factory.template} /> : null}
          {factory.commands.home === null ? null : <FactoryHome name={name} line={factory.commands.home} />}
          <FactoryTrust factory={factory} />
          <FactoryVolumes factory={factory} />
          <p data-volume-again className="-mt-4 text-body-medium">
            <TextLink to="/factories/$factory/volume" params={{ factory: name }}>
              Add the work: a folder, a repository, a new one
            </TextLink>
          </p>
          <FactoryCostLines factory={factory} />
          <FactoryRules name={name} />
          <FactoryDelegations name={name} />
          <FactoryInstruction name={name} />
          <FactoryServers name={name} />
          <LibraryAdds name={name} />
          <FactoryTriggers
            name={name}
            line={factory.commands.trigger}
            schedules={factory.schedules}
            scheduleLine={factory.commands.schedule}
          />
        </>
      )}
    </article>
  );
}
