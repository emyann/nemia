import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AsWritten, KeyTable } from '../field/FilePage';
import { Instant } from '../time/Instant';
import { StartedAs } from './InboxParts';
import { Markdown } from '../markdown/Markdown';
import { Labels } from '../field/Labels';
import { cardQuery } from '@/lib/api/inbox';
import { labelCard } from '@/lib/api/labels';
import { workflowNameOf } from '@/lib/api/workflows';
import { startedCard } from '@/lib/inbox';

import { factoryOf } from '../nav/nav';
import { useSeat } from '../nav/useSeat';

/**
 * One inbox card, to read: its body rendered, then each key a card may set with its value and what it means — or, with Source, its file as
 * written. A started card says the runs it was started as, beside its run's phase (`StartedAs`), whether that run is in flight or ended.
 * It starts and drops nothing: the Inbox page does.
 * @param props the props: the card's name, from the address
 */
export function CardPage({ name }: { name: string }) {
  const { data: card } = useSuspenseQuery(cardQuery(name));
  const queryClient = useQueryClient();

  return (
    <article className="space-y-6">
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
          edit={(edits) => labelCard(card, edits).then(() => queryClient.invalidateQueries({ queryKey: ['inbox'] }))}
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

/** The way back to the Inbox: the factory's, on a page under its path, else every factory's. */
export function BackToInbox() {
  const factory = factoryOf(useSeat());
  const className = 'text-body-medium text-muted-foreground hover:text-foreground';
  return factory === undefined ? (
    <Link to="/inbox" className={className}>
      ← Inbox
    </Link>
  ) : (
    <Link to="/factories/$factory/inbox" params={{ factory }} className={className}>
      ← Inbox
    </Link>
  );
}
