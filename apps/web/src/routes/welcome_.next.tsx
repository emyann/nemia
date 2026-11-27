import { createFileRoute } from '@tanstack/react-router';
import { YouAreSet } from '@/components/welcome/YouAreSet';
import { factoriesQuery } from '@/lib/api/factories';
import { milestonesQuery } from '@/lib/api/readiness';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/**
 * The welcome's last page, "You are set", at /welcome/next: `welcome_` draws it on its own. Reached by the succeeded hint of a first card's
 * run; no redirect. Its loader reads the milestones and the factories.
 */
export const Route = createFileRoute('/welcome_/next')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(milestonesQuery), context.queryClient.ensureQueryData(factoriesQuery)]),
  component: YouAreSet,
  errorComponent: ({ error }) => (
    <ReadTrouble what="this server's milestones or factories" error={error} className="p-4" then="Open the board at /." />
  ),
});
