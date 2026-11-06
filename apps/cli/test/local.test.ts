/**
 * What `nemia` does with no daemon serving its store (the intent's Q14): a moved read with the start turned off is refused, exit 2, naming
 * the command that reads in process (`--local`) and the one that installs the service; the same read typed with `--local` reads the store
 * in process; the verbs that need no daemon — `version`, `service status`, `template lint` — run with none and no flag; a write reaches
 * the in-process path with its words intact, seen by what it writes into the store; and `--local` never reaches the in-process parser.
 * Each `nemia` is this checkout's bin, run as a child on a scratch store, waited on for its exit.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ambient } from './ambient.ts';

const BIN = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-local-'));
after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));

/** A store of its own, its home beside it, so no `nemia` here reads the person's store, service or engine. */
function aStore(name: string): { root: string; env: NodeJS.ProcessEnv } {
  const root = path.join(SCRATCH, name, 'store');
  const home = path.join(SCRATCH, name, 'home');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  const rest = ambient('NEMIA_DAEMON_START', 'AE_ROOT', 'WF_ROOT', 'XDG_CONFIG_HOME');
  return { root, env: { ...rest, WF_ROOT: root, HOME: home, NEMIA_DAEMON_START: 'off', WF_VERIFY_REST: '1' } };
}

/** `nemia <argv>` on `env`, waited on for its exit: its code, and what it printed on each stream. */
function nemia(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [BIN, ...argv], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const GATED = { id: 'read-the-plan-first-local1', step: 'plan' };

/**
 * A run waiting on a person at its gate, written as `nemia start --gate plan` and the engine leave one: `plan → implement`, plan signed
 * off done, its task settled, and nothing after it filed.
 */
function seedGated(root: string): void {
  const at = new Date(Date.now() - 60_000).toISOString();
  const folder = path.join(root, 'workflow-gate');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'plan.md'), '---\nplace: git\nharness: claude\n---\nPlan it.\n');
  fs.writeFileSync(path.join(folder, 'implement.md'), '---\nplace: git\nharness: claude\nafter: plan\n---\nImplement the plan.\n');
  const task = `${GATED.id}-plan`;
  const lane = path.join(root, 'worktrees', GATED.id, 'plan');
  const run = {
    id: GATED.id,
    repo: path.join(root, 'no-repo'),
    workspace: path.join(root, 'no-repo'),
    baseRef: '19c9365',
    branch: 'main',
    isolate: true,
    brief: 'Read the plan first\n\nA run that waits at its gate.',
    workflowDir: folder,
    workflow: [
      { name: 'plan', after: [], body: 'Plan it.', harness: 'claude' },
      { name: 'implement', after: ['plan'], body: 'Implement the plan.', harness: 'claude' },
    ],
    gates: [GATED.step],
    createdAt: at,
    steps: { plan: { taskId: task, workspace: lane, branch: `wf/${GATED.id}/plan` }, implement: { taskId: null } },
  };
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runs', `${GATED.id}.json`), JSON.stringify(run, null, 2));
  const journal = [
    { kind: 'filed', at, brief: 'Plan it.', cwd: lane, maxAttempts: 1, harness: 'claude' },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    {
      kind: 'ended',
      at,
      attempt: 1,
      sessionId: `ae/${task}/1`,
      observed: 'done',
      reason: 'harness',
      closeout: { outcome: 'done', summary: 'The plan.', needs: null, artifacts: [] },
    },
    { kind: 'settled', at, outcome: 'succeeded' },
  ];
  fs.mkdirSync(path.join(root, 'engine', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'engine', 'tasks', `${task}.jsonl`), journal.map((line) => `${JSON.stringify(line)}\n`).join(''));
}

test('with no daemon and the start off, a moved read is refused, exit 2, naming the read in process and the install', async () => {
  const { root, env } = aStore('refused');
  const { code, stderr } = await nemia(['ls'], env);
  assert.equal(code, 2, stderr);
  assert.ok(stderr.includes('nemia ls --local'), stderr);
  assert.ok(stderr.includes('nemia service install'), stderr);
  assert.ok(stderr.includes('NEMIA_DAEMON_START=off'), stderr);
  assert.equal(fs.existsSync(path.join(root, 'daemon.json')), false);
});

test('nemia ls --local reads the store in process, with no daemon', async () => {
  const { root, env } = aStore('ls-local');
  seedGated(root);
  const { code, stdout, stderr } = await nemia(['ls', '--local'], env);
  assert.equal(code, 0, stderr);
  assert.ok(stdout.includes(GATED.id), stdout);
  assert.equal(fs.existsSync(path.join(root, 'daemon.json')), false);
});

test('version, service status and template lint run with no daemon and no flag', async () => {
  const { env } = aStore('unserved');
  const template = path.join(SCRATCH, 'unserved', 'shop');
  fs.mkdirSync(template, { recursive: true });
  fs.writeFileSync(
    path.join(template, 'nemia.yaml'),
    'apiVersion: nemia.dev/v1alpha1\nkind: FactoryTemplate\nmetadata:\n  name: shop\nspec:\n  version: 0.1.0\n  hires: {}\n',
  );
  for (const argv of [['version'], ['service', 'status', '--name', 'nemia-local-test'], ['template', 'lint', template]]) {
    const { code, stderr } = await nemia(argv, env);
    assert.equal(code, 0, `nemia ${argv.join(' ')}: ${stderr}`);
  }
});

test('nemia approve <run> <step> reaches the in-process path with its words intact: the approval is written into the store', async () => {
  const { root, env } = aStore('approve');
  seedGated(root);
  const before = fs.readdirSync(path.join(root, 'runs'));
  const { code, stderr } = await nemia(['approve', GATED.id, GATED.step], env);
  assert.equal(code, 0, stderr);
  const written = fs.readdirSync(path.join(root, 'runs')).filter((name) => !before.includes(name));
  assert.deepEqual(written, [`${GATED.id}.asks`]);
  const asks = path.join(root, 'runs', `${GATED.id}.asks`);
  const said = fs.statSync(asks).isDirectory()
    ? fs.readdirSync(asks, { recursive: true, encoding: 'utf8' }).join('\n')
    : fs.readFileSync(asks, 'utf8');
  assert.ok(said.includes(GATED.step), said);
});

test('--local is taken off before the in-process parser reads the words, wherever it is typed', async () => {
  const { env } = aStore('stripped');
  const { code, stdout, stderr } = await nemia(['version', '--local', '--json'], env);
  assert.equal(code, 0, stderr);
  assert.equal(typeof (JSON.parse(stdout) as { version: unknown }).version, 'string');
});
