import { createFileRoute } from '@tanstack/react-router';
import { FirstCard } from '@/components/welcome/FirstCard';
import { factoriesQuery } from '@/lib/api/factories';

/**
 * The welcome's first card, at /welcome/card: `welcome_` draws it on its own, not inside the welcome. Reached by the volume step's Next;
 * no redirect. Its loader reads the factories, each with the workflows it offers.
 */
export const Route = createFileRoute('/welcome_/card')({
  loader: ({ context }) => context.queryClient.ensureQueryData(factoriesQuery),
  component: FirstCard,
  errorComponent: ({ error }) => (
    <p className="p-4 text-body-medium text-failure">
      Could not read this server&apos;s factories: {error instanceof Error ? error.message : String(error)}. Open the board at /, or reload
      the page once the api answers.
    </p>
  ),
});
