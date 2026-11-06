/**
 * The Card's list, create and delete (`GET /api/cards`, `POST` and `DELETE /api/namespaces/:namespace/cards…`, objects/cards.ts), a card
 * read alone (`GET /api/cards/:name`), and POST /api/runs with `card` (workflows.ts): a story of cards filed, listed and dropped, one
 * table of what those refuse; a story of a card started, one table of what a start refuses, and two starts that fail their own way — in a
 * scratch store and a scratch repository, through the package's own inbox.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { story } from '../../test/checkpoints.ts';
import { app } from '../app.ts';
import { addFactory, addToInbox, fromNote, inboxDir, startFromInbox, runStore, engine, StoreRoot } from 'agent-orchestrator';
import { runWith } from '../../test/builtin-place.ts';
import { objectOf, linesOf } from '../../test/run-reads.ts';
import { names } from '../../test/named.ts';
import { Effect } from 'effect';
import type { Card, CardList } from 'objects';

/** `program`, one of the package's inbox verbs, run on the harness's store (`root`): its refusal thrown as itself. */
const onStore = <A, E>(program: Effect.Effect<A, E>): A => Effect.runSync(Effect.provideService(program, StoreRoot, root));
const repo = scratch('nemia-api-inbox-repo-');
process.env.HKB_REPO = repo;
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
execFileSync('git', ['-c', 'user.email=t@local', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });

/** A card filed, as a test reads the Card the create answers: its name, its file, the keys it writes, and its body. */
type Filed = { name: string; file: string; workflow: string | null; repo: string | null; factory: string | null; body: string };
/** What POST /api/runs answers a card it started (201): the run and the card, which stays in the inbox. */
type CardStarted = { id: string; card: string; ignoredRepo?: string };
type Refused = { error: string };

/** Rows ordered by their first cell, a card's name. */
const byName = (a: unknown[], b: unknown[]): number => String(a[0]).localeCompare(String(b[0]));

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

/** The factory a card's namespace names: none for `default`. */
const factoryOf = (c: Card): string | null =>
  c.metadata.namespace === undefined || c.metadata.namespace === 'default' ? null : c.metadata.namespace;

/** The namespace a filing is sent to: the factory it names, where it names one by text, else `default`. */
const namespaceOf = (body: unknown): string =>
  typeof body === 'object' && body !== null && 'factory' in body && typeof body.factory === 'string' && body.factory !== 'default'
    ? body.factory
    : 'default';

/** A card filed by the Card's create, in the namespace its `factory` names. */
const file = (body: unknown, headers: Record<string, string> = JSON_TYPE) =>
  app.request(`/api/namespaces/${encodeURIComponent(namespaceOf(body))}/cards`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
/** The Card a create answered, as a test reads it (`Filed`). */
const filedFrom = async (res: Response): Promise<Filed> => {
  const c = (await res.json()) as Card;
  return {
    name: c.metadata.name,
    file: path.join(inboxDir(), `${c.metadata.name}.md`),
    workflow: c.spec.workflow ?? null,
    repo: c.spec.repo ?? null,
    factory: factoryOf(c),
    body: c.spec.body ?? '',
  };
};
const drop = (name: string, headers: Record<string, string> = JSON_TYPE) =>
  app.request(`/api/namespaces/default/cards/${name}`, { method: 'DELETE', headers });
/** A start: of the card `card` names at the Card's own `start`, the rest of the body its; or of a run from a brief, with no card. */
const startCard = ({ card, ...body }: { card?: string } & Record<string, unknown>, headers: Record<string, string> = JSON_TYPE) =>
  app.request(card === undefined ? '/api/namespaces/default/runs' : `/api/namespaces/default/cards/${card}/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
/** A Card as the list answers it, in the keys a card's page says it by. */
const entryOf = (c: Card) => ({
  name: c.metadata.name,
  title: c.status.title ?? null,
  workflow: c.spec.workflow ?? null,
  repo: c.spec.repo ?? null,
  factory: factoryOf(c),
  from: c.spec.from ?? [],
  startedAs: c.status.runs,
  state: c.status.state,
  error: c.status.error ?? null,
  body: c.spec.body ?? null,
  filedAt: c.metadata.creationTimestamp,
  labels: c.metadata.labels ?? {},
});
type Entry = ReturnType<typeof entryOf>;
const listed = async (address = '/api/cards'): Promise<Entry[]> => {
  const res = await app.request(address);
  assert.equal(res.status, 200, `${address}: ${await res.clone().text()}`);
  return ((await res.json()) as CardList).items.map(entryOf);
};

/** Every card and record gone, so each test starts from an empty inbox and store. */
const clear = (): void => {
  fs.rmSync(inbox, { recursive: true, force: true });
  fs.rmSync(path.join(root, 'runs'), { recursive: true, force: true });
};

/** The inbox folder as it is: each file's name and text, to show a read wrote nothing. */
const inboxFiles = (): Array<[string, string]> => cards().map((name) => [name, fs.readFileSync(path.join(inbox, name), 'utf8')]);
/** One card read by its name in whichever factory holds it (`GET /api/cards/:name`): the Card with its file as written. */
const cardPage = (name: string) => app.request(`/api/cards/${name}`);

/** What the package refuses `text`, `workflow` and `repo` with, filed by its own function. */
const packageRefusal = (opts: { text: string; workflow?: string; repo?: string }): string => {
  try {
    onStore(addToInbox(opts));
  } catch (err) {
    assert.equal((err as { exitCode?: unknown }).exitCode, 2);
    return (err as Error).message;
  }
  return assert.fail(`${JSON.stringify(opts)} was filed, and should have been refused`);
};

test('a person starts a card: the run carries where it came from, and the card stays in the inbox, listed as started', async (t) => {
  const s = story(t);
  await s.test(
    'POST /api/runs with `card` starts the card through the package: the brief as the person edited it, the workflow the api found, `after` — the record carries `from`, and the card stays, listed as started',
    async () => {
      clear();
      const { card } = onStore(addToInbox({ text: 'Show what a step cost\n\nOn the run page.', workflow: 'mine', repo }));
      const other = onStore(addToInbox({ text: 'Another idea' }));
      const parent = await runWith(
        engine(),
        startFromInbox({ name: other.card.name, callerRepo: repo, workflow: dev, brief: 'A run to wait on' }),
      );

      const res = await startCard({
        workflow: 'dev',
        from: 'repo',
        card: card.name,
        brief: "  Show each step's cost beside its status, in dollars.\n",
        after: [parent.run.id],
      });
      assert.equal(res.status, 201, await res.clone().text());
      const answered = (await res.json()) as CardStarted;
      assert.deepEqual(answered, { id: answered.id, card: card.name }, 'the answer says no removal: the card is kept');
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
      assert.deepEqual(
        (await listed()).map((e) => [e.name, e.state, e.startedAs]).sort(byName),
        [
          [card.name, 'running', [answered.id]],
          [other.card.name, 'running', [parent.run.id]],
        ].sort(byName),
        "both cards kept, each listed as started by the run it became, in its run's phase",
      );

      const { card: plain } = onStore(addToInbox({ text: 'Keep the brief\n\nAs the card says it.' }));
      const bodied = await startCard({ workflow: 'mine', card: plain.name });
      assert.equal(bodied.status, 201, await bodied.clone().text());
      const bodiedRun = runStore.runs.read(((await bodied.json()) as CardStarted).id);
      assert.deepEqual(
        [bodiedRun.brief, bodiedRun.workflowDir, bodiedRun.from],
        ['Keep the brief\n\nAs the card says it.', mine, { inbox: plain.name }],
        "a brief left out is the card's body",
      );
    },
  );

  await s.test(
    "GET /api/runs/:id says a run came from a card — the record's `from`, and `nemia decide`'s sentence for it — and a run started without one carries neither",
    async () => {
      clear();
      const { card } = onStore(addToInbox({ text: 'Say where a run came from' }));
      const started = await startCard({ workflow: 'dev', card: card.name });
      assert.equal(started.status, 201, await started.clone().text());
      const { id } = (await started.json()) as CardStarted;
      const run = await objectOf(app, id);
      assert.deepEqual(run.spec.from, { inbox: card.name });
      const lines = await linesOf(app, id);
      assert.equal(
        lines.fromNote,
        fromNote(runStore.runs.read(id)),
        "`nemia decide`'s sentence is the lines read's alone: the object leaves it out",
      );
      assert.equal(lines.fromNote, `from inbox card ${card.name}`);

      const typed = await startCard({ workflow: 'dev', brief: 'Typed, not parked' });
      assert.equal(typed.status, 201, await typed.clone().text());
      const typedId = ((await typed.json()) as { id: string }).id;
      const plain = await objectOf(app, typedId);
      assert.equal(plain.metadata.name, typedId);
      assert.equal(plain.spec.from, null, "typed at the board's start, as at `nemia start`: no card, so the object's `from` is null");
      assert.equal(
        (await linesOf(app, typedId)).fromNote,
        null,
        "typed at the board's start, as at `nemia start`: no card, so no sentence of where it came from",
      );
    },
  );
});

test('POST /api/runs with `card` of a card already started is refused, 409, naming its run: a card is started once, and kept', async () => {
  clear();
  const { card } = onStore(addToInbox({ text: 'Stays in the inbox' }));
  const res = await startCard({ workflow: 'dev', card: card.name });
  assert.equal(res.status, 201, await res.clone().text());
  const answered = (await res.json()) as CardStarted;
  assert.deepEqual(cards(), [`${card.name}.md`], 'the card is still there');

  const again = await startCard({ workflow: 'dev', card: card.name });
  assert.equal(again.status, 409);
  assert.ok(((await again.json()) as Refused).error.includes(answered.id));
  assert.equal((await drop(card.name)).status, 200);
  assert.deepEqual(cards(), []);
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

test('POST /api/runs with `card`: what a start of a card refuses, writing nothing and removing nothing', async (t) => {
  await t.test("a `card` that is not there is a 404 naming it, the Card's own `Missing` — and nothing is written", async () => {
    clear();
    const { card } = onStore(addToInbox({ text: 'The card that is there' }));
    const expected = await startRefusal('no-such-card');
    assert.ok(expected.startsWith(`no card no-such-card in the inbox. Its cards are: ${card.name}.`), expected);

    const res = await startCard({ workflow: 'dev', card: 'no-such-card', brief: 'Do it.' });
    assert.equal(res.status, 404);
    assert.match(((await res.json()) as Refused).error, /no-such-card/, 'the refusal names the card it has none of');
    const withMd = await startCard({ workflow: 'dev', card: `${card.name}.md`, brief: 'Do it.' });
    assert.equal(withMd.status, 404);
    assert.deepEqual(runFiles(), []);
    assert.deepEqual(cards(), [`${card.name}.md`]);
  });

  await t.test(
    'a card started already is a 409, a blank brief, a card that does not read and a run it cannot wait on are 422s — and nothing is written or removed',
    async () => {
      clear();
      const { card: started } = onStore(addToInbox({ text: 'Started once' }));
      write(path.join(root, 'runs', 'started-once-k2q9.json'), startedFrom('started-once-k2q9', started.name));
      const { card } = onStore(addToInbox({ text: 'Not started' }));
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
      const waitsSaid = ((await waits.json()) as Refused).error;
      assert.ok(waitsSaid.startsWith('--after no-such-run: '), waitsSaid);
      for (const fact of ['no run no-such-run', 'nemia ls']) assert.ok(waitsSaid.includes(fact), `${fact}: ${waitsSaid}`);

      assert.deepEqual(runFiles(), before);
      assert.deepEqual(cards(), [`${card.name}.md`, 'broken.md', `${started.name}.md`].sort());
    },
  );

  await t.test(
    "a card whose `repo:` is a folder a run cannot branch from — no git checkout, no commit, or a `.worktreeinclude` that is a directory — is a 422 in the place's words, and nothing is written or removed",
    async () => {
      clear();
      const plain = scratch('nemia-api-inbox-plain-');
      const empty = scratch('nemia-api-inbox-empty-');
      execFileSync('git', ['init', '-q'], { cwd: empty });
      const odd = scratch('nemia-api-inbox-odd-');
      execFileSync('git', ['init', '-q'], { cwd: odd });
      execFileSync('git', ['-c', 'user.email=t@local', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: odd });
      fs.mkdirSync(path.join(odd, '.worktreeinclude'));
      for (const [about, facts] of [
        [plain, [`${plain} is not a git repository`, 'git init', '--repo']],
        [empty, [`${empty} has no commit yet`, 'commit once']],
        [odd, [`${path.join(odd, '.worktreeinclude')} is not a file`, 'remove it']],
      ] as const) {
        const { card } = onStore(addToInbox({ text: 'Not a repository', repo: about }));
        const res = await startCard({ workflow: 'dev', card: card.name, brief: 'Do it.' });
        assert.equal(res.status, 422, about);
        const words = ((await res.json()) as Refused).error;
        assert.ok(words.startsWith(facts[0]), words);
        for (const fact of facts) assert.ok(words.includes(fact), `${fact}: ${words}`);
        assert.deepEqual(runFiles(), [], 'no run written');
        assert.deepEqual(cards(), [`${card.name}.md`], 'the card stays');
        clear();
      }
    },
  );

  await t.test(
    "a run's start sent a `card` is a 400 pointing at the Card's own start, a card's name that is none a 422, and a brief that is not text a 400 — before any workflow is looked for",
    async () => {
      clear();
      const { card } = onStore(addToInbox({ text: 'Keep this one' }));
      for (const name of ['', '.hidden', '../runs/r-1', 'a/b', '..', card.name, 42, null, ['a']]) {
        const res = await app.request('/api/namespaces/default/runs', {
          method: 'POST',
          headers: JSON_TYPE,
          body: JSON.stringify({ workflow: 'nope', card: name, brief: 'Do it.' }),
        });
        assert.equal(res.status, 400, `${JSON.stringify(name)}: refused before the workflow nobody has`);
        assert.match(((await res.json()) as Refused).error, /\/cards\/.*\/start/, `${JSON.stringify(name)}: the Card's start named`);
      }
      const hidden = await startCard({ workflow: 'nope', card: '.hidden', brief: 'Do it.' });
      assert.equal(hidden.status, 422, "no card's name, refused before the workflow nobody has");
      for (const brief of [42, null]) {
        const res = await startCard({ workflow: 'dev', card: card.name, brief });
        assert.equal(res.status, 400, JSON.stringify(brief));
      }
      const unknown = await startCard({ workflow: 'nope', card: card.name });
      assert.equal(unknown.status, 404, "the workflow is still the api's to find, among its folders");
      assert.deepEqual(runFiles(), []);
      assert.deepEqual(cards(), [`${card.name}.md`]);
    },
  );

  await t.test('a card start another site could make is refused by the guard before its body is read — so the card stays', async () => {
    clear();
    const { card } = onStore(addToInbox({ text: 'Keep this one' }));
    const body = { workflow: 'dev', card: card.name, brief: 'Do it.' };
    const site = await startCard(body, { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' });
    assert.equal(site.status, 403);
    assert.deepEqual(runFiles(), []);
    assert.deepEqual(cards(), [`${card.name}.md`], 'the card a start would have taken off the inbox is still on it');
  });
});

test("a card whose start fails without a refusal — its repository's `.worktreeinclude` a link to itself, which its place's open cannot read, say — fails as the queue tries it again: a 500 in the failure's words, said on stderr, and nothing is written or removed", async (t) => {
  clear();
  const odd = scratch('nemia-api-inbox-odd-');
  execFileSync('git', ['init', '-q'], { cwd: odd });
  execFileSync('git', ['-c', 'user.email=t@local', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: odd });
  fs.symlinkSync('.worktreeinclude', path.join(odd, '.worktreeinclude'));
  const said = t.mock.method(console, 'error', () => {});
  const { card } = onStore(addToInbox({ text: 'Its include file is a link to itself', repo: odd }));
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
  assert.match(lines[0], /^\d\d:\d\d:\d\d {2}POST \/api\/namespaces\/default\/cards\/[^ ]+\/start 500 \d+ms$/);
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

test("a person files cards, in a factory and out of one, lists them, opens a card's page, and drops one", async (t) => {
  const s = story(t);
  await s.test('GET /api/cards on a store with no inbox yet is an empty list', async () => {
    clear();
    assert.deepEqual(await listed(), []);
  });

  await s.test(
    "the Card's create files a card as `nemia inbox add` does: the idea alone; a repository's workflow by name; yours as its folder; the repository it is about — and GET /api/cards lists each with its body and when it was filed",
    async () => {
      clear();
      const bare = await file({ body: 'Cache the views between passes\n\nThe tick reads each task twice.' });
      assert.equal(bare.status, 201, await bare.clone().text());
      const filed = await filedFrom(bare);
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

      const named = await filedFrom(await file({ body: 'Show what a step cost', workflow: 'dev', repo }));
      assert.equal(
        fs.readFileSync(named.file, 'utf8'),
        `---\nworkflow: dev\nrepo: ${repo}\n---\nShow what a step cost\n`,
        "the repository's, on a card about the api's repository: by name, as `nemia inbox add --workflow dev` writes it",
      );
      const yours = await filedFrom(await file({ body: 'Plan the inbox', workflow: 'mine' }));
      assert.deepEqual(
        [yours.workflow, yours.repo],
        [mine, null],
        "yours: its folder, since a name on a card is looked for under the repository's workflows/, where yours is not",
      );
      assert.equal(
        (await filedFrom(await file({ body: 'Both, the repository', workflow: 'both', from: 'repo' }))).workflow,
        'both',
        "one both have, said which: the repository's by name",
      );
      assert.equal(
        (await filedFrom(await file({ body: 'Both, yours', workflow: 'both', from: 'yours' }))).workflow,
        path.join(root, 'workflows', 'both'),
        'one both have, said which: yours by folder',
      );
      const elsewhere = scratch('nemia-api-inbox-elsewhere-');
      assert.equal(
        (await filedFrom(await file({ body: 'Elsewhere', workflow: 'dev', repo: elsewhere }))).workflow,
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
          title: 'Cache the views between passes',
          workflow: null,
          repo: null,
          factory: null,
          from: [],
          startedAs: [],
          state: 'filed',
          error: null,
          body: 'Cache the views between passes\n\nThe tick reads each task twice.',
          filedAt: old.toISOString(),
          labels: {},
        },
        'listed with its body and a filing time, and started as none',
      );
      const namedEntry = entries.find((e) => e.name === named.name)!;
      assert.deepEqual(
        [namedEntry.title, namedEntry.workflow, namedEntry.repo, namedEntry.body],
        ['Show what a step cost', 'dev', repo, 'Show what a step cost'],
      );
      assert.ok(Date.parse(namedEntry.filedAt) > old.getTime());
    },
  );

  await s.test(
    "the Card's create writes an absolute repo as `nemia inbox add --repo` does — no trailing slash, no `.` or `..` — so a card's run records the repository as every other run on it does",
    async () => {
      clear();
      for (const given of [
        `${repo}/`,
        `${repo}//`,
        `${repo}/./`,
        `${path.dirname(repo)}/../${path.basename(path.dirname(repo))}/${path.basename(repo)}`,
      ]) {
        const res = await file({ body: `About ${given}`, workflow: 'dev', repo: given });
        assert.equal(res.status, 201, `${given}: ${await res.clone().text()}`);
        const filed = await filedFrom(res);
        assert.deepEqual(
          [filed.repo, filed.workflow],
          [repo, 'dev'],
          `${given}: the api's own repository once written as it is, so its workflow is written by name, as for the repository given plainly`,
        );
        assert.equal(fs.readFileSync(filed.file, 'utf8'), `---\nworkflow: dev\nrepo: ${repo}\n---\nAbout ${given}\n`, given);
      }

      const { name } = await filedFrom(await file({ body: 'Started from a slash', repo: `${repo}/` }));
      const started = await startCard({ workflow: 'dev', card: name });
      assert.equal(started.status, 201, await started.clone().text());
      assert.equal(
        runStore.runs.read(((await started.json()) as CardStarted).id).repo,
        repo,
        'started, the run names the repository as the api does, so the board lists it with the runs on it',
      );
    },
  );

  await s.test(
    'GET /api/cards lists a card that does not read with its refusal and no body, a card started with its run, an entry that is no markdown file with why, and reads the folder on each request',
    async () => {
      clear();
      write(path.join(inbox, 'broken.md'), '---\nafter: some-run\n---\nWait for it.\n');
      write(path.join(inbox, 'notes.txt'), 'not a card\n');
      const { card } = onStore(addToInbox({ text: 'Started at the command line' }));
      write(path.join(root, 'runs', 'started-run-k2q9.json'), startedFrom('started-run-k2q9', card.name));

      const entries = await listed();
      const broken = entries.find((e) => e.name === 'broken')!;
      assert.match(broken.error!, /^broken\.md: `after` is not a key an inbox card has/);
      assert.deepEqual([broken.body, broken.title, typeof broken.filedAt], [null, null, 'string']);
      const stray = entries.find((e) => e.name === 'notes.txt');
      const whyGiven = typeof stray?.error === 'string';
      assert.deepEqual(
        [whyGiven, typeof stray?.filedAt],
        [true, 'string'],
        'an entry that is no markdown file is listed under its file, with why, dated when it was written',
      );
      const started = entries.find((e) => e.name === card.name)!;
      assert.deepEqual(
        [started.startedAs, started.state],
        [['started-run-k2q9'], 'running'],
        'a run that cannot be judged reads running, as the runs list counts it',
      );
      assert.equal(broken.state, 'filed', 'every card has its state, one that does not read filed');

      fs.rmSync(path.join(inbox, 'broken.md'));
      assert.equal(
        (await listed()).some((e) => e.name === 'broken'),
        false,
        'dropped at the command line: gone on the next request',
      );
    },
  );

  await s.test(
    'GET /api/cards/:name is one card read alone: the Card as the list answers it, with its file as written in status.source',
    async () => {
      clear();
      const text = `---\nworkflow: dev\nrepo: ${repo}\n---\n# Cache the views\n\n- between passes\n- per task\n`;
      write(path.join(inbox, 'cache-the-views-k2q9.md'), text);
      write(path.join(inbox, 'bare-idea-a1b2.md'), 'A bare idea\n');
      const before = inboxFiles();

      const res = await cardPage('cache-the-views-k2q9');
      assert.equal(res.status, 200, await res.clone().text());
      const page = (await res.json()) as Card;
      const items = ((await (await app.request('/api/cards')).json()) as CardList).items;
      const listedAs = items.find((c) => c.metadata.name === 'cache-the-views-k2q9');
      assert.deepEqual(
        { ...page, status: { ...page.status, source: undefined } },
        { ...listedAs, status: { ...listedAs?.status, source: undefined } },
        'the card as GET /api/cards lists it',
      );
      assert.equal(listedAs?.status.source, undefined, 'a list carries no file');
      assert.equal(page.spec.body, '# Cache the views\n\n- between passes\n- per task');
      assert.deepEqual([page.spec.workflow, page.spec.repo], ['dev', repo]);
      assert.equal(page.status.source, text, 'the file byte for byte, frontmatter included');

      const bare = (await (await cardPage('bare-idea-a1b2')).json()) as Card;
      assert.deepEqual([bare.spec.body, bare.status.source], ['A bare idea', 'A bare idea\n']);
      assert.deepEqual(Object.keys(bare.spec), ['body'], 'a card that sets no key: no key in its spec');

      write(path.join(inbox, 'broken.md'), '---\ncolour: red\n---\nPaint it.\n');
      const broken = (await (await cardPage('broken')).json()) as Card;
      assert.match(broken.status.error ?? '', /^broken\.md: `colour` is not a key an inbox card has/);
      assert.deepEqual(
        [broken.spec.body, broken.status.source],
        [undefined, '---\ncolour: red\n---\nPaint it.\n'],
        'an entry that does not read as a card: its refusal and its file',
      );

      fs.rmSync(path.join(inbox, 'broken.md'));
      assert.deepEqual(inboxFiles(), before, 'read, and nothing written');
    },
  );

  await s.test("the Card's delete drops a card as `nemia inbox rm` does, answers it as it was, and leaves the others", async () => {
    clear();
    const kept = onStore(addToInbox({ text: 'Keep this one' }));
    const gone = onStore(addToInbox({ text: 'Drop this one' }));
    const res = await drop(gone.card.name);
    assert.equal(res.status, 200);
    const dropped = (await res.json()) as Card;
    assert.deepEqual([dropped.kind, dropped.metadata.name, dropped.spec.body], ['Card', gone.card.name, 'Drop this one']);
    assert.deepEqual(cards(), [`${kept.card.name}.md`]);
  });

  await s.test(
    "the Card's create in a factory's namespace files the card in it, as `nemia inbox add --factory` does: its `factory:` key, its workflow as a start in the factory finds it, and no `repo:` nobody sent — and GET /api/cards lists it with its factory",
    async () => {
      clear();
      const res = await file({ body: 'Mill the views', factory: 'mill', workflow: 'dev', from: 'repo' });
      assert.equal(res.status, 201, await res.clone().text());
      const filed = await filedFrom(res);
      assert.deepEqual([filed.factory, filed.workflow, filed.repo], ['mill', 'dev', null]);
      assert.equal(
        fs.readFileSync(filed.file, 'utf8'),
        '---\nworkflow: dev\nfactory: mill\n---\nMill the views\n',
        "the factory's one repository is its own to give at start: the card writes no repo: line",
      );
      const entry = (await listed()).find((e) => e.name === filed.name)!;
      assert.deepEqual([entry.factory, entry.repo, entry.workflow], ['mill', null, 'dev']);

      const idea = await filedFrom(await file({ body: 'Mill it later', factory: 'mill' }));
      assert.equal(fs.readFileSync(idea.file, 'utf8'), '---\nfactory: mill\n---\nMill it later\n', 'a factory and no workflow');
      const yours = await filedFrom(await file({ body: 'Mill mine', factory: 'mill', workflow: 'mine' }));
      assert.equal(yours.workflow, mine, 'yours: by its folder, in a factory as out of one');

      const none = await filedFrom(await file({ body: 'No factory' }));
      assert.equal(none.factory, null, 'a filing with no factory answers none');
      assert.equal(fs.readFileSync(none.file, 'utf8'), 'No factory\n');
    },
  );

  await s.test(
    "the Card's create in a factory on several repositories writes `repo:` only when one was sent, and a workflow only one of them has by its folder",
    async () => {
      clear();
      const sent = await filedFrom(await file({ body: 'There', factory: 'pair', workflow: 'dev', repo: `${second}/` }));
      assert.equal(
        fs.readFileSync(sent.file, 'utf8'),
        `---\nworkflow: dev\nrepo: ${second}\nfactory: pair\n---\nThere\n`,
        'the repository sent, resolved, and its workflow by name',
      );
      const found = await filedFrom(await file({ body: 'Alone', factory: 'pair', workflow: 'solo' }));
      assert.deepEqual(
        [found.workflow, found.repo],
        [path.join(second, 'workflows', 'solo'), null],
        'no repository sent: none written, and the one folder found is written whole, so a start on either repository finds it',
      );
      const bare = await filedFrom(await file({ body: 'Bare', factory: 'pair' }));
      assert.deepEqual([bare.factory, bare.repo, bare.workflow], ['pair', null, null]);
    },
  );
});

test("what a filing, a card's page or a drop refuses, writing nothing", async (t) => {
  await t.test(
    "a card read by a name that is not a card's is a 422, and one that is not there a 404 — and nothing is read outside the inbox or written",
    async () => {
      clear();
      const { card } = onStore(addToInbox({ text: 'Keep this one' }));
      write(path.join(root, 'runs', 'r-1.json'), '{"id":"r-1"}');
      const before = inboxFiles();

      for (const sent of ['.hidden', '..%2Fruns%2Fr-1', 'a%2Fb', 'a%5Cb']) {
        const res = await cardPage(sent);
        assert.equal(res.status, 422, sent);
        const { error } = (await res.json()) as Refused;
        assert.ok(!JSON.stringify(error).includes('"id":"r-1"'), `${sent}: nothing of the file it names`);
      }
      const missing = await cardPage('no-such-card');
      assert.equal(missing.status, 404);
      const withMd = await cardPage(`${card.name}.md`);
      assert.equal(withMd.status, 404);

      assert.deepEqual(inboxFiles(), before);
      fs.rmSync(path.join(root, 'runs'), { recursive: true, force: true });
    },
  );

  await t.test(
    "a card's page for a name that is not there, in an inbox holding more than cards, names the cards as the package does — a card that does not read among them, a stray file and a folder not — and a card is found before a stray file of its name",
    async () => {
      clear();
      const { card } = onStore(addToInbox({ text: 'Keep this one' }));
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
      names(((await missing.json()) as Refused).error, 'no-such-card', 'nemia inbox');
      const dropped = await drop('no-such-card');
      assert.equal(dropped.status, 404);
      names(((await dropped.json()) as Refused).error, 'no-such-card', 'nemia inbox');

      write(path.join(inbox, 'notes'), 'a stray file\n');
      write(path.join(inbox, 'notes.md'), '---\nworkflow: dev\n---\nThe card called notes\n');
      const notes = (await (await cardPage('notes')).json()) as Card;
      assert.deepEqual(
        [notes.status.file, notes.spec.body, notes.status.source, notes.spec.workflow],
        ['notes.md', 'The card called notes', '---\nworkflow: dev\n---\nThe card called notes\n', 'dev'],
        "notes.md and a stray notes both list as notes: the read is the card's",
      );
      assert.equal((await cardPage('notes.txt')).status, 404, 'a stray file is no card, and is not read as one');
    },
  );

  await t.test(
    "a filing of the wrong shape is a 400 in the api's words, a workflow that is a path or a `from` with no workflow a 422, a workflow nobody has a 404, one both have a 409 — before anything is written",
    async () => {
      clear();
      const refused = async (res: Response, status: number, sent: unknown, ...facts: string[]) => {
        assert.equal(res.status, status, JSON.stringify(sent));
        names(((await res.json()) as { error?: unknown }).error, ...facts);
      };
      for (const body of ['not json', '[]', '"an idea"']) await refused(await file(body), 400, body, '"body"');
      for (const idea of [undefined, 42, null, ['an idea']]) await refused(await file({ body: idea }), 400, idea, '"body"');
      await refused(await file({ body: 'An idea', workflow: 42 }), 400, 42, '`workflow`');
      for (const workflow of ['', '../workflows/dev', '/tmp/dev', 'dev/implement.md', 'a\\b'])
        await refused(
          await file({ body: 'An idea', workflow }),
          422,
          `${JSON.stringify(workflow)}: a name, as the workflows are listed, never a path, which a card would carry to a start from the command line`,
          '`workflow`',
        );
      await refused(await file({ body: 'An idea', workflow: 'dev', from: 'elsewhere' }), 400, 'from', '`from`');
      await refused(await file({ body: 'An idea', from: 'repo' }), 422, 'from alone', '`workflow`');
      for (const about of [42, null, ['/tmp']]) await refused(await file({ body: 'An idea', repo: about }), 400, about, '`repo`');

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
    },
  );

  await t.test(
    "what the package refuses to file is a 422 carrying its sentence word for word — an idea with nothing in it, a relative repo, one naming no directory, a repo on two lines, an `after:` in the idea's frontmatter — and nothing is written",
    async () => {
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
    },
  );

  await t.test(
    "a drop of a card that is not there is a 404, and of a name that is not a card's a 422 — and nothing is removed",
    async () => {
      clear();
      const { card } = onStore(addToInbox({ text: 'Keep this one' }));

      const missing = await drop('no-such-card');
      assert.equal(missing.status, 404);
      const withMd = await drop(`${card.name}.md`);
      assert.equal(withMd.status, 404);

      for (const sent of ['.hidden', '..%2Fruns%2Fr-1', 'a%2Fb', 'a%5Cb']) {
        const res = await drop(sent);
        assert.equal(
          res.status,
          422,
          `${sent}: a hidden name, or a name with a slash sent encoded, which the route decodes, is refused before the inbox is read`,
        );
      }
      assert.deepEqual(cards(), [`${card.name}.md`]);
    },
  );

  await t.test(
    'a `factory` that is not text is a 400 naming the key, and one that is not the namespace filed in — `default` among them — a 422 naming it — and no card is written',
    async () => {
      clear();
      for (const factory of [7, null, ['mill']]) {
        const res = await file({ body: 'An idea', factory });
        assert.equal(res.status, 400, JSON.stringify(factory));
        names(((await res.json()) as Refused).error, '`factory`');
      }
      const res = await file({ body: 'An idea', factory: 'default' });
      assert.equal(res.status, 422, "`default` names no factory: the default namespace's cards name none");
      names(((await res.json()) as Refused).error, '`factory`');
      const elsewhere = await app.request('/api/namespaces/mill/cards', {
        method: 'POST',
        headers: JSON_TYPE,
        body: JSON.stringify({ body: 'An idea', factory: 'pair' }),
      });
      assert.equal(elsewhere.status, 422, 'a card is filed in the namespace its factory is');
      names(((await elsewhere.json()) as Refused).error, '/api/namespaces/pair/cards');
      assert.deepEqual(cards(), []);
    },
  );

  await t.test(
    'a `factory` the store does not have is a 404, and a name that is no slug a 422, the 404 naming the factories there are — and no card is written',
    async () => {
      clear();
      const unknown = await file({ body: 'An idea', factory: 'nobody' });
      assert.equal(unknown.status, 404);
      const said = ((await unknown.json()) as Refused).error;
      assert.ok(said.endsWith('Its factories are: mill, pair. Nothing was filed.'), said);
      const slug = await file({ body: 'An idea', factory: 'Not A Slug' });
      assert.equal(slug.status, 422);
      assert.deepEqual(cards(), []);
    },
  );

  await t.test(
    "a `repo` that is none of the factory's is a 422 naming those it works on, and a workflow two of its repositories have, with no `repo`, a 409 naming `repo` — and no card is written",
    async () => {
      clear();
      const outside = await file({ body: 'An idea', factory: 'mill', repo: second });
      assert.equal(outside.status, 422);
      const outsideSaid = ((await outside.json()) as Refused).error;
      assert.ok(outsideSaid.startsWith(`${second}: the factory mill works on ${first}`), outsideSaid);
      assert.ok(outsideSaid.includes('as `repo`') && outsideSaid.endsWith('Nothing was filed.'), outsideSaid);
      const relative = await file({ body: 'An idea', factory: 'mill', repo: 'code/myapp' });
      assert.equal(relative.status, 422, 'a relative path is none of them either');
      const two = await file({ body: 'An idea', factory: 'pair', workflow: 'dev' });
      assert.equal(two.status, 409);
      const twoSaid = ((await two.json()) as Refused).error;
      assert.ok(twoSaid.startsWith(`The factory pair works on ${[first, second].join(', ')}`), twoSaid);
      for (const fact of [
        "'dev'",
        path.join(first, 'workflows', 'dev'),
        path.join(second, 'workflows', 'dev'),
        '`"repo": "<one of them>"`',
      ]) {
        assert.ok(twoSaid.includes(fact), `${fact}: ${twoSaid}`);
      }
      const nowhere = await file({ body: 'An idea', factory: 'pair', workflow: 'nope' });
      assert.equal(nowhere.status, 404);
      assert.ok(((await nowhere.json()) as Refused).error.startsWith("No workflow 'nope' in "));
      assert.deepEqual(cards(), []);
    },
  );
});

test("a card's labels: filed with them, listed with them, selected by them with ?labelSelector=, shown on its page, and edited", async (t) => {
  const s = story(t);
  const asked = async (address: string) => (await listed(address)).map((e) => e.name).sort();
  let core = '';
  let docs = '';
  await s.test("the Card's create files a card with `label`, and GET /api/cards lists each card with its labels", async () => {
    clear();
    const one = await file({ body: 'Cache the views', label: ['team=core'] });
    assert.equal(one.status, 201, await one.clone().text());
    core = (await filedFrom(one)).name;
    docs = (await filedFrom(await file({ body: 'Tidy the docs', label: ['team=docs', 'tier=1'] }))).name;
    const bare = (await filedFrom(await file({ body: 'A bare idea' }))).name;
    const entries = await listed();
    assert.deepEqual(entries.find((e) => e.name === core)?.labels, { team: 'core' });
    assert.deepEqual(entries.find((e) => e.name === docs)?.labels, { team: 'docs', tier: '1' });
    assert.deepEqual(entries.find((e) => e.name === bare)?.labels, {}, 'none, `{}`, on a card that carries none');
    const refused = await file({ body: 'Labelled wrong', label: 'team=core' });
    assert.equal(refused.status, 400, 'REFUSED: a `label` that is no list');
    names(((await refused.json()) as { error: string }).error, '`label`');
  });
  await s.test('?labelSelector= keeps the cards one of its selectors takes, OR across repeats; a malformed one is a 422', async () => {
    assert.deepEqual(await asked('/api/cards?labelSelector=team%3Dcore'), [core]);
    assert.deepEqual(await asked('/api/cards?labelSelector=team%3Dcore&labelSelector=tier'), [core, docs].sort(), 'either selector');
    assert.deepEqual(await asked('/api/cards?labelSelector=team%3Dnone'), [], 'none taken');
    const res = await app.request('/api/cards?labelSelector=no%2Fpe%3Dx');
    assert.equal(res.status, 422);
    names(((await res.json()) as { error: string }).error, 'no/pe');
  });
  await s.test("a card read alone carries its labels, and the Card's labels verb edits them", async () => {
    const row = async () => ((await (await cardPage(docs)).json()) as Card).metadata.labels;
    assert.deepEqual(await row(), { team: 'docs', tier: '1' });
    const res = await app.request(`/api/namespaces/default/cards/${docs}/labels`, {
      method: 'POST',
      headers: JSON_TYPE,
      body: JSON.stringify({ labels: ['tier-', 'area=site'] }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    assert.deepEqual(await res.json(), {
      kind: 'Card',
      name: docs,
      labels: { area: 'site', team: 'docs' },
      was: { team: 'docs', tier: '1' },
    });
    assert.deepEqual(await row(), { area: 'site', team: 'docs' }, 'the read reads the edit');
    const changed = await app.request(`/api/namespaces/default/cards/${docs}/labels`, {
      method: 'POST',
      headers: JSON_TYPE,
      body: JSON.stringify({ labels: ['team=core'] }),
    });
    assert.equal(changed.status, 422, 'REFUSED: a value changed without overwrite');
  });
  await s.test("POST /api/runs with `label` starts the card with the card's labels and the edits sent", async () => {
    const res = await startCard({ workflow: 'dev', from: 'repo', card: core, label: ['tier=2'] });
    assert.equal(res.status, 201, await res.clone().text());
    const { id } = (await res.json()) as CardStarted;
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(root, 'runs', `${id}.labels`), 'utf8')),
      { team: 'core', tier: '2' },
      "the card's labels, and the one sent",
    );
    const refused = await startCard({ workflow: 'dev', from: 'repo', card: docs, label: 'tier=2' });
    assert.equal(refused.status, 400, 'REFUSED: a `label` that is no list');
    names(((await refused.json()) as { error: string }).error, '`label`');
  });
});
