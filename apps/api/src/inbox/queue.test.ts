/**
 * The queue, as the board reads and writes it, told as a story of cards queued and taken back, one table of what the queue refuses, and a
 * story of the ceilings: the Card's `spec.queued` and `status.lastStart` (`GET /api/cards`); the Card's `queue` and `unqueue` verbs
 * (`POST /api/namespaces/:namespace/cards/:name/queue` and `…/unqueue`, objects/cards.ts), a card queued and taken off the queue through
 * the package's `nemia inbox queue` entry; and GET /api/ceilings (app.ts), the cap the daemon's last pass ran with and the runs it counts
 * and holds, held to the package's `runSlots` — in the harness's scratch store (`root`) and a scratch repository; and the shell's
 * `WF_MAX_RUNS` is dropped, so no cap comes from it.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Card, CardList } from 'objects';
import { scratch } from '../../test/scratch.ts';
import { story } from '../../test/checkpoints.ts';
import { app } from '../app.ts';
import {
  addToInbox,
  engine,
  type InboxListing,
  PHASES,
  queueInInbox,
  queueOrder,
  readInbox,
  runSlots,
  runStore,
  slotWord,
  standingReader,
  standingSnapshot,
  StoreRoot,
} from 'agent-orchestrator';
import { runWith } from '../../test/builtin-place.ts';
import { Effect } from 'effect';

/** `program`, one of the package's inbox verbs, run on the harness's store (`root`): its refusal thrown as itself. */
const onStore = <A, E>(program: Effect.Effect<A, E>): A => Effect.runSync(Effect.provideService(program, StoreRoot, root));
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

type Ceilings = import('../factory/ceilings.ts').Ceilings;

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

/** The Card's `queue` (or, `off`, its `unqueue`) of the card `name` in `namespace`, `body` sent where given. */
const verb =
  (off: boolean) =>
  (name: string, headers: Record<string, string> = JSON_TYPE, body?: string, namespace = 'default') =>
    app.request(`/api/namespaces/${namespace}/cards/${name}/${off ? 'unqueue' : 'queue'}`, {
      method: 'POST',
      headers,
      ...(body !== undefined ? { body } : {}),
    });
const queue = verb(false);
const unqueue = verb(true);
const listed = async (): Promise<Card[]> => {
  const res = await app.request('/api/cards');
  assert.equal(res.status, 200);
  return ((await res.json()) as CardList).items.slice();
};

/** The names of the cards queued and not started, in the order the tick starts them, read off the Cards: the place each is in. */
const inLine = (cards: readonly Card[]): string[] =>
  cards
    .filter((c) => c.spec.queued !== undefined && !c.status.runs.length)
    .sort((a, b) => (a.spec.queued ?? '').localeCompare(b.spec.queued ?? '') || a.metadata.name.localeCompare(b.metadata.name))
    .map((c) => c.metadata.name);

/** What a Card says of the keys the package lists of its card, in the package's spelling: none for a key the card does not set. */
const asListed = (c: Card) => ({
  name: c.metadata.name,
  title: c.status.title ?? null,
  workflow: c.spec.workflow ?? null,
  repo: c.spec.repo ?? null,
  factory: c.metadata.namespace === 'default' ? null : (c.metadata.namespace ?? null),
  from: c.spec.from ?? [],
  startedAs: c.status.runs,
  labels: c.metadata.labels ?? {},
  state: c.status.state,
  error: c.status.error ?? null,
  queued: c.spec.queued ?? null,
  tried: c.status.lastStart ?? null,
});

/** The same keys of the package's own listing of a card. */
const packageListed = (l: Omit<InboxListing, 'state'>) => ({
  name: l.name,
  title: l.title,
  workflow: l.workflow,
  repo: l.repo,
  factory: l.factory,
  from: l.from,
  startedAs: l.startedAs,
  labels: l.labels,
  error: l.error,
  queued: l.queued?.at ?? null,
  tried: l.tried ?? null,
});

/** What the package refuses a queue of `name` with — or its taking back — asked of it directly, which writes nothing when it refuses. */
const refusalOf = (name: string, off = false): string => {
  try {
    onStore(queueInInbox(name, { off }));
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

test("a person queues cards, reads their order and the tick's tries, and takes them back", async (t) => {
  const s = story(t);
  await s.test(
    "GET /api/cards carries a queued card's time, and the tick's last try of its start, as the package lists them, and its order is the package's",
    async (t) => {
      clear();
      t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-16T09:30:00.000Z') });
      const first = onStore(addToInbox({ text: 'Cache the views between passes', workflow: 'dev', repo })).card;
      const second = onStore(addToInbox({ text: 'Show what a step cost', workflow: 'gone' })).card;
      const parked = onStore(addToInbox({ text: 'Not queued' })).card;
      onStore(queueInInbox(first.name));
      t.mock.timers.tick(1);
      onStore(queueInInbox(second.name));
      const tried = {
        at: '2026-09-16T10:00:00.000Z',
        text: cardText(second.name),
        repo,
        why: `no workflow gone in ${repo}/workflows.`,
        refused: true,
      };
      fs.mkdirSync(path.join(root, 'queue'), { recursive: true });
      fs.writeFileSync(path.join(root, 'queue', `${second.name}.json`), JSON.stringify(tried));

      const cards = await listed();
      const byName = new Map(cards.map((c) => [c.metadata.name, c]));
      const listing = onStore(readInbox());
      for (const entry of listing) {
        const card = byName.get(entry.name);
        assert.ok(card, `${entry.name} is listed`);
        const { state: _state, ...rest } = asListed(card);
        assert.deepEqual(rest, packageListed(entry), `${entry.name}: every key the package lists that a Card holds, as it lists it`);
        assert.equal(typeof card.spec.body, 'string');
        assert.equal(typeof card.metadata.creationTimestamp, 'string');
      }
      assert.deepEqual(
        [first.name, second.name, parked.name].map((name) => byName.get(name)?.status.state),
        ['queued', 'refused', 'filed'],
        "each card's state, none of them started",
      );
      assert.deepEqual(inLine(cards), [first.name, second.name], "the queue's order, read off the Cards");
      assert.deepEqual(
        inLine(cards),
        queueOrder(listing).map((l) => l.name),
        "the order the package's queue starts them in",
      );
      assert.match(byName.get(first.name)?.spec.queued ?? '', /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(byName.get(first.name)?.status.lastStart, undefined, 'no try of a card the tick has not tried');
      assert.deepEqual(
        byName.get(second.name)?.status.lastStart,
        { at: tried.at, repo, why: tried.why, refused: true },
        "the tick's own file for a start it refused, of the card as it stands",
      );
      assert.equal(byName.get(parked.name)?.spec.queued, undefined, 'a card not queued carries no `queued`');
    },
  );

  await s.test(
    'the queue verb queues a card as `nemia inbox queue` does, behind those queued before; unqueue takes it back as `--off` does, and a second writes nothing',
    async (t) => {
      clear();
      t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-16T09:30:00.000Z') });
      const first = onStore(addToInbox({ text: 'Cache the views between passes', workflow: 'dev' })).card;
      const second = onStore(addToInbox({ text: 'Show what a step cost', workflow: 'dev', repo })).card;

      const queued = await queue(first.name);
      assert.equal(queued.status, 200, await queued.clone().text());
      const answer = (await queued.json()) as Card;
      assert.equal(answer.metadata.name, first.name);
      assert.equal(answer.status.state, 'queued');
      assert.match(answer.spec.queued ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      assert.equal(
        cardText(first.name),
        `---\nworkflow: dev\nqueued: ${answer.spec.queued}\n---\nCache the views between passes\n`,
        'written as nemia inbox queue writes it',
      );

      t.mock.timers.tick(1);
      const behind = await queue(second.name, JSON_TYPE, '{}');
      assert.equal(behind.status, 200, 'a body of {} is no body');
      assert.deepEqual(inLine(await listed()), [first.name, second.name]);

      const off = await unqueue(first.name);
      assert.equal(off.status, 200, await off.clone().text());
      const back = (await off.json()) as Card;
      assert.deepEqual([back.metadata.name, back.spec.queued, back.status.state], [first.name, undefined, 'filed']);
      assert.equal(cardText(first.name), '---\nworkflow: dev\n---\nCache the views between passes\n');
      assert.deepEqual(inLine(await listed()), [second.name], 'the card behind it moves up');

      const before = inboxAsIs();
      const again = await unqueue(first.name);
      assert.equal(again.status, 200);
      assert.equal(((await again.json()) as Card).spec.queued, undefined, 'taken back again: not queued');
      assert.deepEqual(inboxAsIs(), before, 'and nothing written');
    },
  );

  await s.test(
    "a queue and its taking back leave a card's filing time as it was: no edit of the idea, and the Inbox orders by it",
    async () => {
      clear();
      const older = onStore(addToInbox({ text: 'Filed an hour ago', workflow: 'dev' }));
      const newer = onStore(addToInbox({ text: 'Filed a minute ago', workflow: 'dev' }));
      const [hourAgo, minuteAgo] = [new Date('2026-09-16T09:00:00.000Z'), new Date('2026-09-16T09:59:00.000Z')];
      fs.utimesSync(older.file, hourAgo, hourAgo);
      fs.utimesSync(newer.file, minuteAgo, minuteAgo);
      const filedAt = async () => new Map((await listed()).map((c) => [c.metadata.name, c.metadata.creationTimestamp]));
      const before = await filedAt();
      assert.deepEqual([before.get(older.card.name), before.get(newer.card.name)], [hourAgo.toISOString(), minuteAgo.toISOString()]);

      const queued = await queue(older.card.name);
      assert.equal(queued.status, 200, await queued.clone().text());
      assert.match(cardText(older.card.name), /\nqueued: /, 'the card is queued');
      assert.deepEqual(await filedAt(), before, 'queued, the older card keeps its filing time, and stays behind the newer one');

      const off = await unqueue(older.card.name);
      assert.equal(off.status, 200);
      assert.doesNotMatch(cardText(older.card.name), /\nqueued: /, 'the card is taken off the queue');
      assert.deepEqual(await filedAt(), before, 'taken back, it keeps it too');

      assert.equal((await unqueue(newer.card.name)).status, 200);
      assert.deepEqual(await filedAt(), before, 'a card taken off a queue it was not in is left as it was');
    },
  );

  await s.test(
    'a queued card whose repository is gone is listed in its place, and taken back as `--off` does without the check',
    async () => {
      clear();
      const about = scratch('nemia-api-queue-gone-');
      const { card } = onStore(addToInbox({ text: 'About a repository deleted', workflow: 'dev', repo: about }));
      onStore(queueInInbox(card.name));
      fs.rmSync(about, { recursive: true, force: true });
      const cards = await listed();
      const entry = cards.find((c) => c.metadata.name === card.name);
      assert.match(entry?.status.error ?? '', /names no directory/);
      assert.deepEqual(inLine(cards), [card.name], 'in its place in the queue');

      const off = await unqueue(card.name);
      assert.equal(off.status, 200, await off.clone().text());
      assert.equal(((await off.json()) as Card).spec.queued, undefined, 'taken back');
      assert.equal((await listed()).find((c) => c.metadata.name === card.name)?.spec.queued, undefined);
    },
  );
});

test('the queue verbs: what a queue or a take-back refuses, writing nothing', async (t) => {
  await t.test(
    'a card with no workflow, or that does not read, is a 422; one not there a 404; one queued or started from a 409',
    async () => {
      clear();
      const bare = onStore(addToInbox({ text: 'No workflow named' })).card;
      const queued = onStore(addToInbox({ text: 'Queued already', workflow: 'dev' })).card;
      onStore(queueInInbox(queued.name));
      const started = onStore(addToInbox({ text: 'Started already', workflow: 'dev' })).card;
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
        assert.equal(res.status, status, `${off ? 'unqueue' : 'queue'} ${name}`);
      }
      assert.deepEqual(inboxAsIs(), before);
    },
  );

  await t.test(
    "as shipped, a card that names no factory is a 422 in the package's words; a factory's card is queued, one queued before the rule taken back",
    async (t) => {
      const was = process.env.WF_DEFAULT_FACTORY_STARTS;
      delete process.env.WF_DEFAULT_FACTORY_STARTS;
      t.after(() => {
        if (was !== undefined) process.env.WF_DEFAULT_FACTORY_STARTS = was;
      });
      clear();
      fs.mkdirSync(inbox, { recursive: true });
      fs.writeFileSync(path.join(inbox, 'loose.md'), '---\nworkflow: dev\n---\nSomewhere.\n');
      fs.writeFileSync(path.join(inbox, 'placed.md'), '---\nworkflow: dev\nfactory: mill\n---\nIn the mill.\n');
      fs.writeFileSync(
        path.join(inbox, 'older.md'),
        '---\nworkflow: dev\nqueued: 2026-09-16T09:01:00.000Z\n---\nQueued before the rule.\n',
      );
      const before = inboxAsIs();

      const refused = await queue('loose');
      assert.equal(refused.status, 422);
      const { error } = (await refused.json()) as { error: string };
      assert.equal(error, refusalOf('loose'));
      for (const fact of ['inbox/loose.md: ', 'names no factory', 'nemia inbox queue loose.'])
        assert.ok(error.includes(fact), `${fact}: ${error}`);
      assert.ok(error.endsWith('Nothing was queued.'), error);
      assert.deepEqual(inboxAsIs(), before);

      const placed = await queue('placed', JSON_TYPE, undefined, 'mill');
      assert.equal(placed.status, 200, await placed.clone().text());
      const cards = await listed();
      assert.equal(cards.find((c) => c.metadata.name === 'placed')?.metadata.namespace, 'mill');
      assert.deepEqual(inLine(cards), ['older', 'placed'], 'behind the card queued before it');
      assert.equal((await queue('placed')).status, 404, "a factory's card is no card of the default namespace");

      const back = await unqueue('older');
      assert.equal(back.status, 200, await back.clone().text());
      assert.doesNotMatch(fs.readFileSync(path.join(inbox, 'older.md'), 'utf8'), /queued:/);
    },
  );

  await t.test("a name that is not a card's is a 422 before the card is read, in the package's words", async () => {
    clear();
    onStore(addToInbox({ text: 'No workflow named' }));
    const before = inboxAsIs();
    for (const sent of ['.hidden', '..%2Fruns%2Fr-1', 'a%2Fb', 'a%5Cb']) {
      for (const send of [queue, unqueue]) {
        const res = await send(sent);
        assert.equal(res.status, 422, sent);
        assert.equal(typeof ((await res.json()) as { error: unknown }).error, 'string', sent);
      }
    }
    assert.deepEqual(inboxAsIs(), before);
  });

  await t.test(
    'the queue takes no body: one sent — a workflow, null, text that is no JSON — is not read, so no workflow is written from it',
    async () => {
      clear();
      const { card } = onStore(addToInbox({ text: 'Queue me on mine' }));
      for (const body of [JSON.stringify({ workflow: 'dev' }), '{"workflow":null}', 'null']) {
        const res = await queue(card.name, JSON_TYPE, body);
        assert.equal(res.status, 422, `${body}: the card names no workflow, and none is read from the body`);
      }
      assert.equal(cardText(card.name), 'Queue me on mine\n', 'nothing written');
      const { card: named } = onStore(addToInbox({ text: 'Queue me on dev', workflow: 'dev' }));
      const res = await queue(named.name, JSON_TYPE, 'not json');
      assert.equal(res.status, 200, await res.clone().text());
      assert.equal(((await res.json()) as Card).spec.workflow, 'dev', 'queued on the workflow the card names');
    },
  );
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

test("a person reads the ceilings: no cap, then the cap of the daemon's last pass and the runs it holds, and what the pass cost", async (t) => {
  const s = story(t);
  await s.test('with no pass written and no cap: `no cap`, and nothing read, no run', async () => {
    clear();
    seedRuns();
    assert.deepEqual(await ceilings(), { last: null, cap: 0, inFlight: null, held: [], pass: null });
  });

  await s.test(
    "the cap the daemon's last pass ran with, the runs in flight oldest first, and those held as `runSlots` holds them — off one list",
    async () => {
      clear();
      seedRuns();
      tickWrote({ sessions: 2, runs: 1 });
      const one = await ceilings();
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
      assert.deepEqual((await ceilings()).inFlight, ['a-flying', '0-also-flying'], 'two in flight, oldest first by createdAt, then id');
    },
  );

  await s.test(
    "judged by the last pass, not the api's WF_MAX_RUNS, which is read before any pass alone, and refused (422) when it is no count",
    async (t) => {
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
      const notCount = ((await res.json()) as { error: string }).error;
      for (const fact of ['WF_MAX_RUNS=two is not a count.', 'WF_MAX_RUNS=2']) assert.ok(notCount.includes(fact), `${fact}: ${notCount}`);
      tickWrote({ sessions: 2, runs: 2 });
      assert.equal((await ceilings()).cap, 2, "once a pass has written its ceilings, the api's environment is not read at all");
    },
  );

  await s.test(
    'what the last pass cost, beside the ceilings, cap or none, as the tick wrote it; null for a file that does not read as one',
    async () => {
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
    },
  );
});
