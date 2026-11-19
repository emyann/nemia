import { createFileRoute } from '@tanstack/react-router';
import { VolumeStep } from '@/components/welcome/VolumeStep';
import { factoryNamesQuery } from '@/lib/api/factories';
import { milestonesQuery } from '@/lib/api/readiness';

/**
 * The welcome's volume step, at /welcome/volume: `welcome_` draws it on its own, not inside the welcome. Reached by the factory step's
 * Next and by Getting started; no redirect. Its loader reads the factories' names and the milestones.
 */
export const Route = createFileRoute('/welcome_/volume')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(factoryNamesQuery), context.queryClient.ensureQueryData(milestonesQuery)]),
  component: () => <VolumeStep />,
  errorComponent: ({ error }) => (
    <p className="p-4 text-body-medium text-failure">
      Could not read this server&apos;s factories or milestones: {error instanceof Error ? error.message : String(error)}. Open the board at
      /, or reload the page once the api answers.
    </p>
  ),
});
