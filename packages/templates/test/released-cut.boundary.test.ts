/**
 * `node packages/templates/released.ts cut`, the command the landing runs where a run's branch lacks its base: in a scratch repository
 * holding a copy of this workspace (its templates, their record and `released.ts`), a branch forked where the record said one version,
 * the base moved since, and the base merged into the branch with `--no-commit`, as the landing leaves it before it runs the command.
 * After `cut`, no derived file is left unmerged, each template's `spec.version` is above every version the base records, of the kind the
 * branch bumped by, and the record holds the digest `nemia template lint` prints of the merged content: the judgement of
 * `released.test.ts`, read here over the merged tree.
 *
 * Every digest spawns the orchestrator's lint, so a fixture records a digest only where `cut` reads it: the base's record is real, and a
 * branch's own record, which `cut` never reads, holds a placeholder.
 *
 * Its subject is git and a spawned script: a boundary file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { digestOf, modesOf, RELEASED, type Records, templatesIn } from '../released.ts';
import { TEMPLATES } from './template.ts';

/** The workspace's path in the scratch repository, as it is in this one. */
const WS = 'packages/templates';

/** A digest no content has: a branch's own record, which `cut` never reads. */
const PLACEHOLDER = `sha256:${'0'.repeat(64)}`;

/** An environment where git reads no configuration of the machine's, and no test runner's variable reaches a spawn. */
const ENV: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
delete ENV.NODE_TEST_CONTEXT;

/** `git <args>` in `dir` as nobody in particular: its exit and its streams. */
const git = (dir: string, ...args: string[]): { code: number | null; out: string; err: string } => {
  const ran = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd: dir,
    env: ENV,
    encoding: 'utf8',
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
};

/** `git <args>` in `dir`, which must succeed: its standard output. */
const ok = (dir: string, ...args: string[]): string => {
  const ran = git(dir, ...args);
  assert.equal(ran.code, 0, `git ${args.join(' ')}: ${ran.err}`);
  return ran.out;
};

/** A version as it is written, from its three parts. */
type Version = [number, number, number];

/** The version `text` says. */
const parts = (text: string): Version => text.split('.').map(Number) as Version;

/**
 * A scratch repository on `main`, its one commit holding a copy of this workspace: its root, and the version sdlc is at there. The
 * repository's `node_modules` is this one's, so the copy of `released.ts` resolves the orchestrator's CLI from where it sits, as the one
 * in a run's worktree does.
 */
function world(): { root: string; ws: string; at: Version } {
  const root = scratch('nemia-released-cut-');
  const ws = path.join(root, WS);
  fs.mkdirSync(ws, { recursive: true });
  const modes = modesOf(TEMPLATES);
  for (const name of ['released.ts', 'package.json', RELEASED, ...templatesIn(TEMPLATES)])
    fs.cpSync(path.join(TEMPLATES, name), path.join(ws, name), { recursive: true });
  for (const template of templatesIn(ws))
    for (const file of fs.readdirSync(path.join(ws, template), { recursive: true, encoding: 'utf8' })) {
      const at = path.join(ws, template, file);
      if (!fs.statSync(at).isDirectory()) fs.chmodSync(at, modes.get(`${template}/${file.split(path.sep).join('/')}`) ?? 0o644);
    }
  fs.symlinkSync(path.join(TEMPLATES, '..', '..', 'node_modules'), path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n');
  fs.writeFileSync(path.join(root, 'notes.txt'), 'notes\n');
  ok(root, 'init', '-q', '-b', 'main');
  ok(root, 'add', '-A');
  ok(root, 'commit', '-q', '-m', 'the record at one version');
  return { root, ws, at: parts(record(ws).sdlc.version) };
}

/** The record of the workspace `ws` as its file holds it. */
const record = (ws: string): Records => JSON.parse(fs.readFileSync(path.join(ws, RELEASED), 'utf8')) as Records;

/** sdlc's `spec.version` in the workspace `ws`. */
const versionOf = (ws: string): string => /^ {2}version: (\S+)$/m.exec(fs.readFileSync(path.join(ws, 'sdlc', 'nemia.yaml'), 'utf8'))![1];

/** `text` with a line appended: a change of a template's content. */
const appended = (line: string) => (text: string) => `${text}${line}\n`;

/**
 * On the branch checked out, each file of `edit` (from the workspace) changed by its function, sdlc's version set to `to` where given,
 * and recorded with the real digest where `digest` says so, else with the placeholder; then committed.
 */
function change(at: { root: string; ws: string }, edit: { [file: string]: (text: string) => string }, to?: Version, digest = false): void {
  for (const [file, by] of Object.entries(edit))
    fs.writeFileSync(path.join(at.ws, file), by(fs.readFileSync(path.join(at.ws, file), 'utf8')));
  if (to !== undefined) {
    const manifest = path.join(at.ws, 'sdlc', 'nemia.yaml');
    fs.writeFileSync(manifest, fs.readFileSync(manifest, 'utf8').replace(/^( {2}version: )\S+$/m, `$1${to.join('.')}`));
    ok(at.root, 'add', '-A');
    const written = {
      ...record(at.ws),
      sdlc: { version: to.join('.'), digest: digest ? digestOf(at.ws, 'sdlc', modesOf(at.ws)) : PLACEHOLDER },
    };
    fs.writeFileSync(path.join(at.ws, RELEASED), `${JSON.stringify(written, null, 2)}\n`);
  }
  ok(at.root, 'add', '-A');
  ok(at.root, 'commit', '-q', '-m', 'a change');
}

/** A change of a file outside every template. */
const elsewhere = (root: string, line: string): void => {
  fs.appendFileSync(path.join(root, 'notes.txt'), `${line}\n`);
  ok(root, 'commit', '-q', '-am', 'elsewhere');
};

/** `main` merged into the branch checked out with no commit, as the landing leaves it: git's exit. */
const mergeBase = (root: string): number | null => git(root, 'merge', '--no-ff', '--no-commit', 'main').code;

/** `node <ws>/released.ts cut` from the root: its exit and its streams. */
function cut(root: string): { code: number | null; out: string; err: string } {
  const ran = spawnSync(process.execPath, [path.join(root, WS, 'released.ts'), 'cut'], {
    cwd: root,
    env: ENV,
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
}

/** The paths the merge leaves unmerged. */
const unmerged = (root: string): string[] => ok(root, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);

/** Each template of the workspace `ws` whose version or digest is not the one its record holds: none where the record is sound. */
const apart = (ws: string): string[] =>
  templatesIn(ws).filter((t) => record(ws)[t]?.version !== versionOf(ws) || record(ws)[t]?.digest !== digestOf(ws, t, modesOf(ws)));

test('two siblings that bumped the same minor both land: the second takes the minor above the first', () => {
  const at = world();
  const [major, minor] = at.at;
  ok(at.root, 'branch', 'b');
  change(at, { 'sdlc/RULES.md': appended('A sibling landed first.') }, [major, minor + 1, 0], true);
  ok(at.root, 'checkout', '-q', 'b');
  change(at, { 'sdlc/workflows/build/design.md': appended('A sibling lands second.') }, [major, minor + 1, 0]);
  assert.equal(mergeBase(at.root), 1, 'the record conflicts, as two siblings that bumped one version do');
  const ran = cut(at.root);
  assert.equal(ran.code, 0, ran.err);
  assert.deepEqual(unmerged(at.root), []);
  assert.equal(versionOf(at.ws), `${major}.${minor + 2}.0`);
  assert.equal(record(at.ws).sdlc?.version, `${major}.${minor + 2}.0`);
  assert.match(fs.readFileSync(path.join(at.ws, 'sdlc', 'RULES.md'), 'utf8'), /A sibling landed first\./);
  assert.deepEqual(apart(at.ws), [], 'the record is sound on the merged tree');
});

test('a patch over a base that took a minor since takes the patch above the base', () => {
  const at = world();
  const [major, minor, patch] = at.at;
  ok(at.root, 'branch', 'b');
  change(at, { 'sdlc/RULES.md': appended('A minor landed.') }, [major, minor + 1, 0], true);
  ok(at.root, 'checkout', '-q', 'b');
  change(at, { 'sdlc/workflows/build/design.md': appended('A patch lands.') }, [major, minor, patch + 1]);
  mergeBase(at.root);
  const ran = cut(at.root);
  assert.equal(ran.code, 0, ran.err);
  assert.deepEqual(unmerged(at.root), []);
  assert.equal(versionOf(at.ws), `${major}.${minor + 1}.1`);
  assert.equal(record(at.ws).sdlc?.version, `${major}.${minor + 1}.1`);
});

test('a base that moved and touched no template keeps its record byte for byte', () => {
  const at = world();
  ok(at.root, 'checkout', '-q', '-b', 'b');
  elsewhere(at.root, 'the branch');
  ok(at.root, 'checkout', '-q', 'main');
  fs.writeFileSync(path.join(at.root, 'more.txt'), 'the base\n');
  ok(at.root, 'add', '-A');
  ok(at.root, 'commit', '-q', '-m', 'the base moved');
  ok(at.root, 'checkout', '-q', 'b');
  assert.equal(mergeBase(at.root), 0);
  const ran = cut(at.root);
  assert.equal(ran.code, 0, ran.err);
  for (const file of [`${WS}/${RELEASED}`, `${WS}/sdlc/nemia.yaml`])
    assert.equal(fs.readFileSync(path.join(at.root, file), 'utf8'), ok(at.root, 'show', `MERGE_HEAD:${file}`), file);
  assert.deepEqual(ok(at.root, 'diff', '--cached', '--name-only', 'MERGE_HEAD', '--', WS), '');
});

test('REFUSED: both sides add a different line at one place of nemia.yaml, which stays unmerged', () => {
  const at = world();
  const [major, minor] = at.at;
  const adding = (name: string) => (text: string) =>
    text.replace(
      /^ {2}parameters:\n/m,
      `  parameters:\n    ${name}:\n      type: string\n      description: "${name}"\n      default: ""\n`,
    );
  ok(at.root, 'branch', 'b');
  change(at, { 'sdlc/nemia.yaml': adding('alpha') }, [major, minor + 1, 0]);
  ok(at.root, 'checkout', '-q', 'b');
  change(at, { 'sdlc/nemia.yaml': adding('beta') }, [major, minor + 1, 0]);
  mergeBase(at.root);
  const ran = cut(at.root);
  assert.equal(ran.code, 1, ran.out);
  assert.ok(unmerged(at.root).includes(`${WS}/sdlc/nemia.yaml`), 'nemia.yaml stays unmerged');
});

test('REFUSED: a template changed on the branch with no version bumped, having written nothing', () => {
  const at = world();
  ok(at.root, 'checkout', '-q', '-b', 'b');
  change(at, { 'sdlc/RULES.md': appended('Changed, and bumped nothing.') });
  ok(at.root, 'checkout', '-q', 'main');
  elsewhere(at.root, 'the base');
  ok(at.root, 'checkout', '-q', 'b');
  assert.equal(mergeBase(at.root), 0);
  const ran = cut(at.root);
  assert.equal(ran.code, 1, ran.out);
  assert.equal(ok(at.root, 'diff', '--name-only', '--', WS), '', 'nothing written');
});

test('REFUSED: no merge in progress', () => {
  const at = world();
  const ran = cut(at.root);
  assert.equal(ran.code, 1, ran.out);
});
