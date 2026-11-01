/**
 * The inbox, for the board: cards parked before they are started — listed, filed and dropped.
 *
 * The package's inbox, through the entries of its command table (`INBOX`, `INBOX_ADD`, and the routes it generates), `nemia inbox`'s own:
 * `$WF_ROOT/inbox/`, a card per `<name>.md`, read from disk on each request, as the workflows are, so a card a person has just filed or
 * dropped at the command line lists as it is now. Starting a card is a start, so it is `POST /api/runs` with `card` (workflows.ts),
 * through `startFromInbox`.
 *
 * A card's page reads one card: as the inbox lists it, as its file is written, and its keys (`GET /api/inbox/:name`).
 *
 * A card is queued to start on its own, and taken off the queue, as `nemia inbox queue <name>` and `nemia inbox queue <name> --off` do
 * (`POST` and `DELETE /api/inbox/:name/queue`, generated from `nemia inbox queue`'s entry): the tick starts the next card in the queue's
 * order when a run slot is free. The listing already says where each queued card stands — `queued`, its time and place, and `tried`, the
 * tick's last start of it that did not happen — since each entry is the package's.
 *
 * Every refusal is the package's sentence with the api's status, but for the body's shape, which is the api's own (400). Filing and
 * dropping are writes a page on another site must not make, so each passes the guard (guard.ts) before its body is read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Schema } from 'effect';
import { Hono } from 'hono';
import {
  DEFAULT_FACTORY,
  INBOX,
  INBOX_ADD,
  INBOX_KEY_MEANINGS,
  INBOX_KEYS,
  inboxNameRefusal,
  Invalid,
  parseInboxCard,
  readFactory,
  inboxEntries,
  StoreRoot,
  type Factory,
  type InboxListing,
} from 'agent-orchestrator';
import { readBody, type BodyIssue } from '../body.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from '../guard.ts';
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

/** What `POST /api/inbox` answers: the card written, as `nemia inbox add` prints it, `factory` null for a card that names none. */
export type InboxFiled = {
  name: string;
  file: string;
  workflow: string | null;
  repo: string | null;
  factory: string | null;
  body: string;
};

/**
 * What `POST` and `DELETE /api/inbox/:name/queue` answer: what `nemia inbox queue` did (the package's `InboxQueued`) — `queued`, `taken
 * back`, or `not queued` for a card taken off a queue it was not in, which writes nothing — the card's `queued:` as it now reads, and, once
 * queued, its place in the queue's order and how many are in it.
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

const isDirectory = (at: string): boolean => Boolean(fs.statSync(at, { throwIfNoEntry: false })?.isDirectory());

/**
 * The inbox as the package lists it (`cards`, every entry by default), each entry with its body and when its file was written
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

const FILE_SHAPE =
  '`{ "body": "<the idea>" }`, with `"workflow": "<name>"` for what runs it — `"from": "repo"` or `"yours"` when both have a workflow of that name — `"repo": "<absolute path>"` for the repository it is about, and `"factory": "<name>"` for the factory it is filed in';

/**
 * `POST /api/inbox`'s body, its keys in the order they are refused: a workflow is a folder's name, never a path, `from` says where it
 * is read from only beside one (`filingOf`), and a factory is a named one, never the default, which is left out.
 */
const FILE_BODY = Schema.Struct({
  body: Schema.String,
  workflow: Schema.optionalKey(Schema.String.check(Schema.makeFilter((name: string) => name !== '' && !/[\\/]/.test(name)))),
  from: Schema.optionalKey(Schema.Literals(['repo', 'yours'])),
  repo: Schema.optionalKey(Schema.String),
  factory: Schema.optionalKey(Schema.String.check(Schema.makeFilter((name: string) => name !== DEFAULT_FACTORY))),
});

/** Why `POST /api/inbox`'s body is not a filing (400), by the first key its schema refused. */
function fileWords({ path: [key], input }: BodyIssue): string {
  if (key === 'body')
    return `\`body\` is the idea, as \`nemia inbox add "<idea>"\` takes it: text. This request's was ${JSON.stringify(input) ?? 'left out'}: ${FILE_SHAPE}.`;
  if (key === 'workflow')
    return `\`workflow\` names what runs the card, as GET /api/workflows lists a workflow: a folder's name, or left out for a card that says nothing of it. This request's was ${JSON.stringify(input)}.`;
  if (key === 'from')
    return `\`from\` is where the card's workflow is read from: "repo" or "yours", or left out when only one has a workflow of that name.`;
  if (key === 'repo')
    return `\`repo\` is the repository the idea is about, as \`nemia inbox add --repo <path>\` takes it: an absolute path, or left out. This request's was ${JSON.stringify(input)}.`;
  if (key === 'factory' && input === DEFAULT_FACTORY)
    return `\`factory\` names the factory the card is filed in, and \`${DEFAULT_FACTORY}\` is none to file into: it holds what names no factory. Leave \`factory\` out for a card that gets its factory when it is started.`;
  if (key === 'factory')
    return `\`factory\` names the factory the card is filed in, as \`nemia inbox add --factory <name>\` takes it: a factory's name, as GET /api/factories lists them, or left out for a card that gets its factory when it is started. This request's was ${JSON.stringify(input)}.`;
  return `POST /api/inbox takes a JSON object: ${FILE_SHAPE}.`;
}

/** A filing, as the guard's refusals word it. */
const FILE: Guarded = {
  route: 'POST /api/inbox',
  does: 'files a card',
  forAnother: 'file one',
  why: "a card's body is what a run started from it is asked to do, in the repository it names",
  reach: 'file the card from the board',
  instead: "File it from the board's Inbox page, or with `nemia inbox add`",
  shape: FILE_SHAPE,
};

/** What `POST /api/inbox` hands the package: the idea, and the keys the card writes. */
type Filing = { text: string; workflow?: string; repo?: string; factory?: string };

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
function filingIn(factory: Factory, body: typeof FILE_BODY.Type, home: string): Filing | Refusal {
  const repos = factory.repos.map((r) => path.resolve(r));
  const sent = body.repo === undefined ? undefined : path.resolve(body.repo);
  if (body.repo !== undefined && sent !== undefined && !repos.includes(sent)) throw outsideFactory(factory, body.repo);
  const filing: Filing = { text: body.body, factory: factory.name, ...(sent !== undefined ? { repo: sent } : {}) };
  if (body.workflow === undefined) return filing;
  const about = sent ?? (repos.length === 1 ? repos[0] : undefined);
  const folder = folderAmong(body.workflow, body.from, about === undefined ? repos : [about], home, factory);
  if ('status' in folder) return folder;
  const byName = [factory.tree, about].some((at) => at !== undefined && path.dirname(folder.dir) === path.join(at, 'workflows'));
  return { ...filing, workflow: byName ? body.workflow : folder.dir };
}

/**
 * What `POST /api/inbox` files, or why not, before the package is asked: the body's shape (400), and the workflow, found among the folders
 * a start finds one in (`folderOf`: 404, 409) — so a card names a workflow a start from the board can run, never a path that was sent.
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
function filingOf(body: typeof FILE_BODY.Type, repo: string, home: string): Filing | Refusal {
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
    ...(about !== undefined ? { repo: path.isAbsolute(about) ? path.resolve(about) : about } : {}),
  };
  if (workflow === undefined) return filing;
  const folder = folderOf(workflow, from, repo, home);
  if ('status' in folder) return folder;
  const byName = path.dirname(folder.dir) === path.join(repo, 'workflows') && (filing.repo === undefined || filing.repo === repo);
  return { ...filing, workflow: byName ? workflow : folder.dir };
}

/**
 * The inbox's routes. Each write passes the guard (guard.ts) before its body is read.
 *
 * - `GET /api/inbox` — `nemia inbox`'s cards, through its entry's handler, and every entry of the folder that does not read as one, with
 *   why: never hidden, as a workflow that does not load is not. 500 for a run's record that does not parse: the listing reads them all,
 *   for the runs a card was started as.
 * - `GET /api/inbox/:name` — one card, for its page (`InboxCardPage`). A name that would leave the inbox, or a hidden one, is refused in
 *   the package's words (400) before anything is read; a card is found among the entries the inbox lists, never by a path joined from what
 *   was sent, and a card before a stray file of the same name (`notes.md` and `notes` both list as `notes`), through the package's entry
 *   (`inbox show`). 404 for a card not there, or dropped since the listing read it, the package's `Missing` naming the cards that are.
 *   Its keys are as the listing reads them: `queued` is when it was queued (the listing carries its place too), null when unset.
 * - `POST /api/inbox` — `nemia inbox add "<idea>" --workflow <name> --repo <path>`, through its entry's handler: a card filed, under the
 *   slug of its first line (201, `InboxFiled`). The body and its workflow are refused as `filingOf` says. With `factory`, the card is
 *   filed in that factory, as `--factory <name>` files it: `default` is refused as the body's shape is (400); a name the store has no
 *   factory of is the package's `Missing` (404), and one that is no slug or whose file does not read its `Invalid` (422), each from
 *   `readFactory`; a `repo` that is none of the factory's is a 422 naming them, and a workflow two of its repositories have, with no
 *   `repo`, a 409 (`filingIn`). No `repo:` is written that the request did not send. The package's refusal, word for
 *   word, is an `Invalid`, which `app.onError` answers 422: an idea with nothing in it, a key it would write on two lines, a repo that is
 *   not an absolute path to a directory, an `after:` in the idea's own frontmatter. Anything else is the store's, 500: the inbox could not
 *   be written.
 *
 * A card dropped (`DELETE /api/inbox/:name`), queued or taken off the queue (`POST` and `DELETE /api/inbox/:name/queue`), and its `from:`
 * set or taken off (`PUT` and `DELETE /api/inbox/:name/from`) are routes the package's command table generates (commands/routes.ts), each
 * from its entry, `nemia inbox rm`'s, `nemia inbox queue`'s and `nemia inbox from`'s.
 */
export const inbox = new Hono<ApiEnv>()
  .get('/api/inbox', (c) =>
    served(c, async ({ e, placeService, memo, home }) => {
      const { cards } = await runPlaced(placeService, e, INBOX.handler({}, undefined, home, { records: { inbox: memo.records.inbox } }));
      return c.json(await runPlaced(placeService, e, listInbox(cards, home)));
    }),
  )
  .get('/api/inbox/:name', (c) => {
    const name = c.req.param('name');
    const wrong = inboxNameRefusal(name);
    if (wrong) return c.json({ error: wrong }, 400);
    return served(c, async ({ e, placeService, home }) => {
      const { card, source } = (await runPlaced(placeService, e, CARD.handler({ name }, undefined, home))) as {
        card: InboxListing;
        source: string;
      };
      const [entry = inboxEntry(card, { filedAt: null, text: null })] = await runPlaced(placeService, e, listInbox([card], home));
      const keys =
        entry.error === null
          ? INBOX_KEYS.map((key) => ({
              key,
              value: key === 'queued' ? (entry.queued?.at ?? null) : key === 'from' ? entry.from.join(', ') || null : (entry[key] ?? null),
              meaning: INBOX_KEY_MEANINGS[key],
            }))
          : null;
      return c.json({ ...entry, source, keys } satisfies InboxCardPage);
    });
  })
  .post('/api/inbox', (c) =>
    served(c, async ({ e, placeService, repo, home }) => {
      const refused = refusedBeforeReading(FILE, c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
      if (refused) return c.json({ error: refused.error }, refused.status);
      const read = await readBody(c.req, FILE_BODY, `POST /api/inbox takes a JSON body: ${FILE_SHAPE}.`, fileWords);
      if ('status' in read) return c.json({ error: read.error }, read.status);
      const asked = filingOf(read.body, repo, home);
      if ('status' in asked) return c.json({ error: asked.error }, asked.status);
      const { card, file } = await runPlaced(
        placeService,
        e,
        INBOX_ADD.handler({ idea: asked.text, workflow: asked.workflow, repo: asked.repo, factory: asked.factory }, undefined, home),
      );
      const filed: InboxFiled = {
        name: card.name,
        file,
        workflow: card.workflow ?? null,
        repo: card.repo ?? null,
        factory: card.factory ?? null,
        body: card.body,
      };
      return c.json(filed, 201);
    }),
  );
