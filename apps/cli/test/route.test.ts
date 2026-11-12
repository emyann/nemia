/**
 * Which way each command goes, as a person types it: every command of the orchestrator's table goes to its own CLI but a moved read
 * (`READ_VERBS`), which asks the api; the client's own verbs (`CLIENT_VERBS`) and the commands whose words it holds (`MOVED_COMMANDS`) ask
 * the api with `--help` too; `--local` is refused, exit 2, naming a `nemia` command, whatever it is typed with. A command opens with the
 * longest moved name its words open with, else its first word (`nameOf`), and a moved read typed with words it does not read — `inbox rm
 * <card>`, a command of its own — hands them to the old path before it asks the api anything. Under a remote context a verb about the store
 * only the old path has is forwarded, the words a moved read hands on among them: the old path spawned with the context's server and token
 * and without `WF_ROOT`, seen by a planted entry in its place; a verb about this machine (`MACHINE_VERBS`, `template lint` among them)
 * still runs here, and `template export --factory`, which reads this machine's store, is refused, exit 2, naming `NEMIA_CONTEXT=local`. The
 * laws of `routeOf` are its contract's (`route.contract.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { COMMANDS } from 'agent-orchestrator';
import { COMMAND_WORDS } from 'objects';
import { scratch } from 'test-kit/scratch';
import { ambient } from './ambient.ts';
import { configWritten } from '../src/context.ts';
import { CLIENT_VERBS, MACHINE_VERBS, MOVED_COMMANDS, nameOf, READ_VERBS, routeOf } from '../src/route.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** The first word of each command of the orchestrator's table, once. */
const TABLE_NAMES = [...new Set(COMMANDS.map((c) => c.name.split(' ')[0] ?? ''))];

test('every command of the table goes to its own CLI but a moved read, which asks the api, in process with --help, and refused with --local', () => {
  const moved: readonly string[] = READ_VERBS;
  for (const name of TABLE_NAMES) {
    assert.equal(routeOf({ name, local: false, help: false, remote: false }), moved.includes(name) ? 'api' : 'process', name);
    assert.equal(routeOf({ name, local: false, help: true, remote: false }), 'process', `${name} --help`);
    for (const remote of [false, true])
      assert.equal(routeOf({ name, local: true, help: false, remote }), 'refused', `${name} --local remote=${remote}`);
  }
});

test("the client's own verbs and the commands whose words it holds go to the client with --help too, under every context", () => {
  for (const name of [...CLIENT_VERBS, ...MOVED_COMMANDS])
    for (const remote of [false, true])
      for (const help of [false, true]) {
        assert.equal(routeOf({ name, local: false, help, remote }), 'api', `${name} help=${help} remote=${remote}`);
        assert.equal(routeOf({ name, local: true, help, remote }), 'refused', `${name} --local help=${help} remote=${remote}`);
      }
});

test("`MOVED_COMMANDS` are the names of `objects`' `COMMAND_WORDS`, in their order", () => {
  assert.deepEqual(
    MOVED_COMMANDS,
    COMMAND_WORDS.map((words) => words.name),
  );
});

test('`nameOf`: the longest moved name a command opens with, else its first word', () => {
  for (const [argv, name] of [
    [['ls', '-l', 'team=core'], 'ls'],
    [['inbox', 'add', 'x'], 'inbox'],
    [['decide', 'r-1'], 'decide'],
    [['workflows', 'write', 'yours', 'w', '--folder', 'd'], 'workflows write'],
    [['agents', 'write', '--help'], 'agents write'],
    [['skills', 'write'], 'skills write'],
    [['workflows', 'ls'], 'workflows'],
    [['workflows'], 'workflows'],
    [['write', 'workflows'], 'write'],
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

test('under a remote context a verb about the store only the old path has is forwarded; a machine verb and a help still run here', () => {
  const kept: readonly string[] = [...READ_VERBS, ...CLIENT_VERBS, ...MACHINE_VERBS];
  for (const name of TABLE_NAMES) {
    assert.equal(
      routeOf({ name, local: false, help: false, remote: true }),
      kept.includes(name) ? routeOf({ name, local: false, help: false, remote: false }) : 'forwarded',
      name,
    );
    assert.notEqual(routeOf({ name, local: false, help: true, remote: true }), 'forwarded', `${name} --help`);
  }
  for (const name of MACHINE_VERBS) assert.equal(routeOf({ name, local: false, help: false, remote: true }), 'process', name);
  for (const name of ['template', 'frontmatter', 'admit'])
    assert.ok((MACHINE_VERBS as readonly string[]).includes(name), `${name} reads and writes this machine's files, no store`);
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

/**
 * A `node` option that loads, in `nemia`'s process, a resolve hook putting a planted entry in place of the orchestrator's CLI — what
 * `src/local.ts`, its one resolver, resolves to the package's `bin/nemia.ts` — which prints the words it was spawned with, and what it
 * reads of the forwarded variables and of `WF_ROOT`, as one JSON line.
 */
function plantedEntry(prefix: string): string {
  const entry = path.join(scratch(prefix), 'planted.mjs');
  fs.writeFileSync(
    entry,
    'const { NEMIA_SERVER = null, NEMIA_SERVER_TOKEN = null, WF_ROOT = null } = process.env;\n' +
      'process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), NEMIA_SERVER, NEMIA_SERVER_TOKEN, WF_ROOT }));\n',
  );
  const url = pathToFileURL(entry).href;
  const hook = `const r=n(s,c);return c.parentURL?.endsWith('/src/local.ts')&&r.url.endsWith('/bin/nemia.ts')?{url:${JSON.stringify(url)},shortCircuit:true}:r;`;
  return `data:text/javascript,import{registerHooks}from'node:module';registerHooks({resolve(s,c,n){${hook}}});`;
}

/**
 * `nemia <argv>` on `env`, waited on for its end: its code, all it said and its stdout, the planted entry of `hook` in the old path's
 * place where one is given.
 */
async function nemia(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  hook?: string,
): Promise<{ code: number | null; said: string; out: string }> {
  const child = spawn(process.execPath, [...(hook === undefined ? [] : ['--import', hook]), CLI, ...argv], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let said = '';
  let out = '';
  child.stdout.on('data', (chunk) => ((said += chunk), (out += chunk)));
  child.stderr.on('data', (chunk) => (said += chunk));
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  return { code, said, out };
}

test('under a remote context `inbox rm`, `inbox add`, `start` and `ls <run>` are forwarded: the old path, with the server and token, no WF_ROOT', async () => {
  const { env, root } = remoteLaptop('nemia-route-remote-');
  const hook = plantedEntry('nemia-route-planted-');
  for (const argv of [
    ['inbox', 'rm', 'x'],
    ['inbox', 'add', 'an idea'],
    ['start', 'card.md'],
    ['ls', 'some-run'],
  ]) {
    const { code, said, out } = await nemia(argv, env, hook);
    assert.equal(code, 0, `nemia ${argv.join(' ')}: ${said}`);
    assert.deepEqual(
      JSON.parse(out),
      { argv, NEMIA_SERVER: 'http://127.0.0.1:9', NEMIA_SERVER_TOKEN: 'tok', WF_ROOT: null },
      argv.join(' '),
    );
  }
  assert.equal(fs.existsSync(root), false, "nothing wrote this machine's store");
});

test('under a remote context `template lint` runs here, unforwarded; `template export --factory` is refused, exit 2, naming NEMIA_CONTEXT=local', async () => {
  const { env, root } = remoteLaptop('nemia-route-template-');
  const hook = plantedEntry('nemia-route-template-planted-');
  for (const argv of [
    ['template', 'lint', 'shop'],
    ['template', 'export', 'shop', '--from', 'repo'],
  ]) {
    const { code, said, out } = await nemia(argv, env, hook);
    assert.equal(code, 0, `nemia ${argv.join(' ')}: ${said}`);
    assert.deepEqual(JSON.parse(out), { argv, NEMIA_SERVER: null, NEMIA_SERVER_TOKEN: null, WF_ROOT: root }, argv.join(' '));
  }
  for (const argv of [
    ['template', 'export', 'shop', '--from', 'repo', '--factory', 'f'],
    ['template', 'export', 'shop', '--from', 'repo', '--factory=f'],
  ]) {
    const { code, said, out } = await nemia(argv, env, hook);
    assert.equal(code, 2, `nemia ${argv.join(' ')}: ${said}`);
    assert.match(said, /NEMIA_CONTEXT=local nemia template export/, argv.join(' '));
    assert.equal(out, '', 'the old path never ran');
  }
});

test('under a remote context `nemia service status` still runs here, a verb about this machine', async () => {
  const { env } = remoteLaptop('nemia-route-machine-');
  const { code, said } = await nemia(['service', 'status', '--name', 'nemia-route-test'], env);
  assert.equal(code, 0, said);
});

/** A laptop whose context in use is this machine's own, its store scratch and served by no daemon, none started on demand. */
function localLaptop(prefix: string): { env: NodeJS.ProcessEnv; root: string } {
  const folder = scratch(prefix);
  const env = {
    ...ambient(),
    WF_ROOT: path.join(folder, 'store'),
    AE_ROOT: path.join(folder, 'engine'),
    HOME: path.join(folder, 'home'),
    XDG_CONFIG_HOME: path.join(folder, 'config'),
    NEMIA_DAEMON_START: 'off',
  };
  return { env, root: env.WF_ROOT };
}

test('`--local` is refused, exit 2, naming a `nemia` command, for a read, a moved write and a machine verb, and the old path never runs', async () => {
  const hook = plantedEntry('nemia-route-local-planted-');
  for (const [laptop, context] of [
    [localLaptop('nemia-route-local-'), /`nemia /],
    [remoteLaptop('nemia-route-local-remote-'), /NEMIA_CONTEXT=local nemia /],
  ] as const)
    for (const argv of [
      ['show', 'r', '--local'],
      ['workflows', 'write', 'yours', 'w', '--folder', 'd', '--local'],
      ['up', '--local'],
    ]) {
      const { code, said, out } = await nemia(argv, laptop.env, hook);
      assert.equal(code, 2, `nemia ${argv.join(' ')}: ${said}`);
      assert.match(said, context, argv.join(' '));
      assert.equal(out, '', 'the old path never ran');
    }
});

test("`nemia workflows write yours w --folder d` is the client's under this machine's context and a remote one; `nemia workflows ls` spawns the old path", async () => {
  const hook = plantedEntry('nemia-route-moved-planted-');
  const local = localLaptop('nemia-route-moved-');
  for (const laptop of [local, remoteLaptop('nemia-route-moved-remote-')]) {
    const argv = ['workflows', 'write', 'yours', 'w', '--folder', path.join(scratch('nemia-route-nofolder-'), 'd')];
    const { code, said, out } = await nemia(argv, laptop.env, hook);
    assert.equal(code, 2, `the client refused the folder that is not there, before asking anything: ${said}`);
    assert.match(said, /nofolder/, 'naming the folder');
    assert.equal(out, '', 'the old path never ran');
  }
  const { code, said, out } = await nemia(['workflows', 'ls'], local.env, hook);
  assert.equal(code, 0, said);
  assert.deepEqual(JSON.parse(out), { argv: ['workflows', 'ls'], NEMIA_SERVER: null, NEMIA_SERVER_TOKEN: null, WF_ROOT: local.root });
});
