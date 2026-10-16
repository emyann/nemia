import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { chatStreamPath, markChatRead, readChat, sendChat, stopChat, type ChatEvent, type ChatSent } from './api/chat.ts';
import { changedChat, followChat, mergeChatEvents, unreadChat, type ChatFollowed } from './chatFollowing.ts';
import { forgetKept, keepUnsent, readKept, sendingOnce, editKept as writeKept, type ChatKept } from './chatOutbox.ts';
import { animationFrames } from './follow.ts';

/** How long the board waits before it reads her chat again, or tries a kept message again, after one that did not work. */
export const CHAT_RETRY_MS = 3_000;

/**
 * How long a page whose panel is closed waits before it reads her chat again. It follows no stream there: a browser holds six
 * connections to one address, the frame's feed holds one of them on every page, and a second stream a person's few open pages would
 * spend them all, leaving the board's own reads queued. The panel open, the stream is followed and this read is not made.
 */
export const CHAT_BEAT_MS = 5_000;

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
 * (`kept`), and what the panel does — send words, end the turn she is answering, try a kept message again, change it, throw it away,
 * and mark what was read.
 */
export type NemiaChat = {
  state: ChatFollowed;
  kept: ChatKept | null;
  send: (text: string) => void;
  stop: () => void;
  sendKept: () => void;
  editKept: (text: string) => void;
  discardKept: () => void;
  markRead: (through: string) => void;
};

/** What the read and the stream write into: the state they change, the try they ask for again, and whether the stream is followed. */
type Reader = { setState: Dispatch<SetStateAction<ChatFollowed>>; tryAgain: () => void; follow: boolean };

/**
 * Reads her chat once and follows it from the cursor it answered, and asks for another try after `CHAT_RETRY_MS` where the read did not
 * work. Returns what stops it: the read abandoned, the retry dropped, the stream closed.
 */
function reading({ setState, tryAgain, follow }: Reader): () => void {
  const read = new AbortController();
  let stop: (() => void) | undefined;
  let again: ReturnType<typeof setTimeout> | undefined;
  readChat({}, read.signal).then(
    (first) => {
      if (read.signal.aborted) return;
      setState((s) => ({
        ...unreadChat(false),
        events: mergeChatEvents(s.events, first.events),
        presence: first.presence,
        cursor: first.cursor,
        live: true,
      }));
      if (!follow) {
        again = setTimeout(tryAgain, CHAT_BEAT_MS);
        return;
      }
      const stream = new EventSource(`${chatStreamPath}?after=${encodeURIComponent(first.cursor)}`);
      stop = followChat(stream, setState, animationFrames);
    },
    (err: unknown) => {
      if (read.signal.aborted) return;
      setState((s) => ({ ...s, loading: false, live: false, error: err instanceof Error ? err.message : String(err) }));
      again = setTimeout(tryAgain, CHAT_RETRY_MS);
    },
  );
  return () => {
    read.abort();
    if (again !== undefined) clearTimeout(again);
    stop?.();
  };
}

/**
 * Nemia's chat, read once and then followed for as long as the page lives.
 *
 * The read gives her history, the cursor a stream resumes from and where she is; an `EventSource` on the stream route follows it from
 * that cursor, as `followChat` says, and leaves a dropped connection to the EventSource, which reconnects with the id of the last event
 * it was sent. A read that did not work is said and made again after `CHAT_RETRY_MS`, so a daemon that comes back is followed without a
 * reload.
 *
 * `follow` is the panel being there to read her as she writes: false, which her docked face asks for while its panel is closed, reads
 * her again every `CHAT_BEAT_MS` instead and holds no stream open, since the browser has few connections to spend (`CHAT_BEAT_MS`).
 *
 * What the person writes goes to her outbox (`sendChat`), and is drawn as their own bubble at once under the id her chat gives it, which
 * the stream replaces by (`mergeChatEvents`). One the api would not take is kept in this browser (`lib/chatOutbox.ts`), survives a
 * reload, and is tried again every `CHAT_RETRY_MS` through `sendingOnce`, so the api coming back takes it once and no more.
 *
 * The read mark is posted for the event the panel says is on screen (`markRead`), once for each: the api never moves it back, and a
 * refusal lets the panel ask again.
 *
 * `stop` ends the turn she is answering (`stopChat`) and leaves her session open. Nothing is drawn from its answer: the stop is written
 * on her chat as the keeper's quiet marker, which the stream brings down with the rest, and a refusal — her turn over by the time it
 * reached the api — is what her presence says a beat later.
 */
export function useNemiaChat(follow = true): NemiaChat {
  const [state, setState] = useState<ChatFollowed>(() => unreadChat(true));
  const [kept, setKept] = useState<ChatKept | null>(() => readKept());
  const [attempt, setAttempt] = useState(0);
  const marked = useRef<string | null>(null);

  useEffect(() => reading({ setState, tryAgain: () => setAttempt((n) => n + 1), follow }), [attempt, follow]);

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

  const stop = useCallback(() => {
    stopChat().catch(() => undefined);
  }, []);

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

  return { state, kept, send, stop, sendKept, editKept: edit, discardKept: discard, markRead };
}
