/**
 * The queue, as the board reads and writes it: GET /api/inbox's `queued` and `tried`; POST and DELETE /api/inbox/:name/queue (inbox.ts), a
 * card queued and taken off the queue through the package's `queueInInbox`; and GET /api/ceilings (app.ts), the cap the daemon's last pass
 * ran with and the runs it counts and holds, held to the package's `runSlots` — in the harness's scratch store (`root`) and a scratch
 * repository; and the shell's `WF_MAX_RUNS` is dropped, so no cap comes from it.
 */
import { observations, root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { app } from '../app.ts';
import {
  addToInbox,
  engine,
  inboxNameRefusal,
  noCardLine,
  PHASES,
  queueInInbox,
  readInbox,
  runSlots,
  runStore,
  slotWord,
  standingReader,
  standingSnapshot,
} from 'agent-orchestrator';
import { runWith } from '../../test/placed.ts';
delete process.env.WF_MAX_RUNS;
const repo = scratch('nemia-api-queue-repo-');
process.env.HKB_REPO = repo;
const git = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: repo, encoding: 'utf8' },
  );
git('init', '-q', '-b', 'main');
git('commit', '-q', '--allow-empty', '-m', 'init');
const base = git('rev-parse', 'HEAD').trim();

type InboxEntry = import('./inbox.ts').InboxEntry;
type Ceilings = import('../factory/ceilings.ts').Ceilings;
type InboxQueueAnswer = import('./inbox.ts').InboxQueueAnswer;

const inbox = path.join(root, 'inbox');
const JSON_TYPE = { 'content-type': 'application/json' };

/** Every card, try, record, journal and the tick's ceilings gone, so each test starts from an empty store. */
const clear = (): void => {
  for (const dir of ['inbox', 'queue', 'runs', 'engine']) fs.rmSync(path.join(root, dir), { recursive: true, force: true });
  for (const file of ['tick.json', 'tick-stats.json']) fs.rmSync(path.join(root, file), { force: true });
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
  return (await res.json()) as InboxEntry[];
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

const cardText = (name: string): string => fs.readFileSync(path.join(inbox, `${name}.md`), 'utf8');

test("GET /api/inbox carries a queued card's time and place, and the tick's last try of its start, as the package lists them", async (t) => {
  clear();
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-16T09:30:00.000Z') });
  const first = addToInbox({ text: 'Cache the views between passes', workflow: 'dev', repo }).card;
  const second = addToInbox({ text: 'Show what a step cost', workflow: 'gone' }).card;
  const parked = addToInbox({ text: 'Not queued' }).card;
  queueInInbox(first.name);
  t.mock.timers.tick(1);
  queueInInbox(second.name);
  const tried = {
    at: '2026-09-16T10:00:00.000Z',
    text: cardText(second.name),
    repo,
    why: `no workflow gone in ${repo}/workflows.`,
    refused: true,
  };
  fs.mkdirSync(path.join(root, 'queue'), { recursive: true });
  fs.writeFileSync(path.join(root, 'queue', `${second.name}.json`), JSON.stringify(tried));

  const entries = await listed();
  const byName = new Map(entries.map((e) => [e.name, e]));
  for (const entry of readInbox()) {
    const { body, filedAt, ...rest } = byName.get(entry.name)!;
    assert.deepEqual(rest, entry, `${entry.name}: every key the package lists, as it lists it, the api's own two beside them`);
    assert.equal(typeof body, 'string');
    assert.equal(typeof filedAt, 'string');
  }
  assert.equal(byName.get(first.name)!.queued!.place, 1);
  assert.match(byName.get(first.name)!.queued!.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(byName.get(first.name)!.tried, undefined, 'no try of a card the tick has not tried');
  assert.equal(byName.get(second.name)!.queued!.place, 2);
  assert.deepEqual(
    byName.get(second.name)!.tried,
    { at: tried.at, repo, why: tried.why, refused: true },
    "the tick's own file for a start it refused, of the card as it stands",
  );
  assert.equal('queued' in byName.get(parked.name)!, false, 'a card not queued carries no `queued`');
});

test('POST /api/inbox/:name/queue queues a card as `nemia inbox queue` does, with its place; DELETE takes it back as `--off` does, and says so of a card not queued, writing nothing', async (t) => {
  clear();
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-16T09:30:00.000Z') });
  const first = addToInbox({ text: 'Cache the views between passes', workflow: 'dev' }).card;
  const second = addToInbox({ text: 'Show what a step cost', workflow: 'dev', repo }).card;

  const queued = await queue(first.name);
  assert.equal(queued.status, 200, await queued.clone().text());
  const answer = (await queued.json()) as InboxQueueAnswer;
  assert.match(answer.queued!, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual(answer, {
    name: first.name,
    file: path.join(inbox, `${first.name}.md`),
    was: 'queued',
    queued: answer.queued,
    place: 1,
    of: 1,
  });
  assert.equal(
    cardText(first.name),
    `---\nworkflow: dev\nqueued: ${answer.queued}\n---\nCache the views between passes\n`,
    'written as nemia inbox queue writes it',
  );

  t.mock.timers.tick(1);
  const behind = (await (await queue(second.name, JSON_TYPE, '{}')).json()) as InboxQueueAnswer;
  assert.deepEqual([behind.was, behind.place, behind.of], ['queued', 2, 2], 'a body of {} is no body');
  const byName = (a: readonly unknown[], b: readonly unknown[]) => String(a[0]).localeCompare(String(b[0]));
  assert.deepEqual(
    (await listed()).map((e) => [e.name, e.queued?.place ?? null]).sort(byName),
    [
      [first.name, 1],
      [second.name, 2],
    ].sort(byName),
  );

  const off = await unqueue(first.name);
  assert.equal(off.status, 200, await off.clone().text());
  assert.deepEqual(await off.json(), {
    name: first.name,
    file: path.join(inbox, `${first.name}.md`),
    was: 'taken back',
    queued: null,
    place: null,
    of: null,
  });
  assert.equal(cardText(first.name), '---\nworkflow: dev\n---\nCache the views between passes\n');
  assert.equal((await listed()).find((e) => e.name === second.name)!.queued!.place, 1, 'the card behind it moves up');

  const before = inboxAsIs();
  const again = await unqueue(first.name);
  assert.equal(again.status, 200);
  assert.equal(((await again.json()) as InboxQueueAnswer).was, 'not queued', 'taken back again: not queued');
  assert.deepEqual(inboxAsIs(), before, 'and nothing written');
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
  assert.equal(((await off.json()) as InboxQueueAnswer).was, 'taken back');
  assert.doesNotMatch(cardText(older.card.name), /\nqueued: /, 'the card is taken off the queue');
  assert.deepEqual(await filedAt(), before, 'taken back, it keeps it too');

  assert.equal(
    (await queue(newer.card.name, JSON_TYPE, '{"workflow":"dev"}')).status,
    400,
    'refused: nothing is written, and nothing is set',
  );
  assert.equal((await unqueue(newer.card.name)).status, 200);
  assert.deepEqual(await filedAt(), before, 'a refusal, and a card taken off a queue it was not in, leave it as it was');
});

test('DELETE /api/inbox/:name/queue takes back a queued card whose repository is gone, as `--off` does without the check — and the listing keeps its place until then', async () => {
  clear();
  const about = scratch('nemia-api-queue-gone-');
  const { card } = addToInbox({ text: 'About a repository deleted', workflow: 'dev', repo: about });
  queueInInbox(card.name);
  fs.rmSync(about, { recursive: true, force: true });
  const entry = (await listed()).find((e) => e.name === card.name)!;
  assert.match(entry.error!, /names no directory/);
  assert.equal(entry.queued!.place, 1);

  const off = await unqueue(card.name);
  assert.equal(off.status, 200, await off.clone().text());
  assert.equal(((await off.json()) as InboxQueueAnswer).was, 'taken back');
  assert.equal((await listed()).find((e) => e.name === card.name)!.queued, undefined);
});

test("REFUSED at shipped defaults: a queue of a card with no workflow, or that does not read, is a 422; of a card not there a 404; of one queued already, or a run was started from, a 409 — each the package's sentence word for word, and nothing written", async () => {
  clear();
  const bare = addToInbox({ text: 'No workflow named' }).card;
  const queued = addToInbox({ text: 'Queued already', workflow: 'dev' }).card;
  queueInInbox(queued.name);
  const started = addToInbox({ text: 'Started, its removal failed', workflow: 'dev' }).card;
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runs', 'started-run-k2q9.json'), startedFrom('started-run-k2q9', started.name));
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
    const { error } = (await res.json()) as { error: string };
    assert.equal(error, refusalOf(name, off), `${off ? 'DELETE' : 'POST'} ${name}`);
  }
  assert.ok(
    refusalOf('no-such-card').startsWith(noCardLine('no-such-card', ['broken', bare.name, queued.name, started.name])),
    'the sentences are the ones a person reads at the command line: not there names the cards there are',
  );
  assert.match(refusalOf(bare.name), /no workflow — a queued card starts on its own/);
  assert.match(refusalOf(queued.name), /already queued, at .+, 1 in the queue's order/);
  assert.match(refusalOf(started.name), /this card was started as started-run-k2q9/);
  assert.deepEqual(inboxAsIs(), before);
});

test("REFUSED as shipped: a queue of a card that names no factory is a 422 in the package's sentence, and nothing is written; a card of a factory is queued in it, and an unfactored card queued before the rule is still taken back", async (t) => {
  const was = process.env.WF_DEFAULT_FACTORY_STARTS;
  delete process.env.WF_DEFAULT_FACTORY_STARTS;
  t.after(() => {
    if (was !== undefined) process.env.WF_DEFAULT_FACTORY_STARTS = was;
  });
  clear();
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(path.join(inbox, 'loose.md'), '---\nworkflow: dev\n---\nSomewhere.\n');
  fs.writeFileSync(path.join(inbox, 'placed.md'), '---\nworkflow: dev\nfactory: mill\n---\nIn the mill.\n');
  fs.writeFileSync(path.join(inbox, 'older.md'), '---\nworkflow: dev\nqueued: 2026-09-16T09:01:00.000Z\n---\nQueued before the rule.\n');
  const before = inboxAsIs();

  const refused = await queue('loose');
  assert.equal(refused.status, 422);
  const { error } = (await refused.json()) as { error: string };
  assert.equal(error, refusalOf('loose'));
  assert.match(
    error,
    /inbox\/loose\.md: this card names no factory, and a queued card is started on its own only in the factory named for it\. .* then queue it again: nemia inbox queue loose\. Nothing was queued\.$/,
  );
  assert.deepEqual(inboxAsIs(), before);

  const placed = await queue('placed');
  assert.equal(placed.status, 200, await placed.clone().text());
  const entry = (await listed()).find((e) => e.name === 'placed')!;
  assert.deepEqual([entry.factory, entry.queued?.place], ['mill', 2]);

  const back = await unqueue('older');
  assert.equal(back.status, 200, await back.clone().text());
  assert.doesNotMatch(fs.readFileSync(path.join(inbox, 'older.md'), 'utf8'), /queued:/);
});

test("REFUSED at shipped defaults: a queue of a name that is not a card's is a 400 in the package's words, and a body that is not none or `{}` a 400 in the api's — a workflow sent among them — before the card is read, and nothing written", async () => {
  clear();
  const { card } = addToInbox({ text: 'No workflow named' });
  const before = inboxAsIs();
  for (const [sent, name] of [
    ['.hidden', '.hidden'],
    ['..%2Fruns%2Fr-1', '../runs/r-1'],
    ['a%2Fb', 'a/b'],
    ['a%5Cb', 'a\\b'],
  ] as const) {
    for (const send of [queue, unqueue]) {
      const res = await send(sent);
      assert.equal(res.status, 400, sent);
      assert.equal(((await res.json()) as { error: string }).error, inboxNameRefusal(name), sent);
    }
  }
  const route = `POST /api/inbox/${card.name}/queue`;
  const withWorkflow = await queue(card.name, JSON_TYPE, JSON.stringify({ workflow: 'dev' }));
  assert.equal(withWorkflow.status, 400);
  assert.equal(
    ((await withWorkflow.json()) as { error: string }).error,
    `${route} takes no body, or \`{}\`: the card is named in the path, and queued on the workflow it names, and this request sent {"workflow":"dev"}. A card is queued on the workflow it names: file it with one, or queue it with \`nemia inbox queue <name> --workflow <w>\`, which writes both.`,
  );
  for (const body of ['{"off":true}', '[]', '"dev"', 'not json']) {
    const res = await queue(card.name, JSON_TYPE, body);
    assert.equal(res.status, 400, body);
    assert.ok(((await res.json()) as { error: string }).error.startsWith(`${route} takes no body, or \`{}\``), body);
  }
  const offRoute = await unqueue(card.name, JSON_TYPE, '{"workflow":"dev"}');
  assert.equal(offRoute.status, 400);
  assert.ok(
    ((await offRoute.json()) as { error: string }).error.startsWith(`DELETE /api/inbox/${card.name}/queue takes no body, or \`{}\``),
  );
  assert.deepEqual(inboxAsIs(), before);
});

test("REFUSED at shipped defaults: a queue's body that is JSON and not `{}` — null, a workflow named null — is a 400 saying what was sent, word for word, and nothing is written", async () => {
  clear();
  const { card } = addToInbox({ text: 'Queue me not', workflow: 'dev' });
  const before = inboxAsIs();
  const route = `POST /api/inbox/${card.name}/queue`;
  const takes = `${route} takes no body, or \`{}\`: the card is named in the path, and queued on the workflow it names`;
  const res = await queue(card.name, JSON_TYPE, 'null');
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: string }).error, `${takes}, and this request sent null.`);
  const named = await queue(card.name, JSON_TYPE, '{"workflow":null}');
  assert.equal(named.status, 400);
  assert.equal(
    ((await named.json()) as { error: string }).error,
    `${takes}, and this request sent {"workflow":null}. A card is queued on the workflow it names: file it with one, or queue it with \`nemia inbox queue <name> --workflow <w>\`, which writes both.`,
  );
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
      assert.ok(
        ((await res.json()) as { error: string }).error.startsWith(
          `${route} takes its body as \`content-type: application/json\`, and this request sent \`${type.split(';')[0]}\``,
        ),
      );
    }
    const none = await send({});
    assert.equal(none.status, 415, `${route} with no content-type`);
    assert.ok(((await none.json()) as { error: string }).error.includes('this request sent no content-type'));
    for (const site of ['cross-site', 'same-site', 'none']) {
      const res = await send({ 'content-type': 'application/json', 'sec-fetch-site': site });
      assert.equal(res.status, 403, `${route} ${site}`);
      assert.ok(
        ((await res.json()) as { error: string }).error.startsWith(
          `${route} refuses a request made by a page on another site (Sec-Fetch-Site: ${site})`,
        ),
      );
    }
    for (const host of ['evil.example', 'evil.example:8787', 'localhost.evil.example:8787']) {
      const res = await send({ 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', host });
      assert.equal(res.status, 403, `${route} ${host}`);
      assert.ok(((await res.json()) as { error: string }).error.startsWith(`${route} refuses a request addressed to ${host}:`));
    }
  }
  assert.deepEqual(inboxAsIs(), before);

  const board = {
    'content-type': 'application/json',
    'sec-fetch-site': 'same-origin',
    origin: 'http://localhost:5173',
    host: '127.0.0.1:8787',
  };
  assert.equal((await queue(card.name, board)).status, 200, "a queue as the board sends it, through vite's proxy: taken");
  assert.equal((await unqueue(other.name, board)).status, 200, 'and its taking back, as the board sends it: taken');
  assert.match(cardText(card.name), /\nqueued: /);
  assert.doesNotMatch(cardText(other.name), /\nqueued: /);
});

const at = (minute: number) => `2026-09-16T10:${String(minute).padStart(2, '0')}:00.000Z`;

/** A task filed and waiting for a session: in flight. */
const pending = (taskId: string) => {
  fs.mkdirSync(path.join(root, 'engine', 'tasks'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'engine', 'tasks', `${taskId}.jsonl`),
    `${JSON.stringify({ kind: 'filed', at: at(0), brief: 'Implement it.', cwd: repo, maxAttempts: 1, harness: 'codex' })}\n`,
  );
};

/** A run of one step, frozen on the record as `nemia start` freezes it. */
function writeRun(id: string, minute: number, fields: { after?: string[]; taskId?: string; cancelled?: boolean } = {}): void {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo,
      workspace: repo,
      baseRef: base,
      branch: 'main',
      isolate: true,
      brief: `Run ${id}`,
      createdAt: at(minute),
      workflowDir: path.join(root, 'no-such-workflow'),
      workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'codex' }],
      steps: { implement: fields.taskId ? { taskId: fields.taskId, workspace: repo, branch: `wf/${id}/implement` } : { taskId: null } },
      ...(fields.after ? { after: fields.after } : {}),
    }),
  );
  if (fields.cancelled) fs.writeFileSync(path.join(root, 'runs', `${id}.cancelled`), at(minute + 1));
}

/** The daemon's last pass's ceilings, as the tick writes them. */
const tickWrote = (c: { sessions: number; runs: number }) => fs.writeFileSync(path.join(root, 'tick.json'), JSON.stringify(c, null, 2));

const ceilings = async (): Promise<Ceilings> => {
  const res = await app.request('/api/ceilings');
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as Ceilings;
};

/** The runs the package's own `runSlots` holds, on the same store, the runs waited on read off `standing.json`, as the api answers them. */
const packageHeld = async (): Promise<Ceilings['held']> => {
  const git = standingReader(await runWith(engine(), standingSnapshot()));
  const held = await runWith(engine(), runSlots(engine(), runStore.runs.list(), process.env, { git, read: new Map() }));
  return [...held].map(([run, slot]) => ({ run, ...slot, word: slotWord(slot) }));
};

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
  assert.deepEqual(await ceilings(), { last: null, cap: 0, inFlight: null, held: [], pass: null });
  assert.equal(observations(), before, 'no observation of the harness with no cap');
});

test("GET /api/ceilings says the cap the daemon's last pass ran with, the runs in flight against it oldest first, and the runs it holds as `runSlots` holds them — off one list", async () => {
  clear();
  seedRuns();
  tickWrote({ sessions: 2, runs: 1 });
  let before = observations();
  const one = await ceilings();
  assert.equal(
    observations() - before,
    0,
    'no `claude agents`: one list of the runs’ tasks, which asks a harness only of a background session among them, and there is none',
  );
  assert.deepEqual(
    one,
    {
      last: { sessions: 2, runs: 1 },
      cap: 1,
      inFlight: ['a-flying'],
      held: [
        { run: 'b-wants', inFlight: 1, cap: 1, word: 'waiting for a run slot (1 of 1 in flight)' },
        { run: 'c-wants', inFlight: 1, cap: 1, word: 'waiting for a run slot (1 of 1 in flight)' },
      ],
      pass: null,
    },
    'a run waiting on a run in flight wants no slot, and a run called off none: neither counted, neither held',
  );
  assert.deepEqual(one.held, await packageHeld(), "held as the package's runSlots holds them");

  tickWrote({ sessions: 2, runs: 2 });
  const two = await ceilings();
  assert.deepEqual(
    [two.cap, two.inFlight, two.held],
    [2, ['a-flying'], [{ run: 'c-wants', inFlight: 2, cap: 2, word: 'waiting for a run slot (2 of 2 in flight)' }]],
    'a cap of 2: the oldest wanting a slot is admitted and counted, and the next held at 2 of 2',
  );
  assert.deepEqual(two.held, await packageHeld());

  tickWrote({ sessions: 4, runs: 3 });
  assert.deepEqual(
    await ceilings(),
    { last: { sessions: 4, runs: 3 }, cap: 3, inFlight: ['a-flying'], held: [], pass: null },
    'a cap of 3: nothing held',
  );
  assert.deepEqual(await packageHeld(), []);

  pending('t-also');
  writeRun('0-also-flying', 5, { taskId: 't-also' });
  before = observations();
  assert.deepEqual((await ceilings()).inFlight, ['a-flying', '0-also-flying'], 'two in flight, oldest first by createdAt, then id');
  assert.equal(observations() - before, 0);
});

test("REFUSED at shipped defaults: GET /api/ceilings judges by the daemon's last pass and not the api's environment — a pass with no cap is `no cap` beside WF_MAX_RUNS=1 — and reads the api's own only before any pass, refusing one that is not a count by name", async (t) => {
  clear();
  seedRuns();
  t.after(() => {
    delete process.env.WF_MAX_RUNS;
  });

  process.env.WF_MAX_RUNS = '1';
  tickWrote({ sessions: 2, runs: 0 });
  assert.deepEqual(await ceilings(), { last: { sessions: 2, runs: 0 }, cap: 0, inFlight: null, held: [], pass: null });
  tickWrote({ sessions: 2, runs: 3 });
  assert.equal((await ceilings()).cap, 3, 'the last pass cap, not the shell of the api');

  fs.rmSync(path.join(root, 'tick.json'));
  const own = await ceilings();
  assert.deepEqual(
    [own.last, own.cap, own.inFlight, own.held.map((h) => h.run)],
    [null, 1, ['a-flying'], ['b-wants', 'c-wants']],
    "before any pass: the api's own",
  );

  process.env.WF_MAX_RUNS = 'two';
  const res = await app.request('/api/ceilings');
  assert.equal(res.status, 422, 'an Invalid, as every route answers one');
  assert.equal(
    ((await res.json()) as { error: string }).error,
    'WF_MAX_RUNS=two is not a count. It is the most runs in flight at once, a whole number: WF_MAX_RUNS=2 — or 0, or unset, for no cap.',
  );
  tickWrote({ sessions: 2, runs: 2 });
  assert.equal((await ceilings()).cap, 2, "once a pass has written its ceilings, the api's environment is not read at all");
});

/** What a pass cost, as the tick writes it (`recordPassCost`): each phase, the harnesses observed, and the totals. */
const PASS = {
  at: '2026-09-25T10:00:00.000Z',
  ms: 212,
  records: 12,
  bytes: 812_000,
  spawned: 1,
  overheadMs: 0.4,
  rested: 0,
  phases: Object.fromEntries(
    PHASES.map((p, k) => [p, { ms: k * 10, calls: 1, bytes: p === 'journals' ? 812_000 : 0, reads: 1, spawned: p === 'observe' ? 1 : 0 }]),
  ),
  harnesses: { claude: { calls: 1, ms: 30, listed: 3, spawned: 1 } },
};

test('GET /api/ceilings serves what the last pass cost beside the ceilings, cap or none, as the tick wrote it; null for a file that does not read as one', async () => {
  clear();
  const stats = path.join(root, 'tick-stats.json');
  fs.writeFileSync(stats, JSON.stringify(PASS));
  assert.deepEqual((await ceilings()).pass, PASS, 'with no cap');
  tickWrote({ sessions: 2, runs: 2 });
  const capped = await ceilings();
  assert.equal(capped.cap, 2);
  assert.deepEqual(capped.pass, PASS, 'and with one');

  fs.writeFileSync(stats, JSON.stringify(PASS).slice(0, 80));
  assert.equal((await ceilings()).pass, null, 'half a file is no pass');
  fs.writeFileSync(stats, JSON.stringify({ ...PASS, phases: { ...PASS.phases, place: undefined } }));
  assert.equal((await ceilings()).pass, null, 'nor one missing a phase');
});
