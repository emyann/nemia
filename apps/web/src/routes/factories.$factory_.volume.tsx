import { createFileRoute } from '@tanstack/react-router';
import { VolumeStep } from '@/components/welcome/VolumeStep';
import { factoryViewQuery } from '@/lib/api/factories';

/**
 * A factory's volume step opened again from its Settings, at /factories/$factory/volume: the welcome's "Where is the work?" for this
 * factory, to add another. `$factory_` draws it on its own, not inside the floor. Its loader reads the factory.
 */
export const Route = createFileRoute('/factories/$factory_/volume')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(factoryViewQuery(params.factory)),
  component: VolumePage,
  errorComponent: ({ error }) => (
    <p className="p-4 text-body-medium text-failure">
      Could not read this factory: {error instanceof Error ? error.message : String(error)}. Its Settings name the factories there are.
    </p>
  ),
});

/** The step, for the factory the path names. */
function VolumePage() {
  const { factory } = Route.useParams();
  return <VolumeStep factory={factory} again />;
}
