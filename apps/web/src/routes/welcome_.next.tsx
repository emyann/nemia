import { createFileRoute } from '@tanstack/react-router';
import { YouAreSet } from '@/components/welcome/YouAreSet';
import { factoriesQuery } from '@/lib/api/factories';
import { milestonesQuery } from '@/lib/api/readiness';

/**
 * The welcome's last page, "You are set", at /welcome/next: `welcome_` draws it on its own. Reached by the landed hint of a first card's
 * run; no redirect. Its loader reads the milestones and the factories.
 */
export const Route = createFileRoute('/welcome_/next')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(milestonesQuery), context.queryClient.ensureQueryData(factoriesQuery)]),
  component: YouAreSet,
  errorComponent: ({ error }) => (
    <p className="p-4 text-body-medium text-failure">
      Could not read this server&apos;s milestones or factories: {error instanceof Error ? error.message : String(error)}. Open the board at
      /, or reload the page once the api answers.
    </p>
  ),
});
