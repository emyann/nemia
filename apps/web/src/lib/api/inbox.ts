/** The inbox: its cards, and a card filed, dropped and queued (apps/api/src/inbox/inbox.ts). */
import { queryOptions } from '@tanstack/react-query';
import { get } from './read.ts';
import type { KeyRow, WorkflowListing } from './workflows.ts';

/**
 * Mirrors `InboxEntry` in apps/api/src/inbox/inbox.ts: a card as `wf inbox` lists it — or an entry of the inbox that does not read as one,
 * `error` saying why — with its body, the brief a start is prefilled with, and when its file was written, which the page orders the cards
 * by.
 */
export type InboxEntry = {
  name: string;
  file: string;
  /** The first line of its body; null for an entry that does not read. */
  title: string | null;
  /** As the card writes it: a workflow's name, or the absolute folder of one. */
  workflow: string | null;
  repo: string | null;
  /** The runs a record says it was started as: a card still here was started, and its removal failed. */
  startedAs: string[];
  error: string | null;
  body: string | null;
  filedAt: string | null;
  /**
   * On a queued card only (`wf inbox queue`): when it was queued, and its place in the order the tick starts cards in, from 1 — null for a card a
   * record says was started, which the tick never starts again.
   */
  queued?: { at: string; place: number | null };
  /**
   * On a queued card only, whose start the tick tried and did not make, as the card stands: when, on which repository, why, and whether the
   * package refused it — which lasts until the card is edited or queued again — or something else failed, which the tick tries again.
   */
  tried?: { at: string; repo: string; why: string; refused: boolean };
};

/**
 * The inbox. Not polled: it changes when a person files, drops or starts a card, here or at the command line. Read again on each visit, and on
 * a run's event on the workflow feed, which a queued card started is; the feed says nothing of cards yet.
 */
export const inboxQuery = queryOptions({
  queryKey: ['inbox'],
  queryFn: () => get<InboxEntry[]>('/api/inbox'),
});

/**
 * Mirrors `InboxCardPage` in apps/api/src/inbox/inbox.ts: a card as the inbox lists it, its file as written, frontmatter included, and each
 * key a card may set, a row each — none for an entry that does not read as a card.
 */
export type InboxCardPage = InboxEntry & { source: string; keys: KeyRow[] | null };

/** A card, for its page. Read again on each visit, as the inbox is. */
export const cardQuery = (name: string) =>
  queryOptions({
    queryKey: ['inbox', name],
    queryFn: () => get<InboxCardPage>(`/api/inbox/${encodeURIComponent(name)}`),
  });

/**
 * File an idea as a card, as `wf inbox add "<idea>" --workflow <name> --repo <path>` does. Resolves with the card's name; rejects with the api's
 * refusal in full — the package's words for an idea with nothing in it or a repository that is not an absolute path to a directory, or the
 * api's own about the request or a workflow it has none of.
 *
 * Sent as `application/json`, which the api requires of it, as of a start.
 */
export async function fileCard(card: {
  body: string;
  workflow?: string;
  from?: WorkflowListing['from'];
  repo?: string;
}): Promise<{ name: string }> {
  const res = await fetch('/api/inbox', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(card) });
  const body = (await res.json().catch(() => undefined)) as { name?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.name === 'string') return { name: body.name };
  if (res.ok) {
    throw new Error(
      `POST /api/inbox answered ${res.status} ${res.statusText} without the card's name, so the api and this board disagree about what a filing answers. ` +
        'The card may be filed: look in the inbox (`wf inbox`) before filing it again, and restart the api (`npm run dev`).',
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST /api/inbox answered ${res.status} ${res.statusText}`);
}

/**
 * Drop a card without starting it, as `wf inbox rm <name>` does. Rejects with the api's refusal in full: the package's words for a card that is
 * not there, naming the cards that are, or for a name that is not a card's.
 *
 * Sent as `application/json`, with no body, which the api requires of it, as of every write: a request another site's page cannot make unasked.
 */
export async function dropCard(name: string): Promise<void> {
  const route = `/api/inbox/${encodeURIComponent(name)}`;
  const res = await fetch(route, { method: 'DELETE', headers: { 'content-type': 'application/json' } });
  if (res.ok) return;
  const body = (await res.json().catch(() => undefined)) as { error?: unknown } | undefined;
  throw new Error(typeof body?.error === 'string' ? body.error : `DELETE ${route} answered ${res.status} ${res.statusText}`);
}

/**
 * Mirrors `InboxQueueAnswer` in apps/api/src/inbox/inbox.ts: what `wf inbox queue` did, the card's `queued:` as it now reads, and its place
 * once queued.
 */
export type Queued = {
  name: string;
  file: string;
  was: 'queued' | 'taken back' | 'not queued';
  queued: string | null;
  place: number | null;
  of: number | null;
};

/**
 * Queue a card to start on its own, as `wf inbox queue <name>` does — or, `off`, take it off the queue, as `--off` does. The tick starts the next
 * card in the queue when a run slot frees, on the workflow the card names. Resolves with what was done; rejects with the api's refusal in full —
 * the package's words for a card that is not there, names no workflow, is queued already or was started — or the api's own about the request.
 *
 * Sent as `application/json`, with no body, which the api requires of it, as of every write.
 */
export async function queueCard(name: string, { off = false }: { off?: boolean } = {}): Promise<Queued> {
  const route = `/api/inbox/${encodeURIComponent(name)}/queue`;
  const method = off ? 'DELETE' : 'POST';
  const res = await fetch(route, { method, headers: { 'content-type': 'application/json' } });
  const body = (await res.json().catch(() => undefined)) as (Partial<Queued> & { error?: unknown }) | undefined;
  if (res.ok && typeof body?.was === 'string') return body as Queued;
  if (res.ok) {
    throw new Error(
      `${method} ${route} answered ${res.status} ${res.statusText} without what it did, so the api and this board disagree about what a queue answers. ` +
        'The card may be queued, or not: look in the inbox (`wf inbox`) before asking again, and restart the api (`npm run dev`).',
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `${method} ${route} answered ${res.status} ${res.statusText}`);
}
