import { createFileRoute } from '@tanstack/react-router';
import { FactoryStep } from '@/components/welcome/FactoryStep';
import { milestonesQuery } from '@/lib/api/readiness';
import { templatesQuery } from '@/lib/api/templates';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/**
 * The welcome's factory step, at /welcome/factory: `welcome_` draws it on its own, not inside the welcome, which sends a store with its
 * harness on to the board as it enters. Reached by the harness step's Next; no redirect. Its loader reads the
 * milestones and the templates.
 */
export const Route = createFileRoute('/welcome_/factory')({
  staticData: { frame: 'reading' },
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(milestonesQuery), context.queryClient.ensureQueryData(templatesQuery)]),
  component: FactoryStep,
  errorComponent: ({ error }) => (
    <ReadTrouble what="this server's milestones or templates" error={error} className="p-4" then="Open the board at /." />
  ),
});
