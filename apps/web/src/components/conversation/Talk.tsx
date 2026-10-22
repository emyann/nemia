/**
 * The talk of a conversation of the board: its items oldest first, each drawn by its kind (`Worked`, `Said`, `Note`, and an `own` item
 * by the `drawOwn` its caller hands over), the line that says how many are new over the first item the person has not read (`newAt`),
 * and the sentinel at its foot that says the latest is on screen — which is when the read mark is posted (`onRead`), and when the jump
 * pill goes.
 *
 * The pill is drawn whenever the person has read back, counted or not: a conversation that counts nothing unread — a step's session,
 * which is read by opening it — still offers the one way back to the latest, and `jumpWords` says the count only where there is one.
 *
 * It scrolls on its own, its bar drawn by `markScrolls`, and follows the latest while the person is at its foot — by `drawnCount`,
 * which counts a turn by its lines, since a turn grows a line at a time and the items it is one of do not: read back, it stays
 * where they left it. It takes the room its panel gives it and no more — the panel is bounded by the window — so a long talk scrolls
 * inside it rather than growing the panel past the screen, and on a page of its own it fills the frame down to the composer.
 *
 * `TalkEmpty` is the same scrolling shell for a conversation with nothing said yet, which its caller's own greeting stands in. Every
 * data mark either writes is under the prefix `marks` names (`mark`).
 *
 * `density` is how closely it stands: a page of its own gives its items the room they want, a panel beside something else
 * (`compact`, the run page's Activity tab) half of it. It is the talk's own layout, so it sits on the talk's elements and on nothing a
 * host hands down — a class on a parent is overridden by the type role of every text under it.
 *
 * `writing` is the message the conversation is being told as it is written, drawn under the items until the whole of it takes its
 * place. It is the talk's too, and not an item of its caller's: what is drawn grows with every character of it, which `drawnCount`
 * cannot see, so the talk would stop following its latest halfway through a message.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { drawnCount, mark, newWords, type ConversationItem } from '@/lib/conversation';
import { markScrolls } from '@/lib/useScrollMark';
import { cn } from '@/lib/utils';
import { Jump } from './Jump';
import { Note, Said, Writing } from './Said';
import { Worked } from './Worked';

/** One item of the talk, drawn by its kind; an `own` item is the caller's, drawn by the `drawOwn` it handed over. */
function Block<Own>({ item, marks, drawOwn }: { item: ConversationItem<Own>; marks: string; drawOwn?: (own: Own) => ReactNode }) {
  if (item.kind === 'work') return <Worked work={item} marks={marks} />;
  if (item.kind === 'said') return <Said said={item} marks={marks} />;
  if (item.kind === 'note')
    return (
      <Note what={item.what} marks={marks}>
        {item.words}
      </Note>
    );
  return drawOwn === undefined ? null : drawOwn(item.own);
}

type Props<Own> = {
  items: readonly ConversationItem<Own>[];
  marks: string;
  label: string;
  backLabel: string;
  newAt: string | null;
  unread: number;
  readable: string | null;
  onRead: (through: string) => void;
  drawOwn?: (own: Own) => ReactNode;
  density?: 'page' | 'compact';
  writing?: string | null;
};

/** The talk: what `items` holds, with the new line, the jump pill, the read mark's sentinel, and the caller's own items drawn. */
export function Talk<Own>({
  items,
  marks,
  label,
  backLabel,
  newAt,
  unread,
  readable,
  onRead,
  drawOwn,
  density = 'page',
  writing = null,
}: Props<Own>) {
  const box = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => (box.current ? markScrolls(box.current) : undefined), []);

  useEffect(() => {
    const target = end.current;
    const root = box.current;
    if (!target || !root) return;
    const seen = new IntersectionObserver((entries) => setAtEnd(entries.some((entry) => entry.isIntersecting)), { root });
    seen.observe(target);
    return () => seen.disconnect();
  }, []);

  useEffect(() => {
    if (atEnd && readable !== null) onRead(readable);
  }, [atEnd, readable, onRead]);

  const drawn = drawnCount(items);
  useEffect(() => {
    if (atEnd) end.current?.scrollIntoView({ block: 'end' });
  }, [atEnd, drawn, writing]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div
        ref={box}
        {...mark(marks, 'talk', atEnd ? 'latest' : 'back')}
        role="log"
        aria-label={atEnd ? label : backLabel}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a box that scrolls is reached by the keyboard
        tabIndex={0}
        className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto', density === 'compact' ? 'gap-2' : 'gap-4')}
      >
        {items.map((item) => (
          <div key={item.id} className="contents">
            {newAt !== null && newAt === item.id && (
              <div {...mark(marks, 'new')} role="separator" className="flex items-center gap-2.5 text-label-small text-alive uppercase">
                <hr className="min-w-0 flex-1 border-alive/55" />
                <span>{newWords(unread)}</span>
                <hr className="min-w-0 flex-1 border-alive/55" />
              </div>
            )}
            <Block item={item} marks={marks} drawOwn={drawOwn} />
          </div>
        ))}
        {writing !== null && writing !== '' && (
          <div {...mark(marks, 'partial')}>
            <Writing text={writing} marks={marks} />
          </div>
        )}
        <div ref={end} aria-hidden="true" className="h-px shrink-0" />
      </div>
      {!atEnd && <Jump unread={unread} marks={marks} onJump={() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })} />}
    </div>
  );
}

/** The scrolling shell a conversation with nothing said yet stands its own greeting in. */
export function TalkEmpty({ marks, children }: { marks: string; children: ReactNode }) {
  return (
    <div {...mark(marks, 'empty')} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      {children}
    </div>
  );
}
