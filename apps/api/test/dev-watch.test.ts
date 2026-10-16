/**
 * What `npm run dev` watches: the sources alone. `node --watch` watches every module the process loads, the dependencies under
 * `node_modules` included, and a run's worktree hardlinks this checkout's packages file by file, so making or freeing one changes the
 * link count — and so the ctime — of every file there, which Linux reports as a change and the viewer restarts for. The `dev` script
 * names a `--watch-path` for each source root instead.
 *
 * The test walks the imports the api's process loads from `src/main.ts`, through this repository's workspace packages by their
 * `exports`, and refuses a file of ours outside every watched path, a watched path that is not there, and one under `node_modules`.
 * Each rule is made to refuse a planted value first.
 *
 * It reads files outside this package; `turbo.json` makes the packages' sources an input of its tests. After a change there by hand,
 * `npx turbo run test --force`.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const API = path.join(import.meta.dirname, '..');
const ROOT = path.join(API, '..', '..');

type Package = { name: string; dir: string; exports: Record<string, string> };

/** Every workspace package of this repository, by the name an import names it with, with the files its `exports` give. */
function workspacePackages(): Package[] {
  const out: Package[] = [];
  for (const group of ['packages', 'apps'])
    for (const entry of fs.readdirSync(path.join(ROOT, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(ROOT, group, entry.name);
      const file = path.join(dir, 'package.json');
      if (!fs.existsSync(file)) continue;
      const read = JSON.parse(fs.readFileSync(file, 'utf8')) as { name: string; exports?: Record<string, string> };
      out.push({ name: read.name, dir, exports: read.exports ?? {} });
    }
  return out;
}

/** The file a bare import names, through the workspace package it names and that package's `exports`, or `undefined` for anyone else's. */
function workspaceFile(spec: string, packages: Package[]): string | undefined {
  for (const pkg of packages) {
    if (spec !== pkg.name && !spec.startsWith(`${pkg.name}/`)) continue;
    const subpath = spec === pkg.name ? '.' : `.${spec.slice(pkg.name.length)}`;
    const target = pkg.exports[subpath];
    return target === undefined ? undefined : path.join(pkg.dir, target);
  }
  return undefined;
}

/** The imports a source file names, relative and bare alike, as TypeScript reads them. */
const importsOf = (file: string): string[] =>
  ts.preProcessFile(fs.readFileSync(file, 'utf8'), true, true).importedFiles.map((found) => found.fileName);

/**
 * Every file of this repository the process started at `entry` loads, `entry` included; a dependency under `node_modules` is no
 * file of ours.
 */
function loaded(entry: string, packages: Package[]): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    seen.add(file);
    for (const spec of importsOf(file)) {
      if (spec.startsWith('node:')) continue;
      const next = spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : workspaceFile(spec, packages);
      if (next !== undefined && !next.includes(`${path.sep}node_modules${path.sep}`)) queue.push(next);
    }
  }
  return [...seen];
}

/** The `--watch-path` values of the api's `dev` script, as absolute paths from `apps/api`, where the script runs. */
function watched(): { script: string; paths: string[] } {
  const read = JSON.parse(fs.readFileSync(path.join(API, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const script = read.scripts.dev;
  const paths = [...script.matchAll(/--watch-path[= ]([^\s]+)/g)].map((found) => path.resolve(API, found[1]));
  return { script, paths };
}

/** Whether `file` sits under one of `paths`. */
const under = (file: string, paths: string[]): boolean => paths.some((dir) => file === dir || file.startsWith(`${dir}${path.sep}`));

test('the dev script watches the sources it loads, and nothing else', () => {
  const { script, paths } = watched();
  assert.ok(script.includes('--watch'), `dev is \`${script}\``);
  assert.ok(paths.length > 0, `dev names no --watch-path: \`${script}\``);
  const packages = workspacePackages();
  const files = loaded(path.join(API, 'src', 'main.ts'), packages);
  assert.ok(files.length > 50, `the walk read ${files.length} files of ours`);
  const outside = files.filter((file) => !under(file, paths));
  assert.deepEqual(
    outside.map((file) => path.relative(ROOT, file)),
    [],
    `dev loads these and watches them not: \`${script}\``,
  );
  assert.ok(!under(path.join(ROOT, 'node_modules', 'jose', 'package.json'), paths), `dev watches node_modules: \`${script}\``);
});

test('a source root outside every watched path is refused', () => {
  const { paths } = watched();
  const entry = workspaceFile('agent-runtime', workspacePackages());
  assert.ok(entry !== undefined, "the runtime's entry is the one its exports name");
  const source = path.dirname(entry);
  assert.ok(under(source, paths), 'the runtime the api loads is watched');
  assert.ok(
    !under(
      source,
      paths.filter((dir) => !dir.includes('agent-runtime')),
    ),
    'the rule reads the paths it is given',
  );
});

test('every watched path is a directory that is there', () => {
  const { script, paths } = watched();
  for (const dir of paths)
    assert.ok(fs.existsSync(dir) && fs.statSync(dir).isDirectory(), `${path.relative(ROOT, dir)} is no directory: \`${script}\``);
  assert.ok(!fs.existsSync(path.join(ROOT, 'packages', 'agent-runtime', 'srcs')), 'the rule reads a path that is not there');
});
