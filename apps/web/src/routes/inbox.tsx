import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { InboxPage } from '../components/inbox/InboxPage';
import { chainsQuery, inboxPageQuery } from '../lib/api/inbox.ts';
import { labelSearch } from '../lib/api/labels.ts';
import { finishedSearch } from '../lib/finished';
import { chainsPulled, inboxAskedOf, inboxSearch } from '../lib/inbox';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/** The Inbox, every factory's cards: its words, labels, order, side, state and page in its search. */
export const Route = createFileRoute('/inbox')({
  validateSearch: (search: Record<string, unknown>) => ({ ...labelSearch(search), ...inboxSearch(search), ...finishedSearch(search) }),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(inboxPageQuery(inboxAskedOf(deps.search))),
      chainsPulled(deps.search) ? context.queryClient.ensureQueryData(chainsQuery()) : null,
    ]),
  component: Page,
  errorComponent: ({ error }) => <ReadTrouble what="the inbox" error={error} />,
});

/** The Inbox, read off its address; a change of its search is written to it. */
function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return <InboxPage at={search} onSearch={(patch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })} />;
}
