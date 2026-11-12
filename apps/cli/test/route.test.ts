/**
 * Which way each command goes, as a person types it: every command of the orchestrator's table goes to its own CLI but a moved read
 * (`READ_VERBS`), which asks the api; the client's own verbs (`CLIENT_VERBS`) ask the api with `--help` and `--local` too; a command
 * opens with one word (`nameOf`), and a moved read typed with words it does not read — `inbox rm <card>`, a command of its own — hands
 * them to the old path before it asks the api anything. Under a remote context a verb about the store only the old path has is refused,
 * exit 2, naming `nemia config use-context local`, the words a moved read hands on among them, while a verb about this machine
 * (`MACHINE_VERBS`) still runs here. The laws of `routeOf` are its contract's (`route.contract.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { COMMANDS } from 'agent-orchestrator';
import { scratch } from 'test-kit/scratch';
import { ambient } from './ambient.ts';
import { configWritten } from '../src/context.ts';
import { CLIENT_VERBS, MACHINE_VERBS, nameOf, READ_VERBS, routeOf } from '../src/route.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** The first word of each command of the orchestrator's table, once. */
const TABLE_NAMES = [...new Set(COMMANDS.map((c) => c.name.split(' ')[0] ?? ''))];

test('every command of the table goes to its own CLI but a moved read, which asks the api, and in process with --local or --help', () => {
  const moved: readonly string[] = READ_VERBS;
  for (const name of TABLE_NAMES) {
    assert.equal(routeOf({ name, local: false, help: false, remote: false }), moved.includes(name) ? 'api' : 'process', name);
    assert.equal(routeOf({ name, local: true, help: false, remote: false }), 'process', `${name} --local`);
    assert.equal(routeOf({ name, local: false, help: true, remote: false }), 'process', `${name} --help`);
  }
});

test("the client's own verbs go to the client with --help and --local too: no process has them", () => {
  for (const name of CLIENT_VERBS)
    for (const local of [false, true])
      for (const help of [false, true])
        assert.equal(routeOf({ name, local, help, remote: false }), 'api', `${name} local=${local} help=${help}`);
});

test('`nameOf`: the first word a command opens with', () => {
  for (const [argv, name] of [
    [['ls', '-l', 'team=core'], 'ls'],
    [['inbox', 'add', 'x'], 'inbox'],
    [['decide', 'r-1'], 'decide'],
    [[], ''],
  ] as const)
    assert.equal(nameOf(argv), name, argv.join(' '));
});

test('`nemia inbox rm <card>` runs on the old path, never asking the api: a store no daemon serves is not refused for it', async () => {
  const env = { ...ambient(), WF_ROOT: scratch('nemia-route-store-'), HOME: scratch('nemia-route-home-'), NEMIA_DAEMON_START: 'off' };
  const child = spawn(process.execPath, [CLI, 'inbox', 'rm', 'no-such-card'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let said = '';
  child.stdout.on('data', (chunk) => (said += chunk));
  child.stderr.on('data', (chunk) => (said += chunk));
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  assert.doesNotMatch(said, /no daemon serves this store/, 'it did not ask the api');
  assert.match(said, /no-such-card/, `the old path's own answer, naming the card (exit ${code}): ${said}`);
});

test('under a remote context a verb about the store only the old path has is refused; a machine verb and a help still run here', () => {
  const kept: readonly string[] = [...READ_VERBS, ...CLIENT_VERBS, ...MACHINE_VERBS];
  for (const name of TABLE_NAMES) {
    assert.equal(
      routeOf({ name, local: false, help: false, remote: true }),
      kept.includes(name) ? routeOf({ name, local: false, help: false, remote: false }) : 'refused',
      name,
    );
    assert.notEqual(routeOf({ name, local: false, help: true, remote: true }), 'refused', `${name} --help`);
  }
  for (const name of MACHINE_VERBS) assert.equal(routeOf({ name, local: false, help: false, remote: true }), 'process', name);
});

/** A laptop whose config's context in use is a remote daemon nothing serves, and whose store root is never made. */
function remoteLaptop(prefix: string): { env: NodeJS.ProcessEnv; root: string } {
  const folder = scratch(prefix);
  const env = {
    ...ambient(),
    WF_ROOT: path.join(folder, 'store'),
    AE_ROOT: path.join(folder, 'engine'),
    HOME: path.join(folder, 'home'),
    XDG_CONFIG_HOME: path.join(folder, 'config'),
  };
  configWritten({ contexts: [{ name: 'vps', server: 'http://127.0.0.1:9', token: 'tok' }], current: 'vps' }, env);
  return { env, root: env.WF_ROOT };
}

/** `nemia <argv>` on `env`, waited on for its end: its code and all it said. */
async function nemia(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; said: string }> {
  const child = spawn(process.execPath, [CLI, ...argv], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let said = '';
  child.stdout.on('data', (chunk) => (said += chunk));
  child.stderr.on('data', (chunk) => (said += chunk));
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  return { code, said };
}

test('under a remote context `nemia inbox add` and `nemia start` are refused, exit 2, naming `nemia config use-context local`', async () => {
  const { env, root } = remoteLaptop('nemia-route-remote-');
  for (const argv of [
    ['inbox', 'add', 'an idea'],
    ['start', 'card.md'],
    ['ls', 'some-run'],
  ]) {
    const { code, said } = await nemia(argv, env);
    assert.equal(code, 2, `nemia ${argv.join(' ')}: ${said}`);
    assert.match(said, /nemia config use-context local/, argv.join(' '));
  }
  assert.equal(fs.existsSync(root), false, "nothing wrote this machine's store");
});

test('under a remote context `nemia service status` still runs here, a verb about this machine', async () => {
  const { env } = remoteLaptop('nemia-route-machine-');
  const { code, said } = await nemia(['service', 'status', '--name', 'nemia-route-test'], env);
  assert.equal(code, 0, said);
});
