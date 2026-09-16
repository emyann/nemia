/**
 * The inbox, for the board: cards parked before they are started — listed, filed and dropped.
 *
 * The package's inbox (agent-workflows' `readInbox`, `addToInbox`, `dropFromInbox`), `wf inbox`'s own: `$WF_ROOT/inbox/`, a card per
 * `<name>.md`, read from disk on each request, as the workflows are, so a card a person has just filed or dropped at the command line lists
 * as it is now. Starting a card is a start, so it is `POST /api/runs` with `card` (workflows.ts), through `startFromInbox`.
 *
 * Every refusal is the package's sentence with the api's status, but for the body's shape, which is the api's own (400). Filing and dropping
 * are writes a page on another site must not make, so each passes the guard (guard.ts) before its body is read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { addToInbox, dropFromInbox, HOME, inboxDir, inboxNameRefusal, noCardLine, parseInboxCard, readInbox, type InboxListing } from 'agent-workflows';
import { repoOf } from './capabilities.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from './guard.ts';
import { folderOf, type WorkflowSource } from './workflows.ts';

/**
 * A card as the board lists it: the package's listing (`InboxListing`) — its name, first line, workflow and repo as the card writes them,
 * the runs it was `startedAs`, and, for an entry that does not read as a card, why — with two things the listing does not carry.
 *
 * `body` is the card's text below its frontmatter, the brief a start is prefilled with: null for an entry that does not read. `filedAt` is when
 * its file was last written — when it was filed, unless a person has edited it since — which is what the board orders the cards by, newest
 * first: a card carries no time of its own. Null for an entry gone between the listing and the read.
 */
export type InboxEntry = InboxListing & { body: string | null; filedAt: string | null };

/** What `POST /api/inbox` answers: the card written, as `wf inbox add` prints it. */
export type InboxFiled = { name: string; file: string; workflow: string | null; repo: string | null; body: string };

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
  });
