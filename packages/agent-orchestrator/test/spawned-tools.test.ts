/**
 * A Node primitive before a spawned tool: no `src` starts `du`, `find`, `rm`, `cp`, `mv`, `ls`, `df` or `stat` as a process, where
 * `node:fs` answers the same in this one (`lstat`, `readdir`, `rm`, `cp`, `rename`, `statfs`) with no fork, no output to parse and no
 * tool to be missing. Over `packages/*\/src` and `apps/*\/src`, tests left out, a call is refused when one of `TOOLS` is the command
 * handed to one of `SPAWNS`, written there or held by a `const` of the same file, or the first word of a line handed to one of
 * `SHELLS`. Read off the syntax tree, so a call oxfmt splits over lines is the same call. A word that runs nothing passes.
 *
 * The test reads files outside this package: `turbo.json` makes the apps' sources and the runtime inputs of this package's tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { scratch } from './scratch.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** The tools `node:fs` stands in for. */
const TOOLS = ['du', 'find', 'rm', 'cp', 'mv', 'ls', 'df', 'stat'];

/** The calls that start a process, by the name they are called by: their first argument is the command. */
const SPAWNS = ['execFileSync', 'execFile', 'spawn', 'spawnSync'];

/** The calls that run a shell line: their first argument is the whole line, which runs a tool when its first word is one. */
const SHELLS = ['exec', 'execSync'];

/** The string `node` is: a literal, a template's head, or a `const` of the file that holds one; else `undefined`. */
function stringOf(node: ts.Expression | undefined, consts: ReadonlyMap<string, string>): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text;
  if (ts.isIdentifier(node)) return consts.get(node.text);
  return undefined;
}

/** The name a call is called by: an identifier's, or the last name of a property access. */
function calleeName(call: ts.CallExpression): string | undefined {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return undefined;
}

/** Each tool a source text spawns, as `<tool> (<call>, line <n>)`. */
function spawnedIn(text: string, file = 'file.ts'): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const consts = new Map<string, string>();
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isStringLiteral(node.initializer))
      consts.set(node.name.text, node.initializer.text);
    if (ts.isCallExpression(node)) calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls.flatMap((call) => {
    const name = calleeName(call) ?? '';
    const said = stringOf(call.arguments[0], consts);
    const tool = SPAWNS.includes(name) ? said : SHELLS.includes(name) ? said?.trim().split(/\s+/)[0] : undefined;
    if (tool === undefined || !TOOLS.includes(path.basename(tool))) return [];
    return [`${path.basename(tool)} (${name}, line ${source.getLineAndCharacterOfPosition(call.getStart()).line + 1})`];
  });
}

/** Every source file under `dir`, tests left out, by its path from `root`. */
function sourcesUnder(dir: string, root: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourcesUnder(at, root);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path.relative(root, at)] : [];
  });
}

/** Each spawned tool under the `src` of every package and app of `root`, as `<file>: <tool> (…)`. */
function spawnedTools(root: string): string[] {
  return ['packages', 'apps']
    .flatMap((kind) => {
      const at = path.join(root, kind);
      return fs.existsSync(at) ? fs.readdirSync(at).map((name) => path.join(at, name, 'src')) : [];
    })
    .flatMap((src) => sourcesUnder(src, root))
    .flatMap((file) => spawnedIn(fs.readFileSync(path.join(root, file), 'utf8'), file).map((found) => `${file}: ${found}`));
}

test('no src spawns a tool node:fs stands in for', () => {
  assert.ok(
    spawnedTools(ROOT).length === 0,
    `ask node:fs instead (lstat, readdir, rm, cp, rename, statfs):\n${spawnedTools(ROOT).join('\n')}`,
  );
  assert.ok(sourcesUnder(path.join(ROOT, 'packages', 'agent-orchestrator', 'src'), ROOT).length > 100, 'the walk reads the sources');
});

test('REFUSED on a fixture: a tool spawned by name, through a const, by its path, on a line a formatter split, or as a shell line', () => {
  const root = scratch('wf-spawned-tools-');
  const src = path.join(root, 'packages', 'one', 'src');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(
    path.join(src, 'size.ts'),
    [
      "import { execFileSync, spawn, execSync } from 'node:child_process';",
      "const TOOL = 'find';",
      "export const size = (dir: string) => execFileSync('du', ['-sk', dir], { encoding: 'utf8' });",
      'export const found = (dir: string) => spawn(TOOL, [dir]);',
      'export const gone = (dir: string) =>',
      '  execFileSync(',
      "    '/bin/rm',",
      "    ['-rf', dir],",
      '  );',
      'export const listed = (dir: string) => execSync(`ls -la ${dir}`);',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(src, 'size.test.ts'), "execFileSync('du', ['-sk', '.']);\n");
  fs.writeFileSync(
    path.join(src, 'words.ts'),
    "export const TOOLS = ['du', 'rm'];\nexport const said = say('rm');\nexport const ran = execFileSync('node', ['rm']);\n",
  );
  assert.deepEqual(spawnedTools(root), [
    'packages/one/src/size.ts: du (execFileSync, line 3)',
    'packages/one/src/size.ts: find (spawn, line 4)',
    'packages/one/src/size.ts: rm (execFileSync, line 6)',
    'packages/one/src/size.ts: ls (execSync, line 10)',
  ]);
});
