/**
 * The README, held to the code.
 *
 * A README is read as a description of what exists, so a sentence naming an environment variable
 * nothing reads, a file that is not there, a verb `ae` does not have, or a hand-kept count of tests
 * or lines is a false claim, not a stale one. Each check below is first made to refuse a README that
 * says such a thing, then run against the real one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRIEF_KEYS } from '../src/cli/main.ts';

const pkg = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => fs.readFileSync(path.join(pkg, p), 'utf8');
/** Every file under `dirs`, in folders too, by its path from the package. */
const filesIn = (...dirs: string[]) =>
  dirs.flatMap((d) =>
    fs
      .readdirSync(path.join(pkg, d), { recursive: true, encoding: 'utf8' })
      .filter((f) => fs.statSync(path.join(pkg, d, f)).isFile())
      .map((f) => `${d}/${f.split(path.sep).join('/')}`),
  );
/** The source files under `dirs`: a test beside the code is left out, as the README names none. */
const sourceIn = (...dirs: string[]) => filesIn(...dirs).filter((f) => !f.endsWith('.test.ts'));
const unique = (xs: string[]) => [...new Set(xs)];

/** `AE_…` variables the README names that no code reads. */
const unreadEnv = (readme: string, code: string) =>
  unique(readme.match(/\bAE_[A-Z_]+\b/g) ?? []).filter((v) => !code.includes(`process.env.${v}`));

/** Package paths the README names, in backticks as it names its own files, that do not exist. */
const missingFiles = (readme: string, exists: (p: string) => boolean) =>
  unique([...readme.matchAll(/`((?:src|bin|test|docs)(?:\/[\w.-]+)+\.(?:ts|md))(?::[\d-]+)?`/g)].map((m) => m[1])).filter(
    (p) => !exists(p),
  );

/** The tables of the CLI whose keys are verbs: what the store keeps, and what is written to a session in flight. */
const TABLES = ['KEEPING', 'WRITING'];

/** The verbs the CLI's table `name` holds, by their keys: the slice from its name to the first `};` after it, none without it. */
const tableVerbs = (cli: string, name: string): string[] => {
  const at = cli.indexOf(`const ${name}`);
  if (at < 0) return [];
  return [...cli.slice(at, cli.indexOf('};', at)).matchAll(/^\s*([a-z]+):\s*(?:\w+,?|async \(.*)\s*$/gm)].map((m) => m[1]);
};

/** `ae <verb>` uses — at a line's start, after a backtick or a prompt — with no case in the CLI, nor a key of one of its `TABLES`. */
const unknownVerbs = (readme: string, cli: string) =>
  unique([...readme.matchAll(/(?:^|`|\$ )(?:ae|node bin\/ae\.ts) ([a-z]+)/gm)].map((m) => m[1])).filter(
    (verb) => !cli.includes(`case '${verb}'`) && !TABLES.some((name) => tableVerbs(cli, name).includes(verb)),
  );

/** Hand-kept counts of tests or lines: true the day they are written, and never again. */
const counts = (readme: string) => readme.match(/\b\d[\d,]*\s+(?:tests?|lines)\b/g) ?? [];

/** Source files the README never names: a new file is described, or the suite says so. */
const undocumented = (readme: string, files: string[]) => files.filter((f) => !readme.includes(`\`${f}\``));

/** Brief keys the README never names. */
const unnamedKeys = (readme: string, keys: readonly string[]) => keys.filter((k) => !readme.includes(`\`${k}\``));

test('each check refuses a README that says what the code does not', () => {
  const planted = [
    'Both are wired. `AE_RUNNER=sdk` swaps one for the other.',
    'See `src/nowhere.ts` and `docs/plan.md`.',
    '```bash',
    'ae frobnicate',
    'node bin/ae.ts start brief.md',
    '```',
    'npm test        # 25 tests, and `src/domain.ts` is 180 lines',
    'A brief takes `cwd` and `model`.',
  ].join('\n');
  const code = 'const root = process.env.AE_ROOT;';
  const cli =
    "case 'start':\nconst KEEPING = {\n  sweep: sweepBodies,\n};\nconst WRITING = {\n  say: sayTo,\n};\nconst other = {\n  frobnicate: x,\n};";
  assert.deepEqual(unreadEnv(planted, code), ['AE_RUNNER']);
  assert.deepEqual(
    missingFiles(planted, (p) => p === 'src/domain.ts'),
    ['src/nowhere.ts', 'docs/plan.md'],
  );
  assert.deepEqual(
    missingFiles('`src/gone.ts:12-30`', () => false),
    ['src/gone.ts'],
    'a line reference names its file too',
  );
  assert.deepEqual(
    missingFiles('`src/core/gone.ts` and `src/core/engine/memo.ts:4`', (p) => p === 'src/core/engine/memo.ts'),
    ['src/core/gone.ts'],
    'a path into a folder is read whole',
  );
  assert.deepEqual(unknownVerbs(planted, cli), ['frobnicate']);
  assert.deepEqual(unknownVerbs('`ae sweep`', cli), [], 'a key of the KEEPING table is a verb');
  assert.deepEqual(unknownVerbs('`ae say`', cli), [], 'and a key of the WRITING table');
  assert.deepEqual(unknownVerbs('`ae sweep` `ae say`', "case 'start':"), ['sweep', 'say'], 'and neither without its table');
  assert.deepEqual(counts(planted), ['25 tests', '180 lines']);
  assert.deepEqual(undocumented(planted, ['src/domain.ts', 'src/engine.ts']), ['src/engine.ts']);
  assert.ok(filesIn('test').includes('test/fixtures/decide-corpus.json'), 'the walk goes into folders');
  assert.ok(!sourceIn('test').includes('test/readme.test.ts'), 'and the source leaves tests out');
  assert.deepEqual(unnamedKeys(planted, ['cwd', 'model', 'tools']), ['tools']);
});

test('the README names no environment variable the code does not read', () => {
  const code = filesIn('src', 'bin', 'test')
    .filter((f) => f !== 'test/readme.test.ts')
    .map(read)
    .join('\n');
  assert.deepEqual(unreadEnv(read('README.md'), code), []);
});

test('the README names no file that does not exist, and every source file is in it', () => {
  const readme = read('README.md');
  assert.deepEqual(
    missingFiles(readme, (p) => fs.existsSync(path.join(pkg, p))),
    [],
  );
  assert.deepEqual(undocumented(readme, sourceIn('src', 'bin')), []);
});

test('the README uses no `ae` verb the CLI does not have, and names every key a brief has', () => {
  const readme = read('README.md');
  assert.deepEqual(unknownVerbs(readme, read('src/cli/main.ts')), []);
  assert.deepEqual(unnamedKeys(readme, BRIEF_KEYS), []);
});

test('the README keeps no count of tests or lines by hand', () => {
  assert.deepEqual(counts(read('README.md')), []);
});
