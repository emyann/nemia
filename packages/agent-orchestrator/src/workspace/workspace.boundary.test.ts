/**
 * A worktree's own `node_modules`, and `.worktreeinclude`.
 *
 * The plan is pure and tested as data. `provisionDeps` is tested the way the run calls it, at shipped
 * defaults, over a real git repository and its worktree, with a main `node_modules` written by hand the
 * way npm leaves one — workspace links, a third-party package, a scope, `.bin`, npm's own dot files — so
 * nothing here asks a registry. Each test is a refusal: it fails against a worktree whose `node_modules`
 * is one link to main's whole tree.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads: nothing here files a run,
 * and nothing here touches the operator's store.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { depsPlan, lockfileParting, workspaceModules, type DepsListing } from './workspace.ts';
import type { Run } from '../record/record.ts';
import { composeBrief } from '../brief/index.ts';
import type { Workflow } from '../step/step.ts';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-deps-');
process.env.WF_ROOT = ROOT;
const { provisionDeps } = await import('../runner.ts');

test("workspace.ts reads no disk and spawns nothing: it imports path, a step's shape and the record's, and nothing else", () => {
  const text = fs.readFileSync(path.join(import.meta.dirname, 'workspace.ts'), 'utf8');
  assert.deepEqual(
    [...text.matchAll(/^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    ['node:path', '../step/step.ts', '../record/record.ts'],
  );
});

test("the plan: workspace packages to the worktree's copy, every other package main's hardlinked, scopes and .bin its own with npm's links as written, npm's dot files left out", () => {
  const listing: DepsListing = {
    entries: [
      { name: '.bin' },
      { name: '.package-lock.json' },
      { name: '.vite-temp' },
      { name: '@fx' },
      { name: 'app', link: '../apps/app' },
      { name: 'third' },
      { name: 'x', link: '../packages/x' },
      { name: 'far', link: '../../elsewhere/far' },
      { name: 'alias', link: 'third' },
    ],
    scopes: { '@fx': [{ name: 'other' }, { name: 'sx', link: '../../packages/sx' }] },
    bins: [
      { name: 'xbin', link: '../x/bin.js' },
      { name: 'sxbin', link: '../@fx/sx/bin.js' },
      { name: 'third', link: '../third/cli.js' },
      { name: 'shim' },
    ],
  };
  const nm = '/wt/run/implement/node_modules';
  assert.deepEqual(
    depsPlan('/repo', '/wt/run/implement', listing),
    [
      { kind: 'dir', path: nm },
      { kind: 'dir', path: `${nm}/@fx` },
      { kind: 'tree', path: `${nm}/@fx/other`, from: '/repo/node_modules/@fx/other' },
      { kind: 'link', path: `${nm}/@fx/sx`, target: '../../packages/sx' },
      { kind: 'link', path: `${nm}/app`, target: '../apps/app' },
      { kind: 'tree', path: `${nm}/third`, from: '/repo/node_modules/third' },
      { kind: 'link', path: `${nm}/x`, target: '../packages/x' },
      { kind: 'link', path: `${nm}/far`, target: '/repo/node_modules/far' },
      { kind: 'link', path: `${nm}/alias`, target: '/repo/node_modules/alias' },
      { kind: 'dir', path: `${nm}/.bin` },
      { kind: 'link', path: `${nm}/.bin/xbin`, target: '../x/bin.js' },
      { kind: 'link', path: `${nm}/.bin/sxbin`, target: '../@fx/sx/bin.js' },
      { kind: 'link', path: `${nm}/.bin/third`, target: '../third/cli.js' },
      { kind: 'tree', path: `${nm}/.bin/shim`, from: '/repo/node_modules/.bin/shim' },
    ],
    "far, a file: dependency outside the repository, and alias, a link within node_modules, are no workspace: base's, linked; shim, a bin that is a file, not npm's link to one, is hardlinked like a package",
  );
});

test("what parts a worktree's lockfile from what main has on disk: a package missing, another version, a link elsewhere — not an optional one main did not take", () => {
  const lock = (packages: Record<string, object>) => ({
    name: 'fixture',
    lockfileVersion: 3,
    packages: { '': { name: 'fixture' }, 'packages/x': { version: '1.0.0' }, ...packages },
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
  assert.equal(
    lockfileParting(lock({ ...base, 'node_modules/@esbuild/darwin-arm64': { version: '0.25.0', optional: true } }), onDisk),
    null,
    'a platform build this machine did not install',
  );
  assert.equal(
    lockfileParting(lock({ ...base, 'node_modules/y': { version: '1.0.0' } }), onDisk),
    'node_modules/y',
    'one main does not have',
  );
  assert.equal(
    lockfileParting(lock({ ...base, 'node_modules/third': { ...third, version: '2.0.0' } }), onDisk),
    'node_modules/third',
    'another version',
  );
  assert.equal(
    lockfileParting(lock({ ...base, 'node_modules/x': { version: '1.0.0' } }), onDisk),
    'node_modules/x',
    'a package where main has a link',
  );
  assert.equal(
    lockfileParting(lock({ ...base, 'node_modules/x': { resolved: 'packages/x2', link: true } }), onDisk),
    'node_modules/x',
    'a link that leads elsewhere',
  );
  assert.equal(
    lockfileParting(lock({ ...base, 'node_modules/third/node_modules/deep': { version: '2.0.0' } }), onDisk),
    null,
    "nested in a package, it rides that package's link",
  );
  assert.equal(
    lockfileParting(lock({ ...base, 'apps/web/node_modules/third': third }), onDisk),
    null,
    "nested in a workspace at the version main has: the worktree is given main's, hardlinked in its own apps/web/node_modules",
  );
  assert.equal(
    lockfileParting(lock({ ...base, 'apps/web/node_modules/third': { ...third, version: '2.0.0' } }), onDisk),
    'apps/web/node_modules/third',
    'another version nested in a workspace parts',
  );
  assert.equal(
    lockfileParting(lock({ ...base, 'apps/api/node_modules/y': { version: '1.0.0' } }), onDisk),
    'apps/api/node_modules/y',
    'and so does one main does not have',
  );
  assert.equal(
    lockfileParting(lock({ ...base, 'apps/web/node_modules/w': { resolved: 'packages/w2', link: true } }), {
      ...onDisk,
      'apps/web/node_modules/w': { link: true, resolved: 'packages/w' },
    }),
    'apps/web/node_modules/w',
    'and a nested link that leads elsewhere',
  );
  for (const key of ['../out/node_modules/third', '/abs/node_modules/third', 'apps/../../out/node_modules/third']) {
    assert.equal(
      lockfileParting(lock({ ...base, [key]: third }), { ...onDisk, [key]: { link: false, version: '1.0.0' } }),
      key,
      `${key} is no folder of the repository's: never made in a worktree, so it parts though main has it`,
    );
  }
  assert.equal(
    lockfileParting(lock({ ...base, 'packages/x': { version: '9.9.9' } }), onDisk),
    null,
    "a workspace package's own entry is the worktree's copy",
  );
  assert.equal(lockfileParting(null, onDisk), 'package-lock.json', 'a lockfile that did not parse');
});

test("the folders whose own node_modules a lockfile installs into: a workspace's, never the root's, one outside the repository or one inside a node_modules", () => {
  const keys = [
    'node_modules/a',
    'node_modules/a/node_modules/b',
    'apps/web/node_modules/@s/p',
    'apps/web/node_modules/q',
    'apps/api/node_modules/r/node_modules/s',
    'packages/x',
    '../out/node_modules/y',
    '/abs/node_modules/z',
    'apps/./web/node_modules/t',
    'node_modules/c/node_modules/d',
  ];
  assert.deepEqual(workspaceModules({ packages: Object.fromEntries(keys.map((k) => [k, { version: '1.0.0' }])) }), [
    'apps/api',
    'apps/web',
  ]);
  assert.deepEqual(workspaceModules({ name: 'not a lockfile' }), []);
  assert.deepEqual(workspaceModules(null), []);
});

test("the plan of a workspace's own node_modules: a directory of the worktree's, under the root's, made by the same rules", () => {
  const empty: DepsListing = { entries: [], scopes: {}, bins: [] };
  const nested: Record<string, DepsListing> = {
    'apps/app': {
      entries: [
        { name: '.vite' },
        { name: '@sc' },
        { name: 'nest' },
        { name: 'wsdep', link: '../../../packages/x' },
        { name: 'rooted', link: '../../../node_modules/third' },
        { name: 'alias', link: 'nest' },
        { name: 'away', link: '/elsewhere/away' },
        { name: '.bin' },
      ],
      scopes: { '@sc': [{ name: 'p' }] },
      bins: [{ name: 'nestbin', link: '../nest/cli.js' }],
    },
  };
  const nm = '/wt/run/implement/apps/app/node_modules';
  assert.deepEqual(depsPlan('/repo', '/wt/run/implement', empty, nested), [
    { kind: 'dir', path: '/wt/run/implement/node_modules' },
    { kind: 'dir', path: nm },
    { kind: 'dir', path: `${nm}/@sc` },
    { kind: 'tree', path: `${nm}/@sc/p`, from: '/repo/apps/app/node_modules/@sc/p' },
    { kind: 'tree', path: `${nm}/nest`, from: '/repo/apps/app/node_modules/nest' },
    { kind: 'link', path: `${nm}/wsdep`, target: '../../../packages/x' },
    { kind: 'link', path: `${nm}/rooted`, target: '/repo/apps/app/node_modules/rooted' },
    { kind: 'link', path: `${nm}/alias`, target: '/repo/apps/app/node_modules/alias' },
    { kind: 'link', path: `${nm}/away`, target: '/repo/apps/app/node_modules/away' },
    { kind: 'dir', path: `${nm}/.bin` },
    { kind: 'link', path: `${nm}/.bin/nestbin`, target: '../nest/cli.js' },
  ]);
  assert.deepEqual(depsPlan('/repo', '/wt/run/implement', empty), [{ kind: 'dir', path: '/wt/run/implement/node_modules' }]);
});

test('the brief says a tree was installed, under Where to look and before the closeout — and nothing of a linked one', () => {
  const run: Run = {
    id: 'r-1',
    repo: '/repo',
    workspace: '/repo',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'add a flag',
    workflowDir: '/wf',
    steps: { implement: { taskId: 't1' }, review: { taskId: null } },
    createdAt: '2026-01-01T00:00:00Z',
  };
  const implement: Workflow = { name: 'implement', after: [], body: 'do implement' };
  const review: Workflow = { name: 'review', after: ['implement'], body: 'do review' };
  const steps = [implement, review];

  const first = composeBrief(implement, { ...run, steps: { implement: { taskId: null } } }, [implement], undefined, undefined, {
    tree: 'own',
    installed: true,
  });
  const at = first.indexOf('## Where to look');
  assert.ok(at > 0 && first.indexOf('`npm ci`', at) > at, 'a first step, which has no Where to look of its own, gets one');
  assert.ok(first.indexOf('`npm ci`', at) < first.indexOf('## When you are finished'), 'before the closeout, which stays last');

  const later = composeBrief(review, run, steps, undefined, undefined, { tree: 'own', installed: false });
  assert.equal(later.split('## Where to look').length, 2, 'one section, not two');
  assert.ok(later.indexOf('git diff abc123') < later.indexOf('`npm ci`'), 'the line joins what is already there');

  for (const deps of [
    { tree: 'hardlinked', made: 12 },
    { tree: 'linked', made: 12 },
  ] as const) {
    assert.doesNotMatch(
      composeBrief(implement, { ...run, steps: { implement: { taskId: null } } }, [implement], undefined, undefined, deps),
      /Where to look|npm ci/,
    );
  }
  const failed = composeBrief(review, run, steps, undefined, undefined, { tree: 'failed', error: 'npm error code EUSAGE' });
  assert.match(failed, /npm error code EUSAGE/);
  assert.match(failed, /Run `npm ci` here before anything that needs a dependency/);
});

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
 * written by hand. Its `.package-lock.json`, npm's record of what it installed, is the lockfile, as npm
 * leaves it: the run does not read it, since it can name what is not there, and a check that did would be
 * fooled by it. Then a worktree cut from it, in which `packages/x` says something else.
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
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: main, stdio: 'ignore' });
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
  fs.copyFileSync(path.join(main, 'package-lock.json'), path.join(nm, '.package-lock.json'));
  write(path.join(nm, '.vite-temp/cache'), 'main\n');

  const wt = path.join(fs.mkdtempSync(path.join(ROOT, 'wt-')), 'implement');
  git('worktree', 'add', '-q', '-b', `wt-${path.basename(main)}`, wt, 'HEAD');
  write(path.join(wt, 'packages/x/index.js'), "module.exports = 'branch-x';\n");
  return { main, wt };
}

/** What `require(name)` gives from a directory, asked of a fresh node: the real path it resolved, and the export. */
const required = (dir: string, name: string): { real: string; value: unknown } =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        `const p = require.resolve(${JSON.stringify(name)}); console.log(JSON.stringify({ real: require('fs').realpathSync(p), value: require(p) }))`,
      ],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  );

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

test("a workspace package resolves to the worktree's own copy: what the worktree's app imports is the branch's packages/x", async () => {
  const { main, wt } = aCheckout();
  assert.deepEqual(await provisionDeps(main, wt), { tree: 'hardlinked', made: 10 });

  assert.deepEqual(required(path.join(wt, 'apps/app'), 'x'), {
    real: fs.realpathSync(path.join(wt, 'packages/x/index.js')),
    value: 'branch-x',
  });
  assert.equal(required(wt, 'app').value, 'branch-x', 'through the app, too');
  assert.equal(required(wt, '@fx/sx').real, fs.realpathSync(path.join(wt, 'packages/sx/index.js')), 'and a scoped workspace package');
  assert.equal(required(path.join(main, 'apps/app'), 'x').value, 'main-x', 'while main still imports its own');
});

test("a third-party package is main's files, hardlinked into a directory of the worktree's: one inode, never copied, and its path the worktree's", async () => {
  const { main, wt } = aCheckout();
  await provisionDeps(main, wt);
  const theirs = path.join(main, 'node_modules/third/index.js');
  const ours = path.join(wt, 'node_modules/third/index.js');
  assert.equal(fs.statSync(ours).ino, fs.statSync(theirs).ino);
  assert.equal(required(wt, 'third').real, fs.realpathSync(ours), 'node resolves it in the worktree');
  assert.ok(fs.lstatSync(path.join(wt, 'node_modules/third')).isDirectory());
  assert.equal(required(wt, '@fx/other').value, 'main-other', 'a scoped one as well');
});

test('every path under a provisioned node_modules is inside the worktree: a fenced step reading it never leaves its working directory', async () => {
  const { wt, main } = aCheckout();
  await provisionDeps(main, wt);
  const real = fs.realpathSync(wt) + path.sep;
  const walk = (p: string): string[] => {
    const st = fs.lstatSync(p);
    const here = [p];
    return st.isDirectory() ? here.concat(fs.readdirSync(p).flatMap((name) => walk(path.join(p, name)))) : here;
  };
  const paths = walk(path.join(wt, 'node_modules'));
  assert.ok(paths.length > 10);
  for (const p of paths) assert.ok(fs.realpathSync(p).startsWith(real), `${path.relative(wt, p)} is ${fs.realpathSync(p)}`);
});

test("a bin of a workspace package runs the worktree's file; a third-party bin runs main's, hardlinked in the worktree", async () => {
  const { main, wt } = aCheckout();
  await provisionDeps(main, wt);
  const bins = path.join(wt, 'node_modules/.bin');
  assert.ok(!fs.lstatSync(bins).isSymbolicLink(), ".bin is the worktree's own directory");
  assert.equal(execFileSync(path.join(bins, 'xbin'), { encoding: 'utf8' }).trim(), 'branch-x');
  assert.equal(execFileSync(path.join(bins, 'third'), { encoding: 'utf8' }).trim(), 'main-third-cli');
  assert.equal(fs.readlinkSync(path.join(bins, 'third')), '../third/cli.js', "npm's link, as npm wrote it");
  assert.equal(fs.realpathSync(path.join(bins, 'third')), fs.realpathSync(path.join(wt, 'node_modules/third/cli.js')));
});

test("a lockfile that differs from main's provisions a tree of its own with npm ci — once — and none of main's is in it", async () => {
  const { main, wt } = aCheckout();
  write(path.join(wt, 'packages/y/package.json'), JSON.stringify({ name: 'y', version: '1.0.0' }));
  write(path.join(wt, 'packages/y/index.js'), "module.exports = 'branch-y';\n");
  npmLockfile(wt);
  assert.notEqual(
    fs.readFileSync(path.join(wt, 'package-lock.json'), 'utf8'),
    fs.readFileSync(path.join(main, 'package-lock.json'), 'utf8'),
    'the branch adds a workspace package, and its lockfile says so',
  );
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
  assert.deepEqual(snapshot(path.join(main, 'node_modules')), mains, "main's tree was not written");
});

test("a lockfile main has not installed yet provisions a tree of its own, though it is main's lockfile byte for byte", async () => {
  const { main, wt } = aCheckout();
  for (const root of [main, wt]) {
    write(path.join(root, 'packages/y/package.json'), JSON.stringify({ name: 'y', version: '1.0.0' }));
    write(path.join(root, 'packages/y/index.js'), "module.exports = 'y';\n");
  }
  npmLockfile(main);
  fs.copyFileSync(path.join(main, 'package-lock.json'), path.join(wt, 'package-lock.json'));
  assert.ok(
    !fs.existsSync(path.join(main, 'node_modules/y')),
    "packages/y is merged into both and main's lockfile, written by npm install --package-lock-only, names it: main has not installed it",
  );
  assert.match(
    fs.readFileSync(path.join(main, 'node_modules/.package-lock.json'), 'utf8'),
    /node_modules\/y/,
    "though npm's record of main's tree says it has: --package-lock-only rewrote it, which is why the run reads the disk",
  );

  assert.deepEqual(await provisionDeps(main, wt), { tree: 'own', installed: true });
  assert.equal(required(path.join(wt, 'apps/app'), 'y').value, 'y', 'the package the lockfile names is there');
});

test('a second provisioning is a no-op, and replaces nothing a step installed over a link', async () => {
  const { main, wt } = aCheckout();
  await provisionDeps(main, wt);
  const nm = path.join(wt, 'node_modules');
  fs.rmSync(path.join(nm, 'third'), { recursive: true });
  write(path.join(nm, 'third/index.js'), "module.exports = 'installed-here';\n");
  const once = snapshot(nm);

  assert.deepEqual(await provisionDeps(main, wt), { tree: 'hardlinked', made: 0 });
  assert.deepEqual(snapshot(nm), once, "main's other files are not added to the package the step installed");
  assert.equal(
    required(wt, 'third').value,
    'installed-here',
    'the package npm install in the worktree updated, its directory replaced, is the one installed',
  );
});

test('a package a pass died making is made again, whole, and not taken for a package meanwhile', async () => {
  const { main, wt } = aCheckout();
  await provisionDeps(main, wt);
  const nm = path.join(wt, 'node_modules');
  fs.rmSync(path.join(nm, 'third'), { recursive: true });
  write(path.join(nm, '.wf-making-third/index.js'), 'half\n');
  assert.throws(
    () => required(wt, 'third'),
    (err: Error & { status?: number; stderr?: string }) => err.status === 1 && /Cannot find module 'third'/.test(String(err.stderr)),
    'what is half made is not found as the package',
  );

  assert.deepEqual(await provisionDeps(main, wt), { tree: 'hardlinked', made: 1 });
  assert.deepEqual(fs.readdirSync(path.join(nm, 'third')).sort(), ['cli.js', 'index.js']);
  assert.equal(required(wt, 'third').value, 'main-third');
  assert.ok(!fs.existsSync(path.join(nm, '.wf-making-third')), 'and nothing is left of the half');
});

test("a file main replaces after the cut — as npm install does, by rename — leaves the worktree's copy as it was", async () => {
  const { main, wt } = aCheckout();
  await provisionDeps(main, wt);
  const theirs = path.join(main, 'node_modules/third/index.js');
  fs.writeFileSync(`${theirs}.new`, "module.exports = 'main-third-2';\n");
  fs.renameSync(`${theirs}.new`, theirs);
  assert.equal(required(main, 'third').value, 'main-third-2');
  assert.equal(required(wt, 'third').value, 'main-third', 'the worktree keeps the file it was cut with');
});

test('a link inside a package is copied as written and never followed: one out of the tree, and one that loops', async () => {
  const { main, wt } = aCheckout();
  const outside = fs.mkdtempSync(path.join(ROOT, 'outside-'));
  write(path.join(outside, 'secret.txt'), 'not a dependency\n');
  link(outside, path.join(main, 'node_modules/third/out'));
  link('.', path.join(main, 'node_modules/third/loop'));
  assert.equal((await provisionDeps(main, wt)).tree, 'hardlinked');
  const third = path.join(wt, 'node_modules/third');
  assert.ok(fs.lstatSync(path.join(third, 'out')).isSymbolicLink());
  assert.equal(fs.readlinkSync(path.join(third, 'out')), outside);
  assert.equal(fs.readlinkSync(path.join(third, 'loop')), '.');
  assert.deepEqual(fs.readdirSync(outside), ['secret.txt'], 'nothing was made where it leads');
});

test("where a hardlink cannot be made — another filesystem — main's packages are linked, and the answer says why; any other failure is a failure", async (t) => {
  const exdev = () => {
    throw Object.assign(new Error("EXDEV: cross-device link not permitted, link 'a' -> 'b'"), { code: 'EXDEV', syscall: 'link' });
  };
  const { main, wt } = aCheckout();
  const linking = t.mock.method(fs, 'linkSync', exdev);
  const got = await provisionDeps(main, wt);
  assert.equal(got.tree, 'linked');
  assert.ok(got.tree === 'linked' && (got.why ?? '').startsWith('EXDEV: cross-device link not permitted'), JSON.stringify(got));
  assert.equal(got.tree === 'linked' && got.made, 10, 'every entry is still made');
  const nm = path.join(wt, 'node_modules');
  assert.equal(fs.readlinkSync(path.join(nm, 'third')), path.join(main, 'node_modules/third'), 'as worktrees were before');
  assert.equal(fs.readlinkSync(path.join(nm, '@fx/other')), path.join(main, 'node_modules/@fx/other'));
  assert.equal(required(wt, 'third').value, 'main-third');
  assert.deepEqual(
    fs.readdirSync(nm).filter((n) => n.startsWith('.wf-making-')),
    [],
    'nothing half made is left',
  );
  assert.deepEqual(
    await provisionDeps(main, wt),
    { tree: 'linked', made: 0, why: 'an earlier pass linked them' },
    'a second call still says so',
  );
  linking.mock.restore();

  const other = aCheckout();
  t.mock.method(fs, 'linkSync', () => {
    throw Object.assign(new Error('EACCES: permission denied, link'), { code: 'EACCES', syscall: 'link' });
  });
  const failed = await provisionDeps(other.main, other.wt);
  assert.equal(failed.tree, 'failed', 'a refusal that is not about where the store is is not taken for one');
  assert.ok(!fs.lstatSync(path.join(other.wt, 'node_modules/third'), { throwIfNoEntry: false }), 'and nothing is linked for it');
});

test("nothing in main's node_modules is written — by provisioning, or by a tool writing the worktree's bins, scopes and caches after", async () => {
  const { main, wt } = aCheckout();
  const before = snapshot(path.join(main, 'node_modules'));
  await provisionDeps(main, wt);
  const nm = path.join(wt, 'node_modules');
  write(path.join(nm, '.bin/new'), 'a bin a step installed\n');
  write(path.join(nm, '@fx/new/index.js'), 'a scoped package a step installed\n');
  write(path.join(nm, '.vite-temp/cache'), "the branch's build\n");
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
  assert.equal(
    fs.readlinkSync(path.join(old.wt, 'node_modules')),
    path.join(old.main, 'node_modules'),
    'a worktree cut before this keeps its link',
  );

  const bare = aCheckout();
  fs.rmSync(path.join(bare.main, 'node_modules'), { recursive: true });
  assert.deepEqual(await provisionDeps(bare.main, bare.wt), { tree: 'absent' });
  assert.ok(!fs.existsSync(path.join(bare.wt, 'node_modules')));
});

test("the checkout against the merge staged in it: a package nested in a workspace is read where it is installed, and parts only when it is not the lockfile's", async () => {
  const { checkoutParts, lockfileParts } = await import('./worktree.store.ts');
  const repo = fs.mkdtempSync(path.join(ROOT, 'checkout-'));
  const lock = (nested: string) => ({
    name: 'fixture',
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture', workspaces: ['apps/*'] },
      'apps/app': { version: '1.0.0' },
      'node_modules/app': { resolved: 'apps/app', link: true },
      'node_modules/third': { version: '1.0.0' },
      'apps/app/node_modules/third': { version: nested },
    },
  });
  write(path.join(repo, 'package-lock.json'), JSON.stringify(lock('2.0.0')));
  assert.equal(checkoutParts(repo), null, 'no node_modules: nobody installed a tree here');
  link('../apps/app', path.join(repo, 'node_modules/app'));
  write(path.join(repo, 'node_modules/third/package.json'), JSON.stringify({ name: 'third', version: '1.0.0' }));
  write(path.join(repo, 'apps/app/node_modules/third/package.json'), JSON.stringify({ name: 'third', version: '2.0.0' }));

  assert.equal(checkoutParts(repo), null, 'every package the lockfile names is installed where it names it');
  assert.equal(lockfileParts(repo, repo), null, "a worktree's comparison agrees: the nested package is the lockfile's");
  write(path.join(repo, 'package-lock.json'), JSON.stringify(lock('3.0.0')));
  assert.equal(checkoutParts(repo), 'apps/app/node_modules/third', 'the merge asks for another version of it');
  fs.rmSync(path.join(repo, 'package-lock.json'));
  assert.equal(checkoutParts(repo), null, 'no lockfile: not an npm checkout');
});

/**
 * `aCheckout`, with a package npm installed nested in the app's own `node_modules`, as it does when a workspace needs its own copy: named
 * in both lockfiles, and on main's disk at `version` (absent when null) beside a cache of vite's.
 */
function aNestedCheckout(version: string | null): { main: string; wt: string } {
  const { main, wt } = aCheckout();
  for (const root of [main, wt]) {
    const file = path.join(root, 'package-lock.json');
    const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
    lock.packages['apps/app/node_modules/nested'] = { version: '1.0.0' };
    fs.writeFileSync(file, JSON.stringify(lock, null, 2));
  }
  const nested = path.join(main, 'apps/app/node_modules');
  if (version) {
    write(path.join(nested, 'nested/package.json'), JSON.stringify({ name: 'nested', version }));
    write(path.join(nested, 'nested/index.js'), "module.exports = 'main-nested';\n");
  }
  write(path.join(nested, '.vite/cache'), 'main\n');
  return { main, wt };
}

test("a package nested in a workspace's node_modules at the version main has is hardlinked into the worktree's own, never installed", async () => {
  const { main, wt } = aNestedCheckout('1.0.0');
  const mains = snapshot(path.join(main, 'apps/app/node_modules'));
  assert.deepEqual(await provisionDeps(main, wt), { tree: 'hardlinked', made: 12 });

  const ours = path.join(wt, 'apps/app/node_modules');
  assert.deepEqual(required(path.join(wt, 'apps/app'), 'nested'), {
    real: fs.realpathSync(path.join(ours, 'nested/index.js')),
    value: 'main-nested',
  });
  assert.equal(
    fs.statSync(path.join(ours, 'nested/index.js')).ino,
    fs.statSync(path.join(main, 'apps/app/node_modules/nested/index.js')).ino,
  );
  assert.ok(fs.lstatSync(ours).isDirectory(), "the app's node_modules is the worktree's own directory, not a link to main's");
  assert.ok(!fs.existsSync(path.join(ours, '.vite')), "vite's cache is the tree's own, and left out");
  assert.deepEqual(await provisionDeps(main, wt), { tree: 'hardlinked', made: 0 }, 'a second call adds nothing');
  write(path.join(ours, '.vite/cache'), "the branch's build\n");
  assert.deepEqual(snapshot(path.join(main, 'apps/app/node_modules')), mains, "main's nested tree was not written");
});

test('a package nested in a workspace parts when main has another version of it, or none', async () => {
  const { lockfileParts } = await import('./worktree.store.ts');
  for (const version of ['2.0.0', null]) {
    const { main, wt } = aNestedCheckout(version);
    assert.equal(lockfileParts(main, wt), 'apps/app/node_modules/nested', `main has ${version ?? 'none'}: provisionDeps runs npm ci`);
  }
});

test('a workspace folder of the worktree that leads outside it, or whose node_modules does, is never made through', async () => {
  const outside = fs.mkdtempSync(path.join(ROOT, 'outside-'));
  const linkedApp = aNestedCheckout('1.0.0');
  fs.rmSync(path.join(linkedApp.wt, 'apps/app'), { recursive: true });
  link(outside, path.join(linkedApp.wt, 'apps/app'));
  assert.deepEqual(await provisionDeps(linkedApp.main, linkedApp.wt), { tree: 'hardlinked', made: 10 });
  assert.deepEqual(fs.readdirSync(outside), [], 'the branch made apps/app a link: nothing is made where it leads');

  const linkedModules = aNestedCheckout('1.0.0');
  link(outside, path.join(linkedModules.wt, 'apps/app/node_modules'));
  assert.deepEqual(await provisionDeps(linkedModules.main, linkedModules.wt), { tree: 'hardlinked', made: 10 });
  assert.deepEqual(fs.readdirSync(outside), [], "nor where the app's node_modules leads");
});
