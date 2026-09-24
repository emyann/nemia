/**
 * A worktree's own `node_modules`, and `.worktreeinclude`.
 *
 * The plan is pure and tested as data. `provisionDeps` is tested the way the run calls it, at shipped
 * defaults, over a real git repository and its worktree, with a main `node_modules` written by hand the
 * way npm leaves one — workspace links, a third-party package, a scope, `.bin`, npm's own dot files — so
 * nothing here asks a registry. Each test is a refusal: it fails against the one link to main's whole
 * tree that worktrees used to get.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { depsPlan, lockfileParting, worktreeInclude, type DepsListing } from '../src/deps.ts';
import { composeBrief, type Run } from '../src/run.ts';
import type { Workflow } from '../src/workflow.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-deps-');
// runner.ts reads WF_ROOT as it loads. Nothing here files a run, and nothing here touches the operator's store either.
process.env.WF_ROOT = ROOT;
const { provisionDeps } = await import('../src/runner.ts');

// ─── the plan, as data ──────────────────────────────────────────────────────

test('deps.ts reads no disk and spawns nothing: it imports path, and nothing else', () => {
  const text = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'deps.ts'), 'utf8');
  assert.deepEqual([...text.matchAll(/^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]), ['node:path']);
});

test('the plan: workspace packages to the worktree\'s copy, everything else to main\'s, scopes and .bin its own, npm\'s dot files left out', () => {
  const listing: DepsListing = {
    entries: [
      { name: '.bin' }, { name: '.package-lock.json' }, { name: '.vite-temp' },
      { name: '@fx' },
      { name: 'app', link: '../apps/app' },
      { name: 'third' },
      { name: 'x', link: '../packages/x' },
      // A `file:` dependency outside the repository, and a link within node_modules: neither is a workspace.
      { name: 'far', link: '../../elsewhere/far' },
      { name: 'alias', link: 'third' },
    ],
    scopes: { '@fx': [{ name: 'other' }, { name: 'sx', link: '../../packages/sx' }] },
    bins: [{ name: 'xbin', link: '../x/bin.js' }, { name: 'sxbin', link: '../@fx/sx/bin.js' }, { name: 'third', link: '../third/cli.js' }],
  };
  const nm = '/wt/run/implement/node_modules';
  assert.deepEqual(depsPlan('/repo', '/wt/run/implement', listing), [
    { kind: 'dir', path: nm },
    { kind: 'dir', path: `${nm}/@fx` },
    { kind: 'link', path: `${nm}/@fx/other`, target: '/repo/node_modules/@fx/other' },
    { kind: 'link', path: `${nm}/@fx/sx`, target: '../../packages/sx' },
    { kind: 'link', path: `${nm}/app`, target: '../apps/app' },
    { kind: 'link', path: `${nm}/third`, target: '/repo/node_modules/third' },
    { kind: 'link', path: `${nm}/x`, target: '../packages/x' },
    { kind: 'link', path: `${nm}/far`, target: '/repo/node_modules/far' },
    { kind: 'link', path: `${nm}/alias`, target: '/repo/node_modules/alias' },
    { kind: 'dir', path: `${nm}/.bin` },
    { kind: 'link', path: `${nm}/.bin/xbin`, target: '../x/bin.js' },
    { kind: 'link', path: `${nm}/.bin/sxbin`, target: '../@fx/sx/bin.js' },
    { kind: 'link', path: `${nm}/.bin/third`, target: '/repo/node_modules/.bin/third' },
  ]);
});

test('.worktreeinclude: paths to copy, a leading / anchored at the root as gitignore\'s is, node_modules set aside, and every line outside the repository refused by name', () => {
  const text = [
    '# what a worktree needs', '',
    '.env.local', 'config/local/', './tools/cache.json', '  spaced.txt  ', '.env.local', '/.env.local',
    'node_modules', 'apps/web/node_modules',
    '../x', 'a/../../y', '/etc/hosts', '/../z', 'C:\\secrets', '.', '/', '.git', '.git/hooks',
  ].join('\n');
  assert.deepEqual(worktreeInclude(text), {
    // `/etc/hosts` is the repository's etc/hosts, as a line in a .gitignore would be: nothing outside it.
    copy: ['.env.local', 'config/local', 'tools/cache.json', 'spaced.txt', 'etc/hosts'],
    provisioned: ['node_modules', 'apps/web/node_modules'],
    refused: [
      { line: '../x', why: 'is outside the repository' },
      { line: 'a/../../y', why: 'is outside the repository' },
      { line: '/../z', why: 'is outside the repository' },
      { line: 'C:\\secrets', why: 'is absolute' },
      { line: '.', why: 'is the repository itself' },
      { line: '/', why: 'is the repository itself' },
      { line: '.git', why: 'is git\'s own' },
      { line: '.git/hooks', why: 'is git\'s own' },
    ],
  });
});

test('what parts a worktree\'s lockfile from what main has on disk: a package missing, another version, a link elsewhere — not an optional one main did not take', () => {
  const lock = (packages: Record<string, object>) => ({
    name: 'fixture', lockfileVersion: 3, packages: { '': { name: 'fixture' }, 'packages/x': { version: '1.0.0' }, ...packages },
  });
  const third = { version: '1.0.0', resolved: 'https://registry.npmjs.org/third/-/third-1.0.0.tgz' };
  const base = { 'node_modules/x': { resolved: 'packages/x', link: true }, 'node_modules/third': third };
  const onDisk = {
    'node_modules/x': { link: true, resolved: 'packages/x' },
    'node_modules/third': { link: false, version: '1.0.0' },
    'node_modules/third/node_modules/deep': { link: false, version: '2.0.0' },
    'apps/web/node_modules/third': { link: false, version: '1.0.0' },
  } as const;

  assert.equal(lockfileParting(lock(base), onDisk), null);
  assert.equal(lockfileParting(lock({ ...base, 'node_modules/@esbuild/darwin-arm64': { version: '0.25.0', optional: true } }), onDisk), null,
    'a platform build this machine did not install');
  assert.equal(lockfileParting(lock({ ...base, 'node_modules/y': { version: '1.0.0' } }), onDisk), 'node_modules/y', 'one main does not have');
  assert.equal(lockfileParting(lock({ ...base, 'node_modules/third': { ...third, version: '2.0.0' } }), onDisk), 'node_modules/third', 'another version');
  assert.equal(lockfileParting(lock({ ...base, 'node_modules/x': { version: '1.0.0' } }), onDisk), 'node_modules/x', 'a package where main has a link');
  assert.equal(lockfileParting(lock({ ...base, 'node_modules/x': { resolved: 'packages/x2', link: true } }), onDisk), 'node_modules/x', 'a link that leads elsewhere');
  assert.equal(lockfileParting(lock({ ...base, 'node_modules/third/node_modules/deep': { version: '2.0.0' } }), onDisk), null, 'nested in a package, it rides that package\'s link');
  assert.equal(lockfileParting(lock({ ...base, 'apps/web/node_modules/third': third }), onDisk), 'apps/web/node_modules/third',
    'nested in a workspace, links to the root tree cannot give it, though main has it');
  assert.equal(lockfileParting(lock({ ...base, 'packages/x': { version: '9.9.9' } }), onDisk), null, 'a workspace package\'s own entry is the worktree\'s copy');
  assert.equal(lockfileParting(null, onDisk), 'package-lock.json', 'a lockfile that did not parse');
});

test('the brief says a tree was installed, under Where to look and before the closeout — and nothing of a linked one', () => {
  const run: Run = {
    id: 'r-1', repo: '/repo', workspace: '/repo', baseRef: 'abc123', branch: 'main', isolate: true, brief: 'add a flag',
    workflowDir: '/wf', steps: { implement: { taskId: 't1' }, review: { taskId: null } }, createdAt: '2026-01-01T00:00:00Z',
  };
  const implement: Workflow = { name: 'implement', after: [], body: 'do implement' };
  const review: Workflow = { name: 'review', after: ['implement'], body: 'do review' };
  const steps = [implement, review];

  const first = composeBrief(implement, { ...run, steps: { implement: { taskId: null } } }, [implement], undefined, undefined, { tree: 'own', installed: true });
  const at = first.indexOf('## Where to look');
  assert.ok(at > 0 && first.indexOf('`npm ci`', at) > at, 'a first step, which has no Where to look of its own, gets one');
  assert.ok(first.indexOf('`npm ci`', at) < first.indexOf('## When you are finished'), 'before the closeout, which stays last');

  const later = composeBrief(review, run, steps, undefined, undefined, { tree: 'own', installed: false });
  assert.equal(later.split('## Where to look').length, 2, 'one section, not two');
  assert.ok(later.indexOf('git diff abc123') < later.indexOf('`npm ci`'), 'the line joins what is already there');

  assert.doesNotMatch(composeBrief(implement, { ...run, steps: { implement: { taskId: null } } }, [implement], undefined, undefined, { tree: 'linked', made: 12 }), /Where to look|npm ci/);
  const failed = composeBrief(review, run, steps, undefined, undefined, { tree: 'failed', error: 'npm error code EUSAGE' });
  assert.match(failed, /npm error code EUSAGE/);
  assert.match(failed, /Run `npm ci` here before anything that needs a dependency/);
});

// ─── provisioning, over a real repository ───────────────────────────────────

const write = (file: string, text: string, mode?: number) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, mode === undefined ? undefined : { mode });
};
const link = (target: string, at: string) => {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(target, at);
};
const npmLockfile = (cwd: string) =>
  execFileSync('npm', ['install', '--package-lock-only', '--offline', '--no-audit', '--no-fund'], { cwd, stdio: 'ignore' });

/**
 * A main checkout as npm workspaces leave it: `packages/x` with a bin, `@fx/sx` in `packages/sx`, and
 * `apps/app`, which requires x — committed with the lockfile npm writes for them — and a `node_modules`
 * written by hand. Then a worktree cut from it, in which `packages/x` says something else.
 */
function aCheckout(): { main: string; wt: string } {
  const main = fs.mkdtempSync(path.join(ROOT, 'main-'));
  write(path.join(main, 'package.json'), JSON.stringify({ name: 'fixture', private: true, workspaces: ['packages/*', 'apps/*'] }));
  write(path.join(main, 'packages/x/package.json'), JSON.stringify({ name: 'x', version: '1.0.0', bin: { xbin: 'bin.js' } }));
  write(path.join(main, 'packages/x/index.js'), "module.exports = 'main-x';\n");
  write(path.join(main, 'packages/x/bin.js'), "#!/usr/bin/env node\nconsole.log(require('./index.js'));\n", 0o755);
  write(path.join(main, 'packages/sx/package.json'), JSON.stringify({ name: '@fx/sx', version: '1.0.0' }));
  write(path.join(main, 'packages/sx/index.js'), "module.exports = 'main-sx';\n");
  write(path.join(main, 'apps/app/package.json'), JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { x: '*' } }));
  write(path.join(main, 'apps/app/index.js'), "module.exports = require('x');\n");
  write(path.join(main, '.gitignore'), 'node_modules\n');
  npmLockfile(main);
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: main, stdio: 'ignore' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');

  const nm = path.join(main, 'node_modules');
  link('../packages/x', path.join(nm, 'x'));
  link('../apps/app', path.join(nm, 'app'));
  link('../../packages/sx', path.join(nm, '@fx/sx'));
  write(path.join(nm, '@fx/other/index.js'), "module.exports = 'main-other';\n");
  write(path.join(nm, 'third/index.js'), "module.exports = 'main-third';\n");
  write(path.join(nm, 'third/cli.js'), "#!/usr/bin/env node\nconsole.log('main-third-cli');\n", 0o755);
  link('../x/bin.js', path.join(nm, '.bin/xbin'));
  link('../third/cli.js', path.join(nm, '.bin/third'));
  // npm's record of what it installed: what the lockfile named. The run does not read it — it can name what
  // is not there — but a check that did would be fooled by it, so it is as npm would leave it.
  fs.copyFileSync(path.join(main, 'package-lock.json'), path.join(nm, '.package-lock.json'));
  write(path.join(nm, '.vite-temp/cache'), 'main\n');

  const wt = path.join(fs.mkdtempSync(path.join(ROOT, 'wt-')), 'implement');
  git('worktree', 'add', '-q', '-b', `wt-${path.basename(main)}`, wt, 'HEAD');
  write(path.join(wt, 'packages/x/index.js'), "module.exports = 'branch-x';\n");
  return { main, wt };
}

/** What `require(name)` gives from a directory, asked of a fresh node: the real path it resolved, and the export. */
const required = (dir: string, name: string): { real: string; value: unknown } => JSON.parse(execFileSync(process.execPath, ['-e',
  `const p = require.resolve(${JSON.stringify(name)}); console.log(JSON.stringify({ real: require('fs').realpathSync(p), value: require(p) }))`,
], { cwd: dir, encoding: 'utf8' }));

/** Everything under a directory, without following a link: kind, link target, bytes, mtime. A write anywhere shows. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (p: string) => {
    const st = fs.lstatSync(p);
    const rel = path.relative(dir, p) || '.';
    if (st.isSymbolicLink()) out[rel] = `link ${fs.readlinkSync(p)} ${st.mtimeMs}`;
    else if (st.isDirectory()) {
      out[rel] = `dir ${st.mtimeMs}`;
      for (const name of fs.readdirSync(p)) walk(path.join(p, name));
    } else out[rel] = `file ${st.mtimeMs} ${fs.readFileSync(p, 'utf8')}`;
  };
  walk(dir);
  return out;
}

test('a workspace package resolves to the worktree\'s own copy: what the worktree\'s app imports is the branch\'s packages/x', async () => {
  const { main, wt } = aCheckout();
  assert.deepEqual(await provisionDeps(main, wt), { tree: 'linked', made: 10 });

  assert.deepEqual(required(path.join(wt, 'apps/app'), 'x'), { real: fs.realpathSync(path.join(wt, 'packages/x/index.js')), value: 'branch-x' });
  assert.equal(required(wt, 'app').value, 'branch-x', 'through the app, too');
  assert.equal(required(wt, '@fx/sx').real, fs.realpathSync(path.join(wt, 'packages/sx/index.js')), 'and a scoped workspace package');
  assert.equal(required(path.join(main, 'apps/app'), 'x').value, 'main-x', 'while main still imports its own');
});

test('a third-party package resolves to main\'s: one inode, linked and never copied', async () => {
  const { main, wt } = aCheckout();
  await provisionDeps(main, wt);
  const theirs = path.join(main, 'node_modules/third/index.js');
  assert.equal(fs.statSync(path.join(wt, 'node_modules/third/index.js')).ino, fs.statSync(theirs).ino);
  assert.equal(required(wt, 'third').real, fs.realpathSync(theirs));
  assert.ok(fs.lstatSync(path.join(wt, 'node_modules/third')).isSymbolicLink());
  assert.equal(required(wt, '@fx/other').value, 'main-other', 'a scoped one as well');
});

test('a bin of a workspace package runs the worktree\'s file; a third-party bin runs main\'s', async () => {
  const { main, wt } = aCheckout();
  await provisionDeps(main, wt);
  const bins = path.join(wt, 'node_modules/.bin');
  assert.ok(!fs.lstatSync(bins).isSymbolicLink(), '.bin is the worktree\'s own directory');
  assert.equal(execFileSync(path.join(bins, 'xbin'), { encoding: 'utf8' }).trim(), 'branch-x');
  assert.equal(execFileSync(path.join(bins, 'third'), { encoding: 'utf8' }).trim(), 'main-third-cli');
});

test('a lockfile that differs from main\'s provisions a tree of its own with npm ci — once — and none of main\'s is in it', async () => {
  const { main, wt } = aCheckout();
  // The branch adds a workspace package, and its lockfile says so.
  write(path.join(wt, 'packages/y/package.json'), JSON.stringify({ name: 'y', version: '1.0.0' }));
  write(path.join(wt, 'packages/y/index.js'), "module.exports = 'branch-y';\n");
  npmLockfile(wt);
  assert.notEqual(fs.readFileSync(path.join(wt, 'package-lock.json'), 'utf8'), fs.readFileSync(path.join(main, 'package-lock.json'), 'utf8'));
  const mains = snapshot(path.join(main, 'node_modules'));

  assert.deepEqual(await provisionDeps(main, wt), { tree: 'own', installed: true });
  const nm = path.join(wt, 'node_modules');
  assert.ok(fs.existsSync(path.join(nm, '.package-lock.json')), 'npm installed it');
  assert.equal(required(wt, 'y').value, 'branch-y', 'the package only the branch has resolves');
  assert.equal(required(path.join(wt, 'apps/app'), 'x').value, 'branch-x');
  assert.ok(!fs.existsSync(path.join(nm, 'third')), 'nothing the lockfile does not name');
  for (const name of fs.readdirSync(nm)) {
    assert.ok(fs.realpathSync(path.join(nm, name)).startsWith(fs.realpathSync(wt) + path.sep), `${name} lies in the worktree`);
  }

  const once = snapshot(nm);
  assert.deepEqual(await provisionDeps(main, wt), { tree: 'own', installed: false }, 'a second call runs nothing');
  assert.deepEqual(snapshot(nm), once, 'and changes nothing');
  assert.deepEqual(snapshot(path.join(main, 'node_modules')), mains, 'main\'s tree was not written');
});

test('a lockfile main has not installed yet provisions a tree of its own, though it is main\'s lockfile byte for byte', async () => {
  const { main, wt } = aCheckout();
  // packages/y is merged into both, and main's lockfile names it — written by `npm install
  // --package-lock-only`, as CLAUDE.md's worktree note used to advise — but main's tree was installed before.
  for (const root of [main, wt]) {
    write(path.join(root, 'packages/y/package.json'), JSON.stringify({ name: 'y', version: '1.0.0' }));
    write(path.join(root, 'packages/y/index.js'), "module.exports = 'y';\n");
  }
  npmLockfile(main);
  fs.copyFileSync(path.join(main, 'package-lock.json'), path.join(wt, 'package-lock.json'));
  assert.ok(!fs.existsSync(path.join(main, 'node_modules/y')), 'main has not installed it');
  assert.match(fs.readFileSync(path.join(main, 'node_modules/.package-lock.json'), 'utf8'), /node_modules\/y/,
    'though npm\'s record of main\'s tree says it has: --package-lock-only rewrote it, which is why the run reads the disk');

  assert.deepEqual(await provisionDeps(main, wt), { tree: 'own', installed: true });
  assert.equal(required(path.join(wt, 'apps/app'), 'y').value, 'y', 'the package the lockfile names is there');
});

test('a second provisioning is a no-op, and replaces nothing a step installed over a link', async () => {
  const { main, wt } = aCheckout();
  await provisionDeps(main, wt);
  const nm = path.join(wt, 'node_modules');
  // What `npm install` in the worktree does to a package it updates: the link becomes a directory.
  fs.unlinkSync(path.join(nm, 'third'));
  write(path.join(nm, 'third/index.js'), "module.exports = 'installed-here';\n");
  const once = snapshot(nm);

  assert.deepEqual(await provisionDeps(main, wt), { tree: 'linked', made: 0 });
  assert.deepEqual(snapshot(nm), once);
  assert.equal(required(wt, 'third').value, 'installed-here');
});

test('nothing in main\'s node_modules is written — by provisioning, or by a tool writing the worktree\'s bins, scopes and caches after', async () => {
  const { main, wt } = aCheckout();
  const before = snapshot(path.join(main, 'node_modules'));
  await provisionDeps(main, wt);
  const nm = path.join(wt, 'node_modules');
  write(path.join(nm, '.bin/new'), 'a bin a step installed\n');
  write(path.join(nm, '@fx/new/index.js'), 'a scoped package a step installed\n');
  write(path.join(nm, '.vite-temp/cache'), 'the branch\'s build\n');
  write(path.join(nm, '.package-lock.json'), '{}\n');
  assert.deepEqual(snapshot(path.join(main, 'node_modules')), before);
});

test('an npm ci that fails is reported, not hidden, and tried again on the next call; old shapes and empty mains are left alone', async () => {
  const { main, wt } = aCheckout();
  write(path.join(wt, 'package-lock.json'), '{ not a lockfile');
  const failed = await provisionDeps(main, wt);
  assert.equal(failed.tree, 'failed');
  assert.ok(failed.tree === 'failed' && failed.error.length > 0, 'with what npm said');
  assert.equal((await provisionDeps(main, wt)).tree, 'failed', 'it is not mistaken for a tree npm finished');

  const old = aCheckout();
  fs.symlinkSync(path.join(old.main, 'node_modules'), path.join(old.wt, 'node_modules'));
  assert.deepEqual(await provisionDeps(old.main, old.wt), { tree: 'shared' });
  assert.equal(fs.readlinkSync(path.join(old.wt, 'node_modules')), path.join(old.main, 'node_modules'), 'a worktree cut before this keeps its link');

  const bare = aCheckout();
  fs.rmSync(path.join(bare.main, 'node_modules'), { recursive: true });
  assert.deepEqual(await provisionDeps(bare.main, bare.wt), { tree: 'absent' });
  assert.ok(!fs.existsSync(path.join(bare.wt, 'node_modules')));
});
