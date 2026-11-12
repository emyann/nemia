/**
 * The inbox's writes and the labels the client holds — `nemia inbox add`, `inbox queue`, `inbox from`, `inbox rm`, `label inbox` and
 * `label run` — told as a person types them, against a store served by the api (`served.ts`), under this machine's context and under a
 * remote one pointed at another: each exit code, the card's file on the store as the verb leaves it, and the lines it prints. An idea
 * given as a file is read on the machine it is typed on and its text sent; a folder and a workflow given as a path are refused, exit 2,
 * before anything is asked.
 *
 * Each refusal asserts its exit code and the command or name it names, never its sentence.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { ambient } from './ambient.ts';
import { configWritten } from '../src/context.ts';
import { type Said, servedStore, write } from './served.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');
const IDEAS = scratch('nemia-inbox-ideas-');

/** A run's record of one step, `r-ctx`, a card's `from:` names and `label run` labels. */
const RUN = JSON.stringify({
  id: 'r-ctx',
  repo: '/code/app',
  workspace: '/code/app',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'A brief',
  workflowDir: '/code/app/workflows',
  createdAt: '2026-11-05T00:00:00.000Z',
  workflow: [{ name: 'implement', after: [], body: 'Implement it.' }],
  steps: { implement: { taskId: null } },
});

/** A store with the run `r-ctx` on it, where a card that names no factory may start in the default one. */
const seeded = (root: string): void => write(path.join(root, 'runs', 'r-ctx.json'), RUN);
const STARTS = { WF_DEFAULT_FACTORY_STARTS: '1' };

const store = await servedStore('nemia-inbox-', seeded, STARTS);
after(store.stop);

/** `nemia <argv>` on `env`, waited on for its end. */
function nemia(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<Said> {
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

/** The card's name, the first word of what `nemia inbox add` printed. */
const nameIn = (out: string): string => /^(\S+) {2}/.exec(out)?.[1] ?? assert.fail(`no card in: ${out}`);

/** The text of the card `name` on the store at `root`, or null where it has none. */
const cardOn = (root: string, name: string): string | null => {
  const file = path.join(root, 'inbox', `${name}.md`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

/** `said` exited 0, with nothing on stderr to say why not. */
const ok = (said: Said, what: string): void => assert.equal(said.code, 0, `${what}: ${said.err}`);

/** The card's life through every write, typed by `run` on the store at `root`: what each prints and leaves on the store. */
async function lifeOfACard(run: (argv: readonly string[]) => Promise<Said>, root: string, idea: string): Promise<void> {
  const added = await run(['inbox', 'add', idea, '--label', 'team=core']);
  ok(added, 'inbox add');
  const name = nameIn(added.out);
  assert.deepEqual(added.out.split('\n'), [
    `${name}  Cache the engine views  labels: team=core`,
    `filed: ${name}.md — start it with nemia start ${name} --workflows <w>`,
    '',
  ]);
  assert.match(cardOn(root, name) ?? '', /Cache the engine views\n\nBetween passes\.\n$/, "the file's text, sent");

  const queued = await run(['inbox', 'queue', name, '--workflow', 'dev']);
  ok(queued, 'inbox queue');
  assert.match(queued.out, new RegExp(`^${name} {2}queued at \\S+, 1 of 1 {2}workflow: dev$`, 'm'));
  assert.match(queued.out, /on the repository nemia up runs in — take it back with nemia inbox queue \S+ --off$/m);
  assert.match(cardOn(root, name) ?? '', /\nworkflow: dev\n/);
  assert.match(cardOn(root, name) ?? '', /\nqueued: /);

  const back = await run(['inbox', 'queue', name, '--off']);
  ok(back, 'inbox queue --off');
  assert.equal(back.out, `${name}  taken back: it no longer starts on its own — start it with nemia start ${name}\n`);
  assert.doesNotMatch(cardOn(root, name) ?? '', /queued:/);
  const again = await run(['inbox', 'queue', name, '--off']);
  ok(again, 'inbox queue --off, again');
  assert.equal(again.out, `${name}  not queued — nothing to take back\n`);

  const from = await run(['inbox', 'from', name, 'r-ctx']);
  ok(from, 'inbox from');
  assert.equal(from.out, `${name}  from: r-ctx — its run is handed what each concluded, as context, and waits on none (${name}.md)\n`);
  assert.match(cardOn(root, name) ?? '', /\nfrom: r-ctx\n/);
  const off = await run(['inbox', 'from', name, '--off']);
  ok(off, 'inbox from --off');
  assert.equal(off.out, `${name}  from: taken off (was r-ctx)\n`);
  assert.doesNotMatch(cardOn(root, name) ?? '', /from:/);

  const labelled = await run(['label', 'inbox', name, 'tier=one', 'team-']);
  ok(labelled, 'label inbox');
  assert.deepEqual(labelled.out.split('\n'), [
    `card ${name}  tier=one set`,
    `card ${name}  team removed (was core)`,
    `card ${name}  labels: tier=one`,
    '',
  ]);
  assert.match(cardOn(root, name) ?? '', /\n {2}tier: one\n/);

  const dropped = await run(['inbox', 'rm', name]);
  ok(dropped, 'inbox rm');
  assert.equal(dropped.out, `${name}  dropped, and nothing started — ${name}.md removed\n`);
  assert.equal(cardOn(root, name), null, 'the card is gone');
  const none = await run(['inbox', 'rm', name]);
  assert.equal(none.code, 2, `a card not there is the api's Missing: ${none.err}`);
  assert.ok(none.err.includes(name), none.err);
}

/** An idea in a file of its own, on the machine the command is typed on. */
const ideaFile = (name: string): string => {
  const file = path.join(IDEAS, name);
  write(file, 'Cache the engine views\n\nBetween passes.\n');
  return file;
};

test("under this machine's context: a card filed from a file, queued, taken back, handed a run, labelled and dropped", async () => {
  await lifeOfACard((argv) => store.nemia(argv), store.root, ideaFile('here.md'));
});

test('`nemia label run` edits a run of the store, a line per key, then its labels; a change without --overwrite is refused', async () => {
  const set = await store.nemia(['label', 'run', 'r-ctx', 'team=core']);
  ok(set, 'label run');
  assert.deepEqual(set.out.split('\n'), ['run r-ctx  team=core set', 'run r-ctx  labels: team=core', '']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(store.root, 'runs', 'r-ctx.labels'), 'utf8')), { team: 'core' });
  const refused = await store.nemia(['label', 'run', 'r-ctx', 'team=infra']);
  assert.equal(refused.code, 2, refused.err);
  assert.ok(refused.err.includes('--overwrite'), refused.err);
  const changed = await store.nemia(['label', 'run', 'r-ctx', 'team=infra', '--overwrite']);
  ok(changed, 'label run --overwrite');
  assert.equal(changed.out.split('\n')[0], 'run r-ctx  team=infra changed (was core)');
});

test('REFUSED, exit 2, before anything is asked: a folder as the idea, a workflow given as a path, a label edit missing', async () => {
  const before = fs.existsSync(path.join(store.root, 'inbox')) ? fs.readdirSync(path.join(store.root, 'inbox')) : [];
  for (const [argv, named] of [
    [['inbox', 'add', IDEAS], /nemia inbox add/],
    [['inbox', 'add', 'An idea', '--workflow', './workflows/dev'], /--workflow <name>/],
    [['inbox', 'queue', 'some-card', '--workflow', '/abs/dev'], /--workflow <name>/],
    [['inbox', 'queue', 'some-card', '--workflow', 'dev', '--off'], /--off/],
    [['inbox', 'from', 'some-card'], /nemia inbox from/],
    [['label', 'inbox', 'some-card'], /key=value/],
  ] as const) {
    const said = await store.nemia(argv);
    assert.equal(said.code, 2, `nemia ${argv.join(' ')}: ${said.err}`);
    assert.match(said.err, named, argv.join(' '));
    assert.equal(said.out, '');
  }
  const after_ = fs.existsSync(path.join(store.root, 'inbox')) ? fs.readdirSync(path.join(store.root, 'inbox')) : [];
  assert.deepEqual(after_, before, 'nothing filed');
});

test('under a remote context pointed at another store, the same writes land there, the idea read on this machine', async () => {
  const exposed = await servedStore('nemia-inbox-remote-', seeded, { WF_EXPOSED: '1', ...STARTS });
  after(exposed.stop);
  const minted = await nemia(['token', 'add', 'laptop'], exposed.env);
  ok(minted, 'token add');
  const token = /Authorization: Bearer (\S+)/.exec(minted.out)?.[1] ?? assert.fail(minted.out);
  const folder = scratch('nemia-inbox-laptop-');
  const env: NodeJS.ProcessEnv = {
    ...ambient('NEMIA_ON_INSTALLED'),
    WF_ROOT: path.join(folder, 'store'),
    AE_ROOT: path.join(folder, 'engine'),
    HOME: path.join(folder, 'home'),
    XDG_CONFIG_HOME: path.join(folder, 'config'),
    NEMIA_DAEMON_START: 'off',
  };
  configWritten({ contexts: [{ name: 'vps', server: exposed.url, token }], current: 'vps' }, env);
  await lifeOfACard((argv) => nemia(argv, env), exposed.root, ideaFile('away.md'));
  assert.equal(fs.existsSync(env.WF_ROOT ?? ''), false, "nothing read or made on this machine's store");
});
