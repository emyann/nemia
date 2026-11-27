import { createFileRoute } from '@tanstack/react-router';
import { CapabilitiesPage, CapabilitiesReading } from '../components/settings/CapabilitiesPage';
import { capabilitiesQuery } from '../lib/api/capabilities.ts';
import { pagePlaceOf } from '../lib/factories';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/** What the repository of the default factory offers a step, on the repository its search names (`?repo=`). */
export const Route = createFileRoute('/capabilities')({
  staticData: { frame: 'reading' },
  validateSearch: pagePlaceOf,
  loaderDeps: ({ search }) => ({ repo: search.repo }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(capabilitiesQuery({ ...deps })),
  component: Page,
  pendingComponent: CapabilitiesReading,
  errorComponent: ({ error }) => <ReadTrouble what="the capabilities" error={error} />,
});

/** The page, read off its address. */
function Page() {
  return <CapabilitiesPage place={{ ...Route.useSearch() }} />;
}
