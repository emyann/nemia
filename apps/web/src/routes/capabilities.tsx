import { createFileRoute } from '@tanstack/react-router';
import { CapabilitiesPage, CapabilitiesReading } from '../components/settings/CapabilitiesPage';
import { capabilitiesQuery } from '../lib/api/capabilities.ts';
import { pagePlaceOf } from '../lib/factories';

/** What the repository of the default factory offers a step, on the repository its search names (`?repo=`). */
export const Route = createFileRoute('/capabilities')({
  validateSearch: pagePlaceOf,
  loaderDeps: ({ search }) => ({ repo: search.repo }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(capabilitiesQuery({ ...deps })),
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
  return <CapabilitiesPage place={{ ...Route.useSearch() }} />;
}
