import { Link } from '@tanstack/react-router';
import { workflowNameOf, type InboxEntry } from '@/lib/api';
import { duration } from '@/lib/canvas';
import { repoName } from '@/lib/factory';
import { ordinal } from '@/lib/inbox';
import { useNow } from '@/lib/useNow';

/**
 * The queue on the Factory: every queued inbox card, in the order the tick starts them (`queueOf`), drawn as a ghost of the card its run
 * will be — at the floor's left edge, where work comes in, and off the floor itself: a ghost is no node, so nothing waits on it and it
 * waits on nothing, and it neither moves nor is moved by the cards. Each says its place, its first line, its workflow and repository, and
 * how long it has been queued, to the minute; a start the tick tried and did not make is marked, refused or failed, with why on hover. A
 * ghost opens the card's page.
 *
 * Beside the floor on a wide screen, a column that scrolls; above it on a narrow one, a row that does.
 */
export function QueueLane({ cards }: { cards: readonly InboxEntry[] }) {
  const now = useNow(30_000);
  return (
    <aside
      aria-label="Queued cards"
      className="flex shrink-0 gap-2 overflow-x-auto border-b bg-muted/30 p-3 md:w-64 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:border-r md:border-b-0"
    >
      <p className="hidden text-[11px] text-muted-foreground md:block">
        <span className="font-medium text-foreground">Queued</span> · started in this order as run slots free
      </p>
      <ol className="flex gap-2 md:flex-col">
        {cards.map((card) => (
          <li key={card.name} className="w-56 shrink-0 md:w-auto">
            <Ghost card={card} now={now} />
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** How long a card has been queued, to the minute: `just now`, `12m ago`, `3h 12m ago`, `2d 4h ago`. */
const waited = (ms: number): string => (ms < 60_000 ? 'just now' : `${duration(ms).replace(/ \d+s$/, '')} ago`);

function Ghost({ card, now }: { card: InboxEntry; now: number }) {
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
      <span className="flex items-center justify-between gap-2 text-[11px]">
        <span data-ghost-place className="rounded-full border border-dashed border-current px-1.5 font-medium">
          {ordinal(place)}
        </span>
        <time dateTime={queued!.at} title={`Queued at ${new Date(queued!.at).toLocaleString()}`} className="font-mono">
          queued {waited(now - Date.parse(queued!.at))}
        </time>
      </span>
      <span data-ghost-title title={title} className="mt-1 line-clamp-2 text-sm font-medium break-words text-foreground/80">
        {title}
      </span>
      <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px]">
        {card.workflow && (
          <span data-ghost-workflow className="truncate font-mono" title={card.workflow}>
            {workflowNameOf(card.workflow)}
          </span>
        )}
        <span
          data-ghost-repo
          className="shrink-0 truncate"
          title={card.repo ?? 'It names no repository: it starts on the one the daemon runs in'}
        >
          {card.repo ? repoName(card.repo) : "the daemon's repository"}
        </span>
      </span>
      {tried && (
        <span
          data-ghost-tried={tried.refused ? 'refused' : 'failed'}
          title={tried.why}
          className={`mt-1 line-clamp-2 text-[11px] break-words ${tried.refused ? 'text-yours' : 'text-muted-foreground'}`}
        >
          {tried.refused ? 'not started, refused: ' : 'failed, tried again: '}
          {tried.why}
        </span>
      )}
      {!tried && card.error && (
        <span data-ghost-error title={card.error} className="mt-1 line-clamp-2 text-[11px] break-words text-failure">
          {card.error}
        </span>
      )}
    </Link>
  );
}
