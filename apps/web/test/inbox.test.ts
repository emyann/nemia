/**
 * The inbox page's arithmetic (src/lib/inbox.ts) — the cards in order, the workflow a card's start is preset to, and the queue as the page
 * and the Factory say it — and what the board sends the api for it (src/lib/api.ts): a card filed, dropped, started, queued and taken off
 * the queue. `npm run e2e` looks at the page itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropCard, fileCard, queueCard, startRun, type Factory, type InboxEntry, type WorkflowListing } from '../src/lib/api.ts';
import {
  afterFor,
  capLine,
  cardFiling,
  cardLines,
  cardPlace,
  factoriesOffered,
  factoryPreset,
  hasPage,
  ignoredRepoNote,
  inboxBadgeTitle,
  namedElsewhere,
  newestCardsFirst,
  notStarted,
  ordinal,
  presetOf,
  queueable,
  queueNeedsFactory,
  queuedWord,
  queueOf,
  startPlace,
  triedLine,
  unassigned,
  unreadWorkflows,
  workflowKey,
  type CardRefusal,
} from '../src/lib/inbox.ts';

const entry = (name: string, filedAt: string | null, extra: Partial<InboxEntry> = {}): InboxEntry => ({
  name,
  file: `${name}.md`,
  title: name,
  workflow: null,
  repo: null,
  factory: null,
  from: [],
  startedAs: [],
  error: null,
  body: name,
  filedAt,
  factoryRepo: null,
  ...extra,
});

test('the cards are listed newest first, by when each was filed, then by name; one whose time is not known goes last', () => {
  const cards = [
    entry('older-k2q9', '2026-09-15T10:00:00.000Z'),
    entry('unknown-a1b2', null),
    entry('newest-c3d4', '2026-09-16T09:00:00.000Z'),
    entry('same-b-e5f6', '2026-09-15T12:00:00.000Z'),
    entry('same-a-g7h8', '2026-09-15T12:00:00.000Z'),
  ];
  assert.deepEqual(
    newestCardsFirst(cards).map((c) => c.name),
    ['newest-c3d4', 'same-a-g7h8', 'same-b-e5f6', 'older-k2q9', 'unknown-a1b2'],
  );
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

  const lines = cardLines([newest, kept], refusals);
  assert.deepEqual(
    lines.map(line),
    [
      ['newest-c3d4', 'listed', null],
      ['dropped-k2q9', 'gone', 'start'],
      ['oldest-a1b2', 'gone', 'remove'],
      ['started-e5f6', 'listed', 'start'],
    ],
    'read again after the answers: dropped-k2q9 and oldest-a1b2 are gone, started-e5f6 is still listed, as started',
  );
  assert.equal(lines[3].entry, kept, 'a card still listed is drawn as the inbox now lists it, not as it was refused');
  assert.equal(lines[1].refusal!.message, 'no card dropped-k2q9 in the inbox.', "with the api's words");

  assert.deepEqual(
    cardLines([newest, middle, oldest, kept], refusals).map(line),
    [
      ['newest-c3d4', 'listed', null],
      ['dropped-k2q9', 'listed', 'start'],
      ['oldest-a1b2', 'listed', 'remove'],
      ['started-e5f6', 'listed', 'start'],
    ],
    'before the inbox is read again, each refused card is still listed: its refusal on it, and no line of its own',
  );
  assert.deepEqual(
    cardLines([newest, kept], []).map(line),
    [
      ['newest-c3d4', 'listed', null],
      ['started-e5f6', 'listed', null],
    ],
    'with no refusal, only what the inbox lists',
  );
});

test('REFUSED: a refusal is on the entry it is of, not on another of the same name — a card and a stray file beside it, notes.md and notes', () => {
  const card = entry('notes', '2026-09-16T09:00:00.000Z');
  const stray = entry('notes', '2026-09-16T08:00:00.000Z', { file: 'notes', title: null, error: 'notes: not a card.' });
  const refused: CardRefusal = { entry: card, action: 'remove', message: 'notes.md could not be removed.' };
  const lines = cardLines([card, stray], [refused]);
  assert.deepEqual(
    lines.map((l) => [l.entry.file, l.gone, l.refusal?.action ?? null]),
    [
      ['notes.md', false, 'remove'],
      ['notes', false, null],
    ],
  );

  const after = cardLines([stray], [refused]);
  assert.deepEqual(
    after.map((l) => [l.entry.file, l.gone, l.refusal?.action ?? null]),
    [
      ['notes.md', true, 'remove'],
      ['notes', false, null],
    ],
    "the card dropped behind the page's back leaves its refusal in its place, with the stray still listed and clear of it",
  );
});

const listing = (name: string, from: 'repo' | 'yours', dir: string, error: string | null = null): WorkflowListing => ({
  name,
  from,
  dir,
  description: null,
  readme: null,
  steps: [],
  graph: { roots: [], edges: [] },
  schemas: [],
  folderTeam: false,
  version: '0',
  error,
  unfilled: null,
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

test('an entry of the inbox has a page by the name the inbox lists it under: a card, one that does not read, and a stray file nothing else answers for', () => {
  const listing = ['cache-the-views-k2q9', 'broken', 'with space'].map((name) => entryOf(name));
  const strays = ['notes.txt', 'notes'].map((name) => entryOf(name, false));
  const all = [...listing, ...strays];
  for (const entry of all) assert.equal(hasPage(entry, all), true, entry.file);
});

test('REFUSED: no page for an entry whose name the api refuses — a folder, which the inbox lists as `sub/`, a name with a backslash, a hidden one or none', () => {
  const refused = [
    { name: 'sub/', file: 'sub' },
    { name: 'a.md/', file: 'a.md' },
    ...['a\\b', '.hidden', '', ' '].map((name) => entryOf(name, false)),
  ];
  for (const entry of refused) assert.equal(hasPage(entry, refused), false, JSON.stringify(entry.name));
});

test("REFUSED: no page for a stray file a card of the same name answers for — `/inbox/notes` is notes.md, and the stray would open another file's page", () => {
  const card = entryOf('notes');
  const stray = entryOf('notes', false);
  assert.equal(hasPage(stray, [card, stray]), false, 'notes, beside notes.md');
  assert.equal(hasPage(card, [card, stray]), true, 'and the card keeps the page, which is the one the api reads');
  assert.equal(
    hasPage(stray, [stray]),
    true,
    'notes, with no card beside it, is its own page: the api finds no card of that name, and answers with the file',
  );
  assert.equal(
    hasPage(card, [card, entryOf('notes.txt', false)]),
    true,
    "a card's name is its file's, and one name is one file: nothing else takes a card's page away",
  );
});

test("a card's start is preset to the workflow it names, found as a start finds it: a name is the repository's, a path that folder", () => {
  assert.equal(
    presetOf('dev', null, HERE, WORKFLOWS),
    WORKFLOWS[0],
    "a name is the repository's workflow, though yours has one of that name too",
  );
  for (const repo of [HERE, `${HERE}/`])
    assert.equal(
      presetOf('dev', repo, HERE, WORKFLOWS),
      WORKFLOWS[0],
      `a card about the api's repository, ${repo}, names one of its workflows`,
    );
  assert.equal(
    presetOf('/home/me/.agent-workflows/workflows/dev', null, HERE, WORKFLOWS),
    WORKFLOWS[2],
    'an absolute path is that folder, yours included',
  );
  assert.equal(presetOf('/home/me/.agent-workflows/workflows/mine/', null, HERE, WORKFLOWS), WORKFLOWS[3], 'with a trailing slash too');
  assert.equal(
    presetOf('/code/app/workflows/dev', '/code/other', HERE, WORKFLOWS),
    WORKFLOWS[0],
    'an absolute path on a card about another repository is that folder',
  );
  assert.equal(workflowKey(WORKFLOWS[2]), 'yours:dev');
});

test('REFUSED: no preset for a card that names no workflow, a workflow nobody here has, one that does not read, a name only yours has, or a relative path', () => {
  for (const workflow of [
    null,
    '',
    'nope',
    'broken',
    '/code/app/workflows/broken',
    'mine',
    '../workflows/dev',
    'workflows/dev',
    '.',
    '..',
    '/elsewhere/dev',
  ]) {
    assert.equal(presetOf(workflow, null, HERE, WORKFLOWS), null, String(workflow));
  }
});

test("REFUSED: no preset for a name on a card about another repository, though the api's repository has a workflow of that name — a start looks for it in the card's", () => {
  assert.equal(presetOf('dev', '/code/other', HERE, WORKFLOWS), null);
  assert.equal(presetOf('dev', '/code/app-two', HERE, WORKFLOWS), null, "a repository whose path starts with the api's is another");
  assert.equal(namedElsewhere('dev', '/code/other', HERE), true);
  for (const [workflow, repo] of [
    ['dev', null],
    ['dev', HERE],
    ['dev', `${HERE}/`],
    ['/code/other/workflows/dev', '/code/other'],
    ['../workflows/dev', '/code/other'],
    [null, '/code/other'],
  ] as const) {
    assert.equal(namedElsewhere(workflow, repo, HERE), false, `${workflow} on ${repo}`);
  }
});

test("a card's repository on a team that works in folders: the start form says it is not looked at, before the start, and names it", () => {
  const inFolders = { ...listing('note', 'yours', '/home/me/.agent-workflows/workflows/note'), folderTeam: true };
  const said = ignoredRepoNote(inFolders, '/code/app');
  assert.equal(
    said,
    "The card's repo: /code/app is not looked at — this workflow's steps work in folders, with no git repository.",
    "said before the start: a start the api takes opens the run's page, so the api's `ignoredRepo` on the start is never read here",
  );
  assert.match(said, /\/code\/app/, 'and it names the repository the card named, not a repository in general');
});

test('REFUSED: nothing is said of a repository a run does look at, nor of a card that names none', () => {
  const onRepo = listing('dev', 'repo', '/code/app/workflows/dev');
  const inFolders = { ...onRepo, folderTeam: true };
  assert.equal(ignoredRepoNote(onRepo, '/code/app'), null, 'a team that works on a repository looks at the one the card names');
  for (const none of [undefined, null, ''])
    assert.equal(ignoredRepoNote(inFolders, none), null, `a card that names none: ${JSON.stringify(none)}`);
});

test('a start sends the runs it waits on, as they were picked', () => {
  const onRepo = listing('dev', 'repo', '/code/app/workflows/dev');
  assert.deepEqual(afterFor(onRepo, ['a-run-k2q9', 'another-c3d4']), ['a-run-k2q9', 'another-c3d4']);
});

test('REFUSED: a start of a team that works in folders sends none, whatever the picker was left holding', () => {
  const inFolders = { ...listing('note', 'yours', '/home/me/.agent-workflows/workflows/note'), folderTeam: true };
  assert.deepEqual(
    afterFor(inFolders, ['a-run-k2q9', 'another-c3d4']),
    [],
    'the picker is hidden for a folder team, not emptied: runs picked under a git workflow are not sent, which `wf start` refuses as `--after` on such a run',
  );
});

/** The api answering each request with `answer()`, for the length of the test: the requests the board sent. */
function sending(t: { after: (fn: () => void) => void }, answer: () => Response) {
  const before = globalThis.fetch;
  const sent: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init });
    return answer();
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  return sent;
}

const answered = (status: number, body: object | string, statusText = '') =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    statusText,
    headers: { 'content-type': 'application/json' },
  });

test("a card is filed as JSON, the one body the api takes, and resolves with its name; a refusal rejects with the api's message word for word", async (t) => {
  let answer = answered(201, {
    name: 'cache-the-views-k2q9',
    file: '/store/inbox/cache-the-views-k2q9.md',
    workflow: 'dev',
    repo: '/code/app',
    body: 'Cache the views',
  });
  const sent = sending(t, () => answer);
  const card = { body: 'Cache the views', workflow: 'dev', from: 'repo' as const, repo: '/code/app', factory: 'pair' };
  assert.deepEqual(await fileCard(card), { name: 'cache-the-views-k2q9' });
  const [{ url, init }] = sent as [(typeof sent)[number]];
  assert.deepEqual([url, init?.method, new Headers(init?.headers).get('content-type')], ['/api/inbox', 'POST', 'application/json']);
  assert.deepEqual(JSON.parse(String(init?.body)), card);

  const refusal =
    'the idea: `repo: /code/nope` names no directory. Correct it to the repository the idea is about, or delete the line, and the card is started on the repository its start names.';
  answer = answered(422, { error: refusal });
  await assert.rejects(fileCard(card), (err: Error) => err.message === refusal);
  answer = answered(502, 'Bad Gateway', 'Bad Gateway');
  await assert.rejects(fileCard(card), (err: Error) => err.message === 'POST /api/inbox answered 502 Bad Gateway');
  answer = answered(201, {});
  await assert.rejects(
    fileCard(card),
    (err: Error) =>
      err.message.startsWith('POST /api/inbox answered what this board does not read: at name, the value is missing.') &&
      /before filing it again/.test(err.message),
  );
});

test("a card is dropped by its name in the path, sent as JSON with no body; a refusal rejects with the api's message word for word", async (t) => {
  let answer = answered(200, { removed: true, file: '/store/inbox/a b.md' });
  const sent = sending(t, () => answer);
  await dropCard('a b');
  const [{ url, init }] = sent as [(typeof sent)[number]];
  assert.deepEqual(
    [url, init?.method, new Headers(init?.headers).get('content-type'), init?.body],
    ['/api/inbox/a%20b', 'DELETE', 'application/json', undefined],
  );

  const refusal = 'no card gone-k2q9 in the inbox. Its cards are: cache-the-views-k2q9.';
  answer = answered(404, { error: refusal });
  await assert.rejects(dropCard('gone-k2q9'), (err: Error) => err.message === refusal);
  answer = answered(500, 'oops', 'Internal Server Error');
  await assert.rejects(
    dropCard('gone-k2q9'),
    (err: Error) => err.message === 'DELETE /api/inbox/gone-k2q9 answered 500 Internal Server Error',
  );
});

test('a card is started through POST /api/runs with `card` beside the workflow and the brief, and resolves with whether it left the inbox, and why not', async (t) => {
  let answer = answered(201, { id: 'show-each-step-s-cost-42g6', card: 'show-what-a-step-cost-c3cw', removed: true }, 'Created');
  const sent = sending(t, () => answer);
  const asked = {
    workflow: 'dev',
    from: 'repo' as const,
    brief: "Show each step's cost",
    after: ['p-1'],
    card: 'show-what-a-step-cost-c3cw',
  };
  assert.deepEqual(await startRun(asked), { id: 'show-each-step-s-cost-42g6', removed: true });
  assert.deepEqual(JSON.parse(String(sent[0].init?.body)), asked);

  answer = answered(201, {
    id: 'show-each-step-s-cost-42g6',
    card: 'show-what-a-step-cost-c3cw',
    removed: false,
    why: '/store/inbox/show.md could not be removed — EACCES',
  });
  assert.deepEqual(await startRun(asked), {
    id: 'show-each-step-s-cost-42g6',
    removed: false,
    why: '/store/inbox/show.md could not be removed — EACCES',
  });

  const refusal =
    'no card show-what-a-step-cost-c3cw in the inbox. The inbox is empty. Start one of those — wf start /store/inbox/<name>.md — or park the idea first: wf inbox add "<idea>".';
  answer = answered(404, { error: refusal });
  await assert.rejects(startRun(asked), (err: Error) => err.message === refusal);
});

test('a place is said as a person says it: 1st, 2nd, 3rd, then th — 11th to 13th too — and 21st, 102nd', () => {
  assert.deepEqual([1, 2, 3, 4, 10, 11, 12, 13, 14, 21, 22, 23, 101, 102, 111, 112, 113].map(ordinal), [
    '1st',
    '2nd',
    '3rd',
    '4th',
    '10th',
    '11th',
    '12th',
    '13th',
    '14th',
    '21st',
    '22nd',
    '23rd',
    '101st',
    '102nd',
    '111th',
    '112th',
    '113th',
  ]);
  assert.equal(queuedWord({ at: '2026-09-16T10:00:00.000Z', place: 2 }), 'queued · 2nd');
  assert.equal(queuedWord({ at: '2026-09-16T10:00:00.000Z', place: null }), 'queued', 'a card a record says was started has no place');
});

test("the queue is every card with a place, in its place's order, whatever order the inbox lists them in — a refused card in its place, a started one not", () => {
  const at = '2026-09-16T10:00:00.000Z';
  const cards = [
    entry('a-third', at, { workflow: 'dev', queued: { at, place: 3 } }),
    entry('b-parked', at, { workflow: 'dev' }),
    entry('c-first', at, { workflow: 'dev', queued: { at, place: 1 } }),
    entry('d-started', at, { workflow: 'dev', queued: { at, place: null }, startedAs: ['r-1'] }),
    entry('e-refused', at, {
      workflow: 'gone',
      queued: { at, place: 2 },
      tried: { at, repo: '/code/app', why: 'no workflow gone.', refused: true },
    }),
  ];
  assert.deepEqual(
    queueOf(cards).map((c) => c.name),
    ['c-first', 'e-refused', 'a-third'],
  );
  assert.deepEqual(queueOf([]), []);
});

test('Queue is offered on a card that names a factory and a workflow, reads, is not queued and was not started', () => {
  assert.equal(queueable(entry('named', null, { factory: 'solo', workflow: 'dev' })), true);
  assert.equal(queueNeedsFactory(entry('named', null, { factory: 'solo', workflow: 'dev' })), false);
});

test('REFUSED: no Queue on a card that names no factory, or default — it says its factory is what it lacks, and no other card does', () => {
  const at = '2026-09-16T10:00:00.000Z';
  for (const factory of [null, 'default']) {
    const loose = (name: string, extra: Partial<InboxEntry> = {}) => entry(name, null, { factory, ...extra });
    assert.equal(queueable(loose('loose', { workflow: 'dev' })), false, String(factory));
    assert.equal(queueNeedsFactory(loose('loose', { workflow: 'dev' })), true, String(factory));
    assert.equal(queueNeedsFactory(loose('bare')), false, 'no workflow: Start gives it both');
    assert.equal(queueNeedsFactory(loose('queued', { workflow: 'dev', queued: { at, place: 1 } })), false, 'queued: Unqueue');
    assert.equal(queueNeedsFactory(loose('started', { workflow: 'dev', startedAs: ['r-1'] })), false, 'started');
    assert.equal(queueNeedsFactory(loose('broken', { workflow: 'dev', error: 'broken.md: not a card.' })), false, 'unread');
  }
});

test("REFUSED: no Queue on a card of a factory that names no workflow, one queued already, one a record says was started, or one that does not read — each a refusal of the package's", () => {
  const at = '2026-09-16T10:00:00.000Z';
  const solo = (name: string, extra: Partial<InboxEntry> = {}) => entry(name, null, { factory: 'solo', ...extra });
  assert.equal(queueable(solo('bare')), false, 'no workflow');
  assert.equal(queueable(solo('queued', { workflow: 'dev', queued: { at, place: 1 } })), false, 'queued already');
  assert.equal(queueable(solo('started', { workflow: 'dev', startedAs: ['r-1'] })), false, 'started');
  assert.equal(
    queueable(solo('broken', { workflow: 'dev', error: 'broken.md: `after` is not a key an inbox card has.' })),
    false,
    'does not read',
  );
});

test('the workflows a list leaves out are those that do not read, each with why', () => {
  const listed = [
    { name: 'dev', error: null },
    { name: 'bad', error: 'bad: no step' },
  ];
  assert.deepEqual(unreadWorkflows(listed), [{ name: 'bad', error: 'bad: no step' }]);
  assert.equal(unreadWorkflows([listed[0]]).length, 0);
});

test("a start the tick tried and did not make says so as `wf inbox` does: refused, it stays queued and waits for you; failed, it is tried again — the repository named for a card of a factory that names none, never for one that names no factory, and a why the card's own refusal says not said twice", () => {
  const at = '2026-09-16T10:00:00.000Z';
  const refused = { at, repo: '/code/app', why: 'no workflow gone in /code/app/workflows.', refused: true };
  assert.equal(
    triedLine({ repo: '/code/app', factory: 'solo', factoryRepo: null, error: null, tried: refused }, 'then'),
    'Not started at then: no workflow gone in /code/app/workflows. It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again.',
  );
  assert.equal(
    triedLine({ repo: null, factory: 'solo', factoryRepo: null, error: null, tried: refused }, 'then'),
    'Not started at then on /code/app: no workflow gone in /code/app/workflows. It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again, or run the daemon in the repository it is about.',
    "a factory that picks no repository: tried on the daemon's, which may run elsewhere",
  );
  assert.equal(
    triedLine({ repo: null, factory: 'solo', factoryRepo: '/code/app', error: null, tried: refused }, 'then'),
    "Not started at then on /code/app, its factory's one repository: no workflow gone in /code/app/workflows. It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again.",
    "tried on its factory's one repository, from a daemon anywhere: no daemon is told to run elsewhere",
  );
  const unfactored = 'card.md: this card names no factory, and a card is started only in the factory named for it.';
  assert.equal(
    triedLine({ repo: null, factory: null, factoryRepo: null, error: null, tried: { ...refused, why: unfactored } }, 'then'),
    `Not started at then: ${unfactored} It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again.`,
    'a card that names no factory is refused wherever a daemon runs: no repository is named to run one in',
  );
  const gone = 'card.md: `repo: /code/gone` names no directory.';
  assert.equal(
    triedLine(
      { repo: '/code/gone', factory: null, factoryRepo: null, error: gone, tried: { ...refused, repo: '/code/gone', why: gone } },
      'then',
    ),
    'Not started at then. It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again.',
  );
  assert.equal(
    triedLine(
      {
        repo: '/code/app',
        factory: 'solo',
        factoryRepo: null,
        error: null,
        tried: { at, repo: '/code/app', why: 'git: not a git repository', refused: false },
      },
      'then',
    ),
    'Failed at then: git: not a git repository. Not a refusal: the tick tries it again on every pass, where it keeps its place.',
  );
});

test("a factory's floor says the run slots taken of the machine's cap, on this machine, and how many are queued — `no cap` with none, and the queue left out when empty", () => {
  assert.equal(capLine({ cap: 4, inFlight: ['a', 'b'] }, 3), '2 of 4 run slots taken on this machine · 3 queued');
  assert.equal(capLine({ cap: 4, inFlight: ['a', 'b'] }, 0), '2 of 4 run slots taken on this machine');
  assert.equal(capLine({ cap: 1, inFlight: [] }, 1), '0 of 1 run slots taken on this machine · 1 queued');
  assert.equal(capLine({ cap: 0, inFlight: null }, 3), 'no cap on this machine · 3 queued');
  assert.equal(capLine({ cap: 0, inFlight: null }, 0), 'no cap on this machine');
  assert.equal(capLine({ cap: 0, inFlight: ['a'] }, 0), 'no cap on this machine', 'a count with no cap is no count against one');
});

test("a card is queued by its name in the path, POST, and taken off the queue with DELETE, each sent as JSON with no body; a refusal rejects with the api's message word for word", async (t) => {
  const done = { name: 'a b', file: '/store/inbox/a b.md', was: 'queued', queued: '2026-09-16T10:00:00.000Z', place: 2, of: 2 };
  let answer = answered(200, done);
  const sent = sending(t, () => answer);
  assert.deepEqual(await queueCard('a b'), done);
  answer = answered(200, { ...done, was: 'taken back', queued: null, place: null, of: null });
  assert.equal((await queueCard('a b', { off: true })).was, 'taken back');
  assert.deepEqual(
    sent.map(({ url, init }) => [url, init?.method, new Headers(init?.headers).get('content-type'), init?.body]),
    [
      ['/api/inbox/a%20b/queue', 'POST', 'application/json', undefined],
      ['/api/inbox/a%20b/queue', 'DELETE', 'application/json', undefined],
    ],
  );

  const refusal =
    'bare.md: no workflow — a queued card starts on its own, and nothing says what runs it. Queue it with its workflow: wf inbox queue bare --workflow <w> writes both.';
  answer = answered(422, { error: refusal });
  await assert.rejects(queueCard('bare'), (err: Error) => err.message === refusal);
  answer = answered(502, 'Bad Gateway', 'Bad Gateway');
  await assert.rejects(
    queueCard('bare', { off: true }),
    (err: Error) => err.message === 'DELETE /api/inbox/bare/queue answered 502 Bad Gateway',
  );
  answer = answered(200, {});
  await assert.rejects(
    queueCard('bare'),
    (err: Error) =>
      err.message.startsWith('POST /api/inbox/bare/queue answered what this board does not read: at name, the value is missing.') &&
      /before asking again/.test(err.message),
  );
});

test('a card in a factory starts there: in the /api/runs request, the factory and its repository go in the query and the body is as before', async (t) => {
  const sent = sending(t, () => answered(201, { id: 'r', card: 'c', removed: true }, 'Created'));
  const asked = { workflow: 'good', from: 'repo' as const, brief: 'Hire', card: 'c' };
  await startRun(asked, { factory: 'hiring', repo: '/r/x' });
  assert.equal(sent[0].url, '/api/runs?factory=hiring&repo=%2Fr%2Fx');
  assert.deepEqual(JSON.parse(String(sent[0].init?.body)), asked);
  await startRun(asked, { factory: 'default', repo: '/r/x' });
  await startRun(asked);
  assert.deepEqual(
    sent.slice(1).map((s) => s.url),
    ['/api/runs', '/api/runs'],
    'the default factory, and no place, send no query',
  );
});

/** The line that files a factory, as `GET /api/store` answers it. */
const FILE_FACTORY = 'nemia factory add <name> --repo <path>';

/** A factory as the api lists it, on `repos`. */
const factoryOn = (name: string, repos: string[], error: string | null = null): Factory => ({
  name,
  default: name === 'default',
  repos,
  workflows: name === 'default' ? null : ['good'],
  hires: {},
  error,
  schedules: [],
  commands: {
    attach: `nemia factory attach ${name} <workflow>`,
    rm: `nemia factory rm ${name}`,
    add: `nemia factory add ${name} --repo <path>`,
    schedule: `nemia factory schedule ${name} <workflow> --cron <expr> --brief <text>`,
    trust: `nemia factory trust ${name}`,
  },
  untrusted: [],
  template: null,
});
const FACTORIES = [factoryOn('default', ['/code/app']), factoryOn('solo', ['/r/a']), factoryOn('pair', ['/r/a', '/r/b'])];

test("a card's place: none in the default factory; a factory's one repository filled in; the card's repo: among several, else none to pick", () => {
  assert.equal(cardPlace(entry('a', null), FACTORIES, FILE_FACTORY), null);
  assert.equal(cardPlace(entry('a', null, { factory: 'default' }), FACTORIES, FILE_FACTORY), null);
  assert.deepEqual(cardPlace(entry('a', null, { factory: 'solo' }), FACTORIES, FILE_FACTORY), {
    factory: 'solo',
    repos: ['/r/a'],
    repo: '/r/a',
  });
  assert.deepEqual(cardPlace(entry('a', null, { factory: 'pair', repo: '/r/b' }), FACTORIES, FILE_FACTORY), {
    factory: 'pair',
    repos: ['/r/a', '/r/b'],
    repo: '/r/b',
  });
  assert.deepEqual(cardPlace(entry('a', null, { factory: 'pair' }), FACTORIES, FILE_FACTORY), {
    factory: 'pair',
    repos: ['/r/a', '/r/b'],
    repo: null,
  });
});

test('REFUSED: no place for a card naming a factory the store does not list, or one whose file does not read — each says why', () => {
  assert.deepEqual(cardPlace(entry('a', null, { factory: 'gone' }), FACTORIES, FILE_FACTORY), {
    why: "The card names the factory gone, which the store does not have: file it by that name with nemia factory add <name> --repo <path>, or change the card's factory: line.",
  });
  assert.deepEqual(
    cardPlace(
      entry('a', null, { factory: 'bad' }),
      [...FACTORIES, factoryOn('bad', [], '/store/factories/bad.json is not JSON')],
      FILE_FACTORY,
    ),
    {
      why: 'The card names the factory bad, whose file does not read: /store/factories/bad.json is not JSON',
    },
  );
});

test("REFUSED: the Inbox badge counts the picked factory's cards not yet started, queued ones too; never one started, nor one that does not read", () => {
  const cards = [
    entry('waits-a1', null, { factory: 'nemia' }),
    entry('queued-b2', null, { factory: 'nemia', queued: { at: '2026-10-01T00:00:00.000Z', place: 1 } }),
    entry('started-c3', null, { factory: 'nemia', startedAs: ['r-1'] }),
    entry('broken-d4', null, { factory: 'nemia', error: 'the card has no front matter' }),
    entry('hiring-e5', null, { factory: 'hiring' }),
    entry('default-f6', null),
  ];
  const names = (picked: string | undefined) => notStarted(cards, picked).map((card) => card.name);
  assert.deepEqual(names('nemia'), ['waits-a1', 'queued-b2']);
  assert.deepEqual(names(undefined), ['waits-a1', 'queued-b2', 'hiring-e5', 'default-f6'], 'every factory under All factories');
  assert.deepEqual(names('default'), ['default-f6'], "a card naming no factory is the default factory's");
  assert.equal(names('quay').length, 0);
});

test("the Inbox badge's title says what it counts whole: in the factory picked, or in every factory", () => {
  assert.equal(inboxBadgeTitle(3, undefined), '3 cards not yet started, in every factory');
  assert.equal(inboxBadgeTitle(1, 'nemia'), '1 card not yet started, in nemia');
});

test('a card names no factory when it has no factory: line or writes default; one naming a factory is assigned', () => {
  assert.equal(unassigned({ factory: null }), true);
  assert.equal(unassigned({ factory: 'default' }), true);
  assert.equal(unassigned({ factory: 'solo' }), false);
});

test("the factories offered are the named ones whose file reads, in the api's order: never the default factory, never one that does not read", () => {
  const listed = [
    factoryOn('default', ['/code/app']),
    factoryOn('pair', ['/r/a', '/r/b']),
    factoryOn('bad', [], 'not JSON'),
    factoryOn('solo', ['/r/a']),
  ];
  assert.deepEqual(
    factoriesOffered(listed).map((f) => f.name),
    ['pair', 'solo'],
  );
  assert.equal(factoriesOffered([factoryOn('default', ['/code/app'])]).length, 0);
});

test("the box is preset to the address's factory when it is offered, else to no factory", () => {
  const offered = factoriesOffered(FACTORIES);
  assert.equal(factoryPreset('solo', offered), 'solo');
  for (const shown of ['gone', 'default', undefined]) assert.equal(factoryPreset(shown, offered), '', String(shown));
  assert.equal(factoryPreset('solo', []), '', 'shown, and not offered');
});

const SOLO = { name: 'solo', repos: ['/r/a'] };
const PAIR = { name: 'pair', repos: ['/r/a', '/r/b'] };
const GIT = { name: 'good', from: 'repo' as const, folderTeam: false };
const FOLDERS = { name: 'notes', from: 'yours' as const, folderTeam: true };

test('REFUSED: the box sends no repository a person did not choose — none with no factory, none for a factory on one repository, whatever a list held before', () => {
  assert.deepEqual(
    cardFiling({ idea: 'An idea', factory: null, repo: '/r/b', workflow: GIT }),
    { body: 'An idea' },
    'no factory: the idea alone, also when a workflow and a repository were picked under a factory chosen before',
  );
  const solo = cardFiling({ idea: 'An idea', factory: SOLO, repo: '', workflow: GIT });
  assert.deepEqual(solo, { body: 'An idea', factory: 'solo', workflow: 'good', from: 'repo' });
  assert.equal('repo' in solo, false, "a factory's only repository is the factory's to give");
  assert.equal(
    'repo' in cardFiling({ idea: 'An idea', factory: SOLO, repo: '/r/a', workflow: null }),
    false,
    'nor is it sent when a list held it under a factory chosen before: one repository offers no list',
  );
  assert.equal(
    'repo' in cardFiling({ idea: 'An idea', factory: PAIR, repo: '/r/elsewhere', workflow: null }),
    false,
    "a repository picked under another factory is none of this one's",
  );
});

test('in a factory on several repositories the box sends the one a person picked, and none with a workflow that works in folders', () => {
  assert.deepEqual(cardFiling({ idea: 'An idea', factory: PAIR, repo: '', workflow: null }), { body: 'An idea', factory: 'pair' });
  assert.deepEqual(cardFiling({ idea: 'An idea', factory: PAIR, repo: '/r/b', workflow: GIT }), {
    body: 'An idea',
    factory: 'pair',
    workflow: 'good',
    from: 'repo',
    repo: '/r/b',
  });
  assert.deepEqual(cardFiling({ idea: 'An idea', factory: PAIR, repo: '/r/b', workflow: FOLDERS }), {
    body: 'An idea',
    factory: 'pair',
    workflow: 'notes',
    from: 'yours',
  });
});

test("a card of no factory starts nowhere until a factory is picked, then in that factory's place: its one repository, or the card's repo: among several", () => {
  assert.equal(startPlace(entry('a', null), '', FACTORIES, FILE_FACTORY), null);
  assert.deepEqual(startPlace(entry('a', null), 'solo', FACTORIES, FILE_FACTORY), { factory: 'solo', repos: ['/r/a'], repo: '/r/a' });
  assert.deepEqual(startPlace(entry('a', null, { factory: 'default', repo: '/r/b/' }), 'pair', FACTORIES, FILE_FACTORY), {
    factory: 'pair',
    repos: ['/r/a', '/r/b'],
    repo: '/r/b/',
  });
  assert.deepEqual(startPlace(entry('a', null), 'pair', FACTORIES, FILE_FACTORY), { factory: 'pair', repos: ['/r/a', '/r/b'], repo: null });
});

test('REFUSED: a card about a repository the picked factory does not work on has no place there — it says why, naming both', () => {
  assert.deepEqual(startPlace(entry('a', null, { repo: '/code/app' }), 'pair', FACTORIES, FILE_FACTORY), {
    why: "The card is about /code/app, and the factory pair works on /r/a, /r/b: pick a factory that works on it, or change the card's repo: line.",
  });
});
