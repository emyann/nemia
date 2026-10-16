/**
 * The talk of Nemia's chat: her events oldest first, each drawn by what it is (`ChatMessage`, `ChatTurn`), the line that says how many
 * are new over the first of them the person has not read (`newFrom`), and the sentinel at its foot that says her latest is on screen —
 * which is when the read mark is posted (`onRead`), and when the jump pill goes.
 *
 * It scrolls on its own, its bar drawn by `markScrolls`, and follows her latest while the person is at its foot: read back, it stays
 * where they left it. It takes the room the panel gives it and no more — the panel is bounded by the window — so a long talk scrolls
 * inside it rather than growing the panel past the screen, and on her own page it fills the frame down to the composer.
 */
import { useEffect, useRef, useState } from 'react';
import { foldChat, newFrom, newWords, readableFrom, type ChatItem } from '@/lib/chatFollowing';
import type { ChatEvent } from '@/lib/api';
import { markScrolls } from '@/lib/useScrollMark';
import { ChatJump } from './ChatJump';
import { ChatMarkerLine, ChatMessage } from './ChatMessage';
import { ChatTurn } from './ChatTurn';

/** One block of the talk, drawn by what it is: a turn of her steps, her words, the person's, or a quiet line. */
function Block({ item }: { item: ChatItem }) {
  if (item.kind === 'turn') return <ChatTurn turn={item} />;
  const event = item.event;
  if (event.kind === 'message') return <ChatMessage message={event} />;
  if (event.kind === 'session') return <ChatMarkerLine what="session">{`A session of hers began — her ${event.attempt}`}</ChatMarkerLine>;
  return null;
}

/** The talk: what `events` holds, folded, with the new line, the jump pill and the read mark's sentinel. */
export function ChatTalk({ events, unread, onRead }: { events: readonly ChatEvent[]; unread: number; onRead: (through: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);
  const items = foldChat(events);
  const newAt = newFrom(events, unread);
  const readable = readableFrom(events);

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

  useEffect(() => {
    if (atEnd) end.current?.scrollIntoView({ block: 'end' });
  }, [atEnd, events.length]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div
        ref={box}
        data-chat-talk={atEnd ? 'latest' : 'back'}
        role="log"
        aria-label={atEnd ? "Nemia's talk" : 'Earlier messages'}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a box that scrolls is reached by the keyboard
        tabIndex={0}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto"
      >
        {items.map((item) => (
          <div key={item.kind === 'turn' ? item.id : item.event.id} className="contents">
            {newAt !== null && newAt === (item.kind === 'turn' ? null : item.event.id) && (
              <div data-chat-new role="separator" className="flex items-center gap-2.5 text-label-small text-alive uppercase">
                <hr className="min-w-0 flex-1 border-alive/55" />
                <span>{newWords(unread)}</span>
                <hr className="min-w-0 flex-1 border-alive/55" />
              </div>
            )}
            <Block item={item} />
          </div>
        ))}
        <div ref={end} aria-hidden="true" className="h-px shrink-0" />
      </div>
      {!atEnd && unread > 0 && (
        <ChatJump unread={unread} onJump={() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })} />
      )}
    </div>
  );
}
