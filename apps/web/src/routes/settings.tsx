import { createFileRoute } from '@tanstack/react-router';
import { NemiaSettings } from '@/components/NemiaSettings';
import { policyQuery, levelQuery, nemiaMemoryQuery } from '@/lib/api';

/**
 * The frame's Settings, at /settings: what is set for the whole store, across factories. Its loader reads Nemia's level, her rules at
 * Auto and her memory.
 */
export const Route = createFileRoute('/settings')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(levelQuery),
      context.queryClient.prefetchQuery(policyQuery('nemia')),
      context.queryClient.prefetchQuery(nemiaMemoryQuery),
    ]);
  },
  component: SettingsPage,
});

/** What a person sets for the whole store: Nemia, its own agent (`NemiaSettings`). */
function SettingsPage() {
  return (
    <article data-settings className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-title-large">Settings</h1>
        <p className="text-body-medium text-muted-foreground">What is set for the whole store, across every factory.</p>
      </header>
      <NemiaSettings />
    </article>
  );
}
