/**
 * The inbox's card page, for the board: one card read as the inbox lists it, its file as written, and its keys (`GET /api/inbox/:name`);
 * and what a card filed through the Card's verb files (`filingOf`, objects/cards.ts).
 *
 * The package's inbox, through the entries of its command table, `nemia inbox`'s own: `$WF_ROOT/inbox/`, a card per `<name>.md`, read
 * from disk on each request, as the workflows are, so a card a person has just filed or dropped at the command line reads as it is now.
 * The cards listed, filed, dropped, started, queued and taken off the queue, and their labels edited, are the Card's verbs, served from
 * `objects`' `Api` (src/objects/cards.ts); a card's `from:` set or taken off is the route the package's command table generates from
 * `nemia inbox from`'s entry (commands/routes.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { Hono } from 'hono';
import {
  INBOX_KEY_MEANINGS,
  INBOX_KEYS,
  inboxNameRefusal,
  Invalid,
  labelsText,
  parseInboxCard,
  readFactory,
  inboxEntries,
  StoreRoot,
  type Factory,
  type InboxListing,
  type InformerMemo,
} from 'agent-orchestrator';
import type { CardFile } from 'objects';
import type { Refusal } from '../guard.ts';
import { type ApiEnv, served } from '../layer.ts';
import { folderOf, type KeyRow } from '../workflows/workflows.ts';
import { commandNamed, runPlaced } from '../store.ts';

/**
 * A card as the board lists it: the package's listing (`InboxListing`) — its name, first line, workflow and repo as the card writes them,
 * the runs it was `startedAs`, its `state` (`CardState`), computed once by the package and passed through as is, the repository its
 * factory picks for it (`factoryRepo`), and, for an entry that does not read as a card, why — with two things the listing does not carry.
 *
 * `body` is the card's text below its frontmatter, the brief a start is prefilled with: null for an entry that does not read. `filedAt` is
 * when its file was last written — when it was filed, unless a person has edited it since — which is what the board orders the cards by,
 * newest first: a card carries no time of its own. Null for an entry gone between the listing and the read.
 */
export type InboxEntry = InboxListing & { body: string | null; filedAt: string | null };

/**
 * What a card's page shows: the card as the inbox lists it (`InboxEntry`), its file as written — frontmatter and all — and each key an
 * inbox card may set, a row each, with its value and what it means. No keys for an entry that does not read as a card: its `error` says
 * why.
 */
export type InboxCardPage = InboxEntry & { source: string; keys: KeyRow[] | null };

/**
 * What `nemia inbox queue`'s entry answers (the package's `InboxQueued`) — `queued`, `taken back`, or `not queued` for a card taken off a
 * queue it was not in — the card's `queued:` as it now reads, and, once queued, its place in the queue's order and how many are in it. No
 * route answers it since the Card's `queue` and `unqueue` answer the Card; the board's mirror reads it until it moves onto the Card.
 */
export type InboxQueueAnswer = {
  name: string;
  file: string;
  was: 'queued' | 'taken back' | 'not queued';
  queued: string | null;
  place: number | null;
  of: number | null;
};

/**
 * What `PUT` and `DELETE /api/inbox/:name/from` answer: what `nemia inbox from` did — the card, its file, the runs its `from:` names now
 * (none once taken off) and those it named before.
 */
export type InboxFromAnswer = { name: string; file: string; from: string[]; was: string[] };

/** One card read for its page (`inbox show`), an entry of the package's table the api serves alone: on `GET /api/inbox/:name`. */
const CARD = commandNamed('inbox show');

/** What the inbox's reads keep between requests: the app's informer, which judges each started card's run, as the runs' lists keep it. */
const keptOf = (informer: InformerMemo | undefined) => (informer ? { runs: informer } : {});

const isDirectory = (at: string): boolean => Boolean(fs.statSync(at, { throwIfNoEntry: false })?.isDirectory());

/**
 * The inbox as the package lists it (`cards`, the cards in play by default), each entry with its body and when its file was written
 * (`InboxEntry`). An entry dropped, or edited into a card that does not read, since the listing read it is listed as the listing has it,
 * with no body or time, and read again next time.
 */
export const listInbox = (cards: readonly InboxListing[], home: string): Effect.Effect<InboxEntry[]> =>
  Effect.map(Effect.provideService(inboxEntries(cards), StoreRoot, home), (read) =>
    cards.map((entry, at) => inboxEntry(entry, read[at] ?? { filedAt: null, text: null })),
  );

/** One card of the inbox as `listInbox` lists it: with its body and when its file was written, or neither where it no longer reads. */
function inboxEntry(entry: InboxListing, read: { filedAt: string | null; text: string | null }): InboxEntry {
  let body: string | null = null;
  try {
    if (read.filedAt !== null && read.text !== null) body = parseInboxCard(entry.file, read.text, isDirectory).body;
  } catch {}
  return { ...entry, body, filedAt: read.filedAt };
}

/**
 * The value a card's page shows for `key` of the entry: when it was queued, the runs its `from:` names, its labels as `a=b,c=d`
 * (`labelsText`), or what the card writes; null for a key it does not set.
 */
const keyValue = (entry: InboxEntry, key: (typeof INBOX_KEYS)[number]): string | null => {
  if (key === 'queued') return entry.queued?.at ?? null;
  if (key === 'from') return entry.from.join(', ') || null;
  if (key === 'labels') return Object.keys(entry.labels).length ? labelsText(entry.labels) : null;
  return entry[key] ?? null;
};

/** What a card filed hands the package: the idea, and the keys the card writes. */
export type Filing = { text: string; workflow?: string; repo?: string; factory?: string; label?: string[] };

/** Why `factory` does not take a card about `repo`, not one of its repositories: an `Invalid`, naming them. */
const outsideFactory = (factory: Factory, repo: string): Invalid =>
  new Invalid({
    message: `${repo}: the factory ${factory.name} works on ${factory.repos.map((r) => path.resolve(r)).join(', ')}, and this repository is not one of them. Send one of them as \`repo\`, or leave it out. Nothing was filed.`,
  });

/**
 * The folder of the workflow `name` in `factory`, looked for on each of `repos` in turn as a start there would (`folderOf`, the factory's
 * tree first): the one folder found, whichever of them has it; else what the first refused it with (404, 409); and for two folders on two
 * repositories a 409 that asks for `repo`.
 */
function folderAmong(
  name: string,
  from: 'repo' | 'yours' | undefined,
  repos: readonly string[],
  home: string,
  factory: Factory,
): { dir: string } | Refusal {
  const looked = repos.map((repo) => folderOf(name, from, repo, home, factory.tree));
  const dirs = [...new Set(looked.flatMap((found) => ('dir' in found ? [found.dir] : [])))];
  const [only] = dirs;
  if (dirs.length === 1 && only !== undefined) return { dir: only };
  if (dirs.length > 1) {
    return {
      status: 409,
      error: `The factory ${factory.name} works on ${repos.join(', ')}, and more than one has a workflow named '${name}' (${dirs.join(' and ')}). Say which with \`"repo": "<one of them>"\`.`,
    };
  }
  return (
    looked.find((found): found is Refusal => 'status' in found) ?? {
      status: 404,
      error: `No workflow '${name}': the factory ${factory.name} names no repository to look for one on. Leave \`workflow\` out, or file the card in a factory that works on one.`,
    }
  );
}

/**
 * What a filing in `factory` files, or why not. The repository the card is about is the one sent, which must be one of the factory's
 * (`outsideFactory`, thrown), else the factory's only one, else none; `repo:` is written only when one was sent, never a repository nobody
 * chose. Its workflow is looked for where a start in the factory would look (`folderOf` on that repository, `folderAmong` when it has
 * several and none was sent), and written by name only where a start finds that same folder by its name: under the factory's tree, or
 * under the repository the card is about. Else by its folder, absolute.
 */
function filingIn(factory: Factory, body: CardFile, home: string): Filing | Refusal {
  const repos = factory.repos.map((r) => path.resolve(r));
  const sent = body.repo === undefined ? undefined : path.resolve(body.repo);
  if (body.repo !== undefined && sent !== undefined && !repos.includes(sent)) throw outsideFactory(factory, body.repo);
  const filing: Filing = {
    text: body.body,
    factory: factory.name,
    ...(sent !== undefined ? { repo: sent } : {}),
    ...(body.label !== undefined ? { label: [...body.label] } : {}),
  };
  if (body.workflow === undefined) return filing;
  const about = sent ?? (repos.length === 1 ? repos[0] : undefined);
  const folder = folderAmong(body.workflow, body.from, about === undefined ? repos : [about], home, factory);
  if ('status' in folder) return folder;
  const byName = [factory.tree, about].some((at) => at !== undefined && path.dirname(folder.dir) === path.join(at, 'workflows'));
  return { ...filing, workflow: byName ? body.workflow : folder.dir };
}

/**
 * What a card filed (`POST /api/namespaces/:namespace/cards`) files, or why not, before the package is asked: `from` with no workflow
 * (400), and the workflow, found among the folders a start finds one in (`folderOf`: 404, 409) — so a card names a workflow a start from
 * the board can run, never a path that was sent.
 *
 * A repository's workflow is written by name, as `nemia inbox add --workflow dev` writes it, when the card starts on the api's repository:
 * a name is found under the repository's `workflows/` at start. Yours, or any workflow on a card about another repository, is written as
 * the folder found, absolute, since its name would be looked for where it is not. Whether the idea, the workflow and the repo make a card
 * is the package's to say (`addToInbox`).
 *
 * An absolute `repo` is written as `nemia inbox add --repo` writes it (`path.resolve`): no trailing slash, no `.` or `..`, so the run a
 * start records names the repository as every other run on it does, and the board finds them together. A relative one is sent on as it is,
 * for the package to refuse: the api has no directory it was typed from.
 *
 * A filing that names a `factory` is the factory's to place (`filingIn`), and the api's repository is not looked at.
 */
export function filingOf(body: CardFile, repo: string, home: string): Filing | Refusal {
  const { body: text, workflow, from, repo: about } = body;
  if (from !== undefined && workflow === undefined) {
    return {
      status: 400,
      error: "`from` says where the card's workflow is read from, and this request names no `workflow`. Name one, or leave both out.",
    };
  }
  if (body.factory !== undefined) return filingIn(readFactory(body.factory, 'Nothing was filed.'), body, home);
  const filing: Filing = {
    text,
    ...(body.label !== undefined ? { label: [...body.label] } : {}),
    ...(about !== undefined ? { repo: path.isAbsolute(about) ? path.resolve(about) : about } : {}),
  };
  if (workflow === undefined) return filing;
  const folder = folderOf(workflow, from, repo, home);
  if ('status' in folder) return folder;
  const byName = path.dirname(folder.dir) === path.join(repo, 'workflows') && (filing.repo === undefined || filing.repo === repo);
  return { ...filing, workflow: byName ? workflow : folder.dir };
}

/**
 * The inbox's routes.
 *
 * - `GET /api/inbox/:name` — one card, for its page (`InboxCardPage`). A name that would leave the inbox, or a hidden one, is refused in
 *   the package's words (400) before anything is read; a card is found among the entries the inbox lists, never by a path joined from what
 *   was sent, and a card before a stray file of the same name (`notes.md` and `notes` both list as `notes`), through the package's entry
 *   (`inbox show`). 404 for a card not there, or dropped since the listing read it, the package's `Missing` naming the cards that are.
 *   Its keys are as the listing reads them: `queued` is when it was queued (the listing carries its place too), null when unset.
 *
 * The list, the filing, the drop, the queue and the labels are the Card's (src/objects/cards.ts); `GET /api/inbox`, `POST /api/inbox`,
 * `DELETE /api/inbox/:name`, `POST` and `DELETE /api/inbox/:name/queue` and `POST /api/inbox/:name/labels` are no route of the api's,
 * and answer 404. A card's `from:` set or taken off (`PUT` and `DELETE /api/inbox/:name/from`) is the route the package's command table
 * generates (commands/routes.ts) from `nemia inbox from`'s entry.
 */
export const inbox = new Hono<ApiEnv>().get('/api/inbox/:name', (c) => {
  const name = c.req.param('name');
  const wrong = inboxNameRefusal(name);
  if (wrong) return c.json({ error: wrong }, 400);
  return served(c, async ({ e, placeService, informer, env, home }) => {
    const { card, source } = (await runPlaced({ placeService, home }, e, CARD.handler({ name }, env, home, keptOf(informer)))) as {
      card: InboxListing;
      source: string;
    };
    const [entry = inboxEntry(card, { filedAt: null, text: null })] = await runPlaced({ placeService, home }, e, listInbox([card], home));
    const keys =
      entry.error === null
        ? INBOX_KEYS.map((key) => ({
            key,
            value: keyValue(entry, key),
            meaning: INBOX_KEY_MEANINGS[key],
          }))
        : null;
    return c.json({ ...entry, source, keys } satisfies InboxCardPage);
  });
});
