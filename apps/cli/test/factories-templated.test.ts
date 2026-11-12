/**
 * The factory made from a template, told as a person types it: `nemia factory apply`, `diff`, `adopt`, `upgrade` and `resolve`, run by
 * the client's runner (`src/commands/factories/templated.ts`) through the api serving a scratch store (`served.ts`). Under this machine's
 * context a template's folder typed relative is sent by its whole path, which the factory reads again on every pass; under a remote one
 * it is packed on this machine and sent as an archive the daemon keeps, and a repository is sent as typed, the daemon's machine's path,
 * so one typed relative is the api's refusal. A file a choice is read from is read here, refused naming it where it is not there.
 * Each refusal asserts its exit code and the command or file it names, never its sentence.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { ambient } from './ambient.ts';
import { configWritten } from '../src/context.ts';
import { type Said, servedStore, write } from './served.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** The store the factories are filed in, served before any test begins. */
const store = await servedStore('nemia-factories-templated-', () => {});
after(store.stop);

/** The template `name` in `folder`: one workflow, `press`, whose step `draft` the agent `drafter` fills. */
function template(folder: string, name: string): string {
  const at = path.join(folder, name);
  write(
    path.join(at, 'nemia.yaml'),
    `apiVersion: nemia.dev/v1alpha1\nkind: FactoryTemplate\nmetadata:\n  name: ${name}\n  description: A mill that presses drafts.\nspec:\n  version: 0.1.0\n  hires:\n    press/draft: drafter\n`,
  );
  write(
    path.join(at, 'workflows', 'press', 'workflow.yaml'),
    'apiVersion: nemia.dev/v1alpha1\nkind: Workflow\nmetadata:\n  name: press\n  description: Press a draft.\nspec:\n  steps:\n    - name: draft\n      place: git\n',
  );
  write(path.join(at, 'workflows', 'press', 'draft.md'), 'Draft the page.\n');
  write(
    path.join(at, 'agents', 'drafter', 'agent.yaml'),
    'apiVersion: nemia.dev/v1alpha1\nkind: Agent\nmetadata:\n  name: drafter\nspec:\n  role: Drafter\n  description: Drafts a page.\n  harness: claude\n',
  );
  write(path.join(at, 'agents', 'drafter', 'instructions.md'), 'You draft.\n');
  return at;
}

/** The folder a person types in: a repository `mill`, and the template `press` beside it. */
const here = scratch('nemia-factories-templated-here-');
const repo = path.join(here, 'mill');
fs.mkdirSync(repo);
const press = template(here, 'press');

/** `nemia <argv>` typed in `here` on `env`, waited on for its end. */
function nemia(argv: readonly string[], env: NodeJS.ProcessEnv = store.env): Promise<Said> {
  const child = spawn(process.execPath, [CLI, ...argv], { cwd: here, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => (out += chunk));
  child.stderr.on('data', (chunk) => (err += chunk));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

/** What `argv` printed on `env`, its exit 0 asserted. */
async function out(argv: readonly string[], env?: NodeJS.ProcessEnv): Promise<string> {
  const said = await nemia(argv, env);
  assert.equal(said.code, 0, `nemia ${argv.join(' ')}: ${said.err}`);
  return said.out;
}

/** The factory `name`'s file in the store at `root`. */
const fileOf = (root: string, name: string): { template?: { source: string } } =>
  JSON.parse(fs.readFileSync(path.join(root, 'factories', `${name}.json`), 'utf8'));

test("under this machine's context a person makes a factory from a template's folder, and takes a hand-made one over by it", async (t) => {
  const s = story(t);

  await s.test('`factory apply` with a folder typed relative makes the factory read from that folder, by its whole path', async () => {
    const said = await out(['factory', 'apply', 'pressed', '--template', './press', '--repo', 'mill', '--no-trust']);
    assert.match(said, new RegExp(`made from ${press} at 0\\.1\\.0`));
    assert.equal(fileOf(store.root, 'pressed').template?.source, press);
    assert.match(await out(['factory', 'ls']), new RegExp(`^ +template: ${press} 0\\.1\\.0, not rendered yet`, 'm'));
  });

  await s.test('`factory diff` previews a hand-made factory taken over; `adopt` by the digest it printed takes it over', async () => {
    await out(['factory', 'add', 'plain', '--repo', 'mill', '--no-trust']);
    const plan = await out(['factory', 'diff', 'plain', '--template', './press']);
    assert.match(plan, /^plain: taken over by the template, in place/m);
    const digest = /^plan: (sha256:\S+)$/m.exec(plan)?.[1] ?? assert.fail(plan);
    const adopted = await out(['factory', 'adopt', 'plain', '--template', './press', '--plan', digest]);
    assert.match(adopted, /^plain: taken over by .* at 0\.1\.0$/m);
    assert.equal(fileOf(store.root, 'plain').template?.source, press);
  });

  await s.test(
    'REFUSED: a choice read from a file that is not there, exit 2, naming it; a resolve with no upgrade, by the api',
    async () => {
      const missing = await nemia(['factory', 'resolve', 'pressed', 'workflows/press/draft.md', '--file', 'nowhere.md']);
      assert.equal(missing.code, 2, missing.err);
      assert.ok(missing.err.includes(path.join(here, 'nowhere.md')), missing.err);
      assert.notEqual((await nemia(['factory', 'resolve', 'pressed', 'workflows/press/draft.md', '--ours'])).code, 0);
      assert.notEqual((await nemia(['factory', 'upgrade', 'pressed', '--to', '0.2.0'])).code, 0);
    },
  );
});

test("under a remote context, a template folder is packed here and kept by the daemon; a repository is the daemon's path", async (t) => {
  const s = story(t);
  const exposed = await servedStore('nemia-factories-remote-', () => {}, { WF_EXPOSED: '1' });
  after(exposed.stop);
  const minted = await nemia(['token', 'add', 'laptop'], exposed.env);
  assert.equal(minted.code, 0, minted.err);
  const token = /Authorization: Bearer (\S+)/.exec(minted.out)?.[1] ?? assert.fail(minted.out);
  const folder = scratch('nemia-factories-laptop-');
  const laptop: NodeJS.ProcessEnv = {
    ...ambient('NEMIA_ON_INSTALLED'),
    WF_ROOT: path.join(folder, 'store'),
    AE_ROOT: path.join(folder, 'engine'),
    HOME: path.join(folder, 'home'),
    XDG_CONFIG_HOME: path.join(folder, 'config'),
    NEMIA_DAEMON_START: 'off',
  };
  configWritten({ contexts: [{ name: 'vps', server: exposed.url, token }], current: 'vps' }, laptop);

  await s.test('`factory apply` packs the folder and sends it: the daemon keeps the archive, and the factory names it', async () => {
    await out(['factory', 'apply', 'away', '--template', './press', '--repo', repo, '--no-trust'], laptop);
    const source = fileOf(exposed.root, 'away').template?.source ?? '';
    assert.ok(source.startsWith(path.join(exposed.root, 'templates-sent')), source);
    assert.match(await out(['factory', 'ls'], laptop), /^away +/m);
  });

  await s.test("`factory add` by a repository's whole path files it there; `rules --file` sends the file's words", async () => {
    assert.match(await out(['factory', 'add', 'far', '--repo', repo, '--no-trust'], laptop), new RegExp(`^far  ${repo}$`, 'm'));
    write(path.join(here, 'RULES.md'), 'Short.\n');
    await out(['factory', 'rules', 'far', '--file', 'RULES.md'], laptop);
    assert.match(await out(['factory', 'rules', 'far'], laptop), /^Short\.$/m);
    assert.equal(fs.readFileSync(path.join(exposed.root, 'factories', 'far', 'RULES.md'), 'utf8'), 'Short.\n');
  });

  await s.test(
    "REFUSED: a repository typed relative names the daemon's machine, and its api refuses it; nothing is read here",
    async () => {
      assert.notEqual((await nemia(['factory', 'add', 'near', '--repo', 'mill', '--no-trust'], laptop)).code, 0);
      assert.equal(fs.existsSync(path.join(exposed.root, 'factories', 'near.json')), false);
      assert.equal(fs.existsSync(laptop.WF_ROOT ?? ''), false, "nothing read or made on this machine's store");
    },
  );
});
