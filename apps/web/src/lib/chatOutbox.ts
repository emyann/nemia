/**
 * A message to Nemia the api did not take, kept in this browser until it does: refused, where the api answered with a 4xx and its
 * words of why, which the board says and never sends again on its own; or lost, where nothing answered or the api failed (a 5xx),
 * which the board tries again every few seconds (`retryKept`). It is no fact of the store — the store's outbox holds
 * what the api took — so it is this browser's alone, under one key, through `lib/stored.ts`: a storage that
 * is refused or full keeps nothing, and the message lasts as long as the page does.
 *
 * Pure, apart from the storage calls, so a node test proves each rule.
 */
import { WriteRefusal } from './api/read.ts';
import { forgetStored, readStored, store } from './stored.ts';

/** The key this browser keeps a message that did not go under. */
export const CHAT_OUTBOX_KEY = 'nemia:chat-outbox';

/**
 * A message that did not go: its words, when the person wrote them, and `refused`, the api's own words where it answered and refused
 * them; absent where the board lost the daemon.
 */
export type ChatKept = { text: string; at: string; refused?: string };

/** What `raw` names: a kept message, or null for storage that holds none, or words that are not one. */
export function parseKept(raw: string | null): ChatKept | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { text, at, refused } = value as Record<string, unknown>;
  if (typeof text !== 'string' || text === '' || typeof at !== 'string') return null;
  return typeof refused === 'string' && refused !== '' ? { text, at, refused } : { text, at };
}

/** The message this browser keeps, null where it keeps none or storage is refused. */
export function readKept(): ChatKept | null {
  return readStored(CHAT_OUTBOX_KEY, parseKept, null);
}

/**
 * Keeps `text`, written at `at`, as the message that did not go, with the api's `refused` words where it refused it: where storage is
 * refused or full, nothing is kept.
 */
export function keepUnsent(text: string, at: string, refused?: string): void {
  store(CHAT_OUTBOX_KEY, JSON.stringify(refused === undefined ? { text, at } : { text, at, refused }));
}

/** The kept message's words changed to `text`, its moment and what the api last said of it kept: nothing where none is kept. */
export function editKept(text: string): void {
  const kept = readKept();
  if (kept !== null) keepUnsent(text, kept.at, kept.refused);
}

/**
 * What the api said where `failure` is its refusal, an answer with a 4xx status: its own words. Null where nothing answered (the fetch
 * failed) or the api failed (a 5xx): the board lost the daemon.
 */
function refusalOf(failure: unknown): string | null {
  return failure instanceof WriteRefusal && failure.status >= 400 && failure.status < 500 ? failure.message : null;
}

/** The message `text`, written at `at`, as a send that failed with `failure` leaves it: refused with the api's words, or lost. */
export function keptAfter(text: string, at: string, failure: unknown): ChatKept {
  const refused = refusalOf(failure);
  return refused === null ? { text, at } : { text, at, refused };
}

/**
 * Tries `send` every `ms` until it resolves or is refused, the first try `ms` from now: a failure that is no refusal (`refusalOf`) is
 * tried again, a refusal is handed to `refused` and never tried again on its own. Returns what stops it.
 */
export function retryKept(send: () => Promise<unknown>, ms: number, refused: (failure: unknown) => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;
  const attempt = () => {
    send().catch((failure: unknown) => {
      if (stopped) return;
      if (refusalOf(failure) !== null) refused(failure);
      else timer = setTimeout(attempt, ms);
    });
  };
  timer = setTimeout(attempt, ms);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** Forgets the kept message: where storage is refused, nothing was kept to forget. */
export function forgetKept(): void {
  forgetStored(CHAT_OUTBOX_KEY);
}

/** The send in flight, so a second try while the first is still going is the first. */
let sending: Promise<unknown> | null = null;

/**
 * Runs `send` unless one is already in flight, in which case that one is answered: the api returning, the stream opening and the pace
 * each try the kept message, and it must reach her once. Resolves and rejects as `send` does, and the next call runs it again.
 */
export function sendingOnce<T>(send: () => Promise<T>): Promise<T> {
  if (sending !== null) return sending as Promise<T>;
  const flight = send();
  sending = flight;
  return flight.finally(() => {
    if (sending === flight) sending = null;
  });
}
