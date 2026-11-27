import type { InboxEntry } from '@/lib/api/inbox';
import { InboxCard } from './InboxCard';

/**
 * One chain of cards drawn whole: its cards in columns, the ones with nothing before them first, the cards each waits on to its left,
 * each in the compact size, and a wire between the columns (the line between them says what a card runs after). `members` are its columns.
 */
export function CardChain({ members }: { members: readonly (readonly InboxEntry[])[] }) {
  const cards = members.flat();
  return (
    <ol aria-label={`Chain of ${cards.length} cards`} data-chain={cards[0]?.name} className="flex items-stretch gap-0 overflow-x-auto pb-2">
      {members.map((column, at) => (
        <li key={at} className="flex shrink-0 items-stretch">
          {at > 0 && <span aria-hidden="true" className="my-auto h-px w-6 bg-outline" />}
          <ul className="flex w-64 flex-col gap-2">
            {column.map((entry) => (
              <li key={entry.name}>
                <InboxCard entry={entry} size="compact" chain={cards} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
