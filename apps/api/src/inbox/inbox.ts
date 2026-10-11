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
import { Schema } from 'effect';
import { Hono } from 'hono';
import {
  COMMANDS,
  INBOX,
  INBOX_ADD,
  INBOX_KEY_MEANINGS,
  INBOX_KEYS,
  inboxNameRefusal,
  parseInboxCard,
  readInbox,
  runStore,
  type InboxListing,
} from 'agent-orchestrator';
import { readBody, type BodyIssue } from '../body.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from '../guard.ts';
import { type ApiEnv, served } from '../layer.ts';
import { folderOf, type KeyRow } from '../workflows/workflows.ts';
import { runPlaced } from '../store.ts';

/**
 * A card as the board lists it: the package's listing (`InboxListing`) — its name, first line, workflow and repo as the card writes them,
 * the runs it was `startedAs`, and, for an entry that does not read as a card, why — with two things the listing does not carry.
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

/** What `POST /api/inbox` answers: the card written, as `nemia inbox add` prints it. */
export type InboxFiled = { name: string; file: string; workflow: string | null; repo: string | null; body: string };

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

/** One card read for its page (`inbox card`), an entry of the package's table the api serves alone: on `GET /api/inbox/:name`. */
const CARD = COMMANDS.find((c) => c.name === 'inbox card')!;

const isDirectory = (at: string): boolean => Boolean(fs.statSync(at, { throwIfNoEntry: false })?.isDirectory());

/**
 * The inbox as the package lists it (`cards`, every entry by default), each entry with its body and when its file was written
 * (`InboxEntry`). An entry dropped, or edited into a card that does not read, since the listing read it is listed as the listing has it,
 * with no body or time, and read again next time.
 */
export function listInbox(cards: readonly InboxListing[] = readInbox()): InboxEntry[] {
  return cards.map((entry) => {
    let filedAt: string | null = null;
    let body: string | null = null;
    try {
      filedAt = runStore.inbox.filedAt(entry.file);
      const text = filedAt !== null && entry.error === null ? runStore.inbox.read(entry.file) : null;
      if (text !== null) body = parseInboxCard(entry.file, text, isDirectory).body;
    } catch {}
    return { ...entry, body, filedAt };
  });
}

const FILE_SHAPE =
  '`{ "body": "<the idea>" }`, with `"workflow": "<name>"` for what runs it — `"from": "repo"` or `"yours"` when both have a workflow of that name — and `"repo": "<absolute path>"` for the repository it is about';

/**
 * `POST /api/inbox`'s body, its keys in the order they are refused: a workflow is a folder's name, never a path, and `from` says where it
 * is read from only beside one (`filingOf`).
 */
const FILE_BODY = Schema.Struct({
  body: Schema.String,
  workflow: Schema.optionalKey(Schema.String.check(Schema.makeFilter((name: string) => name !== '' && !/[\\/]/.test(name)))),
  from: Schema.optionalKey(Schema.Literals(['repo', 'yours'])),
  repo: Schema.optionalKey(Schema.String),
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
 */
function filingOf(body: typeof FILE_BODY.Type, repo: string, home: string): { text: string; workflow?: string; repo?: string } | Refusal {
  const { body: text, workflow, from, repo: about } = body;
  if (from !== undefined && workflow === undefined) {
    return {
      status: 400,
      error: "`from` says where the card's workflow is read from, and this request names no `workflow`. Name one, or leave both out.",
    };
  }
  const filing: { text: string; workflow?: string; repo?: string } = {
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
 *   (`inbox card`). 404 for a card not there, or dropped since the listing read it, the package's `Missing` naming the cards that are.
 *   Its keys are as the listing reads them: `queued` is when it was queued (the listing carries its place too), null when unset.
 * - `POST /api/inbox` — `nemia inbox add "<idea>" --workflow <name> --repo <path>`, through its entry's handler: a card filed, under the
 *   slug of its first line (201, `InboxFiled`). The body and its workflow are refused as `filingOf` says; the package's refusal, word for
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
    served(c, async ({ e, placeService }) => {
      const { cards } = await runPlaced(placeService, e, INBOX.handler({}));
      return c.json(listInbox(cards));
    }),
  )
  .get('/api/inbox/:name', (c) => {
    const name = c.req.param('name');
    const wrong = inboxNameRefusal(name);
    if (wrong) return c.json({ error: wrong }, 400);
    return served(c, async ({ e, placeService }) => {
      const { card, source } = (await runPlaced(placeService, e, CARD.handler({ name }))) as { card: InboxListing; source: string };
      const [entry] = listInbox([card]);
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
        INBOX_ADD.handler({ idea: asked.text, workflow: asked.workflow, repo: asked.repo }),
      );
      return c.json(
        { name: card.name, file, workflow: card.workflow ?? null, repo: card.repo ?? null, body: card.body } satisfies InboxFiled,
        201,
      );
    }),
  );
