/**
 * A message to Nemia the api would not take, kept in this browser until it does. It is no fact of the store — the store's outbox holds
 * what the api took — so it is this browser's alone, under one key, in the shape `lib/canvas.ts` keeps an arrangement in: a storage that
 * is refused or full keeps nothing, and the message lasts as long as the page does.
 *
 * Pure, apart from the storage calls, so a node test proves each rule.
 */

/** The key this browser keeps a message that did not go under. */
export const CHAT_OUTBOX_KEY = 'nemia:chat-outbox';

/** A message that did not go: its words, and when the person wrote them. */
export type ChatKept = { text: string; at: string };

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
  const { text, at } = value as Record<string, unknown>;
  return typeof text === 'string' && text !== '' && typeof at === 'string' ? { text, at } : null;
}

/** The message this browser keeps, null where it keeps none or storage is refused. */
export function readKept(): ChatKept | null {
  try {
    return parseKept(localStorage.getItem(CHAT_OUTBOX_KEY));
  } catch {
    return null;
  }
}

/** Keeps `text`, written at `at`, as the message that did not go: where storage is refused or full, nothing is kept. */
export function keepUnsent(text: string, at: string): void {
  try {
    localStorage.setItem(CHAT_OUTBOX_KEY, JSON.stringify({ text, at }));
  } catch {}
}

/** The kept message's words changed to `text`, its moment kept: nothing where none is kept. */
export function editKept(text: string): void {
  const kept = readKept();
  if (kept !== null) keepUnsent(text, kept.at);
}

/** Forgets the kept message: where storage is refused, nothing was kept to forget. */
export function forgetKept(): void {
  try {
    localStorage.removeItem(CHAT_OUTBOX_KEY);
  } catch {}
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
