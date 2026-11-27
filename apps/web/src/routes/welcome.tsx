import { createFileRoute, redirect } from '@tanstack/react-router';
import { WelcomePage } from '@/components/welcome/WelcomePage';
import { readinessQuery } from '@/lib/api/readiness';
import { readHarnessSkipped } from '@/lib/harnessSkip';
import { welcomeAsked } from '@/lib/welcome';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/**
 * The welcome, at /welcome, where a fresh store opens (`welcomeAsked`): a store that already has its harness or a factory, or whose
 * person skipped it in this browser, is sent on to the board as it enters, decided once at that navigation, never while the page is in
 * use. Its loader reads the readiness read.
 */
export const Route = createFileRoute('/welcome')({
  staticData: { frame: 'reading' },
  beforeLoad: async ({ context, cause }) => {
    if (cause !== 'enter') return;
    const read = await context.queryClient.ensureQueryData(readinessQuery).catch(() => undefined);
    if (read !== undefined && !welcomeAsked(read.pieces, readHarnessSkipped())) throw redirect({ to: '/', replace: true });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(readinessQuery),
  component: WelcomePage,
  errorComponent: ({ error }) => (
    <ReadTrouble what="what this server has in place" error={error} className="p-4" then="Open the board at /." />
  ),
});
