import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AsWritten, KeyTable } from '../components/FilePage';
import { Instant } from '../components/Instant';
import { StartedAs } from '../components/InboxParts';
import { Markdown } from '../components/Markdown';
import { Labels } from '../components/Labels';
import { cardQuery, labelCard, workflowNameOf } from '../lib/api';
import { startedCard } from '../lib/inbox';

/** The page of an inbox card, at /inbox/$name: `inbox_` draws it on its own, not inside the Inbox page, which has no outlet for it. */
export const Route = createFileRoute('/inbox_/$name')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(cardQuery(params.name)),
  component: CardPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToInbox />
      <p className="text-body-medium text-failure">Could not load this card: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

/**
 * One inbox card, to read: its body rendered, then each key a card may set with its value and what it means — or, with Source, its file as
 * written. A started card says the runs it was started as, beside its run's phase (`StartedAs`), whether that run is in flight or ended.
 * It starts and drops nothing: the Inbox page does. It ends on room as tall as Nemia's dock at the bottom right (her face and its
 * cues), so the dock covers none of its last key row once it is scrolled to its end.
 */
function CardPage() {
  const { name } = Route.useParams();
  const { data: card } = useSuspenseQuery(cardQuery(name));
  const queryClient = useQueryClient();

  return (
    <article className="space-y-6 pb-24">
      <BackToInbox />

      <header className="space-y-1">
        <h1 className="font-mono text-body-medium text-muted-foreground">{card.name}</h1>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-body-small text-muted-foreground">
          <span>{card.error === null ? 'inbox card' : 'in the inbox, not a card'}</span>
          {card.workflow && (
            <span data-workflow={card.workflow} title={card.workflow}>
              workflow <span className="font-mono text-foreground">{workflowNameOf(card.workflow)}</span>
            </span>
          )}
          {card.filedAt && (
            <span>
              filed <Instant at={card.filedAt} about="When its file was last written" />
            </span>
          )}
        </p>
      </header>

      {card.error === null && (
        <Labels
          labels={card.labels}
          edit={(edits) => labelCard(card.name, edits).then(() => queryClient.invalidateQueries({ queryKey: ['inbox'] }))}
        />
      )}

      {startedCard(card) && <StartedAs startedAs={card.startedAs} state={card.state} />}

      {card.error !== null && (
        <div className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
          <p className="text-body-medium font-medium text-on-failure-container">Does not read as a card, so it cannot start:</p>
          <p className="font-mono text-body-small whitespace-pre-wrap break-words text-on-failure-container">{card.error}</p>
        </div>
      )}

      <AsWritten file={card.file} source={card.source}>
        {card.body !== null && <Markdown>{card.body}</Markdown>}
        {card.keys && (
          <KeyTable
            rows={card.keys}
            note={<>As the card sets them, in its frontmatter. A start names what a card leaves unset: Start on the Inbox page.</>}
          />
        )}
      </AsWritten>
    </article>
  );
}

function BackToInbox() {
  return (
    <Link to="/inbox" className="text-body-medium text-muted-foreground hover:text-foreground">
      ← Inbox
    </Link>
  );
}
