/**
 * The rest of the store's verbs the client holds, typed under a remote context pointed at a served store (`served.ts`, exposed, so
 * every call presents the context's token): each reads or writes that store, prints what it prints under this machine's context, and
 * reads or makes nothing on this machine. The verbs under this machine's context are `rest.test.ts`'s.
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

const exposed = await servedStore('nemia-rest-remote-', (root) => write(path.join(root, 'nemia', 'memory', 'feed-cursor'), '42\n'), {
  WF_EXPOSED: '1',
});
after(exposed.stop);

/** A laptop with no store of its own, its config naming the exposed store's api with a token of the person's. */
async function laptop(): Promise<NodeJS.ProcessEnv> {
  const minted = await nemia(['token', 'add', 'laptop'], exposed.env);
  assert.equal(minted.code, 0, minted.err);
  const token = /Authorization: Bearer (\S+)/.exec(minted.out)?.[1] ?? assert.fail(minted.out);
  const folder = scratch('nemia-rest-laptop-');
  const env: NodeJS.ProcessEnv = {
    ...ambient('NEMIA_ON_INSTALLED'),
    WF_ROOT: path.join(folder, 'store'),
    AE_ROOT: path.join(folder, 'engine'),
    HOME: path.join(folder, 'home'),
    XDG_CONFIG_HOME: path.join(folder, 'config'),
    NEMIA_DAEMON_START: 'off',
  };
  configWritten({ contexts: [{ name: 'vps', server: exposed.url, token }], current: 'vps' }, env);
  return env;
}

test("under a remote context, each verb reads and writes that context's store, prints as it does here, and makes nothing here", async () => {
  const env = await laptop();
  const typed = async (argv: readonly string[], code = 0) => {
    const said = await nemia(argv, env);
    assert.equal(said.code, code, `nemia ${argv.join(' ')}: ${said.err}${said.out}`);
    return said;
  };
  assert.equal((await typed(['memory', 'feed-cursor'])).out, '42\n');
  assert.match((await typed(['memory'])).out, /^ {2}feed-cursor$/m);
  assert.match((await typed(['chat', 'allow', 'operator'])).out, /^operator$/m);
  assert.match(fs.readFileSync(path.join(exposed.root, 'nemia', 'chat', 'speakers.json'), 'utf8'), /operator/, 'written there');
  assert.equal((await typed(['chat', 'speakers'])).out, 'operator\n');
  assert.match((await typed(['level'])).out, /^Nemia: the store at manual$/m);
  assert.match((await typed(['passes'])).out, /^no pass is kept yet/);
  assert.match((await typed(['series'])).out, /^nothing is kept for 24h yet/);
  assert.match((await typed(['stats', '--line'])).out, /^stats, last 14 days/);
  assert.match((await typed(['pairings', 'ls'])).out, /^no pairing is kept/);
  assert.match((await typed(['board', 'link', '--base', 'http://box:8787'])).out, /^http:\/\/box:8787\//);
  assert.match((await typed(['concluded', 'r-nobody'], 2)).err, /r-nobody/);
  assert.match((await typed(['subscribe', 'away', 't-nobody'], 2)).err, /t-nobody/);
  assert.equal(fs.existsSync(env.WF_ROOT ?? ''), false, "nothing read or made on this machine's store");
});
