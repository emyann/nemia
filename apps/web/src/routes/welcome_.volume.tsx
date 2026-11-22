import { createFileRoute } from '@tanstack/react-router';
import { VolumeStep } from '@/components/welcome/VolumeStep';
import { factoryNamesQuery } from '@/lib/api/factories';
import { milestonesQuery } from '@/lib/api/readiness';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/**
 * The welcome's volume step, at /welcome/volume: `welcome_` draws it on its own, not inside the welcome. Reached by the factory step's
 * Next; no redirect. Its loader reads the factories' names and the milestones.
 */
export const Route = createFileRoute('/welcome_/volume')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(factoryNamesQuery), context.queryClient.ensureQueryData(milestonesQuery)]),
  component: () => <VolumeStep />,
  errorComponent: ({ error }) => (
    <ReadTrouble what="this server's factories or milestones" error={error} className="p-4" then="Open the board at /." />
  ),
});
