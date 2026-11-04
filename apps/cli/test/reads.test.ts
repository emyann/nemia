/**
 * The moved reads over HTTP, held to the old path: on one seeded store, served by an api started with `--no-tick` on a free port, `nemia
 * show`, `show --raw`, `closeout`, `closeout --try`, `ls`, `ls <run>` and `inbox`, and `ls` and `inbox` with `-l`, `--show-labels` and
 * `-L` on a labelled run and card, print the same stdout and exit with the same code as the same command typed with `--local`, which
 * runs the orchestrator's own CLI in process (the parity guard: the printers live twice
 * until the in-process reads retire). Each read is seen asking the api, by the request line the api says. A bare 404 — an api older than
 * this client — exits 2 naming the restart; an unknown run exits 2 with the api's refusal; no api serving the store, and none started
 * (`NEMIA_DAEMON_START=off`), exits 2 naming `--local`.
 *
 * The store is a scratch folder (the api's `scratch.ts`, which reaps what runs in it), never this machine's; the api writes no lease with
 * `--no-tick`, so the test writes the one the client reads, its `url` alone: a lease that names no holder, which both paths word alike.
 * Every child is waited on for its end, or for the line it says, never for a length of time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { scratch } from '../../api/test/scratch.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');
const API = path.join(import.meta.dirname, '..', '..', 'api');

const root = scratch('nemia-cli-reads-');
const away = scratch('nemia-cli-home-');
const engineRoot = scratch('nemia-cli-engine-');

/** The environment of every child: the scratch stores and home, no telemetry, no daemon started on demand, the ceilings set. */
const ENV: NodeJS.ProcessEnv = (() => {
  const { OTEL_EXPORTER_OTLP_ENDPOINT: _otel, NEMIA_ON_INSTALLED: _installed, ...ambient } = process.env;
  return {
    ...ambient,
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
write(
  path.join(root, 'inbox', 'cache-the-views.md'),
  "---\nworkflow: dev\nlabels:\n  team: core\n---\nCache the engine's views between passes.\n",
);
write(path.join(root, 'inbox', 'tidy-the-docs.md'), '---\nlabels:\n  team: docs\n---\nTidy the docs.\n');
write(path.join(root, 'inbox', 'notes.txt'), 'not a card\n');
write(path.join(root, 'inbox', 'hold-the-reads.md'), 'Hold the reads to the old path.\n');
write(path.join(root, 'inbox', 'called-off.md'), '---\nlabels:\n  team: gone\n---\nCalled off.\n');

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
  [['show', RUN, '--raw'], /\/api\/runs\/r-parity\b/],
  [['closeout', RUN, 'build'], /\/api\/runs\/r-parity\/steps\/build\/tries/],
  [['closeout', RUN, 'build', '--try', '1'], /\/api\/runs\/r-parity\/steps\/build\/tries\/1\/closeout/],
  [['closeout', RUN, 'review'], /\/api\/runs\/r-parity\/steps\/review\/tries/],
  [['ls'], /\/api\/listing\b/],
  [['ls', RUN], /\/api\/listing\/r-parity\b/],
  [['inbox'], /\/api\/inbox\b/],
  [['ls', '-l', 'team=core', '--show-labels', '-L', 'team'], /\/api\/listing\b/],
  [['ls', '-l', 'team=core', '-l', 'team', '-L', 'workflow'], /\/api\/listing\b/],
  [['ls', RUN, '--show-labels'], /\/api\/listing\/r-parity\b/],
  [['inbox', '-l', 'team=core', '-l', 'team=docs', '--show-labels', '-L', 'team'], /\/api\/inbox\b/],
  [['inbox', '-L', 'team', '-L', 'workflow'], /\/api\/inbox\b/],
  [['inbox', '-l', 'team=nope'], /\/api\/inbox\b/],
  [['inbox', '--all'], /\/api\/inbox\b/],
  [['inbox', '-l', 'team=gone'], /\/api\/inbox\b/],
  [['inbox', '-l', 'team=gone', '--all'], /\/api\/inbox\b/],
];

test("a started card says its run's phase, `waiting on you` where its run waits on a person; one whose run ended is listed with --all alone", async () => {
  const listed = await nemia(['inbox']);
  assert.equal(listed.code, 0, listed.err);
  assert.match(listed.out, /^hold-the-reads .*  started as r-parity, waiting on you$/m, 'its run waits on a person');
  assert.doesNotMatch(listed.out, /^called-off /m, 'its run was called off: out of the cards in play');
  const all = await nemia(['inbox', '--all']);
  assert.match(
    all.out,
    /^called-off .*  started as r-cancelled, cancelled$/m,
    'listed with --all, sent to the api as ?all=true, in its phase',
  );
  const gone = await nemia(['inbox', '-l', 'team=gone']);
  assert.match(gone.out, /1 whose run ended/, 'a selector only ended cards match says how many, and how to list them');
  assert.match(gone.out, /nemia inbox --all/);
});

test('the labels the parity seeds show on the lines a person asks them on', async () => {
  const listed = await nemia(['ls', '-l', 'team=core', '--show-labels']);
  assert.match(
    listed.out,
    /^r-parity .*  labels: factory=default,team=core,workflow=no-such-workflow$/m,
    "the run's whole map on its head line",
  );
  assert.doesNotMatch(listed.out, /^r-held /m, 'a run the selector does not take is not listed: it reached the api');
  const either = await nemia(['inbox', '-l', 'team=core', '-l', 'team=docs']);
  assert.match(either.out, /^cache-the-views /m, 'one selector takes a card');
  assert.match(either.out, /^tidy-the-docs /m, 'and another takes another');
  assert.doesNotMatch(either.out, /^notes\.txt /m, 'and neither takes an entry with no labels');
  const cards = await nemia(['inbox', '-L', 'team']);
  assert.match(cards.out, /^cache-the-views .*  team: core$/m, "a card's column");
  assert.match(cards.out, /^notes\.txt .*  team: <none>$/m, 'an entry with no such key says none');
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

test('REFUSED: a bare 404 — an api older than this nemia, with no /api/listing — exits 2 naming `nemia service restart`', async (t) => {
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
