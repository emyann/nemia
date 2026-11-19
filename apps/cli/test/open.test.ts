/**
 * `nemia open`, typed as a person types it against a served store (`served.ts`): it mints a first-visit link and hands it to this
 * machine's opener, under `localhost`, printing no secret; where no opener is tried (Linux with no display) or the one tried fails, it
 * prints the link instead; under a remote context it mints on that context's store, under the address the context names; and an agent's
 * token is refused the mint, exit 2, naming the command the person types.
 *
 * The openers are stand-ins: `open` and `xdg-open` scripts on a `PATH` of the test's, which write the arguments they were given to a file
 * and exit as the folder says. Each refusal asserts its exit code and the command it names, never its sentence.
 */
import { afterAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { ambient } from './ambient.ts';
import { configWritten } from '../src/context.ts';
import { type Said, servedStore } from './served.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

const store = await servedStore('nemia-open-', () => undefined);
afterAll(store.stop);

/** A folder of stand-in openers, `open` and `xdg-open`, each writing its arguments to `opened` and exiting `code`. */
function openers(code: number) {
  const bin = scratch('nemia-open-bin-');
  const opened = path.join(bin, 'opened');
  for (const name of ['open', 'xdg-open']) {
    const file = path.join(bin, name);
    fs.writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' "$@" >> '${opened}'\nexit ${code}\n`);
    fs.chmodSync(file, 0o755);
  }
  return { bin, opened } satisfies { bin: string; opened: string };
}

/** What the stand-ins were handed, a line an argument, or nothing where none ran. */
const handed = (opened: string) => (fs.existsSync(opened) ? fs.readFileSync(opened, 'utf8').trim().split('\n') : []) satisfies string[];

/** `nemia <argv>` on `env`, waited on for its end. */
function nemia(argv: readonly string[], env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [CLI, ...argv], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => (out += chunk));
  child.stderr.on('data', (chunk) => (err += chunk));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  }) satisfies Promise<Said>;
}

/** The store's environment with `bin` first on `PATH` and the display variables `display` sets, the others unset. */
function withOpeners(bin: string, display: NodeJS.ProcessEnv, base: NodeJS.ProcessEnv = store.env) {
  const { DISPLAY: _d, WAYLAND_DISPLAY: _w, ...rest } = base;
  return { ...rest, PATH: `${bin}${path.delimiter}${base.PATH ?? ''}`, ...display } satisfies NodeJS.ProcessEnv;
}

/** A first-visit link under `base`, as the api mints one. */
const linkUnder = (base: string) => new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\?link=\\S+$`) satisfies RegExp;

/**
 * A first-visit link under this machine's `localhost`, whatever its port: the board's address is the api's to say (`boardBase`, held by
 * the orchestrator's tests), and the api here, started on a free port with no lease of its own, says the port it was asked for.
 */
const LOCAL_LINK = /^http:\/\/localhost:\d+\/\?link=\S+$/;

test('`nemia open` with a display hands the opener a link under localhost, and prints no secret', async () => {
  const { bin, opened } = openers(0);
  const said = await nemia(['open'], withOpeners(bin, { DISPLAY: ':0' }));
  assert.equal(said.code, 0, said.err);
  const urls = handed(opened);
  assert.equal(urls.length, 1, 'one url handed to one opener');
  assert.match(urls[0] ?? '', LOCAL_LINK);
  assert.doesNotMatch(said.out + said.err, /link=/, 'the secret is not printed where a browser opened');
  assert.match(said.out, /http:\/\/localhost:\d+/, 'the board it opened is named');
});

test.skipIf(process.platform !== 'linux')('`nemia open` on Linux with no display opens nothing and prints the link', async () => {
  const { bin, opened } = openers(0);
  const said = await nemia(['open'], withOpeners(bin, {}));
  assert.equal(said.code, 0, said.err);
  assert.deepEqual(handed(opened), [], 'no opener is tried');
  assert.match(said.out.split('\n')[0] ?? '', LOCAL_LINK);
});

test('`nemia open` whose opener fails prints the link, and `--base` mints it under the name given', async () => {
  const { bin, opened } = openers(1);
  const said = await nemia(['open', '--base', 'http://box:8787'], withOpeners(bin, { DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0' }));
  assert.equal(said.code, 0, said.err);
  assert.equal(handed(opened).length, 1, 'the opener was tried');
  assert.match(said.out.split('\n')[0] ?? '', linkUnder('http://box:8787'));
});

test("under a remote context `nemia open` mints on that context's store, under the server the context names", async () => {
  const minted = await nemia(['token', 'add', 'open-laptop'], store.env);
  assert.equal(minted.code, 0, minted.err);
  const token = /Authorization: Bearer (\S+)/.exec(minted.out)?.[1] ?? assert.fail(minted.out);
  const folder = scratch('nemia-open-laptop-');
  const laptop: NodeJS.ProcessEnv = {
    ...ambient('NEMIA_ON_INSTALLED'),
    WF_ROOT: path.join(folder, 'store'),
    AE_ROOT: path.join(folder, 'engine'),
    HOME: path.join(folder, 'home'),
    XDG_CONFIG_HOME: path.join(folder, 'config'),
    NEMIA_DAEMON_START: 'off',
  };
  configWritten({ contexts: [{ name: 'vps', server: store.url, token }], current: 'vps' }, laptop);
  const { bin, opened } = openers(0);
  const said = await nemia(['open'], withOpeners(bin, { DISPLAY: ':0' }, laptop));
  assert.equal(said.code, 0, said.err);
  assert.match(handed(opened)[0] ?? '', linkUnder(store.url));
});

test("REFUSED exit 2: an agent's token is refused the mint, naming the command the person types", async () => {
  const minted = await nemia(['token', 'add', 'open-ops', '--agent', 'operator'], store.env);
  assert.equal(minted.code, 0, minted.err);
  const token = /Authorization: Bearer (\S+)/.exec(minted.out)?.[1] ?? assert.fail(minted.out);
  const { bin, opened } = openers(0);
  const said = await nemia(['open'], withOpeners(bin, { DISPLAY: ':0', WF_SESSION_TOKEN: token }));
  assert.equal(said.code, 2, said.out);
  assert.match(said.err, /`nemia [a-z]/, 'it names the command the person types');
  assert.deepEqual(handed(opened), [], 'nothing is opened');
});
