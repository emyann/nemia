/**
 * The moved reads over HTTP, on one seeded store served by an api started with `--no-tick` on a free port. `nemia show`, `show --raw`,
 * `closeout` and `closeout --try` print the same stdout and exit with the same code as the same command typed with `--local`, which runs
 * the orchestrator's own CLI in process (the parity guard: the printers live twice until the in-process reads retire). `nemia ls` and
 * `nemia inbox` print the server's `Table` of the runs and of the cards (fc2e), asked with `TABLE_ACCEPT`, with `-l`, `--show-labels` and
 * `-L` on a labelled run and card; `nemia ls <run>`, which no server table prints yet, is the old path's. Each read is seen asking the api,
 * by the request line the api says. `nemia ls` over a runs list the api answers in pages, each but the last with a `continue`, prints a
 * line per run of every page (`everyPage`), the api's table cut into pages of two rows by a stand-in in front of it. A bare 404 — an api
 * older than this client — exits 2 naming the restart; an unknown run exits 2 with the api's refusal; no api serving the store, and none
 * started (`NEMIA_DAEMON_START=off`), exits 2 naming `--local`.
 *
 * The store is a scratch folder (`test-kit/scratch`, which reaps what runs in it), never this machine's; the api writes no lease with
 * `--no-tick`, so the test writes the one the client reads, its `url` alone: a lease that names no holder, which both paths word alike.
 * Every child is waited on for its end, or for the line it says, never for a length of time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { LIST_PAGE } from 'objects';
import { ambient } from './ambient.ts';
import { scratch } from 'test-kit/scratch';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');
const API = path.join(import.meta.dirname, '..', '..', 'api');

const root = scratch('nemia-cli-reads-');
const away = scratch('nemia-cli-home-');
const engineRoot = scratch('nemia-cli-engine-');

/** The environment of every child: the scratch stores and home, no telemetry, no daemon started on demand, the ceilings set. */
const ENV: NodeJS.ProcessEnv = (() => {
  return {
    ...ambient('NEMIA_ON_INSTALLED'),
    WF_ROOT: root,
    AE_ROOT: engineRoot,
    HOME: away,
    WF_VERIFY_REST: '1',
    WF_MAX_RUNS: '2',
    WF_MAX_CONCURRENT: '2',
    WF_DEFAULT_FACTORY_STARTS: '1',
    NEMIA_DAEMON_START: 'off',
  };
})();

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const T0 = Date.parse('2026-09-12T00:10:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

/** A task's journal, as the engine writes it. */
const journal = (taskId: string, events: object[]) =>
  write(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), events.map((e) => `${JSON.stringify(e)}\n`).join(''));

/** A task the engine ran once and settled, which signed off with `closeout`. */
const settled = (taskId: string, closeout: object, s: number) =>
  journal(taskId, [
    { kind: 'filed', at: at(s), brief: `The brief of ${taskId}.`, cwd: root, maxAttempts: 1, harness: 'codex' },
    { kind: 'starting', at: at(s + 1), attempt: 1 },
    { kind: 'spawned', at: at(s + 1), attempt: 1 },
    { kind: 'ended', at: at(s + 9), attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout },
    { kind: 'settled', at: at(s + 9), outcome: 'succeeded' },
  ]);

const RUN = 'r-parity';
write(
  path.join(root, 'runs', `${RUN}.json`),
  JSON.stringify({
    id: RUN,
    place: { kind: 'folder' },
    workspace: root,
    brief: 'Hold the reads to the old path\n\nAnd say why.',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: at(0),
    workflow: [
      { name: 'build', after: [], body: 'Build it.', workspace: 'folder', harness: 'codex' },
      { name: 'review', after: ['build'], body: 'Review it.', workspace: 'folder', harness: 'codex' },
    ],
    steps: {
      build: { taskId: 't-build-2', tries: [{ taskId: 't-build-1', cause: 'fresh' }] },
      review: { taskId: 't-review' },
    },
    from: { inbox: 'hold-the-reads' },
  }),
);
/** A run of one step not filed yet, beside `RUN`, with `more` on its record: a wait, a hold or a cancellation for `nemia ls` to word. */
const waitingRun = (id: string, more: object) =>
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      place: { kind: 'folder' },
      workspace: root,
      brief: `The run ${id}`,
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: at(60),
      workflow: [{ name: 'build', after: [], body: 'Build it.', workspace: 'folder', harness: 'codex' }],
      steps: { build: { taskId: null } },
      ...more,
    }),
  );
waitingRun('r-after', { after: ['r-missing'] });
waitingRun('r-held', {});
write(path.join(root, 'runs', 'r-held.hold'), JSON.stringify({ at: at(70), until: [RUN], why: 'merge conflicts', by: 'operator' }));
waitingRun('r-parked', {});
write(path.join(root, 'runs', 'r-parked.hold'), JSON.stringify({ at: at(71), until: [], why: 'folded into an intake', by: 'operator' }));
write(path.join(root, 'cordon'), JSON.stringify({ at: at(90), by: 'operator', why: 'a release' }));
waitingRun('r-cancelled', { cancelledAt: at(80), from: { inbox: 'called-off' } });
settled('t-build-1', { outcome: 'done', summary: 'A first cut.', needs: null, artifacts: [] }, 10);
settled('t-build-2', { outcome: 'done', summary: 'Built it.', needs: null, artifacts: ['NOTES.md'] }, 30);
settled('t-review', { outcome: 'blocked', summary: 'Half reviewed.', needs: 'Which database?', artifacts: [] }, 50);
write(path.join(root, 'runs', `${RUN}.labels`), JSON.stringify({ team: 'core' }));
waitingRun('r-working', { steps: { build: { taskId: 't-working' } } });
journal('t-working', [
  { kind: 'filed', at: at(100), brief: 'The brief of t-working.', cwd: root, harness: 'codex', queued: false },
  { kind: 'starting', at: at(101), attempt: 1 },
  { kind: 'spawned', at: at(101), attempt: 1 },
  {
    kind: 'image',
    at: at(102),
    attempt: 1,
    image: path.join(root, 'releases', 'v1.2.0', 'packages', 'agent-runtime'),
    harnessVersion: '0.200.0',
  },
]);
/**
 * A run of the one step `build`, its task `taskId`, with `more` on its record and `step` on its step's: the seed of `nemia ls`'s lines
 * around and under its table — `standing.json` read long ago, a finished run's result branch, a run whose journal does not read, and a
 * step blocked asking two questions its folder's `output:` declares a field of.
 */
const oneStepRun = (id: string, taskId: string, more: object = {}, step: object = {}) =>
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      place: { kind: 'folder' },
      workspace: root,
      brief: `The run ${id}`,
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: at(200),
      workflow: [{ name: 'build', after: [], body: 'Build it.', workspace: 'folder', harness: 'codex' }],
      steps: { build: { taskId, ...step } },
      ...more,
    }),
  );
write(path.join(root, 'standing.json'), JSON.stringify({ v: 1, at: at(0), places: [] }));
oneStepRun('r-landed', 't-landed', {}, { branch: 'wf/r-landed/build' });
settled('t-landed', { outcome: 'done', summary: 'Built it.', needs: null, artifacts: [] }, 210);
oneStepRun('r-unread', 't-unread', {}, { branch: 'wf/r-unread/build' });
write(path.join(root, 'engine', 'tasks', 't-unread.jsonl'), '{ this is no journal\n');
const asker = path.join(root, 'asker');
write(path.join(asker, 'plan.md'), '---\nworkspace: folder\nharness: codex\noutput: plan.schema.json\n---\nPlan it.\n');
write(
  path.join(asker, 'plan.schema.json'),
  JSON.stringify({
    type: 'object',
    properties: { open: { 'x-shape': 'questions', description: 'What is undecided.' } },
    required: ['open'],
    additionalProperties: false,
  }),
);
write(
  path.join(root, 'runs', 'r-asking.json'),
  JSON.stringify({
    id: 'r-asking',
    place: { kind: 'folder' },
    workspace: root,
    brief: 'The run r-asking',
    workflowDir: asker,
    createdAt: at(300),
    steps: { plan: { taskId: 't-asking' } },
  }),
);
const question = (title: string) => ({
  title,
  body: 'Either.',
  options: [
    { label: 'one', meaning: 'One way.' },
    { label: 'two', meaning: 'Another.' },
  ],
  recommended: null,
  multiple: false,
});
settled(
  't-asking',
  { outcome: 'blocked', summary: 'Half.', needs: 'Two questions.', artifacts: [], open: [question('How?'), question('Where?')] },
  310,
);
write(
  path.join(root, 'inbox', 'cache-the-views.md'),
  "---\nworkflow: dev\nlabels:\n  team: core\n---\nCache the engine's views between passes.\n",
);
write(path.join(root, 'inbox', 'tidy-the-docs.md'), '---\nlabels:\n  team: docs\n---\nTidy the docs.\n');
write(path.join(root, 'inbox', 'notes.txt'), 'not a card\n');
write(path.join(root, 'inbox', 'hold-the-reads.md'), 'Hold the reads to the old path.\n');
write(path.join(root, 'inbox', 'called-off.md'), '---\nlabels:\n  team: gone\n---\nCalled off.\n');
write(
  path.join(root, 'factories', 'nightly.json'),
  JSON.stringify({ repos: [root], schedules: { tidy: { cron: '0 3 * * *', brief: 'Tidy the docs.', since: at(0) } } }),
);

/** How a child ended, and what it said on each stream. */
type Said = { code: number | null; out: string; err: string };

/** `nemia <argv>` on the store, waited on for its end. */
function nemia(argv: readonly string[], env: NodeJS.ProcessEnv = ENV): Promise<Said> {
  const child = spawn(process.execPath, [CLI, ...argv], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => (out += chunk));
  child.stderr.on('data', (chunk) => (err += chunk));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

/** The api on the store, `--no-tick`, on a free port: its url once it says it listens, and everything it said so far. */
async function startApi(): Promise<{ url: string; said: () => string; stop: () => Promise<void> }> {
  const child = spawn(process.execPath, ['src/main.ts', '--no-tick'], { cwd: API, env: { ...ENV, PORT: '0' } });
  let said = '';
  const ended = new Promise<void>((resolve) => child.on('close', () => resolve()));
  const url = await new Promise<string>((resolve, reject) => {
    const look = () => {
      const m = /api listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(said);
      if (m?.[1]) resolve(m[1]);
    };
    child.stdout.on('data', (chunk) => ((said += chunk), look()));
    child.stderr.on('data', (chunk) => ((said += chunk), look()));
    void ended.then(() => reject(new Error(`the api ended before it listened:\n${said}`)));
  });
  return {
    url,
    said: () => said,
    stop: async () => {
      child.kill();
      await ended;
    },
  };
}

/** The lease the client reads: where the store is served, and nothing else of a holder. */
const lease = (url: string | undefined): void => {
  const file = path.join(root, 'daemon.json');
  if (url === undefined) fs.rmSync(file, { force: true });
  else write(file, JSON.stringify({ url }));
};

const api = await startApi();
lease(api.url);
test.after(() => api.stop());

/** Each read the parity holds, by the route the api answers it on. */
const READS: ReadonlyArray<readonly [readonly string[], RegExp]> = [
  [['show', RUN], /\/api\/runs\/r-parity\b/],
  [['show', RUN, '--raw'], /\/api\/runs\/r-parity\/record\b/],
  [['closeout', RUN, 'build'], /\/api\/runs\/r-parity\/steps\/build\/tries/],
  [['closeout', RUN, 'build', '--try', '1'], /\/api\/runs\/r-parity\/steps\/build\/tries\/1\/closeout/],
  [['closeout', RUN, 'review'], /\/api\/runs\/r-parity\/steps\/review\/tries/],
];

test("`nemia ls` prints the server's table of the runs: its columns of priority 0 under their names, a row per run", async () => {
  const before = api.said().length;
  const listed = await nemia(['ls']);
  assert.equal(listed.code, 0, listed.err);
  assert.match(listed.out, /^NAME +STATUS +BRIEF +COST +NOTE +WAITS$/m, "the server's columns, each name in capitals");
  assert.match(listed.out, /^r-parity .* Hold the reads to the old path /m, "a run's row: its name and its brief's first line");
  assert.match(listed.out, /^r-cancelled +cancelled +The run r-cancelled +cancelled$/m, 'a run called off says so in its note');
  assert.doesNotMatch(listed.out, /LABELS/, 'the labels are a column of priority 1, shown when asked');
  assert.match(api.said().slice(before), /\/api\/runs\b/, 'it asked the runs list');
});

test('`nemia ls` over a runs list answered in pages prints a line per run of every page, asking the most a page holds', async (t) => {
  const asks: Array<{ limit: string | null; continue: string | null }> = [];
  const ROWS = 2;
  const paging = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', api.url);
    const headers = Object.fromEntries(
      Object.entries(req.headers).flatMap(([key, value]) =>
        typeof value === 'string' && (key === 'accept' || key === 'authorization') ? [[key, value]] : [],
      ),
    );
    const runs = url.pathname === '/api/runs';
    const at = runs ? Number(url.searchParams.get('continue')?.slice('at-'.length) ?? 0) : 0;
    if (runs) {
      asks.push({ limit: url.searchParams.get('limit'), continue: url.searchParams.get('continue') });
      url.searchParams.delete('limit');
      url.searchParams.delete('continue');
    }
    void fetch(url, { headers }).then(async (answered) => {
      const text = await answered.text();
      const table: unknown = runs && answered.ok ? JSON.parse(text) : undefined;
      if (table === undefined || typeof table !== 'object' || table === null || !('rows' in table) || !Array.isArray(table.rows)) {
        res.writeHead(answered.status, { 'content-type': answered.headers.get('content-type') ?? 'application/json' });
        res.end(text);
        return;
      }
      const next = at + ROWS < table.rows.length ? { continue: `at-${at + ROWS}` } : {};
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ...table, metadata: { ...next }, rows: table.rows.slice(at, at + ROWS) }));
    });
  });
  await new Promise<void>((resolve) => paging.listen(0, '127.0.0.1', resolve));
  const address = paging.address();
  assert.ok(address !== null && typeof address === 'object');
  lease(`http://127.0.0.1:${address.port}`);
  t.after(async () => {
    lease(api.url);
    paging.closeAllConnections();
    await new Promise((resolve) => paging.close(resolve));
  });
  const listed = await nemia(['ls']);
  assert.equal(listed.code, 0, listed.err);
  for (const run of ['r-parity', 'r-after', 'r-held', 'r-parked', 'r-cancelled', 'r-working', 'r-landed', 'r-unread', 'r-asking'])
    assert.match(listed.out, new RegExp(`^${run} `, 'm'), `${run}'s line, whichever page it was on`);
  assert.equal(listed.out.match(/^NAME +STATUS/gm)?.length, 1, 'one table, its columns named once');
  assert.ok(asks.length > 2, `it read on past the first page: ${JSON.stringify(asks)}`);
  assert.deepEqual(
    asks.map((ask) => ask.limit),
    asks.map(() => String(LIST_PAGE.most)),
    'each page asked for the most a page holds',
  );
  assert.deepEqual(
    asks.map((ask) => ask.continue),
    [null, ...asks.slice(1).map((_, i) => `at-${(i + 1) * ROWS}`)],
    'each page after the first asked with the continue the page before answered',
  );
});

test('`nemia ls` says what waits on you: a step blocked in its word, with `nemia decide <run>`; a hold with what lifts it', async () => {
  const listed = await nemia(['ls']);
  assert.equal(listed.code, 0, listed.err);
  const row = listed.out.split('\n').find((line) => line.startsWith('r-parity '));
  assert.ok(row, listed.out);
  assert.match(row, /review succeeded · BLOCKED/, "the blocked step in its word, in the run's status");
  assert.match(row, /waiting on you: review — nemia decide r-parity/, 'what waits on you, and the command that answers it');
  assert.match(listed.out, /^r-held .*held until r-parity lands.*nemia hold r-held --off/m, 'a hold, and what lifts it');
  assert.match(listed.out, /^r-after .*waiting on you: .*r-missing/m, 'a run waited on that never lands');
  const wide = await nemia(['ls', '-o', 'wide']);
  assert.match(wide.out, /^NAME .* WAITS +LABELS +STEPS$/m, 'wide, each step');
  assert.match(wide.out, /^r-parity .*build unverified · done.*; review succeeded · BLOCKED/m, 'each step in its word');
});

test('`nemia ls` says the pause first, and after the runs a line per schedule and the daemon last', async () => {
  const listed = await nemia(['ls']);
  assert.equal(listed.code, 0, listed.err);
  const lines = listed.out.trimEnd().split('\n');
  assert.match(lines[0] ?? '', /^Paus.* by operator: a release; .*nemia resume/, 'the pause, first');
  assert.match(lines[1] ?? '', /^ {3}r-working's build is finishing/, 'each task finishing under it');
  assert.ok(lines.indexOf(lines.find((l) => l.startsWith('NAME ')) ?? '') > 0, 'the table after it');
  const scheduled = lines.findIndex((l) => /^scheduled {2}nightly\/tidy {2}0 3 \* \* \* {2}next .* {2}last none$/.test(l));
  assert.ok(scheduled > 0, `a line per schedule: ${listed.out}`);
  assert.ok(lines.findIndex((l) => l.startsWith('r-')) < scheduled, 'after the runs');
  assert.match(lines.at(-1) ?? '', /^daemon: /, 'the daemon, last');
});

test('`nemia ls` says again what it said before the table: how old where the branches stand is, a step asking, a run unread, a result', async () => {
  const listed = await nemia(['ls']);
  assert.equal(listed.code, 0, listed.err);
  const lines = listed.out.trimEnd().split('\n');
  const stood = lines.findIndex((l) => /^where branches stand: read \d+d\d+h ago$/.test(l));
  assert.ok(stood > 0, `how long ago the last pass read where the branches stand: ${listed.out}`);
  assert.ok(lines.findIndex((l) => l.startsWith('r-')) < stood, 'after the runs');
  assert.ok(stood < lines.findIndex((l) => l.startsWith('scheduled ')), 'before the schedules');
  assert.match(listed.out, /^r-landed .*result: wf\/r-landed\/build — nemia decide r-landed$/m, "a finished run's result branch");
  const wide = await nemia(['ls', '-o', 'wide']);
  assert.equal(wide.code, 0, wide.err);
  assert.match(wide.out, /^r-asking .*plan succeeded · BLOCKED · asks 2 questions$/m, 'a step notes the questions it asks');
  assert.match(wide.out, /^r-unread .*unreadable: .*build unreadable wf\/r-unread\/build$/m, "an unread run's steps off its record");
  assert.match(wide.out, /^r-working .*build .*· on v1\.2\.0, codex 0\.200\.0$/m, 'what the session of a step at work runs on');
});

test('`nemia ls -l <selector> --show-labels -L <key>`: the runs a selector takes, with their labels column and a column of the key', async () => {
  const listed = await nemia(['ls', '-l', 'team=core', '--show-labels', '-L', 'team']);
  assert.equal(listed.code, 0, listed.err);
  assert.match(listed.out, /^NAME +STATUS +BRIEF +COST +NOTE +WAITS +LABELS +TEAM$/m);
  assert.match(listed.out, /^r-parity .*factory=default,team=core,workflow=no-such-workflow +core$/m, "the run's labels, and its team");
  assert.doesNotMatch(listed.out, /^r-held /m, 'a run the selector does not take is not listed: it reached the api');
  const none = await nemia(['ls', '-l', 'team=nope']);
  assert.equal(none.code, 0, none.err);
  assert.match(none.out, /no run matches -l team=nope/);
});

test("`nemia inbox` prints the server's table of the cards in play, then how to start one; --all keeps every card", async () => {
  const before = api.said().length;
  const listed = await nemia(['inbox']);
  assert.equal(listed.code, 0, listed.err);
  assert.match(listed.out, /^NAME +TITLE +WORKFLOW +REPO +FACTORY +QUEUED +STATE +RUNS$/m, "the server's columns");
  assert.match(listed.out, /^hold-the-reads .*waiting on you +r-parity$/m, "a started card's state beside its run");
  assert.match(listed.out, /^notes\.txt /m, 'an entry that is no card is listed too, never hidden');
  assert.doesNotMatch(listed.out, /^called-off /m, 'its run was called off: out of the cards in play');
  assert.match(
    listed.out,
    /start one: nemia start <name> /,
    'a card named as a start takes it on this machine and on another alike, never by a path of this store',
  );
  assert.match(api.said().slice(before), /\/api\/cards\b/, 'it asked the cards list');
  const all = await nemia(['inbox', '--all']);
  assert.match(all.out, /^called-off .*cancelled +r-cancelled$/m, 'listed with --all, in its phase');
  const gone = await nemia(['inbox', '-l', 'team=gone']);
  assert.match(gone.out, /1 whose run ended/, 'a selector only ended cards match says how many, and how to list them');
  assert.match(gone.out, /nemia inbox --all/);
});

test('`nemia inbox -l … -L <key>`: the cards either selector takes, each with a column of the key off its labels', async () => {
  const either = await nemia(['inbox', '-l', 'team=core', '-l', 'team=docs', '-L', 'team']);
  assert.equal(either.code, 0, either.err);
  assert.match(either.out, /^cache-the-views .* core$/m, 'one selector takes a card, its team its column');
  assert.match(either.out, /^tidy-the-docs .* docs$/m, 'and another takes another');
  assert.doesNotMatch(either.out, /^hold-the-reads /m, 'and neither takes a card with no labels');
});

for (const [argv, route] of READS)
  test(`\`nemia ${argv.join(' ')}\` over HTTP prints what \`--local\` prints, and exits the same`, async () => {
    const before = api.said().length;
    const served = await nemia(argv);
    const local = await nemia([...argv, '--local']);
    assert.equal(local.code, 0, `the old path reads the seed: ${local.err}`);
    assert.equal(served.code, local.code, `the same exit code: ${served.err}`);
    assert.equal(served.out, local.out, 'the same stdout');
    assert.equal(served.err, local.err, 'the same stderr');
    assert.match(api.said().slice(before), route, 'it asked the api');
  });

test('`nemia ls` says a hold that names no run is held until a person lifts it, and never that the run waits on you', async () => {
  const listed = await nemia(['ls', 'r-parked']);
  assert.equal(listed.code, 0, listed.err);
  assert.match(
    listed.out,
    /→ held until a person lifts it \(why: folded into an intake; by operator\)  —  nemia hold r-parked --off lifts it/,
  );
  assert.doesNotMatch(listed.out, /waiting on you/);
});

test('`nemia ls` says what the session of a step at work runs on, off its attempt’s record, beside its line', async () => {
  const said = await nemia(['ls', 'r-working']);
  assert.equal(said.code, 0, said.err);
  assert.match(said.out, /build .* · on v1\.2\.0, codex 0\.200\.0/);
});

test("REFUSED: an unknown run is the api's refusal, exit 2, naming the command that lists the runs", async () => {
  const shown = await nemia(['show', 'no-such-run']);
  assert.equal(shown.code, 2, shown.err);
  assert.match(shown.err, /no-such-run/);
  assert.match(shown.err, /nemia ls/);
  assert.equal(shown.out, '');
});

test('REFUSED: a bare 404 — an api older than this nemia, that serves none of its reads — exits 2 naming `nemia service restart`', async (t) => {
  const old = http.createServer((_req, res) => {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404 Not Found');
  });
  await new Promise<void>((resolve) => old.listen(0, '127.0.0.1', resolve));
  const address = old.address();
  assert.ok(address !== null && typeof address === 'object');
  lease(`http://127.0.0.1:${address.port}`);
  t.after(async () => {
    lease(api.url);
    await new Promise((resolve) => old.close(resolve));
  });
  const listed = await nemia(['ls']);
  assert.equal(listed.code, 2, listed.err);
  assert.match(listed.err, /nemia service restart/);
  assert.equal(listed.out, '');
});

test('REFUSED: with no api serving the store and none started, each read exits 2 naming its `--local`', async (t) => {
  lease(undefined);
  t.after(() => lease(api.url));
  for (const argv of [['show', RUN], ['closeout', RUN, 'build'], ['ls'], ['inbox']]) {
    const read = await nemia(argv);
    assert.equal(read.code, 2, `${argv.join(' ')}: ${read.err}`);
    assert.match(read.err, /--local/, argv.join(' '));
    assert.equal(read.out, '', argv.join(' '));
  }
});
