/**
 * The rest of the store's verbs the client holds, typed as a person types them under this machine's context, against one seeded store
 * served by the api (`served.ts`): `nemia concluded`, `logs`, `passes`, `series`, `memory`, the retired `chat speakers|allow|disallow`
 * and `say --as`, `level`, `subscribe`, `unsubscribe`, `pairings ls|approve`, `board link` and `stats`, each its exit code, what it
 * changed in the store, and the lines it prints. The same verbs under a remote context are `rest-remote.test.ts`'s.
 *
 * Each refusal asserts its exit code and the command or the name it names, never its sentence.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { servedStore, write } from './served.ts';

const T0 = Date.parse('2026-09-12T00:10:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

/** A task's journal under the store's engine, as the engine writes it. */
const journal = (root: string, taskId: string, events: object[]) =>
  write(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), events.map((e) => `${JSON.stringify(e)}\n`).join(''));

/** The store: a run whose `build` ran and settled and whose `review` is not filed, a long-lived task at work, and a fact Nemia keeps. */
const store = await servedStore('nemia-rest-', (root) => {
  write(
    path.join(root, 'runs', 'r-done.json'),
    JSON.stringify({
      id: 'r-done',
      place: { kind: 'folder' },
      workspace: root,
      brief: 'Say what was concluded.',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: at(0),
      workflow: [
        { name: 'build', after: [], body: 'Build it.', workspace: 'folder', harness: 'codex' },
        { name: 'review', after: ['build'], body: 'Review it.', workspace: 'folder', harness: 'codex' },
      ],
      steps: { build: { taskId: 't-build' }, review: { taskId: null } },
    }),
  );
  journal(root, 't-build', [
    { kind: 'filed', at: at(1), brief: 'The brief of t-build.', cwd: root, maxAttempts: 1, harness: 'codex' },
    { kind: 'starting', at: at(2), attempt: 1 },
    { kind: 'spawned', at: at(2), attempt: 1 },
    {
      kind: 'ended',
      at: at(9),
      attempt: 1,
      sessionId: 'ae/t-build/1',
      observed: 'done',
      reason: 'harness',
      closeout: { outcome: 'done', summary: 'Built the thing.', needs: null, artifacts: [] },
    },
    { kind: 'settled', at: at(9), outcome: 'succeeded' },
  ]);
  journal(root, 't-long', [
    { kind: 'filed', at: at(1), brief: 'Watch the feed.', cwd: root, harness: 'codex', queued: false, restartPolicy: 'Always' },
    { kind: 'starting', at: at(2), attempt: 1 },
    { kind: 'spawned', at: at(2), attempt: 1 },
  ]);
  write(path.join(root, 'nemia', 'memory', 'feed-cursor'), '42\n');
});
after(store.stop);

/** `nemia <argv>` on the served store, its exit asserted `code`. */
const typed = async (argv: readonly string[], code = 0) => {
  const said = await store.nemia(argv);
  assert.equal(said.code, code, `nemia ${argv.join(' ')}: ${said.err}${said.out}`);
  return said;
};

test('`nemia concluded <run>` prints the section a run started --from it would be handed; a run the store has not is refused', async () => {
  const said = await typed(['concluded', 'r-done']);
  assert.match(said.out, /^## From run r-done/m);
  assert.match(said.out, /Say what was concluded\./);
  assert.doesNotMatch(said.out, /^\n/, 'its leading blank lines dropped');
  const none = await typed(['concluded', 'r-nobody'], 2);
  assert.match(none.err, /r-nobody/);
});

test('`nemia logs <run> <step>` says a step not filed has not run yet; a step the run has not is refused, naming it', async () => {
  assert.equal((await typed(['logs', 'r-done', 'review'])).out, 'review has not run yet\n');
  const none = await typed(['logs', 'r-done', 'ghost'], 2);
  assert.match(none.err, /ghost/);
});

test('`nemia passes` and `nemia series` say nothing is kept yet, print the whole answer with --json, and refuse a bound that is none', async () => {
  assert.match((await typed(['passes'])).out, /^no pass is kept yet: nemia up/);
  const passes = JSON.parse((await typed(['passes', '--json'])).out) as { recent: unknown[]; summary: unknown };
  assert.deepEqual([passes.recent, passes.summary], [[], null]);
  assert.match((await typed(['passes', '--last', '0'], 2)).err, /--last/);
  assert.match((await typed(['series'])).out, /^nothing is kept for 24h yet/);
  assert.equal((JSON.parse((await typed(['series', '--range', '7d', '--json'])).out) as { range: string }).range, '7d');
  assert.match((await typed(['series', '--range', '2w'], 2)).err, /--range/);
});

test('`nemia memory` lists the facts Nemia keeps, one fact prints its words, and a fact she does not keep is refused, naming it', async () => {
  const facts = await typed(['memory']);
  assert.deepEqual(facts.out.split('\n'), [`Nemia keeps 1 fact in ${path.join(store.root, 'nemia', 'memory')}:`, '  feed-cursor', '']);
  assert.equal((await typed(['memory', 'feed-cursor'])).out, '42\n');
  assert.match((await typed(['memory', 'pending'], 2)).err, /pending/);
});

test('REFUSED: the retired `nemia chat speakers|allow|disallow` and `nemia say --as`, exit 2, each naming the token an agent speaks with', async () => {
  for (const argv of [
    ['chat', 'speakers'],
    ['chat', 'allow', 'operator'],
    ['chat', 'disallow', 'operator'],
    ['say', 'r-done', 'build', '--as', 'operator', 'Cut', 'it.'],
  ]) {
    const { err } = await typed(argv, 2);
    for (const named of ['nemia token add', '--agent']) assert.ok(err.includes(named), `nemia ${argv.join(' ')} names ${named}: ${err}`);
  }
  assert.equal(fs.existsSync(path.join(store.root, 'nemia', 'chat', 'speakers.json')), false, 'no list is written');
});

test('`nemia level` reads where she is; a level, a factory raised for a stretch and its raise ended are written; what is no write is refused', async () => {
  const bare = await typed(['level']);
  assert.match(bare.out, /^Nemia: the store at manual$/m);
  assert.match(bare.out, /^ {2}default: manual \(the store's level, for runs in no factory\)$/m);
  for (const [argv, named] of [
    [['level', 'on'], /nemia level/],
    [['level', 'semi-auto', '--for', '2h'], /--factory/],
    [['level', '--factory', 'default', '--end'], /nemia level/],
  ] as const)
    assert.match((await typed(argv, 2)).err, named, argv.join(' '));
  const mill = fs.mkdtempSync(path.join(store.root, 'mill-'));
  await typed(['factory', 'add', 'mill', '--repo', mill]);
  const raised = await typed(['level', 'semi-auto', '--factory', 'mill', '--for', '2h']);
  assert.match(raised.out, /^ {2}mill: semi-auto until \S+, then manual \(the store's\)$/m);
  assert.match(fs.readFileSync(path.join(store.root, 'factories', 'mill', 'level.json'), 'utf8'), /semi-auto/);
  const ended = await typed(['level', '--factory', 'mill', '--end']);
  assert.match(ended.out, /^ {2}mill: manual \(the store's\)$/m);
  assert.match((await typed(['level', 'auto', '--factory', 'nowhere'], 2)).err, /nowhere/);
});

test('`nemia subscribe` gives a long-lived task a subscription, a former word said on stderr; `unsubscribe` takes it away', async () => {
  const made = await typed(['subscribe', 'watcher', 't-long', '-l', 'reason=NeedsHuman', '--digest-every', '15']);
  assert.match(
    made.out,
    /^subscribed watcher: t-long is told at once of a line taken by reason=NeedsHuman, and of the rest in a digest every 15 minutes/,
  );
  assert.match(made.err, /^nemia subscribe: .*NeedsHuman/m);
  const file = path.join(store.root, 'subscriptions', 'watcher.json');
  assert.deepEqual((JSON.parse(fs.readFileSync(file, 'utf8')) as { selectors: string[] }).selectors, ['reason=NeedsHuman']);
  const plain = await typed(['subscribe', 'plain', 't-long']);
  assert.match(plain.out, /taken by waits=person/);
  assert.equal(plain.err, '');
  assert.match((await typed(['subscribe', 'ghostly', 't-nobody'], 2)).err, /t-nobody/);
  assert.match((await typed(['subscribe', 'loud', 't-long', '--wake', 'failed'], 2)).err, /-l waits=person/);
  assert.equal((await typed(['unsubscribe', 'watcher'])).out, 'unsubscribed watcher: its task is told nothing more of the feed.\n');
  assert.equal(fs.existsSync(file), false);
});

test('`nemia pairings approve <code>` approves the pairing a client asked for, which `pairings ls` lists; `board link` prints a link once', async () => {
  assert.equal((await typed(['pairings', 'ls'])).out, 'no pairing is kept: a client asks for one with nemia pair <url>\n');
  const asked = (await (
    await fetch(`${store.url}/api/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client: 'laptop' }),
    })
  ).json()) as { code: string };
  const approved = await typed(['pairings', 'approve', asked.code]);
  assert.match(approved.out, /^approved laptop's pairing: it claims its token on its next ask, until \S+$/m);
  assert.match((await typed(['pairings', 'ls'])).out, /^\S+ {2}laptop {2}claimable {2}expires \S+$/m, 'approved, it waits for its claim');
  assert.match((await typed(['pairings', 'approve', 'ZZZZ-ZZZZ'], 2)).err, /ZZZZ/);
  const link = await typed(['board', 'link', '--base', 'http://box:8787']);
  const [url, note] = link.out.split('\n');
  assert.match(url ?? '', /^http:\/\/box:8787\//);
  assert.match(note ?? '', /^open it once, until \S+: it signs that browser in, and no other$/);
  assert.equal(link.err, '');
});

test('`nemia stats` prints its tiles and rows, one line with --line, the whole answer with --json, and keeps the runs -l takes', async () => {
  const words = await typed(['stats']);
  assert.match(words.out, /^last 14 days \(\S+ → \S+\), against the 14 before/m);
  assert.match(words.out, /^ {2}runs/m);
  const line = (await typed(['stats', '--line'])).out.split('\n');
  assert.equal(line.length, 2, 'one line');
  assert.match(line[0] ?? '', /^stats, last 14 days \(the 14 before\): .* runs finished, /);
  const json = JSON.parse((await typed(['stats', '--json', '--by', 'factory'])).out) as { by: string; groups: unknown[] };
  assert.equal(json.by, 'factory');
  assert.match((await typed(['stats', '-l', 'team=core', '-l', 'team=infra'])).out, /^last 14 days/m);
  assert.match((await typed(['stats', '-l', 'no/pe=x'], 2)).err, /no\/pe/);
  for (const [argv, named] of [
    [['stats', '--by', 'colour'], /--by/],
    [['stats', '--from', '2026-13-40'], /--from/],
    [['stats', '--from', '2026-09-30', '--to', '2026-09-01'], /--from 2026-09-30/],
  ] as const)
    assert.match((await typed(argv, 2)).err, named, argv.join(' '));
});

test('`nemia stats --help` prints its manual: each flag and what it takes, what the rows go by, and that unmeasured is never 0', async () => {
  const help = (await typed(['stats', '--help'])).out;
  assert.match(help, /^nemia stats \[--from <day>\]/);
  for (const flag of ['from', 'to', 'by', 'agent', 'step', 'factory', 'workflow', 'repo', 'line', 'json'])
    assert.match(help, new RegExp(`^\\s+--${flag}\\s+\\S`, 'm'), `--${flag} is said with what it takes`);
  assert.match(help, /what the rows go by: agent, step, factory, workflow, repo/);
  assert.match(help, /never 0/);
});
