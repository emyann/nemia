/**
 * `.oxlintrc.fast.json`, which `npm run lint:fast` runs, is `.oxlintrc.json` with the type-aware rules left out, and nothing else.
 *
 * Two holds. The file itself: it takes its rules, plugins and overrides from `.oxlintrc.json` by `extends` and says no rule of its
 * own, its options are the first's with `typeAware` false, and its ignore patterns, which `extends` does not carry, are the first's.
 * And what oxlint makes of both: run on the same fixture, a scratch tree with the repository's two configs and a tsconfig, the fast
 * one reports exactly what the whole one does but the diagnostics of the rules oxlint lists as type-aware, of which the fixture
 * breaks some, so the hold is not met by two configs that both report nothing.
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
import { scratch } from 'test-kit/scratch';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const BIN = path.join(ROOT, 'node_modules', '.bin');
const FULL = '.oxlintrc.json';
const FAST = '.oxlintrc.fast.json';

type Block = { files: string[]; rules: Record<string, unknown> };
type Config = {
  overrides?: Block[];
  [key: string]: unknown;
  options?: Record<string, unknown>;
  ignorePatterns?: string[];
  jsPlugins?: { name: string; specifier: string }[];
};

/** A config's text read as oxlint reads it: JSON with comments. */
const parse = (text: string, name: string): Config => {
  const parsed = ts.parseConfigFileTextToJson(name, text);
  if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
  return parsed.config as Config;
};

const read = (name: string): string => fs.readFileSync(path.join(ROOT, name), 'utf8');

/** The folder of the first override block that refuses `x!`, taken from the whole config: the fixture's source lies there. */
const guarded = (): string => {
  const block = (parse(read(FULL), FULL).overrides ?? []).find((each) => 'typescript/no-non-null-assertion' in each.rules);
  assert.ok(block, `no override block of ${FULL} sets typescript/no-non-null-assertion: give the fixture another override to break`);
  return block.files[0].replace(/\/\*\*$/, '');
};

/** The keys the fast config may hold: what `extends` does not carry, and the one option it changes. */
const OWN = ['$schema', 'extends', 'options', 'ignorePatterns'];

/** What makes `fast` more or less than `full` without its type-aware rules, one line each; none when it is only that. */
const drift = (full: Config, fast: Config): string[] => [
  ...Object.keys(fast)
    .filter((key) => !OWN.includes(key))
    .map((key) => `${FAST} sets "${key}": take it out, and set it in ${FULL}, which ${FAST} extends`),
  ...(JSON.stringify(fast.extends) === JSON.stringify([`./${FULL}`]) ? [] : [`${FAST}'s "extends" is not ["./${FULL}"]`]),
  ...(JSON.stringify(fast.options) === JSON.stringify({ ...full.options, typeAware: false })
    ? []
    : [`${FAST}'s "options" are not ${FULL}'s with "typeAware": false`]),
  ...(JSON.stringify(fast.ignorePatterns) === JSON.stringify(full.ignorePatterns)
    ? []
    : [`${FAST}'s "ignorePatterns" are not ${FULL}'s: copy them, as "extends" does not carry them`]),
];

/** The rules oxlint lists as type-aware, as its diagnostics name them: `typescript(no-floating-promises)`. */
const typeAware = (): Set<string> => {
  const rules = JSON.parse(execFileSync(path.join(BIN, 'oxlint'), ['--rules', '-f', 'json'], { encoding: 'utf8' })) as {
    scope: string;
    value: string;
    type_aware: boolean;
  }[];
  return new Set(rules.filter((rule) => rule.type_aware).map((rule) => `${rule.scope}(${rule.value})`));
};

/**
 * A fixture that breaks a type-aware rule, a rule of the top level, a rule an override sets for one folder, the comment
 * plugin's rule, and one under an ignore pattern, in a scratch tree beside the whole config (its plugins made absolute) and `fastText`.
 */
const tree = (fastText: string): string => {
  const dir = scratch('lint-fast-');
  const full = parse(read(FULL), FULL);
  const require = createRequire(path.join(ROOT, 'package.json'));
  const jsPlugins = (full.jsPlugins ?? []).map((entry) => ({
    ...entry,
    specifier: entry.specifier.startsWith('.') ? path.join(ROOT, entry.specifier) : require.resolve(entry.specifier),
  }));
  fs.writeFileSync(path.join(dir, FULL), JSON.stringify({ ...full, $schema: undefined, jsPlugins }));
  fs.writeFileSync(path.join(dir, FAST), fastText);
  fs.writeFileSync(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, module: 'nodenext', target: 'esnext', noEmit: true }, include: ['**/*.ts'] }),
  );
  const source = path.join(dir, guarded());
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(
    path.join(source, 'a.ts'),
    [
      'async function wait(): Promise<void> {}',
      'export function first(list: number[]): number {',
      '  wait();',
      '  debugger;',
      '  // read the first one',
      '  return [...list].sort()[0]!;',
      '}',
      '',
    ].join('\n'),
  );
  const ignored = path.join(dir, 'apps', 'web', 'src');
  fs.mkdirSync(ignored, { recursive: true });
  fs.writeFileSync(path.join(ignored, 'routeTree.gen.ts'), 'debugger;\n');
  return dir;
};

/**
 * What oxlint reports over `dir` with `config`, each `file:line code severity`, sorted: a rule the fast config carried as a warning
 * would let `npm run lint:fast` exit 0 where `npm run lint` exits 1, so the severity is compared with the rest.
 */
const lint = (dir: string, config: string): string[] => {
  const ran = spawnSync(path.join(BIN, 'oxlint'), ['-c', config, '-f', 'json', '.'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, OXLINT_TSGOLINT_PATH: path.join(BIN, 'tsgolint') },
  });
  assert.equal(ran.signal, null, `oxlint was stopped by ${ran.signal}: ${ran.stderr}`);
  assert.ok(ran.status === 0 || ran.status === 1, `oxlint exited ${ran.status}: ${ran.stderr}${ran.stdout}`);
  const report = JSON.parse(ran.stdout) as {
    diagnostics: { code: string; severity: string; filename: string; labels: { span: { line: number } }[] }[];
  };
  return report.diagnostics.map((d) => `${d.filename}:${d.labels[0].span.line} ${d.code} ${d.severity}`).sort();
};

/** Each diagnostic the whole config reports but the type-aware ones, that the fast one does not, and each it adds, one line each. */
const unlike = (dir: string, aware: Set<string>): string[] => {
  const whole = lint(dir, FULL).filter((line) => !aware.has(line.split(' ')[1]));
  const fast = lint(dir, FAST);
  return [
    ...whole.filter((line) => !fast.includes(line)).map((line) => `${FAST} misses ${line}`),
    ...fast.filter((line) => !whole.includes(line)).map((line) => `${FAST} adds ${line}`),
  ];
};

test('the fast config extends the whole one, turns type-aware linting off, repeats its ignore patterns and says nothing else', () => {
  assert.deepEqual(drift(parse(read(FULL), FULL), parse(read(FAST), FAST)), []);
});

test('the fast config reports what the whole one does, but the type-aware rules', () => {
  const aware = typeAware();
  const dir = tree(read(FAST));
  const whole = lint(dir, FULL);
  const codes = new Set(whole.map((line) => line.split(' ')[1]));
  for (const code of [
    'typescript(no-floating-promises)',
    'eslint(no-debugger)',
    'typescript(no-non-null-assertion)',
    'comments(no-code-comments)',
  ])
    assert.ok(codes.has(code), `the fixture no longer breaks ${code} under ${FULL}: ${whole.join(', ')}`);
  assert.ok(aware.has('typescript(no-floating-promises)'), 'oxlint no longer lists no-floating-promises as type-aware');
  assert.ok(!whole.some((line) => line.startsWith('apps/')), `${FULL} lints a file its ignore patterns skip: ${whole.join(', ')}`);
  assert.ok(
    lint(dir, FAST).includes(`${guarded()}/a.ts:4 eslint(no-debugger) error`),
    `${FAST} does not refuse the fixture's debugger as an error, as ${FULL}'s "categories" say: does "extends" still carry them?`,
  );
  assert.deepEqual(unlike(dir, aware), []);
});

test('REFUSED: a fast config that turns a rule off of its own', () => {
  const key = '"options": {';
  const text = read(FAST);
  assert.equal(text.split(key).length, 2, `no one ${key} in ${FAST}`);
  const drifted = text.replace(key, `"rules": { "no-debugger": "off" },\n  ${key}`);
  assert.equal(drift(parse(read(FULL), FULL), parse(drifted, FAST)).length, 1);
  assert.deepEqual(unlike(tree(drifted), typeAware()), [`${FAST} misses ${guarded()}/a.ts:4 eslint(no-debugger) error`]);
});

test('REFUSED: a fast config that holds a rule as a warning where the whole one refuses it', () => {
  const key = '"options": {';
  const drifted = read(FAST).replace(key, `"rules": { "no-debugger": "warn" },\n  ${key}`);
  assert.deepEqual(unlike(tree(drifted), typeAware()), [
    `${FAST} misses ${guarded()}/a.ts:4 eslint(no-debugger) error`,
    `${FAST} adds ${guarded()}/a.ts:4 eslint(no-debugger) warning`,
  ]);
});
