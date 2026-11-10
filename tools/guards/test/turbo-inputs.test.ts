/**
 * A test that reads a file outside its package is re-run when that file changes. Turbo caches a package's test by the package's own
 * files and its dependencies', so a read elsewhere replays a pass from the cache after a change there unless `turbo.json` names it among
 * the task's `inputs`. This test finds each workspace's reads outside its folder itself, from its test sources, and refuses one no input
 * of its task covers: turbo.json is the one list, and the reads are the code's.
 *
 * What it sees: a path built from a folder the file knows — `import.meta.dirname`, a `new URL(…, import.meta.url)`, the test kit's
 * `REPO`, or a constant made of one — by `path.join` or `path.resolve` with string literals, up to the first part that is not one, in
 * the files the test script runs and the helpers they import from their own folder (not from a folder below it, where the board keeps its
 * e2e's harness, which its unit tests import for a constant and never run). What it cannot see: a path built at run time (from a
 * variable, a template with a value in it, or a list git or a walk returns, as the whole-repository scans read every file git lists), a
 * path a helper of another workspace builds, and a read of the repository's root with nothing after it. Those reads are named in the
 * task's inputs by hand, as a whole-repository scan's are.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { REPO, workspaces } from 'test-kit/repo';
import { scratch } from 'test-kit/scratch';

type Turbo = { tasks: Record<string, { inputs?: string[] }> };
type Manifest = { name: string; scripts?: { test?: string }; dependencies?: object; devDependencies?: object };

const manifestOf = (root: string, dir: string): Manifest =>
  JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8')) as Manifest;

/** The files a test script runs first: each `--import` preload and each file its globs match, from the workspace's folder. */
function entries(root: string, dir: string, script: string): string[] {
  const at = path.join(root, dir);
  const preloads = [...script.matchAll(/--import\s+(\S+)/g)].map(([, file]) => path.join(at, file));
  const globs = [...script.matchAll(/'([^']+\.ts)'|\s((?:test|src)\/\S+\.ts)/g)].map(([, quoted, bare]) => quoted ?? bare);
  const files = fs
    .readdirSync(at, { recursive: true, encoding: 'utf8' })
    .filter((file) => !file.split(path.sep).includes('node_modules') && globs.some((glob) => path.matchesGlob(file, glob)));
  return [...preloads, ...files.map((file) => path.join(at, file))];
}

const literal = (node: ts.Node): string | undefined =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;

const isMeta = (node: ts.Node, name: string): boolean =>
  ts.isPropertyAccessExpression(node) && node.name.text === name && ts.isMetaProperty(node.expression);

/** The paths `file` builds from a folder it knows, as far as their literal parts go, and the files it imports by a relative path. */
function readsOf(root: string, file: string): { reads: string[]; imports: string[] } {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const known = new Map<string, string>();
  const reads = new Set<string>();
  const imports: string[] = [];
  const built = (node: ts.Node): { at: string; whole: boolean } | undefined => {
    if (isMeta(node, 'dirname')) return { at: path.dirname(file), whole: true };
    if (ts.isIdentifier(node) && known.has(node.text)) return { at: known.get(node.text) ?? '', whole: true };
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      const [first, ...rest] = node.arguments;
      if (callee === 'fileURLToPath' && first) return built(first);
      if ((callee !== 'path.join' && callee !== 'path.resolve') || !first) return undefined;
      const base = built(first);
      if (!base) return undefined;
      let { at, whole } = base;
      for (const part of rest) {
        const text = literal(part);
        if (text === undefined) {
          whole = false;
          break;
        }
        at = path.join(at, text);
      }
      return { at, whole };
    }
    if (ts.isNewExpression(node) && node.expression.getText(source) === 'URL' && node.arguments?.length === 2) {
      const [relative, base] = node.arguments;
      const text = literal(relative);
      if (text !== undefined && isMeta(base, 'url')) return { at: path.join(path.dirname(file), text), whole: true };
    }
    return undefined;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const from = node.moduleSpecifier && literal(node.moduleSpecifier);
      if (from?.startsWith('.')) imports.push(path.join(path.dirname(file), from));
      const named = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : undefined;
      if (from === 'test-kit/repo' && named && ts.isNamedImports(named))
        for (const element of named.elements)
          if ((element.propertyName ?? element.name).text === 'REPO') known.set(element.name.text, root);
      return;
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = built(node.initializer);
      if (value?.whole) known.set(node.name.text, value.at);
    }
    const value = ts.isCallExpression(node) || ts.isNewExpression(node) ? built(node) : undefined;
    if (value) reads.add(value.at);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { reads: [...reads], imports };
}

/** The workspaces `dir` depends on, by its manifest and theirs in turn: their files reach its task's hash through `^transit`. */
function dependencies(root: string, dir: string, folders: Map<string, string>): Set<string> {
  const out = new Set<string>();
  const visit = (at: string): void => {
    const manifest = manifestOf(root, at);
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
      const folder = folders.get(name);
      if (folder && !out.has(folder)) {
        out.add(folder);
        visit(folder);
      }
    }
  };
  visit(dir);
  return out;
}

const posix = (file: string): string => file.split(path.sep).join('/');

/**
 * Each workspace's reads outside its folder, by path from `root`, with the test file that makes each: from the files its test script
 * runs and the helpers beside them they import, each read that is on disk, outside every workspace it depends on and outside a
 * `node_modules`.
 */
function outsideReads(root: string): Map<string, Map<string, string>> {
  const dirs = workspaces(root);
  const folders = new Map(dirs.map((dir) => [manifestOf(root, dir).name, dir]));
  const out = new Map<string, Map<string, string>>();
  for (const dir of dirs) {
    const script = manifestOf(root, dir).scripts?.test;
    if (!script) continue;
    const inside = [dir, ...dependencies(root, dir, folders)];
    const found = new Map<string, string>();
    const seen = new Set<string>();
    const queue = entries(root, dir, script);
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
      if (seen.has(file) || !/\.tsx?$/.test(file) || !fs.existsSync(file)) continue;
      seen.add(file);
      const { reads, imports } = readsOf(root, file);
      queue.push(...imports.filter((imported) => path.dirname(imported) === path.dirname(file)));
      for (const read of reads) {
        const relative = posix(path.relative(root, read));
        if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) continue;
        if (inside.some((folder) => relative === folder || relative.startsWith(`${folder}/`))) continue;
        if (relative.split('/').includes('node_modules') || !fs.existsSync(read)) continue;
        if (!found.has(relative)) found.set(relative, posix(path.relative(root, file)));
      }
    }
    out.set(dir, found);
  }
  return out;
}

/** The files under `relative`, a folder of `root`, by path from the root: what a read of a folder reads. */
const filesUnder = (root: string, relative: string): string[] =>
  fs
    .readdirSync(path.join(root, relative), { recursive: true, encoding: 'utf8' })
    .filter((file) => !file.split(path.sep).includes('node_modules'))
    .map((file) => `${relative}/${posix(file)}`);

/**
 * Each read of a workspace's tests that no input of its task in `turbo` covers, as a sentence naming the fix: a file is covered by a
 * glob that matches it, a folder by a glob that matches a file under it.
 */
function uncovered(root: string, turbo: Turbo): string[] {
  const out: string[] = [];
  for (const [dir, reads] of outsideReads(root)) {
    const task = `${manifestOf(root, dir).name}#test`;
    const globs = (turbo.tasks[task]?.inputs ?? [])
      .filter((glob) => glob.startsWith('$TURBO_ROOT$/'))
      .map((glob) => glob.slice('$TURBO_ROOT$/'.length));
    const covers = (file: string): boolean => globs.some((glob) => path.matchesGlob(file, glob));
    for (const [read, by] of reads) {
      const isFolder = fs.statSync(path.join(root, read)).isDirectory();
      if (isFolder ? filesUnder(root, read).some(covers) : covers(read)) continue;
      out.push(
        `${by} reads ${read}, outside ${dir}, and ${task} lists no input that covers it: add "$TURBO_ROOT$/${read}${isFolder ? '/**' : ''}" to its inputs in turbo.json, or turbo replays it from its cache`,
      );
    }
  }
  return out;
}

const readTurbo = (root: string): Turbo => JSON.parse(fs.readFileSync(path.join(root, 'turbo.json'), 'utf8')) as Turbo;

test("each workspace's test that reads a file outside its package finds it among its task's inputs in turbo.json", () => {
  const found = outsideReads(REPO);
  assert.ok(
    [...found.values()].reduce((sum, reads) => sum + reads.size, 0) > 20,
    'the finder found almost no read outside a package: it no longer reads how the tests build their paths',
  );
  assert.deepEqual(uncovered(REPO, readTurbo(REPO)), []);
});

/** A repository of two workspaces: `a`, whose tests read files outside it, and `b`, which `a` depends on; `turbo` its turbo.json. */
function planted(turbo: Turbo): string {
  const root = scratch('turbo-inputs-');
  const write = (file: string, text: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  write('package.json', JSON.stringify({ workspaces: ['packages/*'] }));
  write('turbo.json', JSON.stringify(turbo));
  write(
    'packages/a/package.json',
    JSON.stringify({ name: 'a', scripts: { test: "node --test 'test/*.test.ts'" }, dependencies: { b: '*' } }),
  );
  write('packages/b/package.json', JSON.stringify({ name: 'b' }));
  write('packages/b/notes.md', 'b');
  write('docs/guide.md', 'guide');
  write('config/one.json', '{}');
  write('config/deep/two.json', '{}');
  write(
    'packages/a/test/reads.test.ts',
    [
      "import path from 'node:path';",
      "import { configs } from './configs.ts';",
      "const ROOT = path.join(import.meta.dirname, '..', '..', '..');",
      "export const guide = path.join(ROOT, 'docs', 'guide.md');",
      "export const notes = path.join(ROOT, 'packages', 'b', 'notes.md');",
      "export const gone = path.join(ROOT, 'docs', 'gone.md');",
      'export const each = (name: string) => path.join(configs, name);',
    ].join('\n'),
  );
  write('packages/a/test/configs.ts', "export const configs = new URL('../../../config', import.meta.url).pathname;\n");
  return root;
}

const taskA = (inputs?: string[]): Turbo => ({ tasks: { 'a#test': inputs ? { inputs } : {} } });

test('the finder reads a path built from import.meta.dirname, from a constant, in a helper the test imports, and none in a dependency', () => {
  assert.deepEqual(Object.fromEntries(outsideReads(planted(taskA())).get('packages/a') ?? []), {
    'docs/guide.md': 'packages/a/test/reads.test.ts',
    config: 'packages/a/test/configs.ts',
  });
});

test('REFUSED: a read outside the package that turbo.json does not list, or a task with no inputs at all', () => {
  const narrow = taskA(['$TURBO_DEFAULT$', '$TURBO_ROOT$/config/deep/**']);
  const refused = uncovered(planted(narrow), narrow);
  assert.equal(refused.length, 1, refused.join('\n'));
  assert.match(refused[0], /reads docs\/guide\.md, outside packages\/a\b/);
  assert.ok(refused[0].includes('a#test'), 'the refusal names the task');
  assert.equal(uncovered(planted(taskA()), taskA()).length, 2, 'a task with no inputs covers nothing outside its package');
  const listed = taskA(['$TURBO_DEFAULT$', '$TURBO_ROOT$/docs/**', '$TURBO_ROOT$/config/*.json']);
  assert.deepEqual(uncovered(planted(listed), listed), []);
});
