import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { InboxPage } from '../components/inbox/InboxPage';
import { inboxAllQuery } from '../lib/api/inbox.ts';
import { labelSearch } from '../lib/api/labels.ts';
import { cardsSearch } from '../lib/inbox';

/** The Inbox, every factory's cards, its label selector and which cards it lists in its search. */
export const Route = createFileRoute('/inbox')({
  validateSearch: (search: Record<string, unknown>) => ({ ...labelSearch(search), ...cardsSearch(search) }),
  loaderDeps: ({ search }) => ({ l: search.l }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(inboxAllQuery(deps.l)),
  component: Page,
  errorComponent: ({ error }) => (
    <p className="text-body-medium text-failure">
      Could not load the inbox: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

/** The Inbox, read off its address; a change of its search is written to it. */
function Page() {
  const search = Route.useSearch();

  const navigate = useNavigate({ from: Route.fullPath });
  return <InboxPage at={{ ...search }} onSearch={(patch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })} />;
}
