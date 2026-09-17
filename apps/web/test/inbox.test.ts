/**
 * The inbox page's arithmetic (src/lib/inbox.ts) — the cards in order, the workflow a card's start is preset to, and the queue as the page and the
 * Factory say it — and what the board sends the api for it (src/lib/api.ts): a card filed, dropped, started, queued and taken off the queue. `npm run e2e` looks at the page itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropCard, fileCard, queueCard, startRun, type InboxEntry, type WorkflowListing } from '../src/lib/api.ts';
import { capLine, cardLines, hasPage, namedElsewhere, newestCardsFirst, ordinal, presetOf, queueable, queuedWord, queueOf, triedLine, workflowKey, type CardRefusal } from '../src/lib/inbox.ts';

const entry = (name: string, filedAt: string | null, extra: Partial<InboxEntry> = {}): InboxEntry => ({
  name, file: `${name}.md`, title: name, workflow: null, repo: null, startedAs: [], error: null, body: name, filedAt, ...extra,
});

test('the cards are listed newest first, by when each was filed, then by name; one whose time is not known goes last', () => {
  const cards = [
    entry('older-k2q9', '2026-09-15T10:00:00.000Z'),
    entry('unknown-a1b2', null),
    entry('newest-c3d4', '2026-09-16T09:00:00.000Z'),
    entry('same-b-e5f6', '2026-09-15T12:00:00.000Z'),
    entry('same-a-g7h8', '2026-09-15T12:00:00.000Z'),
  ];
  assert.deepEqual(newestCardsFirst(cards).map((c) => c.name), ['newest-c3d4', 'same-a-g7h8', 'same-b-e5f6', 'older-k2q9', 'unknown-a1b2']);
  assert.deepEqual(cards.map((c) => c.name)[0], 'older-k2q9', 'the listing it was given is left as it was');
});

test("a refused start or drop stays on the page after the inbox is read again: on its card while the card is listed, and in the card's place once it is gone", () => {
  const newest = entry('newest-c3d4', '2026-09-16T09:00:00.000Z');
  const middle = entry('dropped-k2q9', '2026-09-15T12:00:00.000Z');
  const oldest = entry('oldest-a1b2', '2026-09-15T10:00:00.000Z');
  const kept = entry('started-e5f6', '2026-09-14T10:00:00.000Z', { startedAs: ['started-run-e5f6'] });
  const refusals: CardRefusal[] = [
    { entry: middle, action: 'start', message: 'no card dropped-k2q9 in the inbox.' },
    { entry: oldest, action: 'remove', message: 'no card oldest-a1b2 in the inbox.' },
    { entry: { ...kept, startedAs: [] }, action: 'start', message: 'this card was started as started-run-e5f6.' },
  ];
  const line = (l: ReturnType<typeof cardLines>[number]) => [l.entry.name, l.gone ? 'gone' : 'listed', l.refusal?.action ?? null];

  // Read again after the answers: dropped-k2q9 and oldest-a1b2 are gone, started-e5f6 is still listed, as started.
  const lines = cardLines([newest, kept], refusals);
  assert.deepEqual(lines.map(line), [
    ['newest-c3d4', 'listed', null],
    ['dropped-k2q9', 'gone', 'start'],
    ['oldest-a1b2', 'gone', 'remove'],
    ['started-e5f6', 'listed', 'start'],
  ]);
  assert.equal(lines[3]!.entry, kept, 'a card still listed is drawn as the inbox now lists it, not as it was refused');
  assert.equal(lines[1]!.refusal!.message, 'no card dropped-k2q9 in the inbox.', "with the api's words");

  // Before the inbox is read again, each refused card is still listed: its refusal on it, and no line of its own.
  assert.deepEqual(cardLines([newest, middle, oldest, kept], refusals).map(line), [
    ['newest-c3d4', 'listed', null],
    ['dropped-k2q9', 'listed', 'start'],
    ['oldest-a1b2', 'listed', 'remove'],
    ['started-e5f6', 'listed', 'start'],
  ]);
  // With no refusal, only what the inbox lists.
  assert.deepEqual(cardLines([newest, kept], []).map(line), [['newest-c3d4', 'listed', null], ['started-e5f6', 'listed', null]]);
});

const listing = (name: string, from: 'repo' | 'yours', dir: string, error: string | null = null): WorkflowListing => ({
  name, from, dir, description: null, steps: [], graph: { roots: [], edges: [] }, schemas: [], version: '0', error,
});

const WORKFLOWS = [
  listing('dev', 'repo', '/code/app/workflows/dev'),
  listing('broken', 'repo', '/code/app/workflows/broken', 'review: `afer` is not a key a step has.'),
  listing('dev', 'yours', '/home/me/.agent-workflows/workflows/dev'),
  listing('mine', 'yours', '/home/me/.agent-workflows/workflows/mine'),
];

/** The api's repository, whose workflows WORKFLOWS lists as the repository's. */
const HERE = '/code/app';

/** An entry as the inbox lists it: a card by its name, a stray file by its own, which is its name too. */
const entryOf = (name: string, card = true) => ({ name, file: card ? `${name}.md` : name });

test("an entry of the inbox has a page by the name the inbox lists it under: a card, one that does not read, and a stray file nothing else answers for", () => {
  const listing = ['cache-the-views-k2q9', 'broken', 'with space'].map((name) => entryOf(name));
  const strays = ['notes.txt', 'notes'].map((name) => entryOf(name, false));
  const all = [...listing, ...strays];
  for (const entry of all) assert.equal(hasPage(entry, all), true, entry.file);
});

test("REFUSED: no page for an entry whose name the api refuses — a folder, which the inbox lists as `sub/`, a name with a backslash, a hidden one or none", () => {
  const refused = [{ name: 'sub/', file: 'sub' }, { name: 'a.md/', file: 'a.md' }, ...['a\\b', '.hidden', '', ' '].map((name) => entryOf(name, false))];
  for (const entry of refused) assert.equal(hasPage(entry, refused), false, JSON.stringify(entry.name));
});

test("REFUSED: no page for a stray file a card of the same name answers for — `/inbox/notes` is notes.md, and the stray would open another file's page", () => {
  const card = entryOf('notes');
  const stray = entryOf('notes', false);
  assert.equal(hasPage(stray, [card, stray]), false, 'notes, beside notes.md');
  assert.equal(hasPage(card, [card, stray]), true, 'and the card keeps the page, which is the one the api reads');
  // The stray alone is its own page: the api finds no card of that name, and answers with the file.
  assert.equal(hasPage(stray, [stray]), true, 'notes, with no card beside it');
  // Two strays of one name cannot both be listed — one file, one name — and a card's name is its file's: nothing else takes a card's page away.
  assert.equal(hasPage(card, [card, entryOf('notes.txt', false)]), true);
});

test("a card's start is preset to the workflow it names, found as a start finds it: a name is the repository's, a path that folder", () => {
  assert.equal(presetOf('dev', null, HERE, WORKFLOWS), WORKFLOWS[0], "a name is the repository's workflow, though yours has one of that name too");
  // A card about the api's repository names one of its workflows, however the path is written.
  for (const repo of [HERE, `${HERE}/`]) assert.equal(presetOf('dev', repo, HERE, WORKFLOWS), WORKFLOWS[0], repo);
  assert.equal(presetOf('/home/me/.agent-workflows/workflows/dev', null, HERE, WORKFLOWS), WORKFLOWS[2], 'an absolute path is that folder, yours included');
  assert.equal(presetOf('/home/me/.agent-workflows/workflows/mine/', null, HERE, WORKFLOWS), WORKFLOWS[3], 'with a trailing slash too');
  // A path names one folder, whatever repository the card is about.
  assert.equal(presetOf('/code/app/workflows/dev', '/code/other', HERE, WORKFLOWS), WORKFLOWS[0], "an absolute path on a card about another repository is that folder");
  assert.equal(workflowKey(WORKFLOWS[2]!), 'yours:dev');
});

test('REFUSED: no preset for a card that names no workflow, a workflow nobody here has, one that does not read, a name only yours has, or a relative path', () => {
  for (const workflow of [null, '', 'nope', 'broken', '/code/app/workflows/broken', 'mine', '../workflows/dev', 'workflows/dev', '.', '..', '/elsewhere/dev']) {
    assert.equal(presetOf(workflow, null, HERE, WORKFLOWS), null, String(workflow));
  }
});

test("REFUSED: no preset for a name on a card about another repository, though the api's repository has a workflow of that name — a start looks for it in the card's", () => {
  assert.equal(presetOf('dev', '/code/other', HERE, WORKFLOWS), null);
  assert.equal(presetOf('dev', '/code/app-two', HERE, WORKFLOWS), null, 'a repository whose path starts with the api\'s is another');
  assert.equal(namedElsewhere('dev', '/code/other', HERE), true);
  for (const [workflow, repo] of [['dev', null], ['dev', HERE], ['dev', `${HERE}/`], ['/code/other/workflows/dev', '/code/other'], ['../workflows/dev', '/code/other'], [null, '/code/other']] as const) {
    assert.equal(namedElsewhere(workflow, repo, HERE), false, `${workflow} on ${repo}`);
  }
});

/** The api answering each request with `answer()`, for the length of the test: the requests the board sent. */
function sending(t: { after: (fn: () => void) => void }, answer: () => Response) {
  const before = globalThis.fetch;
  const sent: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init });
    return answer();
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = before;
  });
  return sent;
}

const answered = (status: number, body: object | string, statusText = '') =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, statusText, headers: { 'content-type': 'application/json' } });

test("a card is filed as JSON, the one body the api takes, and resolves with its name; a refusal rejects with the api's message word for word", async (t) => {
  let answer = answered(201, { name: 'cache-the-views-k2q9', file: '/store/inbox/cache-the-views-k2q9.md', workflow: 'dev', repo: '/code/app', body: 'Cache the views' });
  const sent = sending(t, () => answer);
  const card = { body: 'Cache the views', workflow: 'dev', from: 'repo' as const, repo: '/code/app' };
  assert.deepEqual(await fileCard(card), { name: 'cache-the-views-k2q9' });
  const [{ url, init }] = sent as [(typeof sent)[number]];
  assert.deepEqual([url, init?.method, new Headers(init?.headers).get('content-type')], ['/api/inbox', 'POST', 'application/json']);
  assert.deepEqual(JSON.parse(String(init?.body)), card);

  const refusal = 'the idea: `repo: /code/nope` names no directory. Correct it to the repository the idea is about, or delete the line, and the card is started on the repository its start names.';
  answer = answered(422, { error: refusal });
  await assert.rejects(fileCard(card), (err: Error) => err.message === refusal);
  answer = answered(502, 'Bad Gateway', 'Bad Gateway');
  await assert.rejects(fileCard(card), (err: Error) => err.message === 'POST /api/inbox answered 502 Bad Gateway');
  answer = answered(201, {});
  await assert.rejects(fileCard(card), (err: Error) => /^POST \/api\/inbox answered 201 +without the card's name/.test(err.message) && /before filing it again/.test(err.message));
});

test("a card is dropped by its name in the path, sent as JSON with no body; a refusal rejects with the api's message word for word", async (t) => {
  let answer = answered(200, { removed: true, file: '/store/inbox/a b.md' });
  const sent = sending(t, () => answer);
  await dropCard('a b');
  const [{ url, init }] = sent as [(typeof sent)[number]];
  assert.deepEqual([url, init?.method, new Headers(init?.headers).get('content-type'), init?.body], ['/api/inbox/a%20b', 'DELETE', 'application/json', undefined]);

  const refusal = 'no card gone-k2q9 in the inbox. Its cards are: cache-the-views-k2q9.';
  answer = answered(404, { error: refusal });
  await assert.rejects(dropCard('gone-k2q9'), (err: Error) => err.message === refusal);
  answer = answered(500, 'oops', 'Internal Server Error');
  await assert.rejects(dropCard('gone-k2q9'), (err: Error) => err.message === 'DELETE /api/inbox/gone-k2q9 answered 500 Internal Server Error');
});

test('a card is started through POST /api/runs with `card` beside the workflow and the brief, and resolves with whether it left the inbox, and why not', async (t) => {
  let answer = answered(201, { id: 'show-each-step-s-cost-42g6', card: 'show-what-a-step-cost-c3cw', removed: true }, 'Created');
  const sent = sending(t, () => answer);
  const asked = { workflow: 'dev', from: 'repo' as const, brief: "Show each step's cost", after: ['p-1'], card: 'show-what-a-step-cost-c3cw' };
  assert.deepEqual(await startRun(asked), { id: 'show-each-step-s-cost-42g6', removed: true });
  assert.deepEqual(JSON.parse(String(sent[0]!.init?.body)), asked);

  answer = answered(201, { id: 'show-each-step-s-cost-42g6', card: 'show-what-a-step-cost-c3cw', removed: false, why: '/store/inbox/show.md could not be removed — EACCES' });
  assert.deepEqual(await startRun(asked), { id: 'show-each-step-s-cost-42g6', removed: false, why: '/store/inbox/show.md could not be removed — EACCES' });

  const refusal = 'no card show-what-a-step-cost-c3cw in the inbox. The inbox is empty. Start one of those — wf start /store/inbox/<name>.md — or park the idea first: wf inbox add "<idea>".';
  answer = answered(404, { error: refusal });
  await assert.rejects(startRun(asked), (err: Error) => err.message === refusal);
});

// ─── the queue ──────────────────────────────────────────────────────────────

test('a place is said as a person says it: 1st, 2nd, 3rd, then th — 11th to 13th too — and 21st, 102nd', () => {
  assert.deepEqual([1, 2, 3, 4, 10, 11, 12, 13, 14, 21, 22, 23, 101, 102, 111, 112, 113].map(ordinal), [
    '1st', '2nd', '3rd', '4th', '10th', '11th', '12th', '13th', '14th', '21st', '22nd', '23rd', '101st', '102nd', '111th', '112th', '113th',
  ]);
  assert.equal(queuedWord({ at: '2026-09-16T10:00:00.000Z', place: 2 }), 'queued · 2nd');
  assert.equal(queuedWord({ at: '2026-09-16T10:00:00.000Z', place: null }), 'queued', 'a card a record says was started has no place');
});

test('the queue is every card with a place, in its place\'s order, whatever order the inbox lists them in — a refused card in its place, a started one not', () => {
  const at = '2026-09-16T10:00:00.000Z';
  const cards = [
    entry('a-third', at, { workflow: 'dev', queued: { at, place: 3 } }),
    entry('b-parked', at, { workflow: 'dev' }),
    entry('c-first', at, { workflow: 'dev', queued: { at, place: 1 } }),
    entry('d-started', at, { workflow: 'dev', queued: { at, place: null }, startedAs: ['r-1'] }),
    entry('e-refused', at, { workflow: 'gone', queued: { at, place: 2 }, tried: { at, repo: '/code/app', why: 'no workflow gone.', refused: true } }),
  ];
  assert.deepEqual(queueOf(cards).map((c) => c.name), ['c-first', 'e-refused', 'a-third']);
  assert.deepEqual(queueOf([]), []);
});

test('Queue is offered on a card that names a workflow, reads, is not queued and was not started', () => {
  assert.equal(queueable(entry('named', null, { workflow: 'dev' })), true);
});

test("REFUSED: no Queue on a card that names no workflow, one queued already, one a record says was started, or one that does not read — each a refusal of the package's", () => {
  const at = '2026-09-16T10:00:00.000Z';
  assert.equal(queueable(entry('bare', null)), false, 'no workflow');
  assert.equal(queueable(entry('queued', null, { workflow: 'dev', queued: { at, place: 1 } })), false, 'queued already');
  assert.equal(queueable(entry('started', null, { workflow: 'dev', startedAs: ['r-1'] })), false, 'started');
  assert.equal(queueable(entry('broken', null, { workflow: 'dev', error: 'broken.md: `after` is not a key an inbox card has.' })), false, 'does not read');
});

test("a start the tick tried and did not make says so as `wf inbox` does: refused, it stays queued and waits for you; failed, it is tried again — the repository named for a card that names none, and a why the card's own refusal says not said twice", () => {
  const at = '2026-09-16T10:00:00.000Z';
  const refused = { at, repo: '/code/app', why: 'no workflow gone in /code/app/workflows.', refused: true };
  assert.equal(
    triedLine({ repo: '/code/app', error: null, tried: refused }, 'then'),
    'Not started at then: no workflow gone in /code/app/workflows. It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again.',
  );
  assert.equal(
    triedLine({ repo: null, error: null, tried: refused }, 'then'),
    'Not started at then on /code/app: no workflow gone in /code/app/workflows. It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again, or run wf up in the repository it is about.',
  );
  const gone = 'card.md: `repo: /code/gone` names no directory.';
  assert.equal(
    triedLine({ repo: '/code/gone', error: gone, tried: { ...refused, repo: '/code/gone', why: gone } }, 'then'),
    'Not started at then. It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again.',
  );
  assert.equal(
    triedLine({ repo: '/code/app', error: null, tried: { at, repo: '/code/app', why: 'git: not a git repository', refused: false } }, 'then'),
    'Failed at then: git: not a git repository. Not a refusal: the tick tries it again on every pass, where it keeps its place.',
  );
});

test('the Factory says the run slots taken of the cap and how many are queued — `no cap` with none, and the queue left out when empty', () => {
  assert.equal(capLine({ cap: 4, inFlight: ['a', 'b'] }, 3), '2 of 4 run slots taken · 3 queued');
  assert.equal(capLine({ cap: 4, inFlight: ['a', 'b'] }, 0), '2 of 4 run slots taken');
  assert.equal(capLine({ cap: 1, inFlight: [] }, 1), '0 of 1 run slots taken · 1 queued');
  assert.equal(capLine({ cap: 0, inFlight: null }, 3), 'no cap · 3 queued');
  assert.equal(capLine({ cap: 0, inFlight: null }, 0), 'no cap');
  assert.equal(capLine({ cap: 0, inFlight: ['a'] }, 0), 'no cap', 'a count with no cap is no count against one');
});

test("a card is queued by its name in the path, POST, and taken off the queue with DELETE, each sent as JSON with no body; a refusal rejects with the api's message word for word", async (t) => {
  const done = { name: 'a b', file: '/store/inbox/a b.md', was: 'queued', queued: '2026-09-16T10:00:00.000Z', place: 2, of: 2 };
  let answer = answered(200, done);
  const sent = sending(t, () => answer);
  assert.deepEqual(await queueCard('a b'), done);
  answer = answered(200, { ...done, was: 'taken back', queued: null, place: null, of: null });
  assert.equal((await queueCard('a b', { off: true })).was, 'taken back');
  assert.deepEqual(sent.map(({ url, init }) => [url, init?.method, new Headers(init?.headers).get('content-type'), init?.body]), [
    ['/api/inbox/a%20b/queue', 'POST', 'application/json', undefined],
    ['/api/inbox/a%20b/queue', 'DELETE', 'application/json', undefined],
  ]);

  const refusal = 'bare.md: no workflow — a queued card starts on its own, and nothing says what runs it. Queue it with its workflow: wf inbox queue bare --workflow <w> writes both.';
  answer = answered(422, { error: refusal });
  await assert.rejects(queueCard('bare'), (err: Error) => err.message === refusal);
  answer = answered(502, 'Bad Gateway', 'Bad Gateway');
  await assert.rejects(queueCard('bare', { off: true }), (err: Error) => err.message === 'DELETE /api/inbox/bare/queue answered 502 Bad Gateway');
  answer = answered(200, {});
  await assert.rejects(queueCard('bare'), (err: Error) => /^POST \/api\/inbox\/bare\/queue answered 200 +without what it did/.test(err.message) && /before asking again/.test(err.message));
});
