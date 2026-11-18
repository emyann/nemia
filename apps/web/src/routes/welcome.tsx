import { createFileRoute, redirect } from '@tanstack/react-router';
import { WelcomePage } from '@/components/welcome/WelcomePage';
import { readinessQuery } from '@/lib/api/readiness';
import { readHarnessSkipped } from '@/lib/harnessSkip';
import { welcomeAsked } from '@/lib/welcome';

/**
 * The welcome, at /welcome, where a fresh store opens (`welcomeAsked`): a store that already has its harness or a factory, or whose
 * person skipped it in this browser, is sent on to the board as it enters, decided once at that navigation, never while the page is in
 * use. Its loader reads the readiness read.
 */
export const Route = createFileRoute('/welcome')({
  beforeLoad: async ({ context, cause }) => {
    if (cause !== 'enter') return;
    const read = await context.queryClient.ensureQueryData(readinessQuery).catch(() => undefined);
    if (read !== undefined && !welcomeAsked(read.pieces, readHarnessSkipped())) throw redirect({ to: '/', replace: true });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(readinessQuery),
  component: WelcomePage,
  errorComponent: ({ error }) => (
    <p className="p-4 text-body-medium text-failure">
      Could not read what this server has in place: {error instanceof Error ? error.message : String(error)}. Open the board at /, or reload
      the page once the api answers.
    </p>
  ),
});
