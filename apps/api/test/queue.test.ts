/**
 * The queue, as the board reads and writes it: GET /api/inbox's `queued` and `tried`; POST and DELETE /api/inbox/:name/queue (inbox.ts), a card
 * queued and taken off the queue through the package's `queueInInbox`; and GET /api/ceilings (app.ts), the cap the daemon's last pass ran with
 * and the runs it counts and holds, held to the package's `runSlots` — in a scratch store and a scratch repository.
 */
import { observations } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// agent-orchestrator locates its store, and so its inbox, when the module loads: point it at a scratch directory first. No cap from this shell.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-queue-'));
process.env.WF_ROOT = root;
delete process.env.WF_MAX_RUNS;
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-queue-repo-'));
process.env.HKB_REPO = repo;
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: repo, encoding: 'utf8' });
git('init', '-q', '-b', 'main');
git('commit', '-q', '--allow-empty', '-m', 'init');
const base = git('rev-parse', 'HEAD').trim();

const { app } = await import('../src/app.ts');
const { addToInbox, engine, inboxNameRefusal, noCardLine, queueInInbox, readInbox, runSlots, slotWord } = await import('agent-orchestrator');
type InboxEntry = import('../src/inbox.ts').InboxEntry;
type Ceilings = import('../src/ceilings.ts').Ceilings;

const inbox = path.join(root, 'inbox');
const JSON_TYPE = { 'content-type': 'application/json' };

/** Every card, try, record, journal and the tick's ceilings gone, so each test starts from an empty store. */
const clear = (): void => {
  for (const dir of ['inbox', 'queue', 'runs', 'engine']) fs.rmSync(path.join(root, dir), { recursive: true, force: true });
  fs.rmSync(path.join(root, 'tick.json'), { force: true });
};

/** The inbox folder as it is: each file's name and text, to show a refusal wrote nothing. */
const inboxAsIs = (): Array<[string, string]> =>
  (fs.existsSync(inbox) ? fs.readdirSync(inbox).sort() : []).map((name) => [name, fs.readFileSync(path.join(inbox, name), 'utf8')]);

const queue = (name: string, headers: Record<string, string> = JSON_TYPE, body?: string) =>
  app.request(`/api/inbox/${name}/queue`, { method: 'POST', headers, ...(body !== undefined ? { body } : {}) });
const unqueue = (name: string, headers: Record<string, string> = JSON_TYPE, body?: string) =>
  app.request(`/api/inbox/${name}/queue`, { method: 'DELETE', headers, ...(body !== undefined ? { body } : {}) });
const listed = async (): Promise<InboxEntry[]> => {
  const res = await app.request('/api/inbox');
  assert.equal(res.status, 200);
  return res.json();
};

/** What the package refuses a queue of `name` with — or its taking back — asked of it directly, which writes nothing when it refuses. */
const refusalOf = (name: string, off = false): string => {
  try {
    queueInInbox(name, { off });
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail(`queueInInbox took ${name}${off ? ' --off' : ''}, which the api refused`);
};

const cardText = (name: string): string => fs.readFileSync(path.join(inbox, `${name}.md`), 'utf8');

// ─── the inbox's queue ──────────────────────────────────────────────────────

test("GET /api/inbox carries a queued card's time and place, and the tick's last try of its start, as the package lists them", async () => {
  clear();
  const first = addToInbox({ text: 'Cache the views between passes', workflow: 'dev', repo }).card;
  const second = addToInbox({ text: 'Show what a step cost', workflow: 'gone' }).card;
  const parked = addToInbox({ text: 'Not queued' }).card;
  queueInInbox(first.name);
  queueInInbox(second.name);
  // The tick's own file for a start it refused, of the card as it stands.
  const tried = { at: '2026-09-16T10:00:00.000Z', text: cardText(second.name), repo, why: `no workflow gone in ${repo}/workflows.`, refused: true };
  fs.mkdirSync(path.join(root, 'queue'), { recursive: true });
  fs.writeFileSync(path.join(root, 'queue', `${second.name}.json`), JSON.stringify(tried));

  const entries = await listed();
  const byName = new Map(entries.map((e) => [e.name, e]));
  // Every key the package lists, as it lists it: the api's own two beside them.
  for (const entry of readInbox()) {
    const { body, filedAt, ...rest } = byName.get(entry.name)!;
    assert.deepEqual(rest, entry, entry.name);
    assert.equal(typeof body, 'string');
    assert.equal(typeof filedAt, 'string');
  }
  assert.equal(byName.get(first.name)!.queued!.place, 1);
  assert.match(byName.get(first.name)!.queued!.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(byName.get(first.name)!.tried, undefined, 'no try of a card the tick has not tried');
  assert.equal(byName.get(second.name)!.queued!.place, 2);
  assert.deepEqual(byName.get(second.name)!.tried, { at: tried.at, repo, why: tried.why, refused: true });
  assert.equal('queued' in byName.get(parked.name)!, false, 'a card not queued carries no `queued`');
});

test('POST /api/inbox/:name/queue queues a card as `wf inbox queue` does, with its place; DELETE takes it back as `--off` does, and says so of a card not queued, writing nothing', async () => {
  clear();
  const first = addToInbox({ text: 'Cache the views between passes', workflow: 'dev' }).card;
  const second = addToInbox({ text: 'Show what a step cost', workflow: 'dev', repo }).card;

  const queued = await queue(first.name);
  assert.equal(queued.status, 200, await queued.clone().text());
  const answer = await queued.json();
  assert.match(answer.queued, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual(answer, { name: first.name, file: path.join(inbox, `${first.name}.md`), was: 'queued', queued: answer.queued, place: 1, of: 1 });
  assert.equal(cardText(first.name), `---\nworkflow: dev\nqueued: ${answer.queued}\n---\nCache the views between passes\n`, 'written as wf inbox queue writes it');

  // A body of `{}` is no body.
  const behind = await (await queue(second.name, JSON_TYPE, '{}')).json();
  assert.deepEqual([behind.was, behind.place, behind.of], ['queued', 2, 2]);
  assert.deepEqual((await listed()).map((e) => [e.name, e.queued?.place ?? null]).sort(), [[first.name, 1], [second.name, 2]].sort());

  const off = await unqueue(first.name);
  assert.equal(off.status, 200, await off.clone().text());
  assert.deepEqual(await off.json(), { name: first.name, file: path.join(inbox, `${first.name}.md`), was: 'taken back', queued: null, place: null, of: null });
  assert.equal(cardText(first.name), '---\nworkflow: dev\n---\nCache the views between passes\n');
  assert.equal((await listed()).find((e) => e.name === second.name)!.queued!.place, 1, 'the card behind it moves up');

  // Taken back again: not queued, and nothing written.
  const before = inboxAsIs();
  const again = await unqueue(first.name);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).was, 'not queued');
  assert.deepEqual(inboxAsIs(), before);
});

test("POST and DELETE /api/inbox/:name/queue leave a card's filing time as it was: a queue is no edit of the idea, and the Inbox page orders the cards by it", async () => {
  clear();
  const older = addToInbox({ text: 'Filed an hour ago', workflow: 'dev' });
  const newer = addToInbox({ text: 'Filed a minute ago', workflow: 'dev' });
  const [hourAgo, minuteAgo] = [new Date('2026-09-16T09:00:00.000Z'), new Date('2026-09-16T09:59:00.000Z')];
  fs.utimesSync(older.file, hourAgo, hourAgo);
  fs.utimesSync(newer.file, minuteAgo, minuteAgo);
  const filedAt = async () => new Map((await listed()).map((e) => [e.name, e.filedAt]));
  const before = await filedAt();
  assert.deepEqual([before.get(older.card.name), before.get(newer.card.name)], [hourAgo.toISOString(), minuteAgo.toISOString()]);

  const queued = await queue(older.card.name);
  assert.equal(queued.status, 200, await queued.clone().text());
  assert.match(cardText(older.card.name), /\nqueued: /, 'the card is queued');
  assert.deepEqual(await filedAt(), before, 'queued, the older card keeps its filing time, and stays behind the newer one');

  const off = await unqueue(older.card.name);
  assert.equal((await off.json()).was, 'taken back');
  assert.doesNotMatch(cardText(older.card.name), /\nqueued: /, 'the card is taken off the queue');
  assert.deepEqual(await filedAt(), before, 'taken back, it keeps it too');

  // Refused, nothing is written, and nothing is set.
  assert.equal((await queue(newer.card.name, JSON_TYPE, '{"workflow":"dev"}')).status, 400);
  assert.equal((await unqueue(newer.card.name)).status, 200);
  assert.deepEqual(await filedAt(), before, 'a refusal, and a card taken off a queue it was not in, leave it as it was');
});

test("DELETE /api/inbox/:name/queue takes back a queued card whose repository is gone, as `--off` does without the check — and the listing keeps its place until then", async () => {
  clear();
  const about = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-queue-gone-'));
  const { card } = addToInbox({ text: 'About a repository deleted', workflow: 'dev', repo: about });
  queueInInbox(card.name);
  fs.rmSync(about, { recursive: true, force: true });
  const entry = (await listed()).find((e) => e.name === card.name)!;
  assert.match(entry.error!, /names no directory/);
  assert.equal(entry.queued!.place, 1);

  const off = await unqueue(card.name);
  assert.equal(off.status, 200, await off.clone().text());
  assert.equal((await off.json()).was, 'taken back');
  assert.equal((await listed()).find((e) => e.name === card.name)!.queued, undefined);
});

test("REFUSED at shipped defaults: a queue of a card with no workflow, or that does not read, is a 422; of a card not there a 404; of one queued already, or a run was started from, a 409 — each the package's sentence word for word, and nothing written", async () => {
  clear();
  const bare = addToInbox({ text: 'No workflow named' }).card;
  const queued = addToInbox({ text: 'Queued already', workflow: 'dev' }).card;
  queueInInbox(queued.name);
  const started = addToInbox({ text: 'Started, its removal failed', workflow: 'dev' }).card;
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runs', 'started-run-k2q9.json'), JSON.stringify({ id: 'started-run-k2q9', from: { inbox: started.name } }));
  fs.writeFileSync(path.join(inbox, 'broken.md'), '---\nafter: some-run\nworkflow: dev\n---\nWait for it.\n');
  const before = inboxAsIs();

  for (const [name, status, off] of [
    [bare.name, 422, false],
    ['broken', 422, false],
    ['broken', 422, true],
    ['no-such-card', 404, false],
    ['no-such-card', 404, true],
    [`${bare.name}.md`, 404, false],
    [queued.name, 409, false],
    [started.name, 409, false],
  ] as const) {
    const res = off ? await unqueue(name) : await queue(name);
    assert.equal(res.status, status, `${off ? 'DELETE' : 'POST'} ${name}`);
    const { error } = await res.json();
    assert.equal(error, refusalOf(name, off), `${off ? 'DELETE' : 'POST'} ${name}`);
  }
  // The sentences are the ones a person reads at the command line: not there names the cards there are.
  assert.ok(refusalOf('no-such-card').startsWith(noCardLine('no-such-card', ['broken', bare.name, queued.name, started.name])));
  assert.match(refusalOf(bare.name), /no workflow — a queued card starts on its own/);
  assert.match(refusalOf(queued.name), /already queued, at .+, 1 in the queue's order/);
  assert.match(refusalOf(started.name), /this card was started as started-run-k2q9/);
  assert.deepEqual(inboxAsIs(), before);
});

test("REFUSED at shipped defaults: a queue of a name that is not a card's is a 400 in the package's words, and a body that is not none or `{}` a 400 in the api's — a workflow sent among them — before the card is read, and nothing written", async () => {
  clear();
  const { card } = addToInbox({ text: 'No workflow named' });
  const before = inboxAsIs();
  for (const [sent, name] of [['.hidden', '.hidden'], ['..%2Fruns%2Fr-1', '../runs/r-1'], ['a%2Fb', 'a/b'], ['a%5Cb', 'a\\b']] as const) {
    for (const send of [queue, unqueue]) {
      const res = await send(sent);
      assert.equal(res.status, 400, sent);
      assert.equal((await res.json()).error, inboxNameRefusal(name), sent);
    }
  }
  const route = `POST /api/inbox/${card.name}/queue`;
  const withWorkflow = await queue(card.name, JSON_TYPE, JSON.stringify({ workflow: 'dev' }));
  assert.equal(withWorkflow.status, 400);
  assert.equal(
    (await withWorkflow.json()).error,
    `${route} takes no body, or \`{}\`: the card is named in the path, and queued on the workflow it names, and this request sent {"workflow":"dev"}. A card is queued on the workflow it names: file it with one, or queue it with \`wf inbox queue <name> --workflow <w>\`, which writes both.`,
  );
  for (const body of ['{"off":true}', '[]', '"dev"', 'not json']) {
    const res = await queue(card.name, JSON_TYPE, body);
    assert.equal(res.status, 400, body);
    assert.ok((await res.json()).error.startsWith(`${route} takes no body, or \`{}\``), body);
  }
  const offRoute = await unqueue(card.name, JSON_TYPE, '{"workflow":"dev"}');
  assert.equal(offRoute.status, 400);
  assert.ok((await offRoute.json()).error.startsWith(`DELETE /api/inbox/${card.name}/queue takes no body, or \`{}\``));
  assert.deepEqual(inboxAsIs(), before);
});

test('REFUSED at shipped defaults: a queue or its taking back another site could make — a body not sent as application/json (415), a page on another site (403), a name that is not this machine (403) — is refused before anything is read, and nothing is written', async () => {
  clear();
  const { card } = addToInbox({ text: 'Queue me', workflow: 'dev' });
  const other = addToInbox({ text: 'Queued, to take back', workflow: 'dev' }).card;
  queueInInbox(other.name);
  const before = inboxAsIs();

  const writes = [
    { route: `POST /api/inbox/${card.name}/queue`, send: (headers: Record<string, string>) => queue(card.name, headers) },
    { route: `DELETE /api/inbox/${other.name}/queue`, send: (headers: Record<string, string>) => unqueue(other.name, headers) },
  ];
  for (const { route, send } of writes) {
    for (const type of ['text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
      const res = await send({ 'content-type': type });
      assert.equal(res.status, 415, `${route} ${type}`);
      assert.ok((await res.json()).error.startsWith(`${route} takes its body as \`content-type: application/json\`, and this request sent \`${type.split(';')[0]}\``));
    }
    const none = await send({});
    assert.equal(none.status, 415, `${route} with no content-type`);
    assert.ok((await none.json()).error.includes('this request sent no content-type'));
    for (const site of ['cross-site', 'same-site', 'none']) {
      const res = await send({ 'content-type': 'application/json', 'sec-fetch-site': site });
      assert.equal(res.status, 403, `${route} ${site}`);
      assert.ok((await res.json()).error.startsWith(`${route} refuses a request made by a page on another site (Sec-Fetch-Site: ${site})`));
    }
    for (const host of ['evil.example', 'evil.example:8787', 'localhost.evil.example:8787']) {
      const res = await send({ 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', host });
      assert.equal(res.status, 403, `${route} ${host}`);
      assert.ok((await res.json()).error.startsWith(`${route} refuses a request addressed to ${host}:`));
    }
  }
  assert.deepEqual(inboxAsIs(), before);

  // As the board sends each, through vite's proxy: taken.
  const board = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://localhost:5173', host: '127.0.0.1:8787' };
  assert.equal((await queue(card.name, board)).status, 200);
  assert.equal((await unqueue(other.name, board)).status, 200);
  assert.match(cardText(card.name), /\nqueued: /);
  assert.doesNotMatch(cardText(other.name), /\nqueued: /);
});

// ─── the cap ────────────────────────────────────────────────────────────────

const at = (minute: number) => `2026-09-16T10:${String(minute).padStart(2, '0')}:00.000Z`;

/** A task filed and waiting for a session: in flight. */
const pending = (taskId: string) => {
  fs.mkdirSync(path.join(root, 'engine', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), `${JSON.stringify({ kind: 'filed', at: at(0), brief: 'Implement it.', cwd: repo, maxAttempts: 1, harness: 'codex' })}\n`);
};

/** A run of one step, frozen on the record as `wf start` freezes it. */
function writeRun(id: string, minute: number, fields: { after?: string[]; taskId?: string; cancelled?: boolean } = {}): void {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runs', `${id}.json`), JSON.stringify({
    id, repo, workspace: repo, baseRef: base, branch: 'main', isolate: true, brief: `Run ${id}`, createdAt: at(minute),
    workflowDir: path.join(root, 'no-such-workflow'), workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'codex' }],
    steps: { implement: fields.taskId ? { taskId: fields.taskId, workspace: repo, branch: `wf/${id}/implement` } : { taskId: null } },
    ...(fields.after ? { after: fields.after } : {}),
  }));
  if (fields.cancelled) fs.writeFileSync(path.join(root, 'runs', `${id}.cancelled`), at(minute + 1));
}

/** The daemon's last pass's ceilings, as the tick writes them. */
const tickWrote = (c: { sessions: number; runs: number }) => fs.writeFileSync(path.join(root, 'tick.json'), JSON.stringify(c, null, 2));

const ceilings = async (): Promise<Ceilings> => {
  const res = await app.request('/api/ceilings');
  assert.equal(res.status, 200, await res.clone().text());
  return res.json();
};

/** The runs the package's own `runSlots` holds, on the same store, as the api answers them. */
const packageHeld = async (): Promise<Ceilings['held']> =>
  [...(await runSlots(engine()))].map(([run, slot]) => ({ run, ...slot, word: slotWord(slot) }));

/** One run in flight, two wanting a slot, one waiting on the run in flight, one called off. */
function seedRuns(): void {
  pending('t-flying');
  writeRun('a-flying', 0, { taskId: 't-flying' });
  writeRun('b-wants', 1);
  writeRun('c-wants', 2);
  writeRun('d-waits', 0, { after: ['a-flying'] });
  writeRun('e-called-off', 0, { cancelled: true });
}

test('GET /api/ceilings with no pass written and no cap is `no cap`, and reads nothing: no run, no harness', async () => {
  clear();
  seedRuns();
  const before = observations();
  assert.deepEqual(await ceilings(), { last: null, cap: 0, inFlight: null, held: [] });
  assert.equal(observations(), before, 'no observation of the harness with no cap');
});

test("GET /api/ceilings says the cap the daemon's last pass ran with, the runs in flight against it oldest first, and the runs it holds as `runSlots` holds them — off one observation", async () => {
  clear();
  seedRuns();
  tickWrote({ sessions: 2, runs: 1 });
  let before = observations();
  const one = await ceilings();
  assert.equal(observations() - before, 1, 'one `claude agents` for every run at once');
  // A run waiting on a run in flight wants no slot, and a run called off none: neither counted, neither held.
  assert.deepEqual(one, {
    last: { sessions: 2, runs: 1 },
    cap: 1,
    inFlight: ['a-flying'],
    held: [
      { run: 'b-wants', inFlight: 1, cap: 1, word: 'waiting for a run slot (1 of 1 in flight)' },
      { run: 'c-wants', inFlight: 1, cap: 1, word: 'waiting for a run slot (1 of 1 in flight)' },
    ],
  });
  assert.deepEqual(one.held, await packageHeld(), "held as the package's runSlots holds them");

  // A cap of 2: the oldest wanting a slot is admitted and counted, and the next held at 2 of 2.
  tickWrote({ sessions: 2, runs: 2 });
  const two = await ceilings();
  assert.deepEqual([two.cap, two.inFlight, two.held], [2, ['a-flying'], [{ run: 'c-wants', inFlight: 2, cap: 2, word: 'waiting for a run slot (2 of 2 in flight)' }]]);
  assert.deepEqual(two.held, await packageHeld());

  // A cap of 3: nothing held.
  tickWrote({ sessions: 4, runs: 3 });
  assert.deepEqual(await ceilings(), { last: { sessions: 4, runs: 3 }, cap: 3, inFlight: ['a-flying'], held: [] });
  assert.deepEqual(await packageHeld(), []);

  // Two in flight, oldest first by `createdAt`, then id.
  pending('t-also');
  writeRun('0-also-flying', 5, { taskId: 't-also' });
  before = observations();
  assert.deepEqual((await ceilings()).inFlight, ['a-flying', '0-also-flying']);
  assert.equal(observations() - before, 1);
});

test("REFUSED at shipped defaults: GET /api/ceilings judges by the daemon's last pass and not the api's environment — a pass with no cap is `no cap` beside WF_MAX_RUNS=1 — and reads the api's own only before any pass, refusing one that is not a count by name", async (t) => {
  clear();
  seedRuns();
  t.after(() => { delete process.env.WF_MAX_RUNS; });

  process.env.WF_MAX_RUNS = '1';
  tickWrote({ sessions: 2, runs: 0 });
  assert.deepEqual(await ceilings(), { last: { sessions: 2, runs: 0 }, cap: 0, inFlight: null, held: [] });
  tickWrote({ sessions: 2, runs: 3 });
  assert.equal((await ceilings()).cap, 3, 'the last pass cap, not the shell of the api');

  // Before any pass: the api's own.
  fs.rmSync(path.join(root, 'tick.json'));
  const own = await ceilings();
  assert.deepEqual([own.last, own.cap, own.inFlight, own.held.map((h) => h.run)], [null, 1, ['a-flying'], ['b-wants', 'c-wants']]);

  process.env.WF_MAX_RUNS = 'two';
  const res = await app.request('/api/ceilings');
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, 'WF_MAX_RUNS=two is not a count. It is the most runs in flight at once, a whole number: WF_MAX_RUNS=2 — or 0, or unset, for no cap.');
  // Once a pass has written its ceilings, the api's environment is not read at all.
  tickWrote({ sessions: 2, runs: 2 });
  assert.equal((await ceilings()).cap, 2);
});
