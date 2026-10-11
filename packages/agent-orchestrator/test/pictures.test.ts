/**
 * The build workflow's pictures rule (`workflows/build/pictures.ts`): implement's check refuses a change under `apps/web/src` whose
 * closeout's `artifacts` names no picture, an image file that is there, and says the command that takes them; and a change under
 * `tools/observe` that a dashboard reads whose `artifacts` names no `dashboard-<name>.png` and `dashboard-<name>.txt` of it. Driven as
 * the check drives
 * it, `node pictures.ts <closeout>` in a committed scratch repository whose base is `WF_BASE_REF`, a bounded subprocess; and the shipped
 * check of `workflows/build/implement.md` is run whole, as frozen, with `npm` stubbed, so the clause is proven wired and not only written.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { checkArgv } from '../src/check/check.ts';
import { REPO, placesOf } from './team.ts';
import { scratch } from './scratch.ts';

const BUILD = path.join(REPO, 'workflows', 'build');

const SCRIPT = path.join(BUILD, 'pictures.ts');

/** Run git in `dir`, as nobody in particular. */
const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/** Write `files` into `dir`, each at its path. */
const write = (dir: string, files: Record<string, string>): void => {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
};

/** A scratch repository whose base commit holds `base` and whose HEAD, one commit on, adds `work`; with the base's commit. */
function workOn(work: Record<string, string>, base: Record<string, string> = {}): { repo: string; base: string } {
  const repo = scratch('wf-pictures-repo-');
  write(repo, { 'README.md': 'base\n', ...base });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'base');
  const at = git(repo, 'rev-parse', 'HEAD').trim();
  git(repo, 'checkout', '-q', '-b', 'work');
  write(repo, work);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'work');
  return { repo, base: at };
}

/** A closeout as the check is handed it (`WF_CLOSEOUT`), naming `artifacts`, written to a scratch file: its path. */
function closeoutFile(artifacts: unknown[], more: Record<string, unknown> = {}): string {
  const file = path.join(scratch('wf-pictures-closeout-'), 'closeout.json');
  fs.writeFileSync(file, JSON.stringify({ outcome: 'done', summary: 's', artifacts, ...more }));
  return file;
}

/** Run the script in `repo` with `args`, its environment `env` over this one's, bounded; its exit and streams. */
function pictures(repo: string, args: string[], env: Record<string, string>): { code: number | null; out: string; err: string } {
  const full: NodeJS.ProcessEnv = { ...process.env, ...env };
  delete full.NODE_TEST_CONTEXT;
  const ran = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, env: full, encoding: 'utf8', timeout: 60_000 });
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
}

/** A page of the board, changed. */
const PAGE = { 'apps/web/src/routes/x.tsx': 'export const x = 1;\n' };

test('REFUSED: a change under apps/web/src whose closeout names no picture, with the command that takes them', () => {
  const { repo, base } = workOn(PAGE);
  const files = scratch('wf-pictures-files-');
  const r = pictures(repo, [closeoutFile([])], { WF_BASE_REF: base, WF_ARTIFACTS: files });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.err.includes(`WF_ARTIFACTS=${files} npm run e2e -- --photos --pages <name,…>`), r.err);
  assert.ok(r.err.includes('apps/web/src/routes/x.tsx'), `names what the work touched:\n${r.err}`);
});

test('REFUSED: every named entry that is no picture is said, with why', () => {
  const { repo, base } = workOn({ ...PAGE, 'notes.md': '# notes\n' });
  const files = scratch('wf-pictures-files-');
  const elsewhere = scratch('wf-pictures-elsewhere-');
  fs.writeFileSync(path.join(elsewhere, 'shot.png'), 'png');
  fs.writeFileSync(path.join(files, 'empty.png'), '');
  fs.writeFileSync(path.join(files, 'notes.txt'), 'text');
  const named = [
    path.join(files, 'gone.png'),
    'notes.md',
    path.join(files, 'notes.txt'),
    path.join(elsewhere, 'shot.png'),
    '../shot.png',
    path.join(files, 'empty.png'),
  ];
  const r = pictures(repo, [closeoutFile(named)], { WF_BASE_REF: base, WF_ARTIFACTS: files });
  assert.equal(r.code, 1, r.out);
  for (const [entry, why] of [
    [path.join(files, 'gone.png'), 'not there'],
    ['notes.md', 'not an image'],
    [path.join(files, 'notes.txt'), 'not an image'],
    [path.join(elsewhere, 'shot.png'), `outside ${files}`],
    ['../shot.png', 'climbs out of the workspace'],
    [path.join(files, 'empty.png'), 'empty'],
  ])
    assert.ok(r.err.includes(`  ${entry}: ${why}`), `${entry} is said with why (${why}):\n${r.err}`);
});

test('an existing image named by absolute path in the files directory counts', () => {
  const { repo, base } = workOn(PAGE);
  const files = scratch('wf-pictures-files-');
  fs.writeFileSync(path.join(files, 'factory-dark.png'), 'png');
  const r = pictures(repo, [closeoutFile([path.join(files, 'factory-dark.png')])], { WF_BASE_REF: base, WF_ARTIFACTS: files });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /1 picture named/);
});

test('an image named from the workspace root counts where the run collected it, or in the workspace, in any case of its extension', () => {
  const { repo, base } = workOn(PAGE);
  const files = scratch('wf-pictures-files-');
  write(files, { '.e2e/shot.png': 'png' });
  const collected = pictures(repo, [closeoutFile(['.e2e/shot.png'])], { WF_BASE_REF: base, WF_ARTIFACTS: files });
  assert.equal(collected.code, 0, collected.err);
  write(repo, { 'shots/run-light.JPG': 'jpg' });
  const inWorkspace = pictures(repo, [closeoutFile(['shots/run-light.JPG'])], { WF_BASE_REF: base, WF_ARTIFACTS: files });
  assert.equal(inWorkspace.code, 0, inWorkspace.err);
});

test('a change only under apps/web/test, or outside apps/web, asks for no picture', () => {
  const works: Record<string, string>[] = [{ 'apps/web/test/e2e/pages/x.ts': 'export {};\n' }, { 'packages/x.ts': 'export {};\n' }];
  for (const work of works) {
    const { repo, base } = workOn(work);
    const r = pictures(repo, [closeoutFile([])], { WF_BASE_REF: base, WF_ARTIFACTS: scratch('wf-pictures-files-') });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /nothing under apps\/web\/src was touched/);
  }
});

/**
 * A scratch repository as `workOn` makes it, whose `main` then moves on a commit of `theirs`, merged into the work, which then commits
 * `ours`; with the base's commit. `resolved` is written into the merge itself before it is committed, as a resolution would be.
 */
function mergedMain(
  theirs: Record<string, string>,
  ours: Record<string, string>,
  resolved: Record<string, string> = {},
): ReturnType<typeof workOn> {
  const at = workOn({ 'packages/y.ts': 'export {};\n' });
  git(at.repo, 'checkout', '-q', 'main');
  write(at.repo, theirs);
  git(at.repo, 'add', '-A');
  git(at.repo, 'commit', '-qm', 'main moves on');
  git(at.repo, 'checkout', '-q', 'work');
  git(at.repo, 'merge', '-q', '--no-commit', '--no-ff', 'main');
  write(at.repo, resolved);
  git(at.repo, 'add', '-A');
  git(at.repo, 'commit', '-qm', 'merge main');
  write(at.repo, ours);
  git(at.repo, 'add', '-A');
  git(at.repo, 'commit', '-q', '--allow-empty', '-m', 'more work');
  return at;
}

test("a page main changed, merged into the work, is not the work's: only the work's own commits and its merges' resolutions count", () => {
  const files = scratch('wf-pictures-files-');
  const merged = mergedMain(PAGE, { 'packages/x.ts': 'export {};\n' });
  const theirs = pictures(merged.repo, [closeoutFile([])], { WF_BASE_REF: merged.base, WF_ARTIFACTS: files });
  assert.equal(theirs.code, 0, theirs.err);
  assert.match(theirs.out, /nothing under apps\/web\/src was touched/);
  const own = mergedMain(PAGE, { 'apps/web/src/routes/y.tsx': 'export const y = 1;\n' });
  const ours = pictures(own.repo, [closeoutFile([])], { WF_BASE_REF: own.base, WF_ARTIFACTS: files });
  assert.equal(ours.code, 1, ours.out);
  assert.ok(ours.err.includes('apps/web/src/routes/y.tsx') && !ours.err.includes('routes/x.tsx'), ours.err);
  const resolution = mergedMain(PAGE, {}, { 'apps/web/src/routes/x.tsx': 'export const x = 2;\n' });
  const resolved = pictures(resolution.repo, [closeoutFile([])], { WF_BASE_REF: resolution.base, WF_ARTIFACTS: files });
  assert.equal(resolved.code, 1, `a page changed in the merge itself is the work's:\n${resolved.out}`);
});

test('REFUSED: no closeout with a page touched, and a base git cannot read', () => {
  const { repo, base } = workOn(PAGE);
  const files = scratch('wf-pictures-files-');
  const none = pictures(repo, [], { WF_BASE_REF: base, WF_ARTIFACTS: files });
  assert.equal(none.code, 1);
  assert.match(none.err, /no closeout reached the check/);
  const unread = pictures(repo, [closeoutFile([])], { WF_BASE_REF: 'no-such-ref', WF_ARTIFACTS: files });
  assert.equal(unread.code, 1);
  assert.match(unread.err, /cannot tell what the work touched/);
  const noBase = pictures(repo, [closeoutFile([])], { WF_BASE_REF: '', WF_ARTIFACTS: files });
  assert.equal(noBase.code, 1);
  assert.match(noBase.err, /WF_BASE_REF is not set/);
});

/** A dashboard of the side Grafana, changed, and the files a render writes of it into `files`: their paths. */
const BOARD = { 'tools/observe/dashboards/steps.json': '{"uid":"nemia-steps"}\n' };
const rendered = (files: string, name: string, ...kinds: string[]): string[] =>
  kinds.map((kind) => {
    fs.writeFileSync(path.join(files, `dashboard-${name}.${kind}`), kind);
    return path.join(files, `dashboard-${name}.${kind}`);
  });

test('REFUSED: a dashboard changed whose closeout names no picture and text of it, with the command that renders it', () => {
  const { repo, base } = workOn(BOARD);
  const files = scratch('wf-pictures-files-');
  const env = { WF_BASE_REF: base, WF_ARTIFACTS: files };
  const none = pictures(repo, [closeoutFile([])], env);
  assert.equal(none.code, 1, none.out);
  assert.ok(none.err.includes(`node tools/observe/render/render.ts --out ${files} --dashboards steps`), none.err);
  assert.ok(none.err.includes('tools/observe/dashboards/steps.json'), `names what the work touched:\n${none.err}`);
  assert.ok(none.err.includes('steps (dashboard-steps.png, dashboard-steps.txt)'), none.err);
  const pictureOnly = pictures(repo, [closeoutFile(rendered(files, 'steps', 'png'))], env);
  assert.equal(pictureOnly.code, 1, 'a picture with no text of its panels');
  const textOnly = pictures(repo, [closeoutFile([path.join(files, 'dashboard-steps.txt')])], {
    ...env,
    WF_ARTIFACTS: scratch('wf-pictures-files-'),
  });
  assert.equal(textOnly.code, 1, 'a text named outside the files directory');
  const other = pictures(repo, [closeoutFile(rendered(files, 'time', 'png', 'txt'))], env);
  assert.equal(other.code, 1, "another dashboard's pair");
  fs.writeFileSync(path.join(files, 'dashboard-steps.txt'), '');
  const empty = pictures(repo, [closeoutFile([path.join(files, 'dashboard-steps.png'), path.join(files, 'dashboard-steps.txt')])], env);
  assert.equal(empty.code, 1, empty.out);
  assert.ok(empty.err.includes(`  ${path.join(files, 'dashboard-steps.txt')}: empty, 0 bytes`), empty.err);
});

test("a dashboard changed with its picture and its text named passes, and asks no picture of the board's pages", () => {
  const { repo, base } = workOn(BOARD);
  const files = scratch('wf-pictures-files-');
  const r = pictures(repo, [closeoutFile(rendered(files, 'steps', 'png', 'txt'))], { WF_BASE_REF: base, WF_ARTIFACTS: files });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /nothing under apps\/web\/src was touched/);
  assert.match(r.out, /dashboards named, each with its picture and its text: steps/);
});

test('any other file a dashboard reads owes one pair at least, a removed dashboard too; the README and the profiler owe none', () => {
  const files = scratch('wf-pictures-files-');
  const pair = rendered(files, 'time', 'png', 'txt');
  const others: [Record<string, string>, Record<string, string>][] = [
    [{ 'tools/observe/compose.yaml': 'name: x\n' }, {}],
    [{ 'tools/observe/render/seed.ts': 'export {};\n' }, {}],
    [{ 'tools/observe/dashboards/NOTES.md': 'x\n' }, {}],
  ];
  for (const [work, before] of others) {
    const { repo, base } = workOn(work, before);
    const env = { WF_BASE_REF: base, WF_ARTIFACTS: files };
    const refused = pictures(repo, [closeoutFile([])], env);
    assert.equal(refused.code, 1, Object.keys(work).join());
    assert.ok(refused.err.includes('names no picture and text of: any dashboard'), refused.err);
    assert.ok(refused.err.includes(`node tools/observe/render/render.ts --out ${files}\n`), refused.err);
    assert.equal(pictures(repo, [closeoutFile(pair)], env).code, 0, Object.keys(work).join());
  }
  const removed = workOn({ 'x.md': 'x\n' }, BOARD);
  git(removed.repo, 'rm', '-q', 'tools/observe/dashboards/steps.json');
  git(removed.repo, 'commit', '-qm', 'remove a dashboard');
  const env = { WF_BASE_REF: removed.base, WF_ARTIFACTS: files };
  assert.equal(pictures(removed.repo, [closeoutFile([])], env).code, 1, 'a removed dashboard owes a render of those left');
  assert.equal(pictures(removed.repo, [closeoutFile(pair)], env).code, 0);
  for (const work of [{ 'tools/observe/README.md': '# x\n' }, { 'tools/observe/profile/preload.ts': 'export {};\n' }]) {
    const { repo, base } = workOn(work);
    const r = pictures(repo, [closeoutFile([])], { WF_BASE_REF: base, WF_ARTIFACTS: files });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /nothing a dashboard reads under tools\/observe was touched/);
  }
});

test('REFUSED: a page and a dashboard both changed, with the pictures of one alone', () => {
  const { repo, base } = workOn({ ...PAGE, ...BOARD });
  const files = scratch('wf-pictures-files-');
  const env = { WF_BASE_REF: base, WF_ARTIFACTS: files };
  fs.writeFileSync(path.join(files, 'x-dark.png'), 'png');
  const page = pictures(repo, [closeoutFile([path.join(files, 'x-dark.png')])], env);
  assert.equal(page.code, 1, page.out);
  assert.ok(page.err.includes('dashboard-steps.txt'), page.err);
  const both = pictures(repo, [closeoutFile([path.join(files, 'x-dark.png'), ...rendered(files, 'steps', 'png', 'txt')])], env);
  assert.equal(both.code, 0, both.err);
});

/** The shipped implement step's check, read from the folder as `nemia start` reads and freezes it. */
const implementCheck = (): string => {
  const check = loadWorkflows(BUILD, placesOf(BUILD)).find((step) => step.name === 'implement')?.check;
  assert.equal(typeof check, 'string', 'workflows/build has an implement step with a check');
  return check as string;
};

/**
 * Run the shipped check in `repo` as a check runs, its argv `checkArgv`'s, with `npm` a stub that exits 0 and `claude` one that lists no
 * session first on the path, and the run's variables set; its exit and what it printed.
 */
function shipped(repo: string, env: Record<string, string>): { status: number | null; out: string } {
  const bin = scratch('wf-pictures-bin-');
  fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'claude'), '#!/bin/sh\necho "[]"\n', { mode: 0o755 });
  const [cmd, ...args] = checkArgv(implementCheck());
  const r = spawnSync(cmd, args, {
    cwd: repo,
    env: {
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
      HOME: repo,
      TMPDIR: scratch('wf-pictures-tmp-'),
      WF_RUN: 'r-1',
      ...env,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test("REFUSED at shipped defaults: implement's check, as frozen, refuses a page touched with no picture, and passes one named", () => {
  const scripts = {
    'workflows/build/mutants.ts': fs.readFileSync(path.join(BUILD, 'mutants.ts'), 'utf8'),
    'workflows/build/pictures.ts': fs.readFileSync(SCRIPT, 'utf8'),
    'workflows/build/probe.ts': fs.readFileSync(path.join(BUILD, 'probe.ts'), 'utf8'),
  };
  const { repo, base } = workOn(PAGE, scripts);
  const files = scratch('wf-pictures-files-');
  const unsigned = { mutants: [], noMutants: 'a fixture' };
  const env = (artifacts: string[]) => ({ WF_BASE_REF: base, WF_ARTIFACTS: files, WF_CLOSEOUT: closeoutFile(artifacts, unsigned) });
  const refused = shipped(repo, env([]));
  assert.notEqual(refused.status, 0, refused.out);
  assert.match(refused.out, /npm run e2e -- --photos --pages/);
  fs.writeFileSync(path.join(files, 'x-dark.png'), 'png');
  const passed = shipped(repo, env([path.join(files, 'x-dark.png')]));
  assert.equal(passed.status, 0, passed.out);
  const board = workOn(BOARD, scripts);
  const boardEnv = (artifacts: string[]) => ({ ...env(artifacts), WF_BASE_REF: board.base });
  const unrendered = shipped(board.repo, boardEnv([]));
  assert.notEqual(unrendered.status, 0, unrendered.out);
  assert.match(unrendered.out, /node tools\/observe\/render\/render\.ts --out/);
  assert.equal(shipped(board.repo, boardEnv(rendered(files, 'steps', 'png', 'txt'))).status, 0);
  const { repo: bare, base: without } = workOn(PAGE);
  const old = shipped(bare, { ...env([path.join(files, 'x-dark.png')]), WF_BASE_REF: without });
  assert.notEqual(old.status, 0, old.out);
  assert.match(old.out, /has no workflows\/build\/pictures\.ts/, 'a base without the script refuses, never skips');
});
