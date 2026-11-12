/**
 * A first-visit link, claimed as the board loads (`<base>/?link=<secret>`, printed at the server's shell): its secret is taken off the
 * address at once, whether the claim then succeeds or not, so the address bar, its history and a copy of it never carry it; then it is
 * claimed (`POST /api/pair/link`), which sets this browser's cookie, before the board makes its first read. A link refused — used,
 * lapsed, or no link of this Nemia's — is kept for the visit, and the sign-in says it (`useLinkRefused`).
 */
import { useSyncExternalStore } from 'react';
import { claimLink } from './api/pairing.ts';
import { linkSecretOf, withoutLink } from './setup.ts';

/** Why a first-visit link was refused: its status, and the api's words. */
type LinkRefused = { status: number; message: string };

/** The link this visit was refused, none while it was refused none. */
let refused: LinkRefused | null = null;

/** Who is told when a link is refused. */
const listeners = new Set<() => void>();

/** The status a refusal carries, where it carries one. */
const statusOf = (error: unknown): number =>
  typeof error === 'object' && error !== null && typeof Reflect.get(error, 'status') === 'number' ? Reflect.get(error, 'status') : 0;

/**
 * Claims the first-visit link the page's address carries, if it carries one: the address loses it first (`history.replaceState`), then
 * the api sets the cookie; a refusal is kept for the sign-in to say. Resolves once the claim is answered, never rejects.
 */
export async function claimLinkOnLoad(): Promise<void> {
  const secret = linkSecretOf(window.location.href);
  if (secret === undefined) return;
  window.history.replaceState(window.history.state, '', withoutLink(window.location.href));
  await claimLink(secret).then(
    () => undefined,
    (error: unknown) => {
      refused = { status: statusOf(error), message: error instanceof Error ? error.message : String(error) };
      for (const listener of listeners) listener();
    },
  );
}

/** `listener` told when a link is refused; the answer stops telling it. */
const onRefused = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The link this visit was refused, as a component reads it, or null. */
export const useLinkRefused = (): LinkRefused | null => useSyncExternalStore(onRefused, () => refused);
