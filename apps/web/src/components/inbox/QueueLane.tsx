import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { factoriesQuery, type Factory } from '@/lib/api/factories';
import { workflowNameOf } from '@/lib/api/workflows';
import { type InboxEntry } from '@/lib/api/inbox';
import { agoWords } from '@/lib/runWords';
import { repoName } from '@/lib/factory';
import { cardRepo, ordinal } from '@/lib/inbox';
import { instantWhole } from '@/lib/instant';
import { useNow } from '@/lib/useNow';

/**
 * The queue on the Factory: every queued inbox card, in the order the tick starts them (`queueOf`), drawn as a ghost of the card its run
 * will be — at the floor's left edge, where work comes in, and off the floor itself: a ghost is no node, so nothing waits on it and it
 * waits on nothing, and it neither moves nor is moved by the cards. Each says its place, its first line, its workflow, the repository its
 * factory wires for that workflow (`cardRepo`) or `not wired` with the attach on hover — never the card's nor the daemon's — and how
 * long ago it was queued, as every page says an age (`agoWords`); a start the tick tried and did not make is marked, refused or
 * failed, with why on hover. A ghost opens the card's page.
 *
 * Beside the floor on a wide screen, a column that scrolls; above it on a narrow one, a row that does.
 */
export function QueueLane({ cards }: { cards: readonly InboxEntry[] }) {
  const now = useNow(30_000);
  const factories = useQuery(factoriesQuery).data;
  return (
    <aside
      aria-label="Queued cards"
      className="flex shrink-0 gap-2 overflow-x-auto border-b bg-muted/30 p-3 @lg/page:w-64 @lg/page:flex-col @lg/page:overflow-x-hidden @lg/page:overflow-y-auto @lg/page:border-r @lg/page:border-b-0"
    >
      <p className="hidden text-body-small text-muted-foreground @lg/page:block">
        <span className="font-medium text-foreground">Queued</span> · started in this order as run slots free
      </p>
      <ol className="flex gap-2 @lg/page:flex-col">
        {cards.map((card) => (
          <li key={card.name} className="w-56 shrink-0 @lg/page:w-auto">
            <Ghost card={card} now={now} factories={factories} />
          </li>
        ))}
      </ol>
    </aside>
  );
}

function Ghost({ card, now, factories }: { card: InboxEntry; now: number; factories: readonly Factory[] | undefined }) {
  const { queued, tried } = card;
  const place = queued!.place!;
  const title = card.title ?? card.file;
  return (
    <Link
      to="/inbox/$name"
      params={{ name: card.name }}
      data-ghost={card.name}
      data-place={place}
      aria-label={`Queued ${ordinal(place)}: ${title}`}
      className="block rounded-lg border border-dashed border-outline bg-background/60 px-3 py-2 text-muted-foreground transition-colors hover:border-on-surface-variant hover:bg-background hover:text-foreground"
    >
      <span className="flex items-center justify-between gap-2 text-body-small">
        <span data-ghost-place className="rounded-full border border-dashed border-current px-1.5 font-medium">
          {ordinal(place)}
        </span>
        <time dateTime={queued!.at} title={`Queued at ${instantWhole(new Date(queued!.at))}`} className="font-mono">
          queued {agoWords(new Date(queued!.at), new Date(now))}
        </time>
      </span>
      <span data-ghost-title title={title} className="mt-1 line-clamp-2 text-body-medium font-medium break-words text-foreground/80">
        {title}
      </span>
      <span className="mt-0.5 flex items-center justify-between gap-2 text-body-small">
        {card.workflow && (
          <span data-ghost-workflow className="truncate font-mono" title={card.workflow}>
            {workflowNameOf(card.workflow)}
          </span>
        )}
        <GhostRepo card={card} factories={factories} />
      </span>
      {tried && (
        <span
          data-ghost-tried={tried.refused ? 'refused' : 'failed'}
          title={tried.why}
          className={`mt-1 line-clamp-2 text-body-small break-words ${tried.refused ? 'text-yours' : 'text-muted-foreground'}`}
        >
          {tried.refused ? 'not started, refused: ' : 'failed, tried again: '}
          {tried.why}
        </span>
      )}
      {!tried && card.error && (
        <span data-ghost-error title={card.error} className="mt-1 line-clamp-2 text-body-small break-words text-failure">
          {card.error}
        </span>
      )}
    </Link>
  );
}

/**
 * Where a ghost's run will work: the repository its factory wires for its workflow, by its folder's name, the path on hover; `not
 * wired`, with the attach that wires it on hover, where the factory gives it none; nothing while the factories are unread, or where its
 * factory decides at start (a card that names no workflow in a factory of several).
 */
function GhostRepo({ card, factories }: { card: InboxEntry; factories: readonly Factory[] | undefined }) {
  const on = cardRepo(card, factories);
  if (on === null) return null;
  return 'repo' in on ? (
    <span data-ghost-repo className="shrink-0 truncate" title={on.repo}>
      {repoName(on.repo)}
    </span>
  ) : (
    <span data-ghost-repo="not wired" className="shrink-0 truncate text-yours" title={on.why}>
      not wired
    </span>
  );
}
