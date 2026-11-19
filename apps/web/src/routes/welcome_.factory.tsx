import { createFileRoute } from '@tanstack/react-router';
import { FactoryStep } from '@/components/welcome/FactoryStep';
import { milestonesQuery } from '@/lib/api/readiness';
import { templatesQuery } from '@/lib/api/templates';

/**
 * The welcome's factory step, at /welcome/factory: `welcome_` draws it on its own, not inside the welcome, which sends a store with its
 * harness on to the board as it enters. Reached by the harness step's Next and by Getting started; no redirect. Its loader reads the
 * milestones and the templates.
 */
export const Route = createFileRoute('/welcome_/factory')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(milestonesQuery), context.queryClient.ensureQueryData(templatesQuery)]),
  component: FactoryStep,
  errorComponent: ({ error }) => (
    <p className="p-4 text-body-medium text-failure">
      Could not read this server&apos;s milestones or templates: {error instanceof Error ? error.message : String(error)}. Open the board at
      /, or reload the page once the api answers.
    </p>
  ),
});
