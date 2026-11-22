import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { InboxPage } from '../components/inbox/InboxPage';
import { inboxAllQuery } from '../lib/api/inbox.ts';
import { labelSearch } from '../lib/api/labels.ts';
import { cardsSearch } from '../lib/inbox';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/** The Inbox of the factory its path names's cards, its label selector and which cards it lists in its search. */
export const Route = createFileRoute('/factories/$factory_/inbox')({
  validateSearch: (search: Record<string, unknown>) => ({ ...labelSearch(search), ...cardsSearch(search) }),
  loaderDeps: ({ search }) => ({ l: search.l }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(inboxAllQuery(deps.l)),
  component: Page,
  errorComponent: ({ error }) => <ReadTrouble what="the inbox" error={error} />,
});

/** The Inbox, read off its address; a change of its search is written to it. */
function Page() {
  const search = Route.useSearch();
  const { factory } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  return <InboxPage at={{ ...search, factory }} onSearch={(patch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })} />;
}
