/**
 * The comment guards: a comment is a JSDoc contract, or a lint directive with its reason (CLAUDE.md, "Code reads by itself").
 *
 * `lint/comments.ts` is the oxlint plugin; `.oxlintrc.json` runs the guards in one override block per package, none with an
 * `"excludeFiles"`, and one block also covers the folders beside the packages: `lint/**`, the plugin itself, and `tools/**`, the
 * repository's test tooling. These tests run the repository's oxlint on fixtures with
 * the repository's own block, so a guard the block names that runs nothing — misspelled, set to `off`, or aimed at other files — fails
 * here. The last part is what a lint rule cannot see across files: a name a comment quotes in backticks is one the code has, in each
 * file a guard block covers.
 *
 * No line that holds a comment is wider than oxfmt's print width, which wraps code but rewraps no comment: the plugin's rule refuses
 * one, and a scan of every source file under packages/, apps/, lint/ and tools/ is the floor under it.
 *
 * The design system kit the shadcn CLI writes into the board, and its skills beside it, are another repository's code, fetched again
 * at each update: the linter skips them (`"ignorePatterns"`) and so do the scans here, and no other folder may join them.
 *
 * The test reads files outside this package: after a change elsewhere, `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import plugin, { COMMENT_WIDTH } from '../../../lint/comments.ts';
import { scratch } from './scratch.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const OXLINT = path.join(ROOT, 'node_modules', '.bin', 'oxlint');
const SELF = path
  .relative(ROOT, import.meta.filename)
  .split(path.sep)
  .join('/');

type Block = { files: string[]; excludeFiles?: string[]; rules: Record<string, unknown> };
type Config = { jsPlugins: { name: string; specifier: string }[]; overrides: Block[]; ignorePatterns?: string[]; [key: string]: unknown };

/** The folders that hold another repository's code as it ships it: the design system kit in the board, and its skills beside it. */
const VENDORED = ['apps/web/src/components/ui/ds/**', 'apps/web/.claude/**'];

/** Whether `file`, from the root, is under a vendored folder. */
const vendored = (file: string): boolean => VENDORED.some((glob) => path.matchesGlob(file, glob));

/** The globs the linter is told to skip that are not a vendored folder's, in the order the config lists them: each hides code of ours. */
const strayIgnores = (config: Config): string[] => (config.ignorePatterns ?? []).filter((glob) => !VENDORED.includes(glob));

/** `.oxlintrc.json`, read as oxlint reads it: JSON with comments. */
function readConfig(text = fs.readFileSync(path.join(ROOT, '.oxlintrc.json'), 'utf8')): Config {
  const parsed = ts.parseConfigFileTextToJson('.oxlintrc.json', text);
  if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
  return parsed.config as Config;
}

/** The override blocks that carry the comment guards, in the order the config lists them. */
const guardBlocks = (config: Config): Block[] => config.overrides.filter((block) => 'comments/no-code-comments' in block.rules);

/** The package a block covers, from its first `files` glob. */
const packageOf = (block: Block): string => block.files[0].replace(/\/\*\*$/, '');

/** The package of each guard block that has an `"excludeFiles"`, in the order the config lists them: each takes files back out. */
const excludedBlocks = (config: Config): string[] =>
  guardBlocks(config)
    .filter((block) => block.excludeFiles !== undefined)
    .map(packageOf);

/** Every workspace package: the folders under packages/ and apps/ with a package.json, from the root. */
const workspacePackages = (): string[] =>
  ['apps', 'packages']
    .flatMap((top) => fs.readdirSync(path.join(ROOT, top)).map((name) => `${top}/${name}`))
    .filter((dir) => fs.existsSync(path.join(ROOT, dir, 'package.json')))
    .sort();

/** The globs of the folders beside the packages, which one guard block, and one only, lists after its package: the plugin, the tooling. */
const BESIDE = ['lint/**', 'tools/**'];

/** A jsPlugins specifier made absolute, as a config in another folder needs it: a path from the root, or a package the root installs. */
const resolvePlugin = (specifier: string): string =>
  specifier.startsWith('.') ? path.join(ROOT, specifier) : createRequire(path.join(ROOT, 'package.json')).resolve(specifier);

type Diagnostic = { file: string; line: number; rule: string };

/** A rule as the config names it, from the code oxlint reports: `comments(no-code-comments)` or `eslint(no-inline-comments)`. */
const ruleOf = (code: string): string => code.replace(/^eslint\((.*)\)$/, '$1').replace(/^(\w[\w-]*)\((.*)\)$/, '$1/$2');

/**
 * Oxlint run on `fixtures`, each written under `on/`, with the repository's config and its first guard block, for `on/**`. Type-aware
 * linting is left out: a fixture has no tsconfig.
 */
function lint(fixtures: Record<string, string>): Diagnostic[] {
  const dir = scratch('comments-');
  const config = readConfig();
  const block = guardBlocks(config)[0];
  const { options: _options, $schema: _schema, ...rest } = config;
  const used = {
    ...rest,
    jsPlugins: config.jsPlugins.map((entry) => ({ ...entry, specifier: resolvePlugin(entry.specifier) })),
    overrides: [{ ...block, files: ['on/**'] }],
  };
  fs.writeFileSync(path.join(dir, '.oxlintrc.json'), JSON.stringify(used));
  fs.mkdirSync(path.join(dir, 'on'), { recursive: true });
  for (const [name, text] of Object.entries(fixtures)) fs.writeFileSync(path.join(dir, 'on', name), text);
  const ran = spawnSync(OXLINT, ['-c', '.oxlintrc.json', '-f', 'json', 'on'], { cwd: dir, encoding: 'utf8', timeout: 60_000 });
  assert.equal(ran.signal, null, `oxlint was stopped by ${ran.signal}: ${ran.stderr}`);
  assert.ok(ran.status === 0 || ran.status === 1, `oxlint exited ${ran.status}: ${ran.stderr}${ran.stdout}`);
  const report = JSON.parse(ran.stdout) as { diagnostics: { code: string; filename: string; labels: { span: { line: number } }[] }[] };
  return report.diagnostics.map((d) => ({ file: d.filename, line: d.labels[0].span.line, rule: ruleOf(d.code) }));
}

/** The 1-based line of `text` that holds the needle it is given, which must be on exactly one line. */
function lineOf(text: string, needle: string): number {
  const lines = text.split('\n').flatMap((line, i) => (line.includes(needle) ? [i + 1] : []));
  assert.equal(lines.length, 1, `${needle} is on ${lines.length} lines of the fixture`);
  return lines[0];
}

const CODE = [
  '/** The file: its head is a JSDoc. */',
  "import { test } from 'node:test';",
  '',
  '// refused: a line comment',
  '/* refused: a block comment */',
  '/** A function: documented. */',
  'export function documented(value: number): number {',
  '  /** refused: a JSDoc inside a body */',
  '  const doubled = value * 2;',
  '  // eslint-disable-next-line no-debugger',
  '  debugger;',
  '  // oxlint-disable-next-line no-debugger -- a directive with its reason',
  '  debugger;',
  '  // @ts-ignore',
  '  // @ts-expect-error -- the fixture is not typechecked',
  '  return doubled;',
  '}',
  '/** A constant: documented. */',
  'export const LIMIT = 3;',
  '/** A type: documented. */',
  'export type Shape = {',
  '  /** A member: documented. */',
  '  side: number;',
  '};',
  '/** A class: documented. */',
  'export class Box {',
  '  /** A method: documented. */',
  '  open(): Shape {',
  '    return {',
  '      /** A property: documented. */',
  '      side: LIMIT,',
  '    };',
  '  }',
  '}',
  '/** refused: a JSDoc on a call */',
  "test('a test', () => {});",
  '',
].join('\n');

const JSX = [
  '/** A view: documented. */',
  'export function View() {',
  '  return (',
  '    <div>',
  '      {/* refused: a comment in JSX */}',
  '      <span />',
  '    </div>',
  '  );',
  '}',
  '',
].join('\n');

const HISTORY = [
  '/** refused: measured on 2026-09-28. */',
  'export const a = 1;',
  '/** refused: retired in stage 4a. */',
  'export const b = 1;',
  '/** refused: generated since agents card 3c. */',
  'export const c = 1;',
  '/** refused: split out in part 2. */',
  'export const d = 1;',
  '/** refused: found in review, round 2b. */',
  'export const e = 1;',
  '/** refused: a rule, learned by a failed check. */',
  'export const f = 1;',
  '/** Asked again on round 2 of 3. */',
  'export const g = 1;',
  '/** Drawn a card 45 short of its row. */',
  'export const h = 1;',
  '/**',
  ' * Wrapped over a line: a',
  ' * card 45 short of its row.',
  ' */',
  'export const i = 1;',
  '/** Pinned at oxlint 1.86.0. */',
  'export const j = 1;',
  '',
].join('\n');

const DEFERRAL = [
  '/** refused: a temporary fix. */',
  'export const a = 1;',
  '/** refused: a temporary patch until it lands. */',
  'export const b = 1;',
  '/** refused: the check is left off for now. */',
  'export const c = 1;',
  '/** Written in a temporary directory. */',
  'export const d = 1;',
  '/** Dimmed, so that nobody takes it for now. */',
  'export const e = 1;',
  '',
].join('\n');

const WARNING = [
  '/** refused: a contract,',
  ' * with a todo in its middle.',
  ' */',
  'export const a = 1;',
  '/** refused: a stopgap. */',
  'export const b = 1;',
  '/** A contract that says what the code is. */',
  'export const c = 1;',
  '',
].join('\n');

const INLINE = [
  '/** A constant: documented. */',
  'export const a = 1; /** refused: after code */',
  '/** A constant: documented. */',
  'export const b = 2; // oxlint-disable-line no-debugger -- a directive may follow code',
  '',
].join('\n');

/** A line `width` code points wide: `head`, then as many `x` as it takes, then `tail`. */
const widened = (head: string, tail: string, width: number): string => `${head}${'x'.repeat(width - head.length - tail.length)}${tail}`;

const WIDTH = [
  widened('/** a one-line JSDoc ', ' */', COMMENT_WIDTH + 1),
  'export const a = 1;',
  widened('/** a JSDoc at the width ', ' */', COMMENT_WIDTH),
  'export const b = 1;',
  '/**',
  widened(' * the middle line of a JSDoc ', '', COMMENT_WIDTH + 1),
  ' */',
  'export const c = 1;',
  widened('// oxlint-disable-next-line no-debugger -- a directive ', '', COMMENT_WIDTH + 1),
  'debugger;',
  widened('export const d = 1; // a comment after code ', '', COMMENT_WIDTH + 1),
  widened("export const e = 'a string with no comment ", "';", COMMENT_WIDTH + 10),
  '/** A view: documented. */',
  'export function View() {',
  widened('  return <div>{/* a comment in JSX ', ' */}</div>;', COMMENT_WIDTH + 1),
  '}',
  '',
].join('\n');

/** The needle of each line of `WIDTH` that is over the width and holds a comment, in order; the wide line of code is not among them. */
const WIDE_LINES = ['a one-line JSDoc', 'the middle line of a JSDoc', 'a directive', 'a comment after code', 'a comment in JSX'];

const FIXTURES: Record<string, string> = {
  'code.ts': CODE,
  'jsx.tsx': JSX,
  'history.ts': HISTORY,
  'deferral.ts': DEFERRAL,
  'warning.ts': WARNING,
  'inline.ts': INLINE,
  'width.tsx': WIDTH,
};

let linted: Diagnostic[] | undefined;
/** One oxlint run over every fixture, shared by the tests that read it. */
const fixtureRun = (): Diagnostic[] => (linted ??= lint(FIXTURES));

/** The guard rules, each with the lines it refused in `file` under `on/`, sorted. */
function refusals(file: string): Record<string, number[]> {
  const rules = new Set(Object.keys(guardBlocks(readConfig())[0].rules));
  const out: Record<string, number[]> = {};
  for (const d of fixtureRun().filter((d) => d.file === `on/${file}` && rules.has(d.rule))) (out[d.rule] ??= []).push(d.line);
  for (const lines of Object.values(out)) lines.sort((x, y) => x - y);
  return out;
}

test("the plugin's rules are the ones each guard block names, and each block holds the same five rules", () => {
  const blocks = guardBlocks(readConfig());
  assert.ok(blocks.length > 0, 'no override block names comments/no-code-comments');
  const named = Object.keys(plugin.rules)
    .map((rule) => `${plugin.meta.name}/${rule}`)
    .sort();
  for (const block of blocks) {
    const rules = Object.keys(block.rules).sort();
    assert.deepEqual(
      rules.filter((rule) => rule.startsWith(`${plugin.meta.name}/`)),
      named,
      `${packageOf(block)}'s block names another rule than lint/comments.ts has`,
    );
    assert.deepEqual(rules, [...named, 'no-inline-comments', 'no-warning-comments'].sort(), packageOf(block));
    assert.deepEqual(block.rules, blocks[0].rules, `${packageOf(block)}'s rules differ from ${packageOf(blocks[0])}'s: edit every block`);
  }
  const config = readConfig();
  assert.deepEqual(
    config.jsPlugins.filter((entry) => entry.specifier === './lint/comments.ts').map((entry) => entry.name),
    [plugin.meta.name],
    'the plugin is loaded under the name its rules are named by',
  );
});

test('every guard rule is loaded and runs on its fixture', () => {
  const rules = Object.keys(guardBlocks(readConfig())[0].rules).sort();
  const ran = [...new Set(fixtureRun().map((d) => d.rule))];
  assert.deepEqual(
    ran.filter((rule) => rules.includes(rule)).sort(),
    rules,
    'a rule the block names refused nothing on its fixture: it is off, or not the rule the fixture is for',
  );
});

test('REFUSED: comments/no-code-comments refuses a // and a /* */, JSX included, a directive without a reason, and a misplaced JSDoc', () => {
  assert.deepEqual(refusals('code.ts')['comments/no-code-comments'], [
    lineOf(CODE, 'refused: a line comment'),
    lineOf(CODE, 'refused: a block comment'),
    lineOf(CODE, 'refused: a JSDoc inside a body'),
    lineOf(CODE, 'eslint-disable-next-line'),
    lineOf(CODE, '@ts-ignore'),
    lineOf(CODE, 'refused: a JSDoc on a call'),
  ]);
  assert.deepEqual(refusals('jsx.tsx'), { 'comments/no-code-comments': [lineOf(JSX, 'refused: a comment in JSX')] });
});

test('REFUSED: comments/no-history-in-comments refuses a date, a stage, a card, a part and a round of a run, and how it was learned', () => {
  const refused = HISTORY.split('\n').flatMap((line, i) => (line.includes('refused:') ? [i + 1] : []));
  assert.equal(refused.length, 6);
  assert.deepEqual(refusals('history.ts'), {
    'comments/no-history-in-comments': refused,
    'no-warning-comments': [lineOf(HISTORY, 'learned by')],
  });
});

test('REFUSED: comments/no-deferral-in-comments refuses a temporary remedy and a thing left for now, not a temporary directory', () => {
  assert.deepEqual(refusals('deferral.ts'), {
    'comments/no-deferral-in-comments': [
      lineOf(DEFERRAL, 'a temporary fix'),
      lineOf(DEFERRAL, 'a temporary patch'),
      lineOf(DEFERRAL, 'left off for now'),
    ],
  });
});

test('REFUSED: no-warning-comments refuses a warning word anywhere in a JSDoc', () => {
  assert.deepEqual(refusals('warning.ts'), {
    'no-warning-comments': [lineOf(WARNING, 'refused: a contract,'), lineOf(WARNING, 'refused: a stopgap')],
  });
});

test('REFUSED: no-inline-comments refuses a comment after code, and lets a directive follow it', () => {
  assert.deepEqual(refusals('inline.ts'), { 'no-inline-comments': [lineOf(INLINE, 'refused: after code')] });
});

test('REFUSED: comments/no-wide-comment-lines refuses a wide comment line in each shape, and lets a wide line of code pass', () => {
  const afterCode = lineOf(WIDTH, 'a comment after code');
  const inJSX = lineOf(WIDTH, 'a comment in JSX');
  assert.deepEqual(refusals('width.tsx'), {
    'comments/no-wide-comment-lines': WIDE_LINES.map((needle) => lineOf(WIDTH, needle)),
    'comments/no-code-comments': [afterCode, inJSX],
    'no-inline-comments': [afterCode, inJSX],
  });
});

test("the plugin's width is oxfmt's print width", () => {
  const oxfmt = ts.parseConfigFileTextToJson('.oxfmtrc.json', fs.readFileSync(path.join(ROOT, '.oxfmtrc.json'), 'utf8'));
  assert.equal(oxfmt.error, undefined);
  assert.equal(COMMENT_WIDTH, (oxfmt.config as { printWidth: number }).printWidth);
});

/** Where the guard blocks do not cover the folders beside the packages in one block, after its package's glob, as the fix to make. */
function besideUnguarded(blocks: Block[]): string[] {
  const holding = blocks.filter((block) => BESIDE.some((glob) => block.files.includes(glob)));
  if (holding.length !== 1)
    return [`${BESIDE.join(' and ')} are in ${holding.length} guard blocks: list them all in one, after its package's glob`];
  return blocks.flatMap((block) => {
    const files = [`${packageOf(block)}/**`, ...(block === holding[0] ? BESIDE : [])];
    return JSON.stringify(block.files) === JSON.stringify(files)
      ? []
      : [`${packageOf(block)}'s block lists ${block.files.join(', ')}: make it ${files.join(', ')}`];
  });
}

test('there is one guard block per workspace package, each covering its package, and one also the folders beside them', () => {
  const blocks = guardBlocks(readConfig());
  assert.deepEqual(blocks.map(packageOf).sort(), workspacePackages(), 'a package has no guard block, or two, or a block names no package');
  assert.deepEqual(besideUnguarded(blocks), []);
});

test('REFUSED: the tooling beside the packages guarded by a second block, or left out of the one', () => {
  const blocks = guardBlocks(readConfig());
  const holder = blocks.find((block) => block.files.includes('tools/**'));
  assert.ok(holder, 'one block lists tools/** today');
  const second = blocks.map((block) =>
    block === holder || block !== blocks.find((b) => b !== holder) ? block : { ...block, files: [...block.files, 'tools/**'] },
  );
  assert.equal(besideUnguarded(second).length, 1, 'tools/** in a second block');
  const left = blocks.map((block) => (block === holder ? { ...block, files: block.files.filter((glob) => glob !== 'tools/**') } : block));
  assert.deepEqual(besideUnguarded(left), [
    `${packageOf(holder)}'s block lists ${packageOf(holder)}/**, lint/**: make it ${packageOf(holder)}/**, lint/**, tools/**`,
  ]);
});

test('no guard block has an excludeFiles', () => {
  assert.deepEqual(excludedBlocks(readConfig()), [], "these packages' guard blocks take files back out: every guard runs on every file");
});

test('REFUSED: a guard block with an excludeFiles is found', () => {
  const text = fs.readFileSync(path.join(ROOT, '.oxlintrc.json'), 'utf8');
  const line = '"files": ["apps/api/**"],';
  assert.equal(text.split(line).length, 2, `no one line ${line} in .oxlintrc.json`);
  assert.deepEqual(excludedBlocks(readConfig(text.replace(line, `${line} "excludeFiles": ["apps/api/**"],`))), ['apps/api']);
});

test('the linter skips the vendored folders, each one, and no folder of ours', () => {
  const config = readConfig();
  assert.deepEqual(strayIgnores(config), [], 'the linter is told to skip these: every guard runs on every file of ours');
  assert.deepEqual(config.ignorePatterns, VENDORED, 'the vendored folders the linter skips');
});

test('REFUSED: a folder of ours the linter is told to skip is found', () => {
  const text = fs.readFileSync(path.join(ROOT, '.oxlintrc.json'), 'utf8');
  const key = '"ignorePatterns": [';
  assert.equal(text.split(key).length, 2, `no one ${key} in .oxlintrc.json`);
  assert.deepEqual(strayIgnores(readConfig(text.replace(key, `${key}"apps/api/**", `))), ['apps/api/**']);
});

test('REFUSED: a file of ours beside the vendored folders is no vendored file', () => {
  assert.deepEqual(
    ['apps/web/src/components/ui/ds/components/Button.tsx', 'apps/web/.claude/skills/ds-spec/md3.mjs'].filter((file) => !vendored(file)),
    [],
  );
  assert.deepEqual(
    ['apps/web/src/components/ui/button.tsx', 'apps/web/src/components/ds.tsx', '.claude/skills/look/SKILL.md'].filter(vendored),
    [],
  );
});

/**
 * Every source file of ours git lists under packages/, apps/, lint/ and tools/, tracked or not yet added, that is on disk, from the root:
 * no generated route tree, and no file under a vendored folder.
 */
const sourceFiles = (): string[] =>
  execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'packages', 'apps', 'lint', 'tools'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split('\n')
    .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.gen.ts') && !vendored(file) && fs.existsSync(path.join(ROOT, file)));

/** `text` parsed as TypeScript, or as TSX where the file name says so. */
const parse = (file: string, text: string): ts.SourceFile =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

type Found = { line: number; text: string };

/** Every comment of a file, each once: the leading and trailing comments of every node and token of its syntax tree. */
function commentsOf(file: string, text: string): Found[] {
  const source = parse(file, text);
  const found = new Map<number, Found>();
  const add = (ranges: ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? []) {
      const { line } = source.getLineAndCharacterOfPosition(range.pos);
      found.set(range.pos, { line: line + 1, text: text.slice(range.pos, range.end) });
    }
  };
  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.JsxText) return;
    add(ts.getLeadingCommentRanges(text, node.pos));
    add(ts.getTrailingCommentRanges(text, node.end));
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  return [...found.values()].sort((a, b) => a.line - b.line);
}

/**
 * Each line of `text` that holds any part of a comment and is wider than 140 columns, measured whole in code points, indentation and code
 * before the comment included: `<file>:<line> is <n> columns`, each line once, in order.
 */
function wideCommentLines(file: string, text: string): string[] {
  const lines = text.split('\n');
  const held = new Set(commentsOf(file, text).flatMap(({ line, text: comment }) => comment.split('\n').map((_, i) => line + i)));
  return [...held]
    .sort((a, b) => a - b)
    .flatMap((line) => {
      const width = Array.from(lines[line - 1].replace(/\r$/, '')).length;
      return width > COMMENT_WIDTH ? [`${file}:${line} is ${width} columns`] : [];
    });
}

test('REFUSED: a line over 140 columns that holds a comment is found, in a JSDoc, a //, after code and in JSX; a wide code line is not', () => {
  const at = (needle: string) => `width.tsx:${lineOf(WIDTH, needle)} is ${COMMENT_WIDTH + 1} columns`;
  assert.deepEqual(wideCommentLines('width.tsx', WIDTH), WIDE_LINES.map(at));
});

test('no line that holds a comment, under packages/, apps/, lint/ and tools/, is over 140 columns', () => {
  const files = sourceFiles();
  const wide = files.flatMap((file) => wideCommentLines(file, fs.readFileSync(path.join(ROOT, file), 'utf8')));
  assert.deepEqual(wide, [], `rewrap these comments within ${COMMENT_WIDTH} columns: oxfmt rewraps none`);
  const folders = ['lint', 'tools', ...workspacePackages().flatMap((pkg) => [`${pkg}/src`, `${pkg}/test`])];
  assert.deepEqual(
    folders.filter((folder) => !files.some((file) => file.startsWith(`${folder}/`))),
    [],
    'the scan read no source file in these folders',
  );
});

/** A name a comment may quote: an identifier, a dotted path of them, with `()` after a call. */
const NAME = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\(\))?$/;

/** The extensions that make a quoted `name.ext` a file's name, not a path of names. */
const FILE_EXTENSIONS = /\.(?:ts|tsx|js|mjs|cjs|json|jsonc|md|yaml|yml|html|css|sh|txt|log|png|lock)$/;

/** The names a comment quotes in backticks, each split into the identifiers it is made of. */
function quotedNames(comment: string): string[][] {
  return [...comment.matchAll(/`([^`\n]+)`/g)]
    .map((match) => match[1])
    .filter((quoted) => NAME.test(quoted) && !FILE_EXTENSIONS.test(quoted))
    .map((quoted) => quoted.replace(/\(\)$/, '').split('.'));
}

/** Every name a piece of code has: its identifiers, private and JSX names included, and the words of its strings and templates. */
function namesOf(source: ts.SourceFile, into: Set<string>): Set<string> {
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) into.add(node.text.replace(/^#/, ''));
    else if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node))
      for (const word of node.text.match(/[A-Za-z_$][\w$]*/g) ?? []) into.add(word);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return into;
}

let known: Set<string> | undefined;
/**
 * Every name the repository's code has, from each source file under packages/, apps/, lint/ and tools/ but this one, whose fixtures
 * quote stale names.
 */
const knownNames = (): Set<string> =>
  (known ??= sourceFiles()
    .filter((file) => file !== SELF)
    .reduce((names, file) => namesOf(parse(file, fs.readFileSync(path.join(ROOT, file), 'utf8')), names), new Set<string>()));

/**
 * Other programs' words a comment may quote though the code never spells them, kept short: A2A's states, fields and SDK names; Claude
 * Code's options and settings; Playwright's; HTTP's; Linux's. A word the code comes to have is taken off (the test after the refusal).
 */
const OTHER_PROGRAMS = new Set([
  'UNSPECIFIED',
  'AUTH_REQUIRED',
  'TaskStore',
  'agentCardHandler',
  'crossSessionInbound',
  'claudeInChromeDefaultEnabled',
  '$CLAUDE_CONFIG_DIR',
  'dragTo',
  'Origin',
  'changeOrigin',
  'pid_max',
]);

/** Each quoted name in `file`'s comments that the code does not have, with its line. */
function staleNames(file: string, text: string, names: Set<string>): string[] {
  return commentsOf(file, text).flatMap(({ line, text: comment }) =>
    quotedNames(comment)
      .filter((parts) => parts.some((part) => !names.has(part) && !OTHER_PROGRAMS.has(part)))
      .map((parts) => `${file}:${line} quotes \`${parts.join('.')}\``),
  );
}

test('REFUSED: a comment that quotes a name the code does not have is found, in a JSDoc, a // and JSX', () => {
  const names = new Set(['documented', 'value', 'run', 'pruned', 'page']);
  const fixture = [
    '/** Calls `documented`, then `renderAgentFiles()`, reads `run.pruned` and `run.retiredBriefKey`, as `store.ts` says. */',
    'export function documented(value: number) {',
    '  // `renderedFor` is gone, and `AUTH_REQUIRED` is an A2A state, as `page.dragTo` is a Playwright call',
    '  return <div>{/* `lostName` */}</div>;',
    '}',
  ].join('\n');
  assert.deepEqual(staleNames('fixture.tsx', fixture, names), [
    'fixture.tsx:1 quotes `renderAgentFiles`',
    'fixture.tsx:1 quotes `run.retiredBriefKey`',
    'fixture.tsx:3 quotes `renderedFor`',
    'fixture.tsx:4 quotes `lostName`',
  ]);
});

test('the names comments were found quoting after the code dropped them are not names the code has', () => {
  const names = knownNames();
  assert.ok(names.has('readRun') && names.has('scratch'), 'the names were read from nothing');
  for (const stale of ['renderAgentFiles', 'renderedFor', 'retiredBriefKey']) assert.equal(names.has(stale), false, stale);
});

test("no word on the other programs' list is a name the code has already", () => {
  const names = knownNames();
  assert.deepEqual(
    [...OTHER_PROGRAMS].filter((word) => names.has(word)),
    [],
    'the code has these names: take them off OTHER_PROGRAMS',
  );
});

test('in every file a guard block covers, a name a comment quotes in backticks is one the code has', () => {
  const covered = guardBlocks(readConfig()).flatMap((block) => block.files.map((glob) => glob.replace(/\/\*\*$/, '')));
  const names = knownNames();
  const scanned = new Set<string>();
  const stale = sourceFiles()
    .filter((file) => covered.some((dir) => file.startsWith(`${dir}/`)))
    .flatMap((file) => {
      scanned.add(covered.find((dir) => file.startsWith(`${dir}/`)) ?? '');
      return staleNames(file, fs.readFileSync(path.join(ROOT, file), 'utf8'), names);
    });
  assert.deepEqual(stale, [], 'rename the quoted name to the one the code has, or reword the comment');
  assert.deepEqual([...scanned].sort(), [...covered].sort(), 'a folder a guard block covers had no source file to scan');
});
