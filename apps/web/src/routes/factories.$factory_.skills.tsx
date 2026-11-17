import { createFileRoute } from '@tanstack/react-router';
import { CapabilitiesPage, CapabilitiesReading } from '../components/settings/CapabilitiesPage';
import { capabilitiesQuery } from '../lib/api/capabilities.ts';
import { pagePlaceOf } from '../lib/factories';

/** What the repository of the factory its path names offers a step, on the repository its search names (`?repo=`). */
export const Route = createFileRoute('/factories/$factory_/skills')({
  validateSearch: pagePlaceOf,
  loaderDeps: ({ search }) => ({ repo: search.repo }),
  loader: ({ context, deps, params }) => context.queryClient.ensureQueryData(capabilitiesQuery({ ...deps, factory: params.factory })),
  component: Page,
  pendingComponent: CapabilitiesReading,
  errorComponent: ({ error }) => (
    <p className="text-body-medium text-failure">
      Could not load the capabilities: {error instanceof Error ? error.message : String(error)}. Is the api running (
      <code>npm run dev</code>)?
    </p>
  ),
});

/** The page, read off its address. */
function Page() {
  const { factory } = Route.useParams();
  return <CapabilitiesPage place={{ ...Route.useSearch(), factory }} />;
}
