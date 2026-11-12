/**
 * Which daemon `nemia` asks, kubectl's way: the client's config file (`${XDG_CONFIG_HOME:-~/.config}/nemia/config.yaml`), written by
 * `nemia config set-context` and `use-context` with mode 0600, the token read from a file and never from the command line, and printed
 * by no verb; `NEMIA_CONTEXT` names one for a single command, and a name the file does not hold is refused, exit 2, naming `nemia config
 * get-contexts`. Under a remote context a moved read asks that daemon with the context's token, and nothing reads this machine's store
 * or starts a daemon: the client's own store root is never made, and the old path is forwarded with the context's server and token in
 * the orchestrator's `FORWARD_VARIABLES` and no `WF_ROOT` (`forwardedEnv`). The laws of `contextOf` are its contract's
 * (`context.contract.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { ambient } from './ambient.ts';
import { servedStore, type Said } from './served.ts';
import { FORWARD_VARIABLES as ORCHESTRATOR_FORWARD_VARIABLES } from 'agent-orchestrator';
import { chosenOf, configFileOf, configWritten, contextOf } from '../src/context.ts';
import { FORWARD_VARIABLES, forwardedEnv } from '../src/where.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** A laptop of its own: a config folder, a home, and a store root never made, so whatever reads or starts on it is seen. */
function aLaptop(prefix: string): { env: NodeJS.ProcessEnv; root: string; folder: string } {
  const folder = scratch(`${prefix}laptop-`);
  const root = path.join(folder, 'store');
  const env = {
    ...ambient(),
    HOME: path.join(folder, 'home'),
    XDG_CONFIG_HOME: path.join(folder, 'config'),
    WF_ROOT: root,
    AE_ROOT: path.join(folder, 'engine'),
  };
  return { env, root, folder };
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

/** A port nothing listens on: taken and given back. */
const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const server = net.createServer().listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address !== null ? address.port : 0));
    });
  });

/** A token file under `folder`, holding `token` and a line break, as a person's editor or `nemia token add | tail` leaves it. */
const tokenFile = (folder: string, token: string): string => {
  const file = path.join(folder, 'token');
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  return file;
};

test('`contextOf`: none named is this machine, `local` too, the variable wins over the file, and an unheld name is refused', () => {
  const vps = { name: 'vps', server: 'http://vps:7777', token: 't1' };
  const config = { contexts: [vps], current: 'vps' };
  assert.deepEqual(contextOf({ contexts: [vps], current: undefined }, undefined), { kind: 'local' });
  assert.deepEqual(contextOf(config, undefined), { kind: 'remote', ...vps });
  assert.deepEqual(contextOf(config, 'local'), { kind: 'local' });
  assert.deepEqual(contextOf(config, ''), { kind: 'remote', ...vps });
  assert.deepEqual(contextOf(config, 'gone'), { kind: 'refused', name: 'gone' });
});

test("`forwardedEnv`: the context's server and token in the forwarded variables, the rest kept, `WF_ROOT` dropped", () => {
  assert.deepEqual(FORWARD_VARIABLES, ORCHESTRATOR_FORWARD_VARIABLES, "the orchestrator's names, spelled once in the client");
  const chosen = { kind: 'remote', name: 'vps', server: 'http://vps:7777', token: 't1' } as const;
  const env = { HOME: '/somewhere/a', WF_ROOT: '/somewhere/a/.agent-workflows', NEMIA_SERVER: 'http://stale:1', PATH: '/bin' };
  assert.deepEqual(forwardedEnv(chosen, env), {
    HOME: '/somewhere/a',
    PATH: '/bin',
    NEMIA_SERVER: 'http://vps:7777',
    NEMIA_SERVER_TOKEN: 't1',
  });
  assert.equal(env.WF_ROOT, '/somewhere/a/.agent-workflows', 'the environment handed in is not changed');
});

test('`chosenOf`: the file read, and NEMIA_CONTEXT trimmed over it, blank being none', () => {
  const { env } = aLaptop('nemia-context-chosen-');
  configWritten({ contexts: [{ name: 'vps', server: 'http://vps:7777', token: 't1' }], current: undefined }, env);
  assert.equal(chosenOf(env).kind, 'local');
  assert.equal(chosenOf({ ...env, NEMIA_CONTEXT: ' vps\n' }).kind, 'remote');
  assert.equal(chosenOf({ ...env, NEMIA_CONTEXT: '  ' }).kind, 'local');
});

test('set-context and use-context write the config file 0600, the token read from its file and printed by no verb', async () => {
  const { env, folder } = aLaptop('nemia-context-file-');
  const token = 'person-token-never-printed';
  const set = await nemia(
    ['config', 'set-context', 'vps', '--server', 'http://127.0.0.1:1', '--token-file', tokenFile(folder, token)],
    env,
  );
  assert.equal(set.code, 0, set.err);
  const used = await nemia(['config', 'use-context', 'vps'], env);
  assert.equal(used.code, 0, used.err);
  const file = configFileOf(env);
  assert.equal(file, path.join(folder, 'config', 'nemia', 'config.yaml'));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.ok(fs.readFileSync(file, 'utf8').includes(token), 'the file keeps the token');
  const current = await nemia(['config', 'current-context'], env);
  assert.equal(current.code, 0, current.err);
  assert.equal(current.out.trim(), 'vps');
  const listed = await nemia(['config', 'get-contexts'], env);
  assert.equal(listed.code, 0, listed.err);
  assert.match(listed.out, /vps/);
  for (const said of [set, used, current, listed]) assert.ok(!`${said.out}${said.err}`.includes(token), 'no verb prints the token');
  const local = await nemia(['config', 'use-context', 'local'], env);
  assert.equal(local.code, 0, local.err);
  assert.equal((await nemia(['config', 'current-context'], env)).out.trim(), 'local');
});

test('set-context refuses a token on the command line, and use-context a name the file does not hold, exit 2', async () => {
  const { env } = aLaptop('nemia-context-argv-');
  const argv = await nemia(['config', 'set-context', 'vps', '--server', 'http://127.0.0.1:1', '--token', 'secret'], env);
  assert.equal(argv.code, 2, argv.err);
  assert.match(argv.err, /--token-file/);
  assert.equal(fs.existsSync(configFileOf(env)), false, 'nothing written');
  const unheld = await nemia(['config', 'use-context', 'gone'], env);
  assert.equal(unheld.code, 2, unheld.err);
  assert.match(unheld.err, /nemia config get-contexts/);
});

test('NEMIA_CONTEXT naming a context the file does not hold refuses the command, exit 2, naming `nemia config get-contexts`', async () => {
  const { env, root } = aLaptop('nemia-context-gone-');
  const said = await nemia(['ls'], { ...env, NEMIA_CONTEXT: 'gone' });
  assert.equal(said.code, 2, said.err);
  assert.match(said.err, /nemia config get-contexts/);
  assert.equal(fs.existsSync(root), false, 'no store read or made on this machine');
});

test('under a remote context `nemia ls` asks that daemon with its token, reading no store here and starting no daemon', async (t) => {
  const vps = await servedStore('nemia-context-vps-', () => {}, { WF_EXPOSED: '1' });
  t.after(vps.stop);
  const minted = await nemia(['token', 'add', 'laptop'], vps.env);
  assert.equal(minted.code, 0, minted.err);
  const token = /Authorization: Bearer (\S+)/.exec(minted.out)?.[1];
  assert.ok(token, minted.out);
  const { url } = vps;
  const { env, root, folder } = aLaptop('nemia-context-remote-');
  const set = await nemia(['config', 'set-context', 'vps', '--server', url, '--token-file', tokenFile(folder, token)], env);
  assert.equal(set.code, 0, set.err);
  assert.equal((await nemia(['config', 'use-context', 'vps'], env)).code, 0);
  const listed = await nemia(['ls'], env);
  assert.equal(listed.code, 0, listed.err);
  assert.equal(fs.existsSync(root), false, 'no store read or made on this machine');
  const once = await nemia(['inbox'], { ...env, NEMIA_CONTEXT: 'vps' });
  assert.equal(once.code, 0, once.err);
  const wrong = await nemia(['config', 'set-context', 'bad', '--server', url, '--token-file', tokenFile(folder, 'not-minted')], env);
  assert.equal(wrong.code, 0, wrong.err);
  const refused = await nemia(['ls'], { ...env, NEMIA_CONTEXT: 'bad' });
  assert.equal(refused.code, 2, `a token the daemon never minted is its 401, exit 2: ${refused.err}`);
  assert.equal(fs.existsSync(root), false, 'no daemon started here');
});

test('under a remote context that takes no connection, a read is refused naming the context and `nemia config get-contexts`', async () => {
  const { env, root, folder } = aLaptop('nemia-context-down-');
  const server = `http://127.0.0.1:${await freePort()}`;
  const set = await nemia(['config', 'set-context', 'vps', '--server', server, '--token-file', tokenFile(folder, 'tok')], env);
  assert.equal(set.code, 0, set.err);
  const said = await nemia(['ls'], { ...env, NEMIA_CONTEXT: 'vps' });
  assert.equal(said.code, 2, said.err);
  assert.match(said.err, /nemia config get-contexts/);
  assert.match(said.err, /vps/);
  assert.equal(fs.existsSync(root), false, 'no daemon started here');
});

test("on an exposed store's own machine, a token kept for `local` lets its reads in, and its store verbs still run in process", async (t) => {
  const server = await servedStore('nemia-context-own-', () => {}, { WF_EXPOSED: '1' });
  t.after(server.stop);
  const env = { ...server.env, XDG_CONFIG_HOME: scratch('nemia-context-own-config-') };
  const asked = await nemia(['ls'], env);
  assert.equal(asked.code, 2, `with no token the exposed store refuses its own machine's read: ${asked.err}`);
  const minted = await nemia(['token', 'add', 'here'], env);
  const token = /Authorization: Bearer (\S+)/.exec(minted.out)?.[1];
  assert.ok(token, minted.out);
  const set = await nemia(['config', 'set-context', 'local', '--token-file', tokenFile(scratch('nemia-context-own-token-'), token)], env);
  assert.equal(set.code, 0, set.err);
  assert.equal(fs.statSync(configFileOf(env)).mode & 0o777, 0o600);
  assert.doesNotMatch(set.out, new RegExp(token), 'the token is printed by no verb');
  const read = await nemia(['ls'], env);
  assert.equal(read.code, 0, read.err);
  const current = await nemia(['config', 'current-context'], env);
  assert.equal(current.out.trim(), 'local', 'the context stays this machine’s');
  const added = await nemia(['inbox', 'add', 'a card kept here'], env);
  assert.equal(added.code, 0, `a store verb runs in process, never refused as remote: ${added.err}`);
  assert.equal(
    (await nemia(['config', 'set-context', 'local', '--server', server.url, '--token-file', 'x'], env)).code,
    2,
    'local takes no server: it is always this machine',
  );
});

test("`nemia config headers`: NEMIA_TOKEN's header when set, else the context's (named or in use), else the local token, else {}", async () => {
  const { env } = aLaptop('nemia-headers-');
  const header = (token: string) => `${JSON.stringify({ Authorization: `Bearer ${token}` })}\n`;
  const none = await nemia(['config', 'headers'], env);
  assert.equal(none.code, 0, none.err);
  assert.equal(none.out, '{}\n');
  configWritten({ contexts: [], current: undefined, localToken: 'nm_local' }, env);
  assert.equal((await nemia(['config', 'headers'], env)).out, header('nm_local'));
  configWritten(
    {
      contexts: [
        { name: 'vps', server: 'http://vps:7777', token: 'nm_vps' },
        { name: 'box', server: 'http://box:7777', token: 'nm_box' },
      ],
      current: 'vps',
      localToken: 'nm_local',
    },
    env,
  );
  assert.equal((await nemia(['config', 'headers'], env)).out, header('nm_vps'));
  assert.equal((await nemia(['config', 'headers', '--context', 'box'], env)).out, header('nm_box'));
  assert.equal((await nemia(['config', 'headers', '--context', 'local'], env)).out, header('nm_local'));
  assert.equal((await nemia(['config', 'headers'], { ...env, NEMIA_CONTEXT: 'box' })).out, header('nm_box'));
  assert.equal((await nemia(['config', 'headers'], { ...env, NEMIA_TOKEN: 'nm_env' })).out, header('nm_env'));
  assert.equal((await nemia(['config', 'headers', '--context', 'box'], { ...env, NEMIA_TOKEN: 'nm_env' })).out, header('nm_env'));
  const unheld = await nemia(['config', 'headers', '--context', 'gone'], env);
  assert.equal(unheld.code, 2);
  assert.match(unheld.err, /nemia config get-contexts/);
});
