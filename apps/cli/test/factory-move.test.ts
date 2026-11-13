/**
 * `nemia factory move` as a person types it, between two stores each served by its own api (`served.ts`): this machine's, `local`, the
 * context in use and so the source, and another the client's config names `far`, the target, asked with a token of the person's minted
 * there. A move prints what was filed, then the two commands to type next, the trust on the target and the removal on the source, and
 * exits 0, the target listing the factory. Refused before either daemon is asked: a `--to` the config does not hold, exit 2 naming
 * `nemia config get-contexts`, and `--from` naming the store `--to` names. Refused by the target: an import it refuses exits with its
 * refusal's code, and the target lists no such factory. Each refusal asserts its code and the command it names, never its sentence.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { configWritten } from '../src/context.ts';
import { type Said, servedStore, write } from './served.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** The source, this machine's store: a card of the factory `mill` in its inbox, unstarted, to follow it. */
const source = await servedStore('nemia-move-source-', (root) =>
  write(
    path.join(root, 'inbox', 'polish-it.md'),
    '---\nworkflow: press\nfactory: mill\nqueued: 2026-11-01T00:00:00.000Z\n---\n\nPolish it.\n',
  ),
);
after(source.stop);
/** The target, another store, reached under the context `far`. */
const target = await servedStore('nemia-move-target-', () => {});
after(target.stop);

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

/** `nemia <argv>` on `env`, its exit code asserted `code`. */
async function typed(env: NodeJS.ProcessEnv, argv: readonly string[], code = 0): Promise<Said> {
  const said = await nemia(argv, env);
  assert.equal(said.code, code, `nemia ${argv.join(' ')}: ${said.err}${said.out}`);
  return said;
}

/** A token of the person's for the target, minted there by a verb of its machine. */
const minted = await typed(target.env, ['token', 'add', 'laptop']);
const TOKEN = /Authorization: Bearer (\S+)/.exec(minted.out)?.[1] ?? assert.fail(minted.out);

/** The source's machine as the person types on it: its own store in use, and its config naming the target as `far`. */
const here: NodeJS.ProcessEnv = { ...source.env, XDG_CONFIG_HOME: scratch('nemia-move-config-') };
configWritten({ contexts: [{ name: 'far', server: target.url, token: TOKEN }], current: undefined }, here);

/** The same machine, a command run under the context `far`: the target's store. */
const there: NodeJS.ProcessEnv = { ...here, NEMIA_CONTEXT: 'far' };

/** The repository `mill` works on at the source, a plain folder with no origin, and the folder the target is given for it. */
const MILL = scratch('nemia-move-mill-');
const MILL_THERE = scratch('nemia-move-mill-there-');
/** The repository of `lone`, a factory whose move gives none for it. */
const LONE = scratch('nemia-move-lone-');

await typed(here, ['factory', 'add', 'mill', '--repo', MILL, '--no-trust']);
await typed(here, ['factory', 'add', 'lone', '--repo', LONE, '--no-trust']);

/** Whether `nemia factory ls` on `env` lists the factory `name`. */
const lists = async (env: NodeJS.ProcessEnv, name: string): Promise<boolean> =>
  new RegExp(`^${name} `, 'm').test((await typed(env, ['factory', 'ls'])).out);

test('a factory moved to the store another context names: filed there, then the trust there and the removal here named', async () => {
  const said = await typed(here, ['factory', 'move', 'mill', '--to', 'far', '--repo', `${MILL}=${MILL_THERE}`]);
  assert.match(said.out, /^ +NEMIA_CONTEXT=far nemia factory trust mill$/m, 'the trust on the target is named');
  assert.match(said.out, /NEMIA_CONTEXT=local nemia factory rm mill$/m, 'the removal on the source is named');
  assert.match(said.out, /polish-it ← polish-it/, 'the card that followed is named by its old name');
  assert.ok(await lists(there, 'mill'), 'the target lists the factory');
  assert.ok(await lists(here, 'mill'), 'the source keeps it until it is removed there');
});

test('REFUSED: a --to the config does not hold, exit 2, naming nemia config get-contexts; --from naming the store --to names, exit 2', async () => {
  const unheld = await typed(here, ['factory', 'move', 'mill', '--to', 'nowhere'], 2);
  assert.ok(unheld.err.includes('nemia config get-contexts'), unheld.err);
  const same = await typed(here, ['factory', 'move', 'mill', '--from', 'far', '--to', 'far'], 2);
  assert.ok(same.err.includes('nemia config get-contexts'), same.err);
  const defaulted = await typed(there, ['factory', 'move', 'mill', '--to', 'far'], 2);
  assert.ok(defaulted.err.includes('--from'), `the context in use is the target: ${defaulted.err}`);
});

test("REFUSED: an import the target refuses exits with its refusal's code, and the target lists no such factory", async () => {
  const refused = await typed(here, ['factory', 'move', 'lone', '--to', 'far'], 2);
  assert.ok(refused.err.includes('--repo'), `the flag to give is named: ${refused.err}`);
  assert.equal(await lists(there, 'lone'), false, 'nothing is filed on the target');
  assert.equal(fs.existsSync(path.join(target.root, 'factories', 'lone')), false, 'no folder is left there');
});
