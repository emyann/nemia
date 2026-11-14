/**
 * What `nemia` does under a remote context now that nothing is forwarded, typed against a served store (`served.ts`, exposed, so every
 * call presents the context's token): a write changes that store and leaves this machine's store unmade; what the api answers 404 exits
 * as `Missing` does, exit 2; a token it refuses exits 2; a card filed with no workflow is refused when started with none, naming its
 * start by its name and no path of the daemon's store; `nemia daemon` prints the line of the daemon the context names, as it does under
 * this machine's context; and `nemia template export --factory` writes the factory's rules and instruction as that daemon serves them,
 * read through its api and handed to the export here.
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

/** Where the command line is typed, the files it names beside it. */
const HERE = scratch('nemia-remote-here-');

/** `nemia <argv>` on `env`, typed in `HERE`, waited on for its end. */
function nemia(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<Said> {
  const child = spawn(process.execPath, [CLI, ...argv], { cwd: HERE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => (out += chunk));
  child.stderr.on('data', (chunk) => (err += chunk));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

const exposed = await servedStore('nemia-remote-', () => {}, { WF_EXPOSED: '1' });
after(exposed.stop);

/** A token of the person's for the exposed store, minted there by a verb of its machine. */
const minted = await nemia(['token', 'add', 'laptop'], exposed.env);
assert.equal(minted.code, 0, minted.err);
const TOKEN = /Authorization: Bearer (\S+)/.exec(minted.out)?.[1] ?? assert.fail(minted.out);

/** A laptop with no store of its own, its config naming the exposed store's api with `token`. */
function laptop(token: string = TOKEN): NodeJS.ProcessEnv {
  const folder = scratch('nemia-remote-laptop-');
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

/** Every file under `dir`, by its path from it, with its text: what a store holds. */
function filesOf(dir: string): Record<string, string> {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => {
        const at = path.join(e.parentPath, e.name);
        return [path.relative(dir, at), fs.readFileSync(at, 'utf8')];
      }),
  );
}

/** The keys of `after` whose text is not `before`'s: what a command changed in a store. */
const changed = (before: Record<string, string>, after: Record<string, string>): string[] =>
  Object.keys(after).filter((k) => before[k] !== after[k]);

/** The repository the factory `mill` works on, with a `workflows/` folder an export reads. */
const MILL = scratch('nemia-remote-mill-');
fs.mkdirSync(path.join(MILL, 'workflows'), { recursive: true });

/** `nemia <argv>` on the laptop `env`, its exit code asserted `code`. */
async function typed(env: NodeJS.ProcessEnv, argv: readonly string[], code = 0): Promise<Said> {
  const said = await nemia(argv, env);
  assert.equal(said.code, code, `nemia ${argv.join(' ')}: ${said.err}${said.out}`);
  return said;
}

/** The factory `mill` filed on the daemon's store over `MILL`, its instruction kept in the store, through the laptop `env`. */
const millFiled = await (async () => {
  const env = laptop();
  await typed(env, ['factory', 'add', 'mill', '--repo', MILL]);
  await typed(env, ['factory', 'instruction', 'mill', '--store']);
  return 'mill';
})();

test("a write changes the daemon's store, its file read on this machine and sent, and this machine's store is never made", async () => {
  const env = laptop();
  const before = filesOf(exposed.root);
  await typed(env, ['pause-timeout', '10m']);
  assert.ok(changed(before, filesOf(exposed.root)).length > 0, 'the timeout is written there');
  write(path.join(HERE, 'words.md'), 'Keep it short.\n');
  await typed(env, ['factory', 'instruct', millFiled, '--file', 'words.md']);
  const after = filesOf(exposed.root);
  assert.ok(
    Object.values(after).some((text) => text.includes('Keep it short.')),
    'the instruction read here is written there',
  );
  assert.equal(fs.existsSync(env.WF_ROOT ?? ''), false, "nothing made on this machine's store");
});

test('REFUSED: what the api answers 404 exits as Missing does, exit 2, and a token it refuses exits 2, naming the run or the server', async () => {
  const env = laptop();
  const missing = await typed(env, ['cancel', 'no-such-run'], 2);
  assert.match(missing.err, /no-such-run/);
  const stranger = laptop('never-minted');
  const refused = await typed(stranger, ['pause-timeout', '10m'], 2);
  assert.ok(refused.err.length > 0, 'it says why');
  for (const at of [env, stranger]) assert.equal(fs.existsSync(at.WF_ROOT ?? ''), false, "nothing made on this machine's store");
});

test("REFUSED: a card of the daemon's inbox that names no workflow, started with none, is refused naming its start by its name", async () => {
  const env = laptop();
  await typed(env, ['factory', 'add', 'press', '--repo', scratch('nemia-remote-press-')]);
  write(path.join(HERE, 'bare.md'), 'Show the flag\n\nNo workflow named.\n');
  const before = Object.keys(filesOf(path.join(exposed.root, 'inbox')));
  await typed(env, ['inbox', 'add', 'bare.md', '--factory', 'press']);
  const [made = ''] = Object.keys(filesOf(path.join(exposed.root, 'inbox'))).filter((f) => f.endsWith('.md') && !before.includes(f));
  const name = path.basename(made, '.md');
  assert.ok(name, 'the card is filed there');
  const started = await typed(env, ['start', name], 2);
  assert.ok(started.err.includes(`nemia start ${name} --workflows`), started.err);
  assert.ok(!started.err.includes(exposed.root), `no path of the daemon's store: ${started.err}`);
});

/** The line the api serving `url` says of its daemon (`GET /api/daemon`), asked with `token` where one is given. */
async function daemonLine(url: string, token?: string): Promise<string> {
  const answer = await fetch(`${url}/api/daemon`, token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } });
  assert.equal(answer.status, 200);
  const { line } = (await answer.json()) as { line: string };
  return line;
}

test("`nemia daemon` prints the line of the daemon the context names, under this machine's context and a remote one, exit 0", async () => {
  const here = await servedStore('nemia-remote-daemon-', () => {});
  try {
    const local = await here.nemia(['daemon']);
    assert.equal(local.code, 0, local.err);
    const credential = fs.readFileSync(path.join(here.root, 'credential'), 'utf8').trim();
    assert.equal(local.out, `${await daemonLine(here.url, credential)}\n`);
    const json = await here.nemia(['daemon', '--json']);
    assert.equal(json.code, 0, json.err);
    assert.deepEqual(Object.keys(JSON.parse(json.out)), ['state', 'by', 'pid', 'url']);
  } finally {
    await here.stop();
  }
  const remote = await typed(laptop(), ['daemon']);
  assert.equal(remote.out, `${await daemonLine(exposed.url, TOKEN)}\n`);
});

test("`nemia template export --factory` under a remote context writes the factory's rules and instruction as that daemon serves them", async () => {
  const env = laptop();
  write(path.join(HERE, 'rules.md'), 'Ship small changes.\n');
  write(path.join(HERE, 'instruction.md'), 'Mill makes the flour.\n');
  await typed(env, ['factory', 'rules', millFiled, '--file', 'rules.md']);
  await typed(env, ['factory', 'instruct', millFiled, '--file', 'instruction.md']);
  const dir = path.join(scratch('nemia-remote-export-'), 'mill-template');
  const exported = await typed(env, ['template', 'export', dir, '--from', MILL, '--factory', millFiled]);
  assert.match(exported.out, /written: /);
  assert.equal(fs.readFileSync(path.join(dir, 'RULES.md'), 'utf8'), 'Ship small changes.\n');
  assert.equal(fs.readFileSync(path.join(dir, 'NEMIA.md'), 'utf8'), 'Mill makes the flour.\n');
  assert.equal(fs.existsSync(env.WF_ROOT ?? ''), false, "nothing made on this machine's store");
});
