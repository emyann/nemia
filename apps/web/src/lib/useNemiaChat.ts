import { useCallback, useEffect, useRef, useState } from 'react';
import { chatStreamPath, markChatRead, readChat, sendChat, type ChatEvent, type ChatSent } from './api/chat.ts';
import { changedChat, followChat, mergeChatEvents, unreadChat, type ChatFollowed } from './chatFollowing.ts';
import { forgetKept, keepUnsent, readKept, sendingOnce, editKept as writeKept, type ChatKept } from './chatOutbox.ts';
import { animationFrames } from './following.ts';

/** How long the board waits before it reads her chat again, or tries a kept message again, after one that did not work. */
export const CHAT_RETRY_MS = 3_000;

/** The person's words, drawn as their own at once, under the id her chat gives the outbox entry, which the stream replaces by. */
const personEvent = (entry: ChatSent): ChatEvent => ({
  kind: 'message',
  id: `p:${entry.id}`,
  at: entry.at,
  from: 'person',
  text: entry.text,
  delivered: null,
});

/**
 * Her chat as a page holds it: what was read and followed (`state`), the message this browser kept because the api would not take it
 * (`kept`), and what the panel does — send words, try a kept message again, change it, throw it away, and mark what was read.
 */
export type NemiaChat = {
  state: ChatFollowed;
  kept: ChatKept | null;
  send: (text: string) => void;
  sendKept: () => void;
  editKept: (text: string) => void;
  discardKept: () => void;
  markRead: (through: string) => void;
};

/**
 * Nemia's chat, read once and then followed for as long as the page lives.
 *
 * The read gives her history, the cursor a stream resumes from and where she is; an `EventSource` on the stream route follows it from
 * that cursor, as `followChat` says, and leaves a dropped connection to the EventSource, which reconnects with the id of the last event
 * it was sent. A read that did not work is said and made again after `CHAT_RETRY_MS`, so a daemon that comes back is followed without a
 * reload.
 *
 * What the person writes goes to her outbox (`sendChat`), and is drawn as their own bubble at once under the id her chat gives it, which
 * the stream replaces by (`mergeChatEvents`). One the api would not take is kept in this browser (`lib/chatOutbox.ts`), survives a
 * reload, and is tried again every `CHAT_RETRY_MS` through `sendingOnce`, so the api coming back takes it once and no more.
 *
 * The read mark is posted for the event the panel says is on screen (`markRead`), once for each: the api never moves it back, and a
 * refusal lets the panel ask again.
 */
export function useNemiaChat(): NemiaChat {
  const [state, setState] = useState<ChatFollowed>(() => unreadChat(true));
  const [kept, setKept] = useState<ChatKept | null>(() => readKept());
  const [attempt, setAttempt] = useState(0);
  const marked = useRef<string | null>(null);

  useEffect(() => {
    const reading = new AbortController();
    let stop: (() => void) | undefined;
    let again: ReturnType<typeof setTimeout> | undefined;
    readChat({}, reading.signal).then(
      (first) => {
        if (reading.signal.aborted) return;
        setState((s) => ({
          ...unreadChat(false),
          events: mergeChatEvents(s.events, first.events),
          presence: first.presence,
          cursor: first.cursor,
          live: true,
        }));
        const stream = new EventSource(`${chatStreamPath}?after=${encodeURIComponent(first.cursor)}`);
        stop = followChat(stream, setState, animationFrames);
      },
      (err: unknown) => {
        if (reading.signal.aborted) return;
        setState((s) => ({ ...s, loading: false, live: false, error: err instanceof Error ? err.message : String(err) }));
        again = setTimeout(() => setAttempt((n) => n + 1), CHAT_RETRY_MS);
      },
    );
    return () => {
      reading.abort();
      if (again !== undefined) clearTimeout(again);
      stop?.();
    };
  }, [attempt]);

  const took = useCallback((entry: ChatSent) => {
    forgetKept();
    setKept(null);
    setState((s) => changedChat(s, { kind: 'events', events: [personEvent(entry)] }));
  }, []);

  const tryKept = useCallback((text: string) => sendingOnce(() => sendChat(text)).then(took), [took]);

  useEffect(() => {
    if (kept === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const retry = () => {
      tryKept(kept.text).catch(() => {
        timer = setTimeout(retry, CHAT_RETRY_MS);
      });
    };
    timer = setTimeout(retry, CHAT_RETRY_MS);
    return () => clearTimeout(timer);
  }, [kept, tryKept]);

  const send = useCallback(
    (text: string) => {
      const words = text.trim();
      if (!words) return;
      sendChat(words).then(took, () => {
        const at = new Date().toISOString();
        keepUnsent(words, at);
        setKept({ text: words, at });
      });
    },
    [took],
  );

  const sendKept = useCallback(() => {
    if (kept !== null) tryKept(kept.text).catch(() => undefined);
  }, [kept, tryKept]);

  const edit = useCallback((text: string) => {
    const words = text.trim();
    if (!words) return;
    writeKept(words);
    setKept((now) => (now === null ? now : { ...now, text: words }));
  }, []);

  const discard = useCallback(() => {
    forgetKept();
    setKept(null);
  }, []);

  const markRead = useCallback((through: string) => {
    if (marked.current === through) return;
    marked.current = through;
    markChatRead(through).then(
      () => setState((s) => ({ ...s, presence: { ...s.presence, unread: 0 } })),
      () => {
        marked.current = null;
      },
    );
  }, []);

  return { state, kept, send, sendKept, editKept: edit, discardKept: discard, markRead };
}
