import { ChevronRight } from 'lucide-react';
import type { InboxEntry } from '@/lib/api/inbox';
import { Body } from '@/components/ui/ds';
import { StartChain } from './CardActions';
import { InboxCard } from './InboxCard';

/**
 * One chain of cards drawn whole: its cards in columns, the ones with nothing before them first, the cards each waits on to its left,
 * each in the compact size, and a wire between the columns (the line between them says what a card runs after). Its head says the card it
 * leads toward and how many of its cards are working or not started, and holds Start chain…. `members` are its columns.
 */
export function CardChain({ members }: { members: readonly (readonly InboxEntry[])[] }) {
  const cards = members.flat();
  const toward = members.at(-1)?.[0];
  const working = cards.filter((card) => card.phase === 'working').length;
  const waiting = cards.filter((card) => card.phase === 'notStarted' || card.phase === 'blocked').length;
  return (
    <div data-chain={cards[0]?.name} className="space-y-2">
      <div data-chain-head className="flex flex-wrap items-center gap-3">
        <Body size="medium" component="span">
          Toward {toward?.title ?? toward?.name}
        </Body>
        <Body size="small" component="span" colorRole="on-surface-variant">
          {cards.length} cards · {working} working · {waiting} not started
        </Body>
        <StartChain chain={cards} />
      </div>
      <ol aria-label={`Chain of ${cards.length} cards`} className="flex items-stretch gap-0 overflow-x-auto pb-2">
        {members.map((column, at) => (
          <li key={at} className="flex shrink-0 items-stretch">
            {at > 0 && (
              <span aria-hidden="true" className="my-auto flex w-8 items-center text-outline">
                <span className="h-px flex-1 bg-outline" />
                <ChevronRight size={14} className="-ml-1.5 shrink-0" />
              </span>
            )}
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
    </div>
  );
}
