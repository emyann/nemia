/** The inbox: its cards, and a card filed, dropped and queued (apps/api/src/inbox/inbox.ts). */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { get, send } from './read.ts';
import { KeyRowSchema, type KeyRow } from './library.ts';
import type { WorkflowListing } from './workflows.ts';

/**
 * A card's life, as the orchestrator computes it once (`CardState` in its inbox) and the api sends it: `started` once a run's record names
 * it, whatever else it carries; `refused` queued and refused as it stands; `queued` queued otherwise; `filed` every other, an entry that
 * does not read as a card among them. The board reads it and never rebuilds it from `queued`, `tried` or `startedAs`.
 */
export type CardState = 'filed' | 'queued' | 'refused' | 'started';

/**
 * Mirrors `InboxEntry` in apps/api/src/inbox/inbox.ts: a card as the CLI's `inbox` lists it — or an entry of the inbox that does not read
 * as one, `error` saying why — with its body, the brief a start is prefilled with, and when its file was written, which the page orders the
 * cards by.
 */
export type InboxEntry = {
  name: string;
  file: string;
  /** The first line of its body; null for an entry that does not read. */
  title: string | null;
  /** As the card writes it: a workflow's name, or the absolute folder of one. */
  workflow: string | null;
  repo: string | null;
  /** The factory the card names (`factory:`); null for a card that names none, and for an entry that does not read as a card. */
  factory: string | null;
  /** The runs its run is handed as context (`from:`), read and never waited on: none for a card without the line. */
  from: string[];
  /** The step its run is gated at, as written; absent on a card with no gate. */
  gate?: string;
  /** The runs a record says it was started as, each linked from the card: a started card keeps its file, and stays in the inbox. */
  startedAs: string[];
  /** Its life, closed (`CardState`): what the page offers on it and how it draws it. */
  state: CardState;
  error: string | null;
  body: string | null;
  filedAt: string | null;
  /**
   * On a queued card only (the CLI's `inbox queue`): when it was queued, and its place in the order the tick starts cards in, from 1 — null
   * for a card a record says was started, which the tick never starts again.
   */
  queued?: { at: string; place: number | null };
  /**
   * On a queued card only, whose start the tick tried and did not make, as the card stands: when, on which repository, why, and whether the
   * package refused it — which lasts until the card is edited or queued again — or something else failed, which the tick tries again.
   */
  tried?: { at: string; repo: string; why: string; refused: boolean };
  /**
   * The repository the card's factory picks for it: its factory's one repository, for a card that names none — null for a card that names
   * its own, one whose factory has several or does not read, and an entry that does not read as a card.
   */
  factoryRepo: string | null;
};

/** The keys of an `InboxEntry`, each decoded: a `gate`, a `queued` or a `tried` the api leaves out stays out. */
const inboxEntryFields = {
  name: Schema.String,
  file: Schema.String,
  title: Schema.NullOr(Schema.String),
  workflow: Schema.NullOr(Schema.String),
  repo: Schema.NullOr(Schema.String),
  factory: Schema.NullOr(Schema.String),
  from: Schema.mutable(Schema.Array(Schema.String)),
  gate: Schema.optionalKey(Schema.String),
  startedAs: Schema.mutable(Schema.Array(Schema.String)),
  state: Schema.Literals(['filed', 'queued', 'refused', 'started']),
  error: Schema.NullOr(Schema.String),
  body: Schema.NullOr(Schema.String),
  filedAt: Schema.NullOr(Schema.String),
  queued: Schema.optionalKey(Schema.Struct({ at: Schema.String, place: Schema.NullOr(Schema.Number) })),
  tried: Schema.optionalKey(Schema.Struct({ at: Schema.String, repo: Schema.String, why: Schema.String, refused: Schema.Boolean })),
  factoryRepo: Schema.NullOr(Schema.String),
};

/** Decodes an `InboxEntry`. */
const InboxEntrySchema = decodes<InboxEntry>()(Schema.Struct(inboxEntryFields));

/**
 * The inbox. Not polled: it changes when a person files, drops or starts a card, here or at the command line. Read again on each visit, and
 * on a run's event on the workflow feed, which a queued card started is; the feed says nothing of cards.
 */
export const inboxQuery = queryOptions({
  queryKey: ['inbox'],
  queryFn: () => get('/api/inbox', Schema.mutable(Schema.Array(InboxEntrySchema))),
});

/**
 * Mirrors `InboxCardPage` in apps/api/src/inbox/inbox.ts: a card as the inbox lists it, its file as written, frontmatter included, and each
 * key a card may set, a row each — none for an entry that does not read as a card.
 */
export type InboxCardPage = InboxEntry & { source: string; keys: KeyRow[] | null };

/** Decodes an `InboxCardPage`. */
const InboxCardPageSchema = decodes<InboxCardPage>()(
  Schema.Struct({
    ...inboxEntryFields,
    source: Schema.String,
    keys: Schema.NullOr(Schema.mutable(Schema.Array(KeyRowSchema))),
  }),
);

/** A card, for its page. Read again on each visit, as the inbox is. */
export const cardQuery = (name: string) =>
  queryOptions({
    queryKey: ['inbox', name],
    queryFn: () => get(`/api/inbox/${encodeURIComponent(name)}`, InboxCardPageSchema),
  });

/**
 * File an idea as a card, as the CLI's `inbox add "<idea>" --workflow <name> --repo <path> --factory <name>` does: in `factory` when it
 * names one, in none when it is left out. Resolves with the card's name; rejects with the api's refusal in full — the package's words for
 * an idea with nothing in it, a repository that is not an absolute path to a directory or a factory the store does not have, or the api's
 * own about the request or a workflow it has none of.
 *
 * Sent as `application/json`, which the api requires of it, as of a start.
 */
export const fileCard = (card: {
  body: string;
  workflow?: string;
  from?: WorkflowListing['from'];
  repo?: string;
  factory?: string;
}): Promise<{ name: string }> =>
  send('POST', '/api/inbox', Schema.Struct({ name: Schema.String }), {
    body: card,
    may: 'The card may be filed: look in the inbox before filing it again.',
  });

/**
 * Drop a card without starting it, as the CLI's `inbox rm <name>` does. Rejects with the api's refusal in full: the package's words for a
 * card that is not there, naming the cards that are, or for a name that is not a card's.
 *
 * Sent as `application/json`, with no body, which the api requires of it, as of every write: a request another site's page cannot make
 * unasked.
 */
export async function dropCard(name: string): Promise<void> {
  await send('DELETE', `/api/inbox/${encodeURIComponent(name)}`, Schema.Struct({ removed: Schema.Literal(true) }), {
    may: 'The card may be dropped: look in the inbox before dropping it again.',
  });
}

/**
 * Mirrors `InboxQueueAnswer` in apps/api/src/inbox/inbox.ts: what the CLI's `inbox queue` did, the card's `queued:` as it now reads, and
 * its place once queued.
 */
export type Queued = {
  name: string;
  file: string;
  was: 'queued' | 'taken back' | 'not queued';
  queued: string | null;
  place: number | null;
  of: number | null;
};

/** Decodes a `Queued`. */
const QueuedSchema = decodes<Queued>()(
  Schema.Struct({
    name: Schema.String,
    file: Schema.String,
    was: Schema.Literals(['queued', 'taken back', 'not queued']),
    queued: Schema.NullOr(Schema.String),
    place: Schema.NullOr(Schema.Number),
    of: Schema.NullOr(Schema.Number),
  }),
);

/**
 * Queue a card to start on its own, as the CLI's `inbox queue <name>` does — or, `off`, take it off the queue, as `--off` does. The tick
 * starts the next card in the queue when a run slot frees, on the workflow the card names. Resolves with what was done; rejects with the
 * api's refusal in full — the package's words for a card that is not there, names no workflow, is queued already or was started — or the
 * api's own about the request.
 *
 * Sent as `application/json`, with no body, which the api requires of it, as of every write.
 */
export const queueCard = (name: string, { off = false }: { off?: boolean } = {}): Promise<Queued> =>
  send(off ? 'DELETE' : 'POST', `/api/inbox/${encodeURIComponent(name)}/queue`, QueuedSchema, {
    may: 'The card may be queued, or not: look in the inbox before asking again.',
  });

/**
 * Mirrors `InboxFromAnswer` in apps/api/src/inbox/inbox.ts: what the CLI's `inbox from` did — the card's `from:` as it now reads, and the
 * runs it named before.
 */
export type FromSet = { name: string; file: string; from: string[]; was: string[] };

/** Decodes a `FromSet`. */
const FromSetSchema = decodes<FromSet>()(
  Schema.Struct({
    name: Schema.String,
    file: Schema.String,
    from: Schema.mutable(Schema.Array(Schema.String)),
    was: Schema.mutable(Schema.Array(Schema.String)),
  }),
);

/**
 * Set the runs a card's run is handed as context, as the CLI's `inbox from <name> <run>...` does — or, with none, take its `from:` off, as
 * `--off` does. Rejects with the api's refusal in full: the package's words for a card that is not there or was started, a run the store
 * does not have or named twice — or the api's own about the request.
 */
export const setCardFrom = (name: string, runs: readonly string[]): Promise<FromSet> =>
  send(runs.length ? 'PUT' : 'DELETE', `/api/inbox/${encodeURIComponent(name)}/from`, FromSetSchema, {
    body: runs.length ? { runs } : {},
    may: "The card's from: may be set, or not: look at the card before asking again.",
  });
