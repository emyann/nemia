/**
 * The inbox, for the board: cards parked before they are started — listed, filed and dropped.
 *
 * The package's inbox (agent-workflows' `readInbox`, `addToInbox`, `dropFromInbox`), `wf inbox`'s own: `$WF_ROOT/inbox/`, a card per
 * `<name>.md`, read from disk on each request, as the workflows are, so a card a person has just filed or dropped at the command line lists
 * as it is now. Starting a card is a start, so it is `POST /api/runs` with `card` (workflows.ts), through `startFromInbox`.
 *
 * A card's page reads one card: as the inbox lists it, as its file is written, and its keys (`GET /api/inbox/:name`).
 *
 * A card is queued to start on its own, and taken off the queue, as `wf inbox queue <name>` and `wf inbox queue <name> --off` do (`POST` and
 * `DELETE /api/inbox/:name/queue`, through `queueInInbox`): the tick starts the next card in the queue's order when a run slot is free. The
 * listing already says where each queued card stands — `queued`, its time and place, and `tried`, the tick's last start of it that did not
 * happen — since each entry is the package's.
 *
 * Every refusal is the package's sentence with the api's status, but for the body's shape, which is the api's own (400). Filing and dropping
 * are writes a page on another site must not make, so each passes the guard (guard.ts) before its body is read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import { addToInbox, dropFromInbox, HOME, INBOX_KEY_MEANINGS, INBOX_KEYS, inboxDir, inboxNameRefusal, noCardLine, parseInboxCard, queueInInbox, readInbox, type InboxListing } from 'agent-workflows';
import { repoOf } from './capabilities.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from './guard.ts';
import { folderOf, type KeyRow, type WorkflowSource } from './workflows.ts';

/**
 * A card as the board lists it: the package's listing (`InboxListing`) — its name, first line, workflow and repo as the card writes them,
 * the runs it was `startedAs`, and, for an entry that does not read as a card, why — with two things the listing does not carry.
 *
 * `body` is the card's text below its frontmatter, the brief a start is prefilled with: null for an entry that does not read. `filedAt` is when
 * its file was last written — when it was filed, unless a person has edited it since — which is what the board orders the cards by, newest
 * first: a card carries no time of its own. Null for an entry gone between the listing and the read.
 */
export type InboxEntry = InboxListing & { body: string | null; filedAt: string | null };

/**
 * What a card's page shows: the card as the inbox lists it (`InboxEntry`), its file as written — frontmatter and all — and each key an inbox
 * card may set, a row each, with its value and what it means. No keys for an entry that does not read as a card: its `error` says why.
 */
export type InboxCardPage = InboxEntry & { source: string; keys: KeyRow[] | null };

/** What `POST /api/inbox` answers: the card written, as `wf inbox add` prints it. */
export type InboxFiled = { name: string; file: string; workflow: string | null; repo: string | null; body: string };

/**
 * What `POST` and `DELETE /api/inbox/:name/queue` answer: what `wf inbox queue` did (the package's `InboxQueued`) — `queued`, `taken back`, or
 * `not queued` for a card taken off a queue it was not in, which writes nothing — the card's `queued:` as it now reads, and, once queued, its
 * place in the queue's order and how many are in it.
 */
export type InboxQueueAnswer = { name: string; file: string; was: 'queued' | 'taken back' | 'not queued'; queued: string | null; place: number | null; of: number | null };

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const isDirectory = (at: string): boolean => Boolean(fs.statSync(at, { throwIfNoEntry: false })?.isDirectory());

/** The inbox as the package lists it, each entry with its body and when its file was written (`InboxEntry`). */
export function listInbox(): InboxEntry[] {
  return readInbox().map((entry) => {
    const file = path.join(inboxDir(), entry.file);
    let filedAt: string | null = null;
    let body: string | null = null;
    try {
      filedAt = fs.statSync(file).mtime.toISOString();
      if (entry.error === null) body = parseInboxCard(entry.file, fs.readFileSync(file, 'utf8'), isDirectory).body;
    } catch {
      // Dropped, or edited into a card that does not read, since the listing read it: listed as the listing has it, and read again next time.
    }
    return { ...entry, body, filedAt };
  });
}

const FILE_SHAPE =
  '`{ "body": "<the idea>" }`, with `"workflow": "<name>"` for what runs it — `"from": "repo"` or `"yours"` when both have a workflow of that name — and `"repo": "<absolute path>"` for the repository it is about';

/** A filing, as the guard's refusals word it. */
const FILE: Guarded = {
  route: 'POST /api/inbox',
  does: 'files a card',
  forAnother: 'file one',
  why: "a card's body is what a run started from it is asked to do, in the repository it names",
  reach: 'file the card from the board',
  instead: "File it from the board's Inbox page, or with `wf inbox add`",
  shape: FILE_SHAPE,
};

/** A drop of `name`, as the guard's refusals word it. */
const dropGuard = (name: string): Guarded => ({
  route: `DELETE /api/inbox/${name}`,
  does: 'drops a card',
  forAnother: 'drop one',
  why: 'a card dropped is an idea gone, and nothing keeps a copy',
  reach: 'drop the card from the board',
  instead: `Drop it from the board's Inbox page, or with \`wf inbox rm ${name}\``,
  shape: 'no body, or `{}`: the card is named in the path',
});

const QUEUE_SHAPE = 'no body, or `{}`: the card is named in the path, and queued on the workflow it names';

/** A queue of `name`, or its taking back (`off`), as the guard's refusals word it. */
const queueGuard = (name: string, off: boolean): Guarded => (off
  ? {
      route: `DELETE /api/inbox/${name}/queue`,
      does: 'takes a card off the queue',
      forAnother: 'take one off',
      why: 'a card taken off the queue is an idea the tick no longer starts, and its place is lost',
      reach: 'take the card off the queue from the board',
      instead: `Take it off from the board's Inbox page, or with \`wf inbox queue ${name} --off\``,
      shape: QUEUE_SHAPE,
    }
  : {
      route: `POST /api/inbox/${name}/queue`,
      does: 'queues a card',
      forAnother: 'queue one',
      why: "a queued card is started by the tick when a run slot frees, and its body is what the run is asked to do, in the repository it names",
      reach: 'queue the card from the board',
      instead: `Queue it from the board's Inbox page, or with \`wf inbox queue ${name}\``,
      shape: QUEUE_SHAPE,
    });

/**
 * Why a queue's body is refused, or null: it takes none, or `{}`. `wf inbox queue --workflow <w>` writes a workflow with the mark, and the api does
 * not: a card is queued from the board on the workflow it names, and one that names none is the package's to refuse — so a `workflow` sent is
 * refused by name rather than read as nothing.
 */
function queueBodyRefusal(route: string, text: string): Refusal | null {
  if (!text.trim()) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { status: 400, error: `${route} takes ${QUEUE_SHAPE}, and this request's body is not JSON.` };
  }
  if (isObject(body) && Object.keys(body).length === 0) return null;
  const named = isObject(body) && 'workflow' in body
    ? ' A card is queued on the workflow it names: file it with one, or queue it with `wf inbox queue <name> --workflow <w>`, which writes both.'
    : '';
  return { status: 400, error: `${route} takes ${QUEUE_SHAPE}, and this request sent ${JSON.stringify(body)}.${named}` };
}

/**
 * The status of a queue — or its taking back — that `queueInInbox` refused, in its words (`exitCode` 2), by what is on disk once refused: 404
 * for a card not there; 422 for a card that does not read, or a card to queue that names no workflow; 409 for a card to queue that a run's
 * record already names, or that is queued already — a card whose state is not the one the request was made against.
 */
function queueRefusalStatus(name: string): 404 | 409 | 422 {
  if (!fs.existsSync(path.join(inboxDir(), `${name}.md`))) return 404;
  let entry: InboxListing | undefined;
  try {
    entry = readInbox().find((e) => e.file === `${name}.md`);
  } catch {
    return 422;
  }
  if (!entry || entry.error !== null) return 422;
  return entry.startedAs.length || entry.queued ? 409 : 422;
}

/**
 * What `POST /api/inbox` files, or why not, before the package is asked: the body's shape (400), and the workflow, found among the folders a
 * start finds one in (`folderOf`: 404, 409) — so a card names a workflow a start from the board can run, never a path that was sent.
 *
 * A repository's workflow is written by name, as `wf inbox add --workflow dev` writes it, when the card starts on the api's repository: a name
 * is found under the repository's `workflows/` at start. Yours, or any workflow on a card about another repository, is written as the folder
 * found, absolute, since its name would be looked for where it is not. Whether the idea, the workflow and the repo make a card is the package's
 * to say (`addToInbox`).
 */
function filingOf(body: unknown, repo: string, home: string): { text: string; workflow?: string; repo?: string } | Refusal {
  if (!isObject(body)) return { status: 400, error: `POST /api/inbox takes a JSON object: ${FILE_SHAPE}.` };
  const { body: text, workflow, from, repo: about } = body;
  if (typeof text !== 'string') {
    return { status: 400, error: `\`body\` is the idea, as \`wf inbox add "<idea>"\` takes it: text. This request's was ${JSON.stringify(text) ?? 'left out'}: ${FILE_SHAPE}.` };
  }
  if (workflow !== undefined && (typeof workflow !== 'string' || !workflow || /[\\/]/.test(workflow))) {
    return {
      status: 400,
      error: `\`workflow\` names what runs the card, as GET /api/workflows lists a workflow: a folder's name, or left out for a card that says nothing of it. This request's was ${JSON.stringify(workflow)}.`,
    };
  }
  if (from !== undefined && (from !== 'repo' && from !== 'yours')) {
    return { status: 400, error: `\`from\` is where the card's workflow is read from: "repo" or "yours", or left out when only one has a workflow of that name.` };
  }
  if (from !== undefined && workflow === undefined) {
    return { status: 400, error: '`from` says where the card\'s workflow is read from, and this request names no `workflow`. Name one, or leave both out.' };
  }
  if (about !== undefined && typeof about !== 'string') {
    return { status: 400, error: `\`repo\` is the repository the idea is about, as \`wf inbox add --repo <path>\` takes it: an absolute path, or left out. This request's was ${JSON.stringify(about)}.` };
  }
  // An absolute path written as `wf inbox add --repo` writes it (`path.resolve`): no trailing slash, no `.` or `..`, so the run a start records
  // names the repository as every other run on it does, and the board finds them together. A relative one is sent on as it is, for the
  // package to refuse: the api has no directory it was typed from.
  const filing: { text: string; workflow?: string; repo?: string } = { text, ...(about !== undefined ? { repo: path.isAbsolute(about) ? path.resolve(about) : about } : {}) };
  if (workflow === undefined) return filing;
  const folder = folderOf(workflow, from as WorkflowSource | undefined, repo, home);
  if ('status' in folder) return folder;
  const byName = path.dirname(folder.dir) === path.join(repo, 'workflows') && (filing.repo === undefined || filing.repo === repo);
  return { ...filing, workflow: byName ? workflow : folder.dir };
}

/**
 * The cards a sentence about a card not there names, as the package's does (`wf inbox rm`, a start): every `.md` file, read as a card or
 * not — never a stray file or a folder, which no name reaches as a card.
 */
const cardsIn = (entries: readonly InboxEntry[]): string[] => entries.filter((e) => e.file.endsWith('.md')).map((e) => e.name);

export const inbox = new Hono()
  // The cards, and every entry of the folder that does not read as one, with why: never hidden, as a workflow that does not load is not.
  .get('/api/inbox', (c) => {
    try {
      return c.json(listInbox());
    } catch (err) {
      // A run's record that does not parse: the listing reads them all, for the runs a card was started as.
      return c.json({ error: messageOf(err) }, 500);
    }
  })
  // One card, for its page. A name that would leave the inbox, or a hidden one, is refused in the package's words before anything is read; a
  // card is found among the entries the inbox lists, never by a path joined from what was sent.
  .get('/api/inbox/:name', (c) => {
    const name = c.req.param('name');
    const wrong = inboxNameRefusal(name);
    if (wrong) return c.json({ error: wrong }, 400);
    let entries: InboxEntry[];
    try {
      entries = listInbox();
    } catch (err) {
      return c.json({ error: messageOf(err) }, 500);
    }
    // A card before a stray file of the same name: `notes.md` and `notes` both list as `notes`.
    const entry = entries.find((e) => e.name === name && e.file.endsWith('.md')) ?? entries.find((e) => e.name === name);
    if (!entry) return c.json({ error: noCardLine(name, cardsIn(entries)) }, 404);
    let source: string;
    try {
      source = fs.readFileSync(path.join(inboxDir(), entry.file), 'utf8');
    } catch {
      // Dropped since the listing read it: not among the cards the sentence names.
      return c.json({ error: noCardLine(name, cardsIn(entries.filter((e) => e !== entry))) }, 404);
    }
    // A card's keys as the listing reads them: `queued` is when it was queued (the listing carries its place too), null when unset.
    const keys = entry.error === null
      ? INBOX_KEYS.map((key) => ({ key, value: key === 'queued' ? entry.queued?.at ?? null : entry[key] ?? null, meaning: INBOX_KEY_MEANINGS[key] }))
      : null;
    return c.json({ ...entry, source, keys } satisfies InboxCardPage);
  })
  // `wf inbox add "<idea>" --workflow <name> --repo <path>`: a card filed, under the slug of its first line.
  .post('/api/inbox', async (c) => {
    const refused = refusedBeforeReading(FILE, c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: `POST /api/inbox takes a JSON body: ${FILE_SHAPE}.` }, 400);
    }
    const asked = filingOf(body, repoOf(), HOME);
    if ('status' in asked) return c.json({ error: asked.error }, asked.status);
    try {
      const { card, file } = addToInbox({ text: asked.text, ...(asked.workflow !== undefined ? { workflow: asked.workflow } : {}), ...(asked.repo !== undefined ? { repo: asked.repo } : {}) });
      return c.json({ name: card.name, file, workflow: card.workflow ?? null, repo: card.repo ?? null, body: card.body } satisfies InboxFiled, 201);
    } catch (err) {
      // The package's refusal, word for word (`exitCode` 2): an idea with nothing in it, a key it would write on two lines, a repo that is not
      // an absolute path to a directory, an `after:` in the idea's own frontmatter. Anything else is the store's: the inbox could not be written.
      return c.json({ error: messageOf(err) }, (err as { exitCode?: unknown }).exitCode === 2 ? 422 : 500);
    }
  })
  // `wf inbox rm <name>`: a card dropped without being started.
  .delete('/api/inbox/:name', (c) => {
    const name = c.req.param('name');
    const refused = refusedBeforeReading(dropGuard(name), c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    // A name that would leave the inbox, or a hidden one, in the package's words, before anything is read.
    const wrong = inboxNameRefusal(name);
    if (wrong) return c.json({ error: wrong }, 400);
    try {
      const dropped = dropFromInbox(name);
      if (!dropped.removed) return c.json({ error: noCardLine(name, dropped.cards) }, 404);
      return c.json(dropped);
    } catch (err) {
      return c.json({ error: messageOf(err) }, 500);
    }
  })
  // `wf inbox queue <name>`: the card marked to start on its own, on the workflow it names; and `--off`, the mark taken back.
  .post('/api/inbox/:name/queue', (c) => queueRoute(c, false))
  .delete('/api/inbox/:name/queue', (c) => queueRoute(c, true));

/**
 * A queue, or its taking back: the guard, then the name in the package's words (400) and the body (400), before the card is read; then
 * `queueInInbox`, whose refusals are its sentences with the status of what is on disk (`queueRefusalStatus`).
 */
async function queueRoute(c: Context, off: boolean) {
  const name = c.req.param('name')!;
  const guard = queueGuard(name, off);
  const refused = refusedBeforeReading(guard, c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
  if (refused) return c.json({ error: refused.error }, refused.status);
  const wrong = inboxNameRefusal(name);
  if (wrong) return c.json({ error: wrong }, 400);
  const shaped = queueBodyRefusal(guard.route, await c.req.text());
  if (shaped) return c.json({ error: shaped.error }, shaped.status);
  try {
    const done = queueInInbox(name, { off });
    return c.json({ name: done.card.name, file: done.file, was: done.was, queued: done.card.queued ?? null, place: done.place ?? null, of: done.of ?? null } satisfies InboxQueueAnswer);
  } catch (err) {
    if ((err as { exitCode?: unknown }).exitCode !== 2) return c.json({ error: messageOf(err) }, 500);
    return c.json({ error: messageOf(err) }, queueRefusalStatus(name));
  }
}
