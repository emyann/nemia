/**
 * GET, POST and DELETE /api/inbox (inbox.ts), and POST /api/runs with `card` (workflows.ts): the inbox listed, a card filed and dropped,
 * and a card started — in a scratch store and a scratch repository, through the package's own inbox.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { app } from '../app.ts';
import {
  addFactory,
  addToInbox,
  fromNote,
  INBOX_KEY_MEANINGS,
  inboxDir,
  startFromInbox,
  runStore,
  engine,
} from 'agent-orchestrator';
import { runWith } from '../../test/placed.ts';
const repo = scratch('nemia-api-inbox-repo-');
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
execFileSync('git', ['-c', 'user.email=t@local', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });

type InboxEntry = import('./inbox.ts').InboxEntry;
type InboxCardPage = import('./inbox.ts').InboxCardPage;
type InboxFiled = import('./inbox.ts').InboxFiled;
type RunDetail = import('../detail/detail.ts').RunDetail;
/** What POST /api/runs answers a card it started (201): the run, the card, and whether the card left the inbox — and why not. */
type CardStarted = { id: string; card: string; removed: boolean; why?: string; ignoredRepo?: string };
type Refused = { error: string };

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A record of a run started from `card`, as `nemia start` writes one: a folder run with nothing filed yet, its `from` naming the card. */
const startedFrom = (id: string, card: string): string =>
  JSON.stringify({
    id,
    place: { kind: 'folder' },
    workspace: path.join(root, 'runs', id),
    brief: 'Started from its card',
    workflowDir: path.join(root, 'no-such-workflow'),
    steps: {},
    createdAt: '2026-09-16T09:00:00.000Z',
    from: { inbox: card },
  });

/** The repository's `dev`, yours `mine`, and `both`, which each has. */
const dev = path.join(repo, 'workflows', 'dev');
write(path.join(dev, 'implement.md'), '---\nplace: git\n---\nImplement it.\n');
const mine = path.join(root, 'workflows', 'mine');
write(path.join(mine, 'plan.md'), '---\nplace: git\n---\nWrite PLAN.md.\n');
write(path.join(repo, 'workflows', 'both', 'implement.md'), '---\nplace: git\n---\nImplement it.\n');
write(path.join(root, 'workflows', 'both', 'implement.md'), '---\nplace: git\n---\nImplement it my way.\n');

const inbox = path.join(root, 'inbox');
const cards = (): string[] => (fs.existsSync(inbox) ? fs.readdirSync(inbox).sort() : []);
const runFiles = (): string[] => (fs.existsSync(path.join(root, 'runs')) ? fs.readdirSync(path.join(root, 'runs')).sort() : []);
const JSON_TYPE = { 'content-type': 'application/json' };

const file = (body: unknown, headers: Record<string, string> = JSON_TYPE) =>
  app.request('/api/inbox', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
const drop = (name: string, headers: Record<string, string> = JSON_TYPE) =>
  app.request(`/api/inbox/${name}`, { method: 'DELETE', headers });
const startCard = (body: unknown, headers: Record<string, string> = JSON_TYPE) =>
  app.request('/api/runs', { method: 'POST', headers, body: JSON.stringify(body) });
const listed = async (): Promise<InboxEntry[]> => {
  const res = await app.request('/api/inbox');
  assert.equal(res.status, 200);
  return (await res.json()) as InboxEntry[];
};

/** Every card and record gone, so each test starts from an empty inbox and store. */
const clear = (): void => {
  fs.rmSync(inbox, { recursive: true, force: true });
  fs.rmSync(path.join(root, 'runs'), { recursive: true, force: true });
};

test('GET /api/inbox on a store with no inbox yet is an empty list', async () => {
  clear();
  assert.deepEqual(await listed(), []);
});

test("POST /api/inbox files a card as `nemia inbox add` does: the idea alone; a repository's workflow by name; yours as its folder; the repository it is about — and GET /api/inbox lists each with its body and when it was filed", async () => {
  clear();
  const bare = await file({ body: 'Cache the views between passes\n\nThe tick reads each task twice.' });
  assert.equal(bare.status, 201, await bare.clone().text());
  const filed = (await bare.json()) as InboxFiled;
  assert.match(filed.name, /^cache-the-views-between-pass-[a-z0-9]+$/);
  assert.deepEqual(filed, {
    name: filed.name,
    file: path.join(inboxDir(), `${filed.name}.md`),
    workflow: null,
    repo: null,
    factory: null,
    body: 'Cache the views between passes\n\nThe tick reads each task twice.',
  });
  assert.equal(
    fs.readFileSync(filed.file, 'utf8'),
    'Cache the views between passes\n\nThe tick reads each task twice.\n',
    'no frontmatter for a card that says nothing of its workflow or repository',
  );

  const named = (await (await file({ body: 'Show what a step cost', workflow: 'dev', repo })).json()) as InboxFiled;
  assert.equal(
    fs.readFileSync(named.file, 'utf8'),
    `---\nworkflow: dev\nrepo: ${repo}\n---\nShow what a step cost\n`,
    "the repository's, on a card about the api's repository: by name, as `nemia inbox add --workflow dev` writes it",
  );
  const yours = (await (await file({ body: 'Plan the inbox', workflow: 'mine' })).json()) as InboxFiled;
  assert.deepEqual(
    [yours.workflow, yours.repo],
    [mine, null],
    "yours: its folder, since a name on a card is looked for under the repository's workflows/, where yours is not",
  );
  assert.equal(
    ((await (await file({ body: 'Both, the repository', workflow: 'both', from: 'repo' })).json()) as InboxFiled).workflow,
    'both',
    "one both have, said which: the repository's by name",
  );
  assert.equal(
    ((await (await file({ body: 'Both, yours', workflow: 'both', from: 'yours' })).json()) as InboxFiled).workflow,
    path.join(root, 'workflows', 'both'),
    'one both have, said which: yours by folder',
  );
  const elsewhere = scratch('nemia-api-inbox-elsewhere-');
  assert.equal(
    ((await (await file({ body: 'Elsewhere', workflow: 'dev', repo: elsewhere })).json()) as InboxFiled).workflow,
    dev,
    "the repository's, on a card about another repository: its folder, since the name would be looked for in that one",
  );

  const old = new Date('2026-09-01T10:00:00.000Z');
  fs.utimesSync(filed.file, old, old);
  const entries = await listed();
  assert.equal(entries.length, 6);
  const bareEntry = entries.find((e) => e.name === filed.name)!;
  assert.deepEqual(
    bareEntry,
    {
      name: filed.name,
      file: `${filed.name}.md`,
      title: 'Cache the views between passes',
      workflow: null,
      repo: null,
      factory: null,
      from: [],
      startedAs: [],
      error: null,
      body: 'Cache the views between passes\n\nThe tick reads each task twice.',
      filedAt: old.toISOString(),
      factoryRepo: null,
    },
    'listed with its body and a filing time, and started as none',
  );
  const namedEntry = entries.find((e) => e.name === named.name)!;
  assert.deepEqual(
    [namedEntry.title, namedEntry.workflow, namedEntry.repo, namedEntry.body],
    ['Show what a step cost', 'dev', repo, 'Show what a step cost'],
  );
  assert.ok(Date.parse(namedEntry.filedAt!) > old.getTime());
});

test("POST /api/inbox writes an absolute repo as `nemia inbox add --repo` does — no trailing slash, no `.` or `..` — so a card's run records the repository as every other run on it does", async () => {
  clear();
  for (const given of [
    `${repo}/`,
    `${repo}//`,
    `${repo}/./`,
    `${path.dirname(repo)}/../${path.basename(path.dirname(repo))}/${path.basename(repo)}`,
  ]) {
    const res = await file({ body: `About ${given}`, workflow: 'dev', repo: given });
    assert.equal(res.status, 201, `${given}: ${await res.clone().text()}`);
    const filed = (await res.json()) as InboxFiled;
    assert.deepEqual(
      [filed.repo, filed.workflow],
      [repo, 'dev'],
      `${given}: the api's own repository once written as it is, so its workflow is written by name, as for the repository given plainly`,
    );
    assert.equal(fs.readFileSync(filed.file, 'utf8'), `---\nworkflow: dev\nrepo: ${repo}\n---\nAbout ${given}\n`, given);
  }

  const { name } = (await (await file({ body: 'Started from a slash', repo: `${repo}/` })).json()) as InboxFiled;
  const started = await startCard({ workflow: 'dev', card: name });
  assert.equal(started.status, 201, await started.clone().text());
  assert.equal(
    runStore.runs.read(((await started.json()) as CardStarted).id).repo,
    repo,
    'started, the run names the repository as the api does, so the board lists it with the runs on it',
  );
});

test('GET /api/inbox lists an entry that does not read as a card with its refusal and no body, a card started with its run, and reads the folder on each request', async () => {
  clear();
  write(path.join(inbox, 'broken.md'), '---\nafter: some-run\n---\nWait for it.\n');
  write(path.join(inbox, 'notes.txt'), 'not a card\n');
  const { card } = addToInbox({ text: 'Started, and its removal failed' });
  write(path.join(root, 'runs', 'started-run-k2q9.json'), startedFrom('started-run-k2q9', card.name));

  const entries = await listed();
  const broken = entries.find((e) => e.name === 'broken')!;
  assert.match(broken.error!, /^broken\.md: `after` is not a key an inbox card has/);
  assert.deepEqual([broken.body, broken.title, typeof broken.filedAt], [null, null, 'string']);
  const stray = entries.find((e) => e.file === 'notes.txt')!;
  assert.match(stray.error!, /^notes\.txt: not a card/);
  assert.deepEqual(entries.find((e) => e.name === card.name)!.startedAs, ['started-run-k2q9']);

  fs.rmSync(path.join(inbox, 'broken.md'));
  assert.equal(
    (await listed()).some((e) => e.name === 'broken'),
    false,
    'dropped at the command line: gone on the next request',
  );
});

/** The inbox folder as it is: each file's name and text, to show a read wrote nothing. */
const inboxFiles = (): Array<[string, string]> => cards().map((name) => [name, fs.readFileSync(path.join(inbox, name), 'utf8')]);
const cardPage = (name: string) => app.request(`/api/inbox/${name}`);

test("GET /api/inbox/:name is a card's page: the card as the inbox lists it, its file as written, and each key a card may set with its value and the package's line of what it means", async () => {
  clear();
  const text = `---\nworkflow: dev\nrepo: ${repo}\n---\n# Cache the views\n\n- between passes\n- per task\n`;
  write(path.join(inbox, 'cache-the-views-k2q9.md'), text);
  write(path.join(inbox, 'bare-idea-a1b2.md'), 'A bare idea\n');
  const before = inboxFiles();

  const res = await cardPage('cache-the-views-k2q9');
  assert.equal(res.status, 200, await res.clone().text());
  const page = (await res.json()) as InboxCardPage;
  const listedAs = (await listed()).find((e) => e.name === 'cache-the-views-k2q9')!;
  assert.deepEqual(
    { ...page, source: undefined, keys: undefined },
    { ...listedAs, source: undefined, keys: undefined },
    'the card as GET /api/inbox lists it',
  );
  assert.equal(page.body, '# Cache the views\n\n- between passes\n- per task');
  assert.equal(page.source, text, 'the file byte for byte, frontmatter included');
  assert.deepEqual(page.keys, [
    { key: 'workflow', value: 'dev', meaning: INBOX_KEY_MEANINGS.workflow },
    { key: 'repo', value: repo, meaning: INBOX_KEY_MEANINGS.repo },
    { key: 'queued', value: null, meaning: INBOX_KEY_MEANINGS.queued },
    { key: 'gate', value: null, meaning: INBOX_KEY_MEANINGS.gate },
    { key: 'factory', value: null, meaning: INBOX_KEY_MEANINGS.factory },
    { key: 'from', value: null, meaning: INBOX_KEY_MEANINGS.from },
  ]);

  const bare = (await (await cardPage('bare-idea-a1b2')).json()) as InboxCardPage;
  assert.deepEqual([bare.body, bare.source], ['A bare idea', 'A bare idea\n']);
  assert.deepEqual(
    bare.keys,
    [
      { key: 'workflow', value: null, meaning: INBOX_KEY_MEANINGS.workflow },
      { key: 'repo', value: null, meaning: INBOX_KEY_MEANINGS.repo },
      { key: 'queued', value: null, meaning: INBOX_KEY_MEANINGS.queued },
      { key: 'gate', value: null, meaning: INBOX_KEY_MEANINGS.gate },
      { key: 'factory', value: null, meaning: INBOX_KEY_MEANINGS.factory },
      { key: 'from', value: null, meaning: INBOX_KEY_MEANINGS.from },
    ],
    'a card that sets no key: every key, none set',
  );

  write(path.join(inbox, 'broken.md'), '---\ncolour: red\n---\nPaint it.\n');
  const broken = (await (await cardPage('broken')).json()) as InboxCardPage;
  assert.match(broken.error!, /^broken\.md: `colour` is not a key an inbox card has/);
  assert.deepEqual(
    [broken.body, broken.source, broken.keys],
    [null, '---\ncolour: red\n---\nPaint it.\n', null],
    'an entry that does not read as a card: its refusal and its file, and no keys to lay out',
  );

  fs.rmSync(path.join(inbox, 'broken.md'));
  assert.deepEqual(inboxFiles(), before, 'read, and nothing written');
});

test("REFUSED at shipped defaults: a card's page for a name that is not a card's is a 400, and for a card that is not there a 404 — and nothing is read outside the inbox or written", async () => {
  clear();
  const { card } = addToInbox({ text: 'Keep this one' });
  write(path.join(root, 'runs', 'r-1.json'), '{"id":"r-1"}');
  const before = inboxFiles();

  for (const sent of ['.hidden', '..%2Fruns%2Fr-1', 'a%2Fb', 'a%5Cb']) {
    const res = await cardPage(sent);
    assert.equal(res.status, 400, sent);
    const { error } = (await res.json()) as Refused;
    assert.ok(!JSON.stringify(error).includes('"id":"r-1"'), `${sent}: nothing of the file it names`);
  }
  const missing = await cardPage('no-such-card');
  assert.equal(missing.status, 404);
  const withMd = await cardPage(`${card.name}.md`);
  assert.equal(withMd.status, 404);

  assert.deepEqual(inboxFiles(), before);
  fs.rmSync(path.join(root, 'runs'), { recursive: true, force: true });
});

test("REFUSED at shipped defaults: a card's page for a name that is not there, in an inbox holding more than cards, names the cards as the package does — a card that does not read among them, a stray file and a folder not — and a card is found before a stray file of its name", async () => {
  clear();
  const { card } = addToInbox({ text: 'Keep this one' });
  write(path.join(inbox, 'broken.md'), '---\ncolour: red\n---\nPaint it.\n');
  write(path.join(inbox, 'notes.txt'), 'not a card\n');
  fs.mkdirSync(path.join(inbox, 'sub'));
  assert.deepEqual(
    (await listed()).map((e) => e.name).sort(),
    ['broken', card.name, 'notes.txt', 'sub/'].sort(),
    'the listing has all four',
  );

  const missing = await cardPage('no-such-card');
  assert.equal(missing.status, 404);
  const { error } = (await missing.json()) as Refused;
  const dropped = await drop('no-such-card');
  assert.equal(dropped.status, 404);
  assert.equal(
    error,
    ((await dropped.json()) as Refused).error,
    "the sentence `nemia inbox rm` gives for the same name, word for word: the package's own list of cards",
  );
  assert.ok(!error.includes('notes.txt') && !error.includes('sub/'), error);

  write(path.join(inbox, 'notes'), 'a stray file\n');
  write(path.join(inbox, 'notes.md'), '---\nworkflow: dev\n---\nThe card called notes\n');
  const notes = (await (await cardPage('notes')).json()) as InboxCardPage;
  assert.deepEqual(
    [notes.file, notes.body, notes.source, notes.keys?.[0]?.value],
    ['notes.md', 'The card called notes', '---\nworkflow: dev\n---\nThe card called notes\n', 'dev'],
    "notes.md and a stray notes both list as notes: the page is the card's",
  );
  const stray = (await (await cardPage('notes.txt')).json()) as InboxCardPage;
  assert.deepEqual(
    [stray.body, stray.source, stray.keys],
    [null, 'not a card\n', null],
    'a stray file with no card of its name has a page all the same: its refusal and its text',
  );
  assert.match(stray.error!, /^notes\.txt: not a card/);
});

test("REFUSED at shipped defaults: a filing of the wrong shape is a 400 in the api's words, a workflow nobody has a 404, one both have a 409 — before anything is written", async () => {
  clear();
  for (const body of ['not json', '[]', '"an idea"']) {
    const res = await file(body);
    assert.equal(res.status, 400, body);
    assert.ok(((await res.json()) as Refused).error.startsWith('POST /api/inbox takes a JSON'), body);
  }
  for (const idea of [undefined, 42, null, ['an idea']]) {
    const res = await file({ body: idea });
    assert.equal(res.status, 400, JSON.stringify(idea));
    assert.ok(
      ((await res.json()) as Refused).error.startsWith('`body` is the idea, as `nemia inbox add "<idea>"` takes it: text.'),
      JSON.stringify(idea),
    );
  }
  for (const workflow of ['', 42, '../workflows/dev', '/tmp/dev', 'dev/implement.md', 'a\\b']) {
    const res = await file({ body: 'An idea', workflow });
    assert.equal(res.status, 400, JSON.stringify(workflow));
    assert.ok(
      ((await res.json()) as Refused).error.startsWith('`workflow` names what runs the card'),
      `${JSON.stringify(workflow)}: a name, as the workflows are listed, never a path, which a card would carry to a start from the command line`,
    );
  }
  const from = await file({ body: 'An idea', workflow: 'dev', from: 'elsewhere' });
  assert.equal(from.status, 400);
  assert.ok(((await from.json()) as Refused).error.startsWith("`from` is where the card's workflow is read from"));
  const alone = await file({ body: 'An idea', from: 'repo' });
  assert.equal(alone.status, 400);
  assert.ok(((await alone.json()) as Refused).error.includes('names no `workflow`'));
  for (const about of [42, null, ['/tmp']]) {
    const res = await file({ body: 'An idea', repo: about });
    assert.equal(res.status, 400, JSON.stringify(about));
    assert.ok(((await res.json()) as Refused).error.startsWith('`repo` is the repository the idea is about'), JSON.stringify(about));
  }

  const unknown = await file({ body: 'An idea', workflow: 'nope' });
  assert.equal(unknown.status, 404);
  assert.ok(((await unknown.json()) as Refused).error.startsWith("No workflow 'nope' in "));
  write(path.join(repo, 'workflows', '.draft', 'implement.md'), '---\nplace: git\n---\nImplement it.\n');
  assert.equal(
    (await file({ body: 'An idea', workflow: '.draft' })).status,
    404,
    'found among the folders, never joined: a hidden folder is none of them',
  );
  const both = await file({ body: 'An idea', workflow: 'both' });
  assert.equal(both.status, 409);
  assert.ok(((await both.json()) as Refused).error.startsWith("Both the repository and yours have a workflow named 'both'"));

  assert.deepEqual(cards(), []);
});

/** What the package refuses `text`, `workflow` and `repo` with, filed by its own function. */
const packageRefusal = (opts: { text: string; workflow?: string; repo?: string }): string => {
  try {
    addToInbox(opts);
  } catch (err) {
    assert.equal((err as { exitCode?: unknown }).exitCode, 2);
    return (err as Error).message;
  }
  return assert.fail(`${JSON.stringify(opts)} was filed, and should have been refused`);
};

test("REFUSED at shipped defaults: what the package refuses to file is a 422 carrying its sentence word for word — an idea with nothing in it, a relative repo, one naming no directory, a repo on two lines, an `after:` in the idea's frontmatter — and nothing is written", async () => {
  clear();
  const cases: Array<{ body: string; repo?: string }> = [
    { body: '' },
    { body: '  \n\t' },
    { body: 'An idea', repo: 'code/myapp' },
    { body: 'An idea', repo: path.join(repo, 'not-there') },
    { body: 'An idea', repo: `${repo}\n${repo}` },
    { body: '---\nafter: some-run\n---\nWait for it.' },
  ];
  for (const asked of cases) {
    const expected = packageRefusal({ text: asked.body, ...(asked.repo !== undefined ? { repo: asked.repo } : {}) });
    const res = await file(asked);
    assert.equal(res.status, 422, JSON.stringify(asked));
    assert.equal(((await res.json()) as Refused).error, expected, JSON.stringify(asked));
  }
  assert.deepEqual(cards(), []);
});

test('DELETE /api/inbox/:name drops a card as `nemia inbox rm` does, and leaves the others', async () => {
  clear();
  const kept = addToInbox({ text: 'Keep this one' });
  const gone = addToInbox({ text: 'Drop this one' });
  const res = await drop(gone.card.name);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { removed: true, file: gone.file });
  assert.deepEqual(cards(), [`${kept.card.name}.md`]);
});

test("REFUSED at shipped defaults: a drop of a card that is not there is a 404, and of a name that is not a card's a 400 — and nothing is removed", async () => {
  clear();
  const { card } = addToInbox({ text: 'Keep this one' });

  const missing = await drop('no-such-card');
  assert.equal(missing.status, 404);
  const withMd = await drop(`${card.name}.md`);
  assert.equal(withMd.status, 404);

  for (const sent of ['.hidden', '..%2Fruns%2Fr-1', 'a%2Fb', 'a%5Cb']) {
    const res = await drop(sent);
    assert.equal(
      res.status,
      400,
      `${sent}: a hidden name, or a name with a slash sent encoded, which the route decodes, is refused before the inbox is read`,
    );
  }
  assert.deepEqual(cards(), [`${card.name}.md`]);
});


test('POST /api/runs with `card` starts the card through the package: the brief as the person edited it, the workflow the api found, `after` — the record carries `from`, and the card leaves the inbox', async () => {
  clear();
  const { card } = addToInbox({ text: 'Show what a step cost\n\nOn the run page.', workflow: 'mine', repo });
  const other = addToInbox({ text: 'Another idea' });
  const parent = await runWith(
    engine(),
    startFromInbox({ name: other.card.name, callerRepo: repo, workflow: dev, brief: 'A run to wait on' }),
  );
  assert.equal(parent.removed, true);

  const res = await startCard({
    workflow: 'dev',
    from: 'repo',
    card: card.name,
    brief: "  Show each step's cost beside its status, in dollars.\n",
    after: [parent.run.id],
  });
  assert.equal(res.status, 201, await res.clone().text());
  const answered = (await res.json()) as CardStarted;
  assert.deepEqual(answered, { id: answered.id, card: card.name, removed: true });
  assert.equal(res.headers.get('location'), `/api/runs/${answered.id}`);

  const run = runStore.runs.read(answered.id);
  assert.deepEqual(
    { from: run.from, brief: run.brief, workflowDir: run.workflowDir, repo: run.repo, after: run.after },
    {
      from: { inbox: card.name },
      brief: "Show each step's cost beside its status, in dollars.",
      workflowDir: dev,
      repo,
      after: [parent.run.id],
    },
    "the workflow the start named, over the card's own: the form's is preset from the card, and changeable",
  );
  assert.deepEqual(cards(), [], 'the card left the inbox');
  assert.equal((await listed()).length, 0);

  const { card: plain } = addToInbox({ text: 'Keep the brief\n\nAs the card says it.' });
  const bodied = await startCard({ workflow: 'mine', card: plain.name });
  assert.equal(bodied.status, 201, await bodied.clone().text());
  const bodiedRun = runStore.runs.read(((await bodied.json()) as CardStarted).id);
  assert.deepEqual(
    [bodiedRun.brief, bodiedRun.workflowDir, bodiedRun.from],
    ['Keep the brief\n\nAs the card says it.', mine, { inbox: plain.name }],
    "a brief left out is the card's body",
  );
});

test(
  "POST /api/runs with `card` whose removal fails still starts: 201 with `removed: false` and the package's why, the record written, the card listed as started — and refused a second start until it is dropped",
  { skip: process.getuid?.() === 0 ? 'root removes a file from a read-only folder all the same' : false },
  async () => {
    clear();
    const { card, file: cardFile } = addToInbox({ text: 'Stays in the inbox' });
    fs.chmodSync(inbox, 0o555);
    try {
      const res = await startCard({ workflow: 'dev', card: card.name });
      assert.equal(res.status, 201, await res.clone().text());
      const answered = (await res.json()) as CardStarted;
      assert.deepEqual(Object.keys(answered).sort(), ['card', 'id', 'removed', 'why']);
      assert.deepEqual([answered.card, answered.removed], [card.name, false]);
      assert.ok(answered.why?.startsWith(`${cardFile} could not be removed — `), answered.why);
      assert.deepEqual(runStore.runs.read(answered.id).from, { inbox: card.name });
      assert.deepEqual(cards(), [`${card.name}.md`], 'the card is still there');
      assert.deepEqual((await listed()).find((e) => e.name === card.name)?.startedAs, [answered.id]);

      const again = await startCard({ workflow: 'dev', card: card.name });
      assert.equal(again.status, 409);
      assert.ok(((await again.json()) as Refused).error.includes(`this card was started as ${answered.id}`));
    } finally {
      fs.chmodSync(inbox, 0o755);
    }
    assert.equal((await drop(card.name)).status, 200);
    assert.deepEqual(cards(), []);
  },
);

test("GET /api/runs/:id says a run came from a card — the record's `from`, and `nemia decide`'s sentence for it — and a run started without one carries neither", async () => {
  clear();
  const { card } = addToInbox({ text: 'Say where a run came from' });
  const started = await startCard({ workflow: 'dev', card: card.name });
  assert.equal(started.status, 201, await started.clone().text());
  const { id } = (await started.json()) as CardStarted;
  const res = await app.request(`/api/runs/${id}`);
  assert.equal(res.status, 200, await res.clone().text());
  const detail = (await res.json()) as RunDetail;
  assert.deepEqual(detail.from, { inbox: card.name });
  assert.equal(detail.fromNote, fromNote(runStore.runs.read(id)));
  assert.equal(detail.fromNote, `from inbox card ${card.name}`);

  const typed = await startCard({ workflow: 'dev', brief: 'Typed, not parked' });
  assert.equal(typed.status, 201, await typed.clone().text());
  const typedId = ((await typed.json()) as { id: string }).id;
  const plain = (await (await app.request(`/api/runs/${typedId}`)).json()) as RunDetail;
  assert.equal(plain.id, typedId);
  assert.deepEqual(
    ['from' in plain, 'fromNote' in plain],
    [false, false],
    "typed at the board's start, as at `nemia start`: no card, so no `from`, absent and not null, and no sentence",
  );
});

/** What `startFromInbox` refuses `name` with, asked as the route asks it. */
const startRefusal = async (name: string, extra: { brief?: string; after?: string[] } = {}): Promise<string> => {
  try {
    await runWith(engine(), startFromInbox({ name, callerRepo: repo, workflow: dev, ...extra }));
  } catch (err) {
    assert.equal((err as { exitCode?: unknown }).exitCode, 2);
    return (err as Error).message;
  }
  return assert.fail(`${name} started, and should have been refused`);
};

test("REFUSED at shipped defaults: a `card` that is not there is a 404 carrying the package's sentence word for word — and nothing is written", async () => {
  clear();
  const { card } = addToInbox({ text: 'The card that is there' });
  const expected = await startRefusal('no-such-card');
  assert.ok(expected.startsWith(`no card no-such-card in the inbox. Its cards are: ${card.name}.`), expected);

  const res = await startCard({ workflow: 'dev', card: 'no-such-card', brief: 'Do it.' });
  assert.equal(res.status, 404);
  assert.equal(((await res.json()) as Refused).error, expected);
  const withMd = await startCard({ workflow: 'dev', card: `${card.name}.md`, brief: 'Do it.' });
  assert.equal(withMd.status, 404);
  assert.deepEqual(runFiles(), []);
  assert.deepEqual(cards(), [`${card.name}.md`]);
});

test("REFUSED at shipped defaults: a card started already is a 409, a blank brief, a card that does not read and a run it cannot wait on are 422s — and nothing is written or removed", async () => {
  clear();
  const { card: started } = addToInbox({ text: 'Started once' });
  write(path.join(root, 'runs', 'started-once-k2q9.json'), startedFrom('started-once-k2q9', started.name));
  const { card } = addToInbox({ text: 'Not started' });
  write(path.join(inbox, 'broken.md'), '---\nafer: dev\n---\nMisspelt.\n');
  const before = runFiles();

  const again = await startCard({ workflow: 'dev', card: started.name, brief: 'Do it again.' });
  assert.equal(again.status, 409);
  const { error: startedError } = (await again.json()) as Refused;
  assert.ok(startedError.includes('this card was started as started-once-k2q9'), startedError);

  for (const brief of ['', '  \n']) {
    const res = await startCard({ workflow: 'dev', card: card.name, brief });
    assert.equal(res.status, 422, JSON.stringify(brief));
  }

  const broken = await startCard({ workflow: 'dev', card: 'broken', brief: 'Do it.' });
  assert.equal(broken.status, 422);

  const waits = await startCard({ workflow: 'dev', card: card.name, brief: 'Wait for it.', after: ['no-such-run'] });
  assert.equal(waits.status, 422);
  assert.equal(
    ((await waits.json()) as Refused).error,
    '--after no-such-run: the store has no run no-such-run. --after takes a run this one waits on, by its id — nemia ls lists them.',
  );

  assert.deepEqual(runFiles(), before);
  assert.deepEqual(cards(), [`${card.name}.md`, 'broken.md', `${started.name}.md`].sort());
});

test("REFUSED at shipped defaults: a card whose `repo:` is a folder a run cannot branch from — no git checkout, no commit, or a `.worktreeinclude` that is a directory — is a 422 in the place's words, and nothing is written or removed", async () => {
  clear();
  const plain = scratch('nemia-api-inbox-plain-');
  const empty = scratch('nemia-api-inbox-empty-');
  execFileSync('git', ['init', '-q'], { cwd: empty });
  const odd = scratch('nemia-api-inbox-odd-');
  execFileSync('git', ['init', '-q'], { cwd: odd });
  execFileSync('git', ['-c', 'user.email=t@local', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: odd });
  fs.mkdirSync(path.join(odd, '.worktreeinclude'));
  for (const [about, words] of [
    [plain, `${plain} is not a git repository: run git init there and commit once, or name a repository with --repo`],
    [empty, `${empty} has no commit yet, so a run has nothing to start from: commit once there, then start again`],
    [odd, `${path.join(odd, '.worktreeinclude')} is not a file: write it as a file, one gitignored path per line, or remove it`],
  ]) {
    const { card } = addToInbox({ text: 'Not a repository', repo: about });
    const res = await startCard({ workflow: 'dev', card: card.name, brief: 'Do it.' });
    assert.equal(res.status, 422, about);
    assert.equal(((await res.json()) as Refused).error, words);
    assert.deepEqual(runFiles(), [], 'no run written');
    assert.deepEqual(cards(), [`${card.name}.md`], 'the card stays');
    clear();
  }
});

test("a card whose start fails without a refusal — its repository's `.worktreeinclude` a link to itself, which its place's open cannot read, say — fails as the queue tries it again: a 500 in the failure's words, said on stderr, and nothing is written or removed", async (t) => {
  clear();
  const odd = scratch('nemia-api-inbox-odd-');
  execFileSync('git', ['init', '-q'], { cwd: odd });
  execFileSync('git', ['-c', 'user.email=t@local', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: odd });
  fs.symlinkSync('.worktreeinclude', path.join(odd, '.worktreeinclude'));
  const said = t.mock.method(console, 'error', () => {});
  const { card } = addToInbox({ text: 'Its include file is a link to itself', repo: odd });
  let failure: (Error & { exitCode?: unknown }) | undefined;
  try {
    await runWith(engine(), startFromInbox({ name: card.name, callerRepo: repo, workflow: dev }));
  } catch (err) {
    failure = err as Error & { exitCode?: unknown };
  }
  assert.ok(
    failure && failure.exitCode !== 2 && failure.message.startsWith("the place's open was not heard: open threw before it answered: ELOOP"),
    failure?.message,
  );
  const res = await startCard({ workflow: 'dev', card: card.name, brief: 'Do it.' });
  assert.equal(res.status, 500);
  assert.equal(((await res.json()) as Refused).error, failure.message);
  assert.deepEqual(runFiles(), [], 'no run written');
  assert.deepEqual(cards(), [`${card.name}.md`], 'the card stays');
  const errors = said.mock.calls.filter((call) => call.arguments[0] instanceof Error);
  assert.equal(errors.length, 1, 'the failure said once on stderr');
  const lines = said.mock.calls.filter((call) => typeof call.arguments[0] === 'string').map((call) => String(call.arguments[0]));
  assert.equal(lines.length, 1, `beside it, the request's own line at Error: ${JSON.stringify(lines)}`);
  assert.match(lines[0], /^\d\d:\d\d:\d\d {2}POST \/api\/runs 500 \d+ms$/);
});

test("REFUSED at shipped defaults: a `card` that is not a card's name is a 400, and one that is not text or with a brief that is not a 400 in the api's — before any workflow is looked for", async () => {
  clear();
  const { card } = addToInbox({ text: 'Keep this one' });
  for (const name of ['', '.hidden', '../runs/r-1', 'a/b', '..']) {
    const res = await startCard({ workflow: 'nope', card: name, brief: 'Do it.' });
    assert.equal(res.status, 400, `${JSON.stringify(name)}: refused before the workflow nobody has`);
  }
  for (const name of [42, null, ['a']]) {
    const res = await startCard({ workflow: 'nope', card: name, brief: 'Do it.' });
    assert.equal(res.status, 400, JSON.stringify(name));
    assert.ok(
      ((await res.json()) as Refused).error.startsWith('`card` names the inbox card to start, as `nemia inbox` lists it'),
      JSON.stringify(name),
    );
  }
  for (const brief of [42, null]) {
    const res = await startCard({ workflow: 'dev', card: card.name, brief });
    assert.equal(res.status, 400, JSON.stringify(brief));
    assert.ok(
      ((await res.json()) as Refused).error.startsWith("`brief` is what the run is asked to do in place of the card's body"),
      JSON.stringify(brief),
    );
  }
  const unknown = await startCard({ workflow: 'nope', card: card.name });
  assert.equal(unknown.status, 404, "the workflow is still the api's to find, among its folders");
  assert.deepEqual(runFiles(), []);
  assert.deepEqual(cards(), [`${card.name}.md`]);
});

test('REFUSED at shipped defaults: a card start another site could make is refused by the guard before its body is read — so the card stays', async () => {
  clear();
  const { card } = addToInbox({ text: 'Keep this one' });
  const body = { workflow: 'dev', card: card.name, brief: 'Do it.' };
  const site = await startCard(body, { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' });
  assert.equal(site.status, 403);
  assert.deepEqual(runFiles(), []);
  assert.deepEqual(cards(), [`${card.name}.md`], 'the card a start would have taken off the inbox is still on it');
});

/**
 * Two repositories that are not the api's, each with a `dev`, the second with a `solo` the first has not: `mill` works on the first,
 * `pair` on both.
 */
const first = scratch('nemia-api-inbox-first-');
const second = scratch('nemia-api-inbox-second-');
for (const cwd of [first, second]) execFileSync('git', ['init', '-q', '-b', 'main'], { cwd });
write(path.join(first, 'workflows', 'dev', 'implement.md'), '---\nplace: git\n---\nImplement it here.\n');
write(path.join(second, 'workflows', 'dev', 'implement.md'), '---\nplace: git\n---\nImplement it there.\n');
write(path.join(second, 'workflows', 'solo', 'implement.md'), '---\nplace: git\n---\nImplement it alone.\n');
addFactory({ name: 'mill', repos: [first] });
addFactory({ name: 'pair', repos: [first, second] });


test('POST /api/inbox with `factory` files the card in it, as `nemia inbox add --factory` does: its `factory:` key, its workflow as a start in the factory finds it, and no `repo:` nobody sent — and GET /api/inbox lists it with its factory', async () => {
  clear();
  const res = await file({ body: 'Mill the views', factory: 'mill', workflow: 'dev', from: 'repo' });
  assert.equal(res.status, 201, await res.clone().text());
  const filed = (await res.json()) as InboxFiled;
  assert.deepEqual([filed.factory, filed.workflow, filed.repo], ['mill', 'dev', null]);
  assert.equal(
    fs.readFileSync(filed.file, 'utf8'),
    '---\nworkflow: dev\nfactory: mill\n---\nMill the views\n',
    "the factory's one repository is its own to give at start: the card writes no repo: line",
  );
  const entry = (await listed()).find((e) => e.name === filed.name)!;
  assert.deepEqual([entry.factory, entry.repo, entry.workflow], ['mill', null, 'dev']);

  const idea = (await (await file({ body: 'Mill it later', factory: 'mill' })).json()) as InboxFiled;
  assert.equal(fs.readFileSync(idea.file, 'utf8'), '---\nfactory: mill\n---\nMill it later\n', 'a factory and no workflow');
  const yours = (await (await file({ body: 'Mill mine', factory: 'mill', workflow: 'mine' })).json()) as InboxFiled;
  assert.equal(yours.workflow, mine, 'yours: by its folder, in a factory as out of one');

  const none = (await (await file({ body: 'No factory' })).json()) as InboxFiled;
  assert.equal(none.factory, null, 'a filing with no factory answers none');
  assert.equal(fs.readFileSync(none.file, 'utf8'), 'No factory\n');
});

test('POST /api/inbox in a factory on several repositories writes `repo:` only when one was sent, and a workflow only one of them has by its folder', async () => {
  clear();
  const sent = (await (await file({ body: 'There', factory: 'pair', workflow: 'dev', repo: `${second}/` })).json()) as InboxFiled;
  assert.equal(
    fs.readFileSync(sent.file, 'utf8'),
    `---\nworkflow: dev\nrepo: ${second}\nfactory: pair\n---\nThere\n`,
    'the repository sent, resolved, and its workflow by name',
  );
  const found = (await (await file({ body: 'Alone', factory: 'pair', workflow: 'solo' })).json()) as InboxFiled;
  assert.deepEqual(
    [found.workflow, found.repo],
    [path.join(second, 'workflows', 'solo'), null],
    'no repository sent: none written, and the one folder found is written whole, so a start on either repository finds it',
  );
  const bare = (await (await file({ body: 'Bare', factory: 'pair' })).json()) as InboxFiled;
  assert.deepEqual([bare.factory, bare.repo, bare.workflow], ['pair', null, null]);
});

test('REFUSED at shipped defaults: a `factory` that is not text, or is `default`, is a 400 naming the key — and no card is written', async () => {
  clear();
  for (const factory of [7, null, ['mill']]) {
    const res = await file({ body: 'An idea', factory });
    assert.equal(res.status, 400, JSON.stringify(factory));
    assert.ok(
      ((await res.json()) as Refused).error.startsWith('`factory` names the factory the card is filed in'),
      JSON.stringify(factory),
    );
  }
  const res = await file({ body: 'An idea', factory: 'default' });
  assert.equal(res.status, 400);
  assert.equal(
    ((await res.json()) as Refused).error,
    '`factory` names the factory the card is filed in, and `default` is none to file into: it holds what names no factory. Leave `factory` out for a card that gets its factory when it is started.',
  );
  assert.deepEqual(cards(), []);
});

test("REFUSED at shipped defaults: a `factory` the store does not have is a 404, and a name that is no slug a 422, the 404 naming the factories there are — and no card is written", async () => {
  clear();
  const unknown = await file({ body: 'An idea', factory: 'nobody' });
  assert.equal(unknown.status, 404);
  const said = ((await unknown.json()) as Refused).error;
  assert.ok(said.endsWith('Its factories are: mill, pair. Nothing was filed.'), said);
  const slug = await file({ body: 'An idea', factory: 'Not A Slug' });
  assert.equal(slug.status, 422);
  assert.deepEqual(cards(), []);
});

test("REFUSED at shipped defaults: a `repo` that is none of the factory's is a 422 naming those it works on, and a workflow two of its repositories have, with no `repo`, a 409 naming `repo` — and no card is written", async () => {
  clear();
  const outside = await file({ body: 'An idea', factory: 'mill', repo: second });
  assert.equal(outside.status, 422);
  assert.equal(
    ((await outside.json()) as Refused).error,
    `${second}: the factory mill works on ${first}, and this repository is not one of them. Send one of them as \`repo\`, or leave it out. Nothing was filed.`,
  );
  const relative = await file({ body: 'An idea', factory: 'mill', repo: 'code/myapp' });
  assert.equal(relative.status, 422, 'a relative path is none of them either');
  const two = await file({ body: 'An idea', factory: 'pair', workflow: 'dev' });
  assert.equal(two.status, 409);
  assert.equal(
    ((await two.json()) as Refused).error,
    `The factory pair works on ${[first, second].join(', ')}, and more than one has a workflow named 'dev' (${path.join(first, 'workflows', 'dev')} and ${path.join(second, 'workflows', 'dev')}). Say which with \`"repo": "<one of them>"\`.`,
  );
  const nowhere = await file({ body: 'An idea', factory: 'pair', workflow: 'nope' });
  assert.equal(nowhere.status, 404);
  assert.ok(((await nowhere.json()) as Refused).error.startsWith("No workflow 'nope' in "));
  assert.deepEqual(cards(), []);
});
