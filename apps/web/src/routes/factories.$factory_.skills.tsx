import { createFileRoute } from '@tanstack/react-router';
import { CapabilitiesPage, CapabilitiesReading } from '../components/settings/CapabilitiesPage';
import { capabilitiesQuery } from '../lib/api/capabilities.ts';
import { pagePlaceOf } from '../lib/factories';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/** What the repository of the factory its path names offers a step, on the repository its search names (`?repo=`). */
export const Route = createFileRoute('/factories/$factory_/skills')({
  validateSearch: pagePlaceOf,
  loaderDeps: ({ search }) => ({ repo: search.repo }),
  loader: ({ context, deps, params }) => context.queryClient.ensureQueryData(capabilitiesQuery({ ...deps, factory: params.factory })),
  component: Page,
  pendingComponent: CapabilitiesReading,
  errorComponent: ({ error }) => <ReadTrouble what="the capabilities" error={error} />,
});

/** The page, read off its address. */
function Page() {
  const { factory } = Route.useParams();
  return <CapabilitiesPage place={{ ...Route.useSearch(), factory }} />;
}
