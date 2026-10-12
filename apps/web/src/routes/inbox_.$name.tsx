import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AsWritten, KeyTable } from '../components/FilePage';
import { Markdown } from '../components/Markdown';
import { cardQuery, workflowNameOf } from '../lib/api';

/** The page of an inbox card, at /inbox/$name: `inbox_` draws it on its own, not inside the Inbox page, which has no outlet for it. */
export const Route = createFileRoute('/inbox_/$name')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(cardQuery(params.name)),
  component: CardPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToInbox />
      <p className="text-sm text-red-600">Could not load this card: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

/**
 * One inbox card, to read: its body rendered, then each key a card may set with its value and what it means — or, with Source, its file as
 * written. It starts and drops nothing: the Inbox page does.
 */
function CardPage() {
  const { name } = Route.useParams();
  const { data: card } = useSuspenseQuery(cardQuery(name));

  return (
    <article className="space-y-6">
      <BackToInbox />

      <header className="space-y-1">
        <h1 className="font-mono text-sm text-muted-foreground">{card.name}</h1>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{card.error === null ? 'inbox card' : 'in the inbox, not a card'}</span>
          {card.workflow && (
            <span data-workflow={card.workflow} title={card.workflow}>
              workflow <span className="font-mono text-foreground">{workflowNameOf(card.workflow)}</span>
            </span>
          )}
          {card.filedAt && (
            <time dateTime={card.filedAt} title="When its file was last written">
              filed {new Date(card.filedAt).toLocaleString()}
            </time>
          )}
        </p>
      </header>

      {card.startedAs.length > 0 && (
        <p data-started-as className="text-sm text-amber-700 dark:text-amber-400">
          Started as{' '}
          {card.startedAs.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <Link to="/runs/$runId" params={{ runId: id }} className="font-mono underline underline-offset-2">
                {id}
              </Link>
            </span>
          ))}
          , and still in the inbox because its removal failed.
        </p>
      )}

      {card.error !== null && (
        <div className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Does not read as a card, so it cannot start:</p>
          <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{card.error}</p>
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
    <Link to="/inbox" className="text-sm text-muted-foreground hover:text-foreground">
      ← Inbox
    </Link>
  );
}
