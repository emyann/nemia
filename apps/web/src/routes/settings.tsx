import { createFileRoute } from '@tanstack/react-router';
import { ForgetToken } from '@/components/frame/ForgetToken';
import { NemiaSettings } from '@/components/nemia/NemiaSettings';
import { ServerRelease } from '@/components/settings/ServerRelease';
import { policyQuery } from '@/lib/api/policy';
import { levelQuery, nemiaMemoryQuery } from '@/lib/api/nemia';
import { upgradesQuery } from '@/lib/api/upgrades';
import { versionQuery } from '@/lib/api/version';

/**
 * The frame's Settings, at /settings: what is set for the whole store, across factories. Its loader reads the server's release and its
 * upgrades, Nemia's level, her rules at Auto and her memory.
 */
export const Route = createFileRoute('/settings')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(versionQuery),
      context.queryClient.prefetchQuery(upgradesQuery),
      context.queryClient.prefetchQuery(levelQuery),
      context.queryClient.prefetchQuery(policyQuery('nemia')),
      context.queryClient.prefetchQuery(nemiaMemoryQuery),
    ]);
  },
  component: SettingsPage,
});

/**
 * What a person sets for the whole store: the server's release, upgraded or taken back here (`ServerRelease`); Nemia, its own agent
 * (`NemiaSettings`); and this browser's token (`ForgetToken`).
 */
function SettingsPage() {
  return (
    <article data-settings className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-title-large">Settings</h1>
        <p className="text-body-medium text-muted-foreground">What is set for the whole store, across every factory.</p>
      </header>
      <ServerRelease />
      <NemiaSettings />
      <ForgetToken />
    </article>
  );
}
