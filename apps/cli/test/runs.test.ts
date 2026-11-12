/**
 * The run's verbs the client holds, told as a person types them, against a store served by the api (`served.ts`) with no tick: `nemia
 * start` of a brief, a file, a plan card's file and an inbox card, each by its workflow's name, with its models, gates and inputs sent;
 * then `hold` and its lift, `say` kept for a step not filed, `cancel`, `rm` and `prune`, and the store's `pause`, `pause --now`,
 * `resume` and `pause-timeout`, and `wait`; and `start` and `hold` under a remote context pointed at an exposed store. Each asserts its
 * exit code and what the store holds after it; a refusal, its exit code and the command or flag it names, never its sentence.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { ambient } from './ambient.ts';
import { configWritten } from '../src/context.ts';
import { type Said, servedStore, write } from './served.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');
const TEAM = path.join(import.meta.dirname, '..', '..', '..', 'packages', 'agent-orchestrator', 'test', 'fixtures', 'team');

/** A scratch git repository with one commit on `main`. */
function repoMade(prefix: string): string {
  const repo = scratch(prefix);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@local', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });
  return repo;
}

/** The factory `acme` on `repo`, its tree holding the test team's `dev`, written into the store `root`. */
const acmeIn = (repo: string) => (root: string) => {
  const tree = path.join(root, 'factories', 'acme', 'tree');
  fs.cpSync(TEAM, path.join(tree, 'workflows'), { recursive: true });
  write(
    path.join(root, 'factories', 'acme.json'),
    JSON.stringify({ repos: [repo], template: { source: '/t/team', version: '0.1.0', params: {} } }),
  );
  write(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['dev'], hires: {} }));
};

const REPO = repoMade('nemia-runs-repo-');
const store = await servedStore('nemia-runs-', acmeIn(REPO), { HKB_REPO: REPO });
after(store.stop);
const DRAFTS = scratch('nemia-runs-drafts-');

/** The run a start printed first on its first line. */
const idIn = (said: Said): string => /^(\S+)\s/.exec(said.out)?.[1] ?? assert.fail(`no run id in: ${said.out}${said.err}`);

/** The run's record as the store keeps it. */
const recordOf = (root: string, id: string) =>
  JSON.parse(fs.readFileSync(path.join(root, 'runs', `${id}.json`), 'utf8')) as {
    brief: string;
    models?: Record<string, string>;
    inputs?: string[];
    gates?: string[];
  };

/** `dev` started in `acme` with `argv` after the brief, its id. */
async function started(brief: string, ...argv: string[]): Promise<string> {
  const said = await store.nemia(['start', brief, '--workflows', 'dev', '--factory', 'acme', ...argv]);
  assert.equal(said.code, 0, said.err);
  return idIn(said);
}

test('nemia start of a brief in words, with --model, --gate and --input, starts the run with each, the file sent by its bytes', async () => {
  const notes = path.join(DRAFTS, 'notes.md');
  write(notes, 'Read me first.\n');
  const said = await store.nemia([
    'start',
    'Add a cache.',
    '--workflows',
    'dev',
    '--factory',
    'acme',
    '--model',
    'implement=sonnet',
    '--gate',
    'implement',
    '--input',
    notes,
  ]);
  assert.equal(said.code, 0, said.err);
  const id = idIn(said);
  const run = recordOf(store.root, id);
  assert.equal(run.brief, 'Add a cache.');
  assert.deepEqual(run.models, { implement: 'sonnet' });
  assert.deepEqual(run.inputs, ['notes.md']);
  assert.equal(fs.readFileSync(path.join(store.root, 'runs', id, 'inputs', 'notes.md'), 'utf8'), 'Read me first.\n');
  assert.match(said.out, /^gated at: implement/m);
});

test("nemia start of a file starts its text; of a plan card's file, its body on its own workflow:", async () => {
  const brief = path.join(DRAFTS, 'brief.md');
  write(brief, 'Add a cache, from a file.\n');
  assert.equal(recordOf(store.root, await started(brief)).brief, 'Add a cache, from a file.');
  const card = path.join(DRAFTS, 'card.md');
  write(card, '---\nworkflow: dev\n---\nAdd a cache, from a card.\n');
  const said = await store.nemia(['start', card, '--factory', 'acme']);
  assert.equal(said.code, 0, said.err);
  assert.equal(recordOf(store.root, idIn(said)).brief, 'Add a cache, from a card.');
});

test('nemia start of an inbox card by its name starts its body (cards.start), and --brief in its place', async () => {
  write(path.join(store.root, 'inbox', 'cache-card.md'), '---\nworkflow: dev\nfactory: acme\n---\nAdd a cache, from the inbox\n');
  const said = await store.nemia(['start', 'cache-card', '--brief', 'Add a cache, said instead']);
  assert.equal(said.code, 0, said.err);
  assert.match(recordOf(store.root, idIn(said)).brief, /Add a cache, said instead/);
});

test('REFUSED, exit 2, nothing started: a folder, a workflow as a path, no workflow named, --brief for no card, a stray card key', async () => {
  const before = fs.readdirSync(path.join(store.root, 'runs')).length;
  const stray = path.join(DRAFTS, 'stray.md');
  write(stray, '---\nworkflow: dev\nrepo: /elsewhere\n---\nA card of the inbox.\n');
  for (const [argv, named] of [
    [['start', DRAFTS, '--factory', 'acme'], /nemia inbox add/],
    [['start', 'Add a cache.', '--workflows', './workflows/dev', '--factory', 'acme'], /--workflows <name>/],
    [['start', 'Add a cache.', '--factory', 'acme'], /--workflows <name>/],
    [['start', 'Add a cache.', '--workflows', 'dev', '--brief', 'other words'], /--brief/],
    [['start', stray, '--factory', 'acme'], /nemia inbox add/],
    [['start', 'Add a cache.', '--workflows', 'dev', '--factory', 'acme', '--model', 'sonnet'], /--model <step>=<model>/],
  ] as const) {
    const said = await store.nemia(argv);
    assert.equal(said.code, 2, `nemia ${argv.join(' ')}: ${said.out}${said.err}`);
    assert.match(said.err, named, argv.join(' '));
  }
  assert.equal(fs.readdirSync(path.join(store.root, 'runs')).length, before);
});

test('nemia hold puts a hold and --off lifts it; nemia say keeps words for a step not filed yet', async () => {
  const id = await started('Hold me.');
  const held = await store.nemia(['hold', id, '--why', 'waiting on legal']);
  assert.equal(held.code, 0, held.err);
  assert.ok(fs.existsSync(path.join(store.root, 'runs', `${id}.hold`)));
  assert.match(held.out, new RegExp(`nemia hold ${id} --off`));
  const lifted = await store.nemia(['hold', id, '--off']);
  assert.equal(lifted.code, 0, lifted.err);
  assert.equal(fs.existsSync(path.join(store.root, 'runs', `${id}.hold`)), false);
  const kept = await store.nemia(['say', id, 'implement', 'mind', 'the', 'cache']);
  assert.equal(kept.code, 0, kept.err);
  assert.ok(kept.out.includes('mind the cache'), kept.out);
});

test('nemia cancel stops the run; nemia rm forgets it, its branches deleted; a run not there is not forgotten, exit 2', async () => {
  const id = await started('Cancel me.');
  const cancelled = await store.nemia(['cancel', id]);
  assert.equal(cancelled.code, 0, cancelled.err);
  assert.ok(fs.existsSync(path.join(store.root, 'runs', `${id}.cancelled`)));
  const gone = await store.nemia(['rm', id, 'nobody-1', '--delete-branches']);
  assert.equal(gone.code, 2, `${gone.out}${gone.err}`);
  assert.match(gone.out, new RegExp(`^${id}`, 'm'));
  assert.match(gone.out, /^nobody-1 {2}not forgotten/m);
  assert.equal(fs.existsSync(path.join(store.root, 'runs', `${id}.json`)), false);
});

test('nemia prune of a run with nothing to prune says so, and of none lists nothing to prune, exit 0; of a run not there, exit 2', async () => {
  const id = await started('Prune me.');
  assert.equal((await store.nemia(['cancel', id])).code, 0);
  const named = await store.nemia(['prune', id]);
  assert.equal(named.code, 0, `${named.out}${named.err}`);
  assert.match(named.out, new RegExp(`^${id} `, 'm'));
  const missing = await store.nemia(['prune', 'nobody-1']);
  assert.equal(missing.code, 2, `${missing.out}${missing.err}`);
  assert.match(missing.out, /^nobody-1 {2}not pruned/m);
  const every = await store.nemia(['prune']);
  assert.equal(every.code, 0, every.err);
  assert.match(every.out, /nothing to prune/);
});

test('nemia pause --now without --yes shows what it would cut and writes nothing; pause, pause-timeout and resume', async () => {
  const preview = await store.nemia(['pause', '--now']);
  assert.equal(preview.code, 0, preview.err);
  assert.match(preview.out, /nemia pause --now --yes/);
  assert.equal(fs.existsSync(path.join(store.root, 'paused.json')), false, 'nothing paused');
  const paused = await store.nemia(['pause', '--why', 'upgrade']);
  assert.equal(paused.code, 0, paused.err);
  assert.match(paused.out, /nemia resume/);
  const timeout = await store.nemia(['pause-timeout', '15m']);
  assert.equal(timeout.code, 0, timeout.err);
  assert.match(timeout.out, /15m/);
  assert.match((await store.nemia(['pause-timeout'])).out, /15m, set /);
  const resumed = await store.nemia(['resume']);
  assert.equal(resumed.code, 0, resumed.err);
});

test('nemia wait --for 1s prints the cursor to wait again from', async () => {
  const said = await store.nemia(['wait', '--for', '1s']);
  assert.equal(said.code, 0, said.err);
  assert.match(said.out, /^cursor: \d+$/m);
});

/** A laptop with no store of its own, its scratch home and config, the start off. */
function laptop(prefix: string): NodeJS.ProcessEnv {
  const folder = scratch(prefix);
  return {
    ...ambient('NEMIA_ON_INSTALLED'),
    WF_ROOT: path.join(folder, 'store'),
    AE_ROOT: path.join(folder, 'engine'),
    HOME: path.join(folder, 'home'),
    XDG_CONFIG_HOME: path.join(folder, 'config'),
    NEMIA_DAEMON_START: 'off',
  };
}

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

test('under a remote context, nemia start and nemia hold land on the remote store, nothing made on this machine', async () => {
  const repo = repoMade('nemia-runs-remote-repo-');
  const exposed = await servedStore('nemia-runs-remote-', acmeIn(repo), { WF_EXPOSED: '1', HKB_REPO: repo });
  after(exposed.stop);
  const minted = await nemia(['token', 'add', 'laptop'], exposed.env);
  assert.equal(minted.code, 0, minted.err);
  const token = /Authorization: Bearer (\S+)/.exec(minted.out)?.[1] ?? assert.fail(minted.out);
  const env = laptop('nemia-runs-laptop-');
  configWritten({ contexts: [{ name: 'vps', server: exposed.url, token }], current: 'vps' }, env);
  const said = await nemia(['start', 'Add a cache, away.', '--workflows', 'dev', '--factory', 'acme'], env);
  assert.equal(said.code, 0, said.err);
  const id = idIn(said);
  assert.equal(recordOf(exposed.root, id).brief, 'Add a cache, away.');
  assert.equal((await nemia(['hold', id], env)).code, 0);
  assert.ok(fs.existsSync(path.join(exposed.root, 'runs', `${id}.hold`)), 'held on the remote store');
  assert.equal(fs.existsSync(env.WF_ROOT ?? ''), false, "nothing read or made on this machine's store");
});
