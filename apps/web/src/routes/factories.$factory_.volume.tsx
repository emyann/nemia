import { createFileRoute } from '@tanstack/react-router';
import { VolumeStep } from '@/components/welcome/VolumeStep';
import { factoryViewQuery } from '@/lib/api/factories';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/**
 * A factory's volume step opened again from its Settings, at /factories/$factory/volume: the welcome's "Where is the work?" for this
 * factory, to add another. `$factory_` draws it on its own, not inside the floor. Its loader reads the factory.
 */
export const Route = createFileRoute('/factories/$factory_/volume')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(factoryViewQuery(params.factory)),
  component: VolumePage,
  errorComponent: ({ error }) => (
    <ReadTrouble what="this factory" error={error} className="p-4" then="Its Settings name the factories there are." />
  ),
});

/** The step, for the factory the path names. */
function VolumePage() {
  const { factory } = Route.useParams();
  return <VolumeStep factory={factory} again />;
}
