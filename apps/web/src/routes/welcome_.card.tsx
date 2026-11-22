import { createFileRoute } from '@tanstack/react-router';
import { FirstCard } from '@/components/welcome/FirstCard';
import { factoriesQuery } from '@/lib/api/factories';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/**
 * The welcome's first card, at /welcome/card: `welcome_` draws it on its own, not inside the welcome. Reached by the volume step's Next;
 * no redirect. Its loader reads the factories, each with the workflows it offers.
 */
export const Route = createFileRoute('/welcome_/card')({
  loader: ({ context }) => context.queryClient.ensureQueryData(factoriesQuery),
  component: FirstCard,
  errorComponent: ({ error }) => <ReadTrouble what="this server's factories" error={error} className="p-4" then="Open the board at /." />,
});
