/**
 * `nemia factory` and its writes of a factory's own parts, told as a person types them under this machine's context: each parsed and
 * helped from `objects`' `COMMAND_WORDS`, run by the client's runner (`src/commands/factories/`) through the api serving a scratch store
 * (`served.ts`), and printed from what the api answers. A path the daemon keeps — a repository, a volume — typed relative to where the
 * command is typed is sent whole (`pathSent`); a file of words is read here, `-` from stdin, and its text sent. A write is seen in the
 * listing after it; each refusal asserts its exit code and the command or file it names, never its sentence.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { type Said, servedStore, write } from './served.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** The store the factory is filed in, served before any test begins. */
const store = await servedStore('nemia-factories-', () => {});
after(store.stop);

/** The folder a person types in: the factory's repository, `mill`, one workflow `make` of one step, and a folder `notes` to mount. */
const here = scratch('nemia-factories-here-');
const repo = path.join(here, 'mill');
write(path.join(repo, 'workflows', 'make', 'code.md'), '---\nplace: git\n---\nDo code.\n');
fs.mkdirSync(path.join(here, 'notes'));
write(path.join(here, 'RULES.md'), 'Say what you changed.\n');
write(path.join(here, 'NEMIA.md'), 'The mill presses drafts.\n');

/** `nemia <argv>` typed in `here` on the store's environment, `stdin` its input, waited on for its end. */
function nemia(argv: readonly string[], stdin = ''): Promise<Said> {
  const child = spawn(process.execPath, [CLI, ...argv], { cwd: here, env: store.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => (out += chunk));
  child.stderr.on('data', (chunk) => (err += chunk));
  child.stdin.end(stdin);
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

/** What `argv` printed, its exit 0 asserted. */
async function out(argv: readonly string[], stdin?: string): Promise<string> {
  const said = await nemia(argv, stdin);
  assert.equal(said.code, 0, `nemia ${argv.join(' ')}: ${said.err}`);
  return said.out;
}

/** That `argv` was refused with `code`, naming `named` on stderr. */
async function refused(argv: readonly string[], code: number, named: string): Promise<void> {
  const said = await nemia(argv);
  assert.equal(said.code, code, `nemia ${argv.join(' ')}: ${said.out}${said.err}`);
  assert.ok(said.err.includes(named), `nemia ${argv.join(' ')} names ${named}: ${said.err}`);
}

test('a person files a factory, wires its parts, sees each in the listing, and removes it', async (t) => {
  const s = story(t);

  await s.test('`factory add` with a repository typed relative files it on the folder by its whole path', async () => {
    const said = await out(['factory', 'add', 'mill', '--repo', 'mill', '--no-trust']);
    assert.match(said, new RegExp(`^mill  ${repo}$`, 'm'));
    assert.match(said, /^filed: .*mill\.json$/m);
    assert.match(await out(['factory', 'ls']), new RegExp(`^mill +${repo}$`, 'm'));
  });

  await s.test('`factory attach` attaches the workflow, and says so again unchanged; `hire` and `fire` fill its step', async () => {
    assert.match(await out(['factory', 'attach', 'mill', 'make']), /^mill  attached make$/m);
    assert.match(await out(['factory', 'attach', 'mill', 'make']), /^unchanged: /m);
    const folder = path.basename(repo);
    assert.match(
      await out(['factory', 'attach', 'mill', 'make', '--repo', folder]),
      new RegExp(`^mill  (already )?attached make, works on ${folder}$`, 'm'),
      '--repo names the repository its runs work on, said on its line',
    );
    assert.match(await out(['factory', 'hire', 'mill', 'implementer', '--step', 'make/code']), /^mill  make\/code ← implementer$/m);
    assert.match(
      await out(['factory', 'hire', 'mill', 'reviewer', '--step', 'make/code']),
      /^mill  make\/code ← reviewer \(was implementer\)$/m,
    );
    const listed = await out(['factory']);
    assert.match(listed, /^ +workflows: make$/m);
    assert.match(listed, /^ +make\/code ← reviewer$/m);
    assert.match(await out(['factory', 'fire', 'mill', '--step', 'make/code']), /^mill  make\/code  fired reviewer$/m);
  });

  await s.test('`factory schedule` schedules the workflow, the listing says its next fire, and `unschedule` takes it back', async () => {
    assert.match(
      await out(['factory', 'schedule', 'mill', 'make', '--cron', '0 9 * * 1', '--brief', 'Read the stats']),
      /^mill  make at 0 9 \* \* 1$/m,
    );
    assert.match(await out(['factory', 'schedule', 'mill', 'make', '--cron', '0 8 * * 1', '--brief', 'Read']), /\(was 0 9 \* \* 1\)$/m);
    const listed = await out(['factory', 'ls']);
    assert.match(listed, /^ +schedule make  0 8 \* \* 1  "Read"$/m);
    assert.match(listed, /^ +next \S+, in \S+  last none$/m);
    assert.match(await out(['factory', 'unschedule', 'mill', 'make']), /^mill  make no longer at 0 8 \* \* 1$/m);
  });

  await s.test('`factory volume add` mounts a folder typed relative by its whole path; `volume rm` takes it off typed so too', async () => {
    const notes = path.join(here, 'notes');
    assert.match(await out(['factory', 'volume', 'add', 'mill', 'notes:ro']), new RegExp(`^mill  volume ${notes} :ro$`, 'm'));
    assert.match(await out(['factory', 'ls']), new RegExp(`^ +volume ${notes} :ro$`, 'm'));
    assert.match(await out(['factory', 'volume', 'rm', 'mill', 'notes']), new RegExp(`^mill  volume ${notes} removed$`, 'm'));
  });

  await s.test('`factory setting` and `cost-line` set and take off what the runs are given, each seen in the listing', async () => {
    assert.match(
      await out(['factory', 'setting', 'set', 'mill', 'claude.language', '"french"']),
      /^mill  setting claude\.language "french"$/m,
    );
    assert.match(await out(['factory', 'cost-line', 'set', 'mill', 'make', '80']), /^mill  cost line make \$80\.00$/m);
    assert.match(await out(['factory', 'cost-line', 'set', 'mill', 'make', '12.50']), /^mill  cost line make \$12\.50 \(was \$80\.00\)$/m);
    const listed = await out(['factory']);
    assert.match(listed, /^ +setting claude\.language "french"$/m);
    assert.match(listed, /^ +cost line make \$12\.50$/m);
    assert.match(await out(['factory', 'setting', 'rm', 'mill', 'claude.language']), /^mill  setting claude\.language removed$/m);
    assert.match(await out(['factory', 'cost-line', 'rm', 'mill', 'make']), /^mill  cost line make removed$/m);
  });

  await s.test('`factory rules` writes the words of stdin, prints them bare, and removes them with --clear', async () => {
    assert.match(await out(['factory', 'rules', 'mill', '--file', '-'], 'Keep it short.\n'), /^mill: rules written to /m);
    assert.match(await out(['factory', 'rules', 'mill']), /^Keep it short\.$/m);
    assert.match(await out(['factory', 'rules', 'mill', '--file', 'RULES.md']), /^mill: rules written to /m);
    assert.match(await out(['factory', 'rules', 'mill']), /^Say what you changed\.$/m);
    assert.match(await out(['factory', 'rules', 'mill', '--clear']), /^mill: rules removed, /m);
    assert.match(await out(['factory', 'rules', 'mill', '--clear']), /^mill has no rules to remove$/m);
  });

  await s.test('`factory instruction --store`, then `instruct` writes its words from a file and takes them off once', async () => {
    assert.match(await out(['factory', 'instruction', 'mill', '--store']), /^mill: instruction kept in the store: /m);
    assert.match(await out(['factory', 'instruct', 'mill', '--file', 'NEMIA.md']), /^mill: instruction written to /m);
    assert.match(await out(['factory', 'instruction', 'mill']), /^The mill presses drafts\.$/m);
    assert.match(await out(['factory', 'ls']), /^ +instruction: kept in the store$/m);
    assert.match(await out(['factory', 'instruct', 'mill', '--clear']), /^mill: instruction removed, /m);
    assert.match(await out(['factory', 'instruct', 'mill', '--clear']), /^mill has no instruction in the store to remove$/m);
  });

  await s.test('`factory server add` records a server, `servers` lists it with its state, and `server rm` takes it off', async () => {
    const added = await out(['factory', 'server', 'add', 'mill', 'docs', '--url', 'https://a.example/mcp', '--header', 'X-Team=mill']);
    assert.match(added, /^mill  docs → http https:\/\/a\.example\/mcp$/m);
    assert.match(
      await out(['factory', 'server', 'add', 'mill', 'docs', '--url', 'https://b.example/mcp']),
      /\(was https:\/\/a\.example\/mcp\)$/m,
    );
    assert.match(await out(['factory', 'servers', 'mill']), /^docs +http  https:\/\/b\.example\/mcp  /m);
    assert.match(await out(['factory', 'server', 'rm', 'mill', 'docs']), /^mill  docs removed$/m);
    assert.match(await out(['factory', 'servers', 'mill']), /^mill  no server recorded/m);
  });

  await s.test('`factory revisions` sets the policy and says the one it replaced; `trust` asks nothing of a harness here', async () => {
    assert.match(await out(['factory', 'revisions', 'mill', 'follow']), /^mill  revisions: follow$/m);
    assert.match(await out(['factory', 'revisions', 'mill', 'pinned']), /^mill  revisions: pinned \(was follow\)$/m);
    assert.match(await out(['factory', 'ls']), /^ +revisions: pinned$/m);
    assert.equal((await nemia(['factory', 'trust', 'mill'])).code, 0);
  });

  await s.test(
    'REFUSED, exit 2: a hire with no step, a header with no value, a callback port with no client, before anything is asked',
    async () => {
      await refused(['factory', 'hire', 'mill', 'implementer'], 2, '--step');
      await refused(['factory', 'server', 'add', 'mill', 'docs', '--url', 'https://a.example/mcp', '--header', 'novalue'], 2, 'novalue');
      await refused(
        ['factory', 'server', 'add', 'mill', 'docs', '--url', 'https://a.example/mcp', '--callback-port', '8791'],
        2,
        '--client-id',
      );
      await refused(['factory', 'rules', 'mill', '--file', 'nowhere.md'], 2, path.join(here, 'nowhere.md'));
      await refused(['factory', 'cost-line', 'set', 'mill', 'make', 'lots'], 2, 'lots');
    },
  );

  await s.test('REFUSED by the api in its words: a workflow the factory has not attached, a step it does not offer', async () => {
    assert.notEqual((await nemia(['factory', 'detach', 'mill', 'nowhere'])).code, 0);
    assert.notEqual((await nemia(['factory', 'hire', 'mill', 'implementer', '--step', 'nowhere/code'])).code, 0);
  });

  await s.test('`factory rm` removes it, and the listing holds the default alone', async () => {
    assert.match(await out(['factory', 'rm', 'mill']), /^mill  removed — /m);
    const listed = await out(['factory', 'ls']);
    assert.doesNotMatch(listed, /^mill /m);
    assert.match(listed, /^default  every run and card that names no factory/m);
  });
});
