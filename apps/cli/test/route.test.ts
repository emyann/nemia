/**
 * Which way each command goes, as a person types it: the client's own verbs (`CLIENT_VERBS`) and the commands whose words it holds
 * (`MOVED_COMMANDS`: every store verb, `cancel`, `inbox add`, `factory hire`, `ls` and `stats` among them) ask the api with `--help` too,
 * under both contexts; its reads (`READ_VERBS`: `doctor`, `daemon`) ask it but for a help; a verb about this machine (`MACHINE_VERBS`)
 * runs on the old path here, whatever the context; `--local` is refused, exit 2, naming a `nemia` command, whatever it is typed with. A
 * command opens with the longest moved name its words open with, else its first word (`nameOf`), a former name read as the name it became
 * (`renamedIn`), and a word the bare `inbox` read does not take is refused by its words. Nothing is forwarded: a word typed under a remote
 * context that the client does not answer and this machine does not own is refused, exit 2, naming `nemia --help` and
 * `NEMIA_CONTEXT=local`, and the old path never runs, seen by a planted entry in its place. `template export --factory` reads the
 * factory's parts through the api of the context in use and hands them on stdin. The laws of `routeOf` are its contract's
 * (`route.contract.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { COMMANDS } from 'agent-orchestrator';
import { COMMAND_WORDS, renamedIn } from 'objects';
import { scratch } from 'test-kit/scratch';
import { ambient } from './ambient.ts';
import { configWritten } from '../src/context.ts';
import { CLIENT_VERBS, MACHINE_VERBS, MOVED_COMMANDS, nameOf, READ_VERBS, routeOf } from '../src/route.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** The first word of each command of the orchestrator's table, once. */
const TABLE_NAMES = [...new Set(COMMANDS.map((c) => c.name.split(' ')[0] ?? ''))];

/** The names the client answers itself: its own verbs and the commands whose words it holds. */
const CLIENTS: readonly string[] = [...CLIENT_VERBS, ...MOVED_COMMANDS];

test('every command of the table the client does not hold goes to its own CLI but a read, which asks the api, in process with --help, and refused with --local', () => {
  const moved: readonly string[] = READ_VERBS;
  for (const name of TABLE_NAMES.filter((n) => !CLIENTS.includes(n))) {
    assert.equal(routeOf({ name, local: false, help: false, remote: false }), moved.includes(name) ? 'api' : 'process', name);
    const held: readonly string[] = MOVED_COMMANDS;
    assert.equal(routeOf({ name, local: false, help: true, remote: false }), held.includes(name) ? 'api' : 'process', `${name} --help`);
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
    [['inbox', 'add', 'x'], 'inbox add'],
    [['inbox'], 'inbox'],
    [['factory', 'hire', 'f', 'a'], 'factory hire'],
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

test("REFUSED: `nemia inbox <word>` the bare read does not take is refused by its words, exit 2, naming the inbox's commands, asking no api", async () => {
  const env = { ...ambient(), WF_ROOT: scratch('nemia-route-store-'), HOME: scratch('nemia-route-home-'), NEMIA_DAEMON_START: 'off' };
  const child = spawn(process.execPath, [CLI, 'inbox', 'frob', 'no-such-card'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let said = '';
  child.stdout.on('data', (chunk) => (said += chunk));
  child.stderr.on('data', (chunk) => (said += chunk));
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  assert.equal(code, 2, said);
  assert.doesNotMatch(said, /no daemon serves this store/, 'it did not ask the api');
  assert.match(said, /nemia inbox add/, `it names the inbox's commands: ${said}`);
});

test('under a remote context a word the client does not answer and this machine does not own is refused; a machine verb and a help still run here', () => {
  const kept: readonly string[] = [...READ_VERBS, ...CLIENT_VERBS, ...MOVED_COMMANDS, ...MACHINE_VERBS];
  for (const name of [...TABLE_NAMES, 'frobnicate', 'workflows'])
    assert.equal(
      routeOf({ name, local: false, help: false, remote: true }),
      kept.includes(name) ? routeOf({ name, local: false, help: false, remote: false }) : 'refused',
      name,
    );
  for (const name of [...TABLE_NAMES, 'frobnicate'])
    assert.notEqual(routeOf({ name, local: false, help: true, remote: true }), 'refused', `${name} --help`);
  for (const name of MACHINE_VERBS) assert.equal(routeOf({ name, local: false, help: false, remote: true }), 'process', name);
  for (const name of ['template', 'frontmatter', 'admit'])
    assert.ok((MACHINE_VERBS as readonly string[]).includes(name), `${name} reads and writes this machine's files, no store`);
});

test('a moved command of each group asks the api under both contexts and with --help, its former name included', () => {
  for (const argv of [
    ['cancel', 'r'],
    ['inbox', 'add', 'x'],
    ['factory', 'hire', 'f', 'a'],
    ['ls'],
    ['stats'],
    ['accept', 'r', 's'],
    ['round', 'r', 's'],
  ]) {
    const name = nameOf(renamedIn(argv).words);
    assert.ok((MOVED_COMMANDS as readonly string[]).includes(name), `${argv.join(' ')} opens with ${name}, a moved command`);
    for (const remote of [false, true])
      for (const help of [false, true])
        assert.equal(routeOf({ name, local: false, help, remote }), 'api', `${argv.join(' ')} ${help} ${remote}`);
  }
  assert.equal(nameOf(renamedIn(['accept', 'r', 's']).words), 'approve');
  assert.equal(nameOf(renamedIn(['round', 'r', 's']).words), 'retry');
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
 * `src/local.ts`, its one resolver, resolves to the package's `bin/nemia.ts` — which prints the words it was spawned with, what it read
 * on stdin and `WF_ROOT`, as one JSON line.
 */
function plantedEntry(prefix: string): string {
  const entry = path.join(scratch(prefix), 'planted.mjs');
  fs.writeFileSync(
    entry,
    "import fs from 'node:fs';\n" +
      'const { WF_ROOT = null } = process.env;\n' +
      "const stdin = process.argv.includes('-') ? fs.readFileSync(0, 'utf8') : null;\n" +
      'process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), stdin, WF_ROOT }));\n',
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

test('REFUSED: a word stranded under a remote context, exit 2, naming `nemia --help` and NEMIA_CONTEXT=local; the old path never runs', async () => {
  const { env, root } = remoteLaptop('nemia-route-remote-');
  const hook = plantedEntry('nemia-route-planted-');
  for (const argv of [['frobnicate'], ['workflows', 'ls']]) {
    const { code, said, out } = await nemia(argv, env, hook);
    assert.equal(code, 2, `nemia ${argv.join(' ')}: ${said}`);
    assert.match(said, /`nemia --help`/, argv.join(' '));
    assert.match(said, new RegExp(`NEMIA_CONTEXT=local nemia ${argv.join(' ')}`), argv.join(' '));
    assert.equal(out, '', 'the old path never ran');
  }
  assert.equal(fs.existsSync(root), false, "nothing wrote this machine's store");
});

test("`nemia ls <run>` is the client's under both contexts: it asks the daemon the context names, and the old path never runs", async () => {
  const hook = plantedEntry('nemia-route-ls-run-planted-');
  for (const [laptop, unanswered] of [
    [remoteLaptop('nemia-route-ls-run-'), /127\.0\.0\.1:9/],
    [localLaptop('nemia-route-ls-run-local-'), /`nemia up`/],
  ] as const) {
    const { code, said, out } = await nemia(['ls', 'some-run'], laptop.env, hook);
    assert.equal(code, 2, `no daemon answers the client: ${said}`);
    assert.match(said, unanswered, 'it asked the daemon the context names');
    assert.doesNotMatch(said, /nemia show some-run/, 'never refused as a listing the remote daemon has not');
    assert.equal(out, '', 'the old path never ran');
    assert.equal(fs.existsSync(laptop.root), false, "nothing wrote this machine's store");
  }
});

test("`--help` of `show`, `closeout`, `ls`, `inbox` and `watch` is the client's, printed from their words under both contexts", async () => {
  const hook = plantedEntry('nemia-route-help-planted-');
  for (const laptop of [localLaptop('nemia-route-help-'), remoteLaptop('nemia-route-help-remote-')])
    for (const verb of ['show', 'closeout', 'ls', 'inbox', 'watch']) {
      for (const remote of [false, true]) assert.equal(routeOf({ name: verb, local: false, help: true, remote }), 'api', verb);
      const { code, said, out } = await nemia([verb, '--help'], laptop.env, hook);
      assert.equal(code, 0, `nemia ${verb} --help: ${said}`);
      assert.match(out, new RegExp(`nemia ${verb}`), `${verb}'s help names it`);
      assert.doesNotMatch(out, /"argv"/, 'the old path never ran');
    }
});

test('under a remote context `template lint` and an export of no factory run here; `template export --factory` asks the daemon first', async () => {
  const { env, root } = remoteLaptop('nemia-route-template-');
  const hook = plantedEntry('nemia-route-template-planted-');
  for (const argv of [
    ['template', 'lint', 'shop'],
    ['template', 'export', 'shop', '--from', 'repo'],
  ]) {
    const { code, said, out } = await nemia(argv, env, hook);
    assert.equal(code, 0, `nemia ${argv.join(' ')}: ${said}`);
    assert.deepEqual(JSON.parse(out), { argv, stdin: null, WF_ROOT: root }, argv.join(' '));
  }
  for (const argv of [
    ['template', 'export', 'shop', '--from', 'repo', '--factory', 'f'],
    ['template', 'export', 'shop', '--from', 'repo', '--factory=f'],
  ]) {
    const { code, said, out } = await nemia(argv, env, hook);
    assert.equal(code, 2, `nemia ${argv.join(' ')}: ${said}`);
    assert.match(said, /127\.0\.0\.1:9/, 'it asked the daemon the context names, which takes no connection');
    assert.equal(out, '', 'the old path never ran');
  }
});

test('under a remote context `nemia service status` still runs here, a verb about this machine', async () => {
  const { env } = remoteLaptop('nemia-route-machine-');
  const { code, said } = await nemia(['service', 'status', '--name', 'nemia-route-test'], env);
  assert.equal(code, 0, said);
});

test("a bare `nemia upgrade` under a remote context upgrades this machine, then names `nemia server upgrade`; under this machine's, and its help, no hint", async () => {
  const { env, root } = remoteLaptop('nemia-route-upgrade-');
  const hook = plantedEntry('nemia-route-upgrade-planted-');
  const remote = await nemia(['upgrade', 'v9.9.9'], env, hook);
  assert.equal(remote.code, 0, remote.said);
  assert.deepEqual(JSON.parse(remote.out), { argv: ['upgrade', 'v9.9.9'], stdin: null, WF_ROOT: root });
  assert.match(remote.said.slice(remote.out.length), /`nemia server upgrade/, 'the hint names the remote form, on stderr');
  const help = await nemia(['upgrade', '--help'], env, hook);
  assert.doesNotMatch(help.said, /nemia server upgrade/, "a help is the old path's alone");
  const local = localLaptop('nemia-route-upgrade-local-');
  const here = await nemia(['upgrade', 'v9.9.9'], local.env, hook);
  assert.equal(here.code, 0, here.said);
  assert.doesNotMatch(here.said, /nemia server upgrade/, "under this machine's context nothing names the server");
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
  assert.deepEqual(JSON.parse(out), { argv: ['workflows', 'ls'], stdin: null, WF_ROOT: local.root });
});
