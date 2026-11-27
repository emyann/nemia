import { useLayoutEffect, useRef, useState } from 'react';
import type { InboxEntry } from '@/lib/api/inbox';
import { cardWord } from '@/lib/inbox';
import { Body } from '@/components/ui/ds';
import { StartChain } from './CardActions';
import { InboxCard } from './InboxCard';

/** The words a chain's head counts its cards by, in the order it says them: its tags' words, then `not started` for a card with none. */
const COUNTED = ['working', 'waiting', 'stuck', 'refused', 'failed', 'pending', 'blocked', 'not started', 'cancelled', 'done'] as const;

/** A wait drawn: from the right edge of the card waited on to the left edge of the card that waits, in the chain's own pixels. */
type Wire = { from: string; to: string; x1: number; y1: number; x2: number; y2: number };

/**
 * The ends of a chain, each card that no other card of it waits on, as a person reads them: one title, two joined by `and`, three as a
 * list, and past three the first two and how many more.
 * @param ends The chain's cards that nothing of it waits on, in the chain's order.
 */
function towardOf(ends: readonly InboxEntry[]) {
  const titles = ends.map((end) => end.title ?? end.name);
  if (titles.length <= 2) return titles.join(' and ');
  if (titles.length === 3) return `${titles[0]}, ${titles[1]} and ${titles[2]}`;
  return `${titles[0]}, ${titles[1]} and ${titles.length - 2} more`;
}

/**
 * How many of `cards` hold each word, by the word each card's tag says, `not started` for a card whose tag says nothing: only the words
 * held, in the order of `COUNTED`.
 * @param cards The chain's cards.
 */
function countsOf(cards: readonly InboxEntry[]) {
  const words = cards.map((card) => cardWord(card) ?? 'not started');
  return COUNTED.flatMap((word) => {
    const held = words.filter((w) => w === word).length;
    return held === 0 ? [] : [`${held} ${word}`];
  });
}

/**
 * Where each wait of the chain is drawn, read from the cards' boxes in `chain`: one wire per card of the chain a card names in its
 * `after`, from the waited-on card's right edge to the waiting card's left edge, each at its card's middle.
 * @param chain The element that holds the chain's columns and its wires.
 * @param cards The chain's cards.
 */
function wiresIn(chain: HTMLElement, cards: readonly InboxEntry[]) {
  const origin = chain.getBoundingClientRect();
  const boxes = new Map(
    [...chain.querySelectorAll<HTMLElement>('[data-chain-card]')].map((el) => [el.dataset.chainCard, el.getBoundingClientRect()]),
  );
  return cards.flatMap((card) =>
    (card.after ?? []).flatMap((before) => {
      const from = boxes.get(before);
      const to = boxes.get(card.name);
      if (from === undefined || to === undefined) return [];
      const wire: Wire = {
        from: before,
        to: card.name,
        x1: from.right - origin.left,
        y1: from.top + from.height / 2 - origin.top,
        x2: to.left - origin.left,
        y2: to.top + to.height / 2 - origin.top,
      };
      return [wire];
    }),
  );
}

/**
 * The path of one wire: out of the card waited on, across the gap, and into the card that waits, bending once halfway.
 * @param wire The wire's two ends.
 */
function pathOf({ x1, y1, x2, y2 }: Wire) {
  const bend = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${bend} ${y1}, ${bend} ${y2}, ${x2} ${y2}`;
}

/**
 * One chain of cards drawn whole: its cards in columns, the ones with nothing before them first, the cards each waits on to its left,
 * each in the compact size, and a wire for each wait, from the card waited on to the card that waits. Its head names each card the chain
 * leads toward (those no card of it waits on) and counts its cards by the words their tags say, and holds Start chain… where a card is
 * left to offer. `members` are its columns.
 */
export function CardChain({ members }: { members: readonly (readonly InboxEntry[])[] }) {
  const cards = members.flat();
  const waitedOn = new Set(cards.flatMap((card) => card.after ?? []));
  const ends = cards.filter((card) => !waitedOn.has(card.name));
  const chain = useRef<HTMLDivElement>(null);
  const [wires, setWires] = useState<readonly Wire[]>([]);
  useLayoutEffect(() => {
    const el = chain.current;
    if (!el) return;
    const read = () =>
      setWires((was) => {
        const now = wiresIn(el, cards);
        return JSON.stringify(now) === JSON.stringify(was) ? was : now;
      });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    for (const card of el.querySelectorAll('[data-chain-card]')) observer.observe(card);
    return () => observer.disconnect();
  }, [cards]);
  return (
    <div data-chain={cards[0]?.name} className="space-y-2">
      <div data-chain-head className="flex flex-wrap items-center gap-3">
        <Body size="medium" component="span">
          Toward {towardOf(ends)}
        </Body>
        <Body size="small" component="span" colorRole="on-surface-variant">
          {[`${cards.length} cards`, ...countsOf(cards)].join(' · ')}
        </Body>
        <StartChain chain={cards} />
      </div>
      <div className="overflow-x-auto pb-2">
        <div ref={chain} className="relative w-max">
          <ol aria-label={`Chain of ${cards.length} cards`} className="flex items-stretch gap-8">
            {members.map((column, at) => (
              <li key={at} className="flex shrink-0 items-stretch">
                <ul className="flex w-64 flex-col gap-2">
                  {column.map((entry) => (
                    <li key={entry.name} data-chain-card={entry.name}>
                      <InboxCard entry={entry} size="compact" chain={cards} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-outline">
            {wires.map((wire) => (
              <g key={`${wire.from}>${wire.to}`} data-wire={`${wire.from}>${wire.to}`} fill="none" stroke="currentColor">
                <path data-wire-line d={pathOf(wire)} strokeWidth={1} />
                <polyline
                  points={`${wire.x2 - 5},${wire.y2 - 4} ${wire.x2},${wire.y2} ${wire.x2 - 5},${wire.y2 + 4}`}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
