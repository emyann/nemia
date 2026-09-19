/**
 * The README, held to the code, after the engine's: each check is first made to refuse a README that says what the code
 * does not, then run against the real one. And the sentences the owner asked for are there: the judge is optional,
 * never in a tick, and TypeSafe's retention terms are unread.
 */
import './hermetic.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pkg = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(pkg, p), 'utf8');
const filesIn = (...dirs: string[]) => dirs.flatMap((d) => fs.readdirSync(path.join(pkg, d)).map((f) => `${d}/${f}`));
const unique = (xs: string[]) => [...new Set(xs)];

/** Variables the README names that the source never reads and no test sets to show it is ignored. */
const unreadEnv = (readme: string, src: string, tests: string) =>
  unique(readme.match(/\b(?:TYPESAFE|WF)_[A-Z_]+\b/g) ?? []).filter((v) => !src.includes(`env.${v}`) && !src.includes(`'${v}'`) && !tests.includes(v));

/** Package paths the README names, in backticks, that do not exist. */
const missingFiles = (readme: string, exists: (p: string) => boolean) =>
  unique([...readme.matchAll(/`((?:src|bin|test)\/[\w.-]+\.ts)`/g)].map((m) => m[1]!)).filter((p) => !exists(p));

/** `judge <verb>` uses with no case in the command. */
const unknownVerbs = (readme: string, cli: string) =>
  unique([...readme.matchAll(/(?:^|`|\$ )judge ([a-z]+)/gm)].map((m) => m[1]!)).filter((verb) => !cli.includes(`case '${verb}'`));

/** Hand-kept counts of tests or lines. */
const counts = (readme: string) => readme.match(/\b\d[\d,]*\s+(?:tests?|lines)\b/g) ?? [];

/** Files the README never names. */
const undocumented = (readme: string, files: string[]) => files.filter((f) => !readme.includes(`\`${f}\``));

/** The sentences the owner asked for, and whether each is there. */
const REQUIRED = [
  /^## Optional$/m,
  /The package is optional\./,
  /Every question reads\s+`unsure`/,
  /nothing in the workspace imports it/,
  /list the judge among the agents, shown as off until a key is present/,
  /^## Never in a tick$/m,
  /Nothing in a tick, in `assess`, in `wf decide` or in any gate calls the judge\./,
  /key is kept out of `wf up`'s environment/,
  /exactly what the caller put in `state`, plus the questions, and nothing else/,
  /\*\*TypeSafe's retention terms have not been read by this project\.\*\*/,
  /\*\*have not been measured on held-out cards\.\*\*/,
];
const absent = (readme: string) => REQUIRED.filter((r) => !r.test(readme)).map(String);

test('each check refuses a README that says what the code does not', () => {
  const planted = [
    'Set `TYPESAFE_TIMEOUT` to wait longer, and `WF_ROOT` to move the record.',
    'See `src/nowhere.ts` and `src/key.ts`.',
    '$ judge frobnicate',
    '`judge card x.md`',
    'npm test   # 61 tests; `src/judge.ts` is 300 lines',
  ].join('\n');
  assert.deepEqual(unreadEnv(planted, 'const r = env.WF_ROOT;', ''), ['TYPESAFE_TIMEOUT']);
  assert.deepEqual(unreadEnv('`TYPESAFE_BASE_URL` is ignored', '', "env: { TYPESAFE_BASE_URL: 'x' }"), [], 'a test shows it ignored');
  assert.deepEqual(missingFiles(planted, (p) => p === 'src/key.ts' || p === 'src/judge.ts'), ['src/nowhere.ts']);
  assert.deepEqual(unknownVerbs(planted, "case 'card':"), ['frobnicate']);
  assert.deepEqual(counts(planted), ['61 tests', '300 lines']);
  assert.deepEqual(undocumented(planted, ['src/key.ts', 'src/record.ts']), ['src/record.ts']);
  assert.equal(absent(planted).length, REQUIRED.length);
});

test('the README names no variable the code does not read', () => {
  const src = filesIn('src', 'bin').map(read).join('\n');
  const tests = filesIn('test').filter((f) => f !== 'test/readme.test.ts').map(read).join('\n');
  assert.deepEqual(unreadEnv(read('README.md'), src, tests), []);
});

test('the README names no file that does not exist, and every source and test file is in it', () => {
  const readme = read('README.md');
  assert.deepEqual(missingFiles(readme, (p) => fs.existsSync(path.join(pkg, p))), []);
  assert.deepEqual(undocumented(readme, filesIn('src', 'bin', 'test').filter((f) => f.endsWith('.ts'))), []);
});

test('the README uses no verb the command does not have, and keeps no count by hand', () => {
  assert.deepEqual(unknownVerbs(read('README.md'), read('src/cli.ts')), []);
  assert.deepEqual(counts(read('README.md')), []);
});

test('the README says the judge is optional, never in a tick, what is sent, and that retention terms are unread', () => {
  assert.deepEqual(absent(read('README.md')), []);
});
