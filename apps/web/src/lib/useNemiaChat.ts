import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  answerChat,
  chatStreamPath,
  markChatRead,
  readChat,
  sendChat,
  stopChat,
  type AskPick,
  type ChatEvent,
  type ChatSent,
} from './api/chat.ts';
import { changedChat, followChat, mergeChatEvents, unreadChat, type ChatFollowed } from './chatFollowing.ts';
import { forgetKept, keepUnsent, readKept, sendingOnce, editKept as writeKept, type ChatKept } from './chatOutbox.ts';
import { animationFrames } from './follow.ts';

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
 * (`kept`), and what the panel does — send words, answer a question of hers, end the turn she is answering, try a kept message
 * again, change it, throw it away, and mark what was read.
 */
export type NemiaChat = {
  state: ChatFollowed;
  kept: ChatKept | null;
  send: (text: string) => void;
  answer: (id: string, picks: readonly AskPick[]) => void;
  stop: () => void;
  sendKept: () => void;
  editKept: (text: string) => void;
  discardKept: () => void;
  markRead: (through: string) => void;
};

/** What the read and the stream write into: the state they change, and the try they ask for again. */
export type Reader = { setState: Dispatch<SetStateAction<ChatFollowed>>; tryAgain: () => void };

/**
 * Reads her chat once and follows it from the cursor it answered, and asks for another try after `CHAT_RETRY_MS` where the read did not
 * work. Every read that works opens one stream, the panel open or closed: her docked face reads her presence from it. A read that did not
 * work is the end: it fills `error` and clears the `retrying` notice an earlier stream may have left, as `follow`'s end does. Returns
 * what stops it: the read abandoned, the retry dropped, the stream closed.
 */
export function reading({ setState, tryAgain }: Reader): () => void {
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
      const stream = new EventSource(`${chatStreamPath}?after=${encodeURIComponent(first.cursor)}`);
      stop = followChat(stream, setState, animationFrames);
    },
    (err: unknown) => {
      if (read.signal.aborted) return;
      setState((s) => ({ ...s, loading: false, live: false, error: err instanceof Error ? err.message : String(err), retrying: null }));
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
 * Nemia's chat, read once and then followed for as long as the page is open: held by `NemiaChatProvider` over the frame, not by a
 * route, so navigating keeps the one stream, and her docked face and the chat page read the same state from it.
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
 *
 * `answer` files the person's picks against a question of hers (`answerChat`). Nothing is drawn from its answer: the choice is written
 * on her chat, which the stream brings down with the rest and draws on the ask itself, and a refusal — the ask answered already, or
 * cut since — is what the next read says.
 *
 * `stop` ends the turn she is answering (`stopChat`) and leaves her session open. Nothing is drawn from its answer: the stop is written
 * on her chat as the keeper's quiet marker, which the stream brings down with the rest, and a refusal — her turn over by the time it
 * reached the api — is what her presence says a beat later.
 */
function useHeldChat(): NemiaChat {
  const [state, setState] = useState<ChatFollowed>(() => unreadChat(true));
  const [kept, setKept] = useState<ChatKept | null>(() => readKept());
  const [attempt, setAttempt] = useState(0);
  const marked = useRef<string | null>(null);

  useEffect(() => reading({ setState, tryAgain: () => setAttempt((n) => n + 1) }), [attempt]);

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

  const answer = useCallback((id: string, picks: readonly AskPick[]) => {
    answerChat(id, picks).catch(() => undefined);
  }, []);

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

  return { state, kept, send, answer, stop, sendKept, editKept: edit, discardKept: discard, markRead };
}

const HeldChat = createContext<NemiaChat | null>(null);

/**
 * Holds her chat, its read and its one stream, for as long as it is mounted: the frame mounts it once over every page
 * (`routes/__root.tsx`), so the page's visit holds one stream of hers beside the feed's, whatever route it is on.
 */
export function NemiaChatProvider({ children }: { children?: ReactNode }) {
  return createElement(HeldChat.Provider, { value: useHeldChat() }, children);
}

/** Her chat as the frame's `NemiaChatProvider` holds it; a component drawn outside one is refused. */
export function useNemiaChat(): NemiaChat {
  const chat = useContext(HeldChat);
  if (chat === null)
    throw new Error('useNemiaChat reads her chat from NemiaChatProvider: draw this component under it (routes/__root.tsx).');
  return chat;
}
