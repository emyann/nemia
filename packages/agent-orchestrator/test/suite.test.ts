/**
 * The root's `npm test` runs every package to its end, and `npm run typecheck` checks every package's tests.
 *
 * Turbo's default, `--continue=never`, interrupts every task still running when one fails, and `node --test`
 * reports each file it was in the middle of as failed — `✖ test/detached.test.ts`, *Promise resolution is still
 * pending but the event loop has already resolved*, with no failing test inside it. The package that failed is named
 * only on the summary's `Failed:` line, so without `--continue` a person reads the longest file of another package as
 * the failure.
 *
 * Each file under a package's `test/`, and each `*.test.ts` beside the code in its `src/`, is among the files of a
 * tsconfig its `typecheck` script runs, and a package's `test` script runs the tests beside its code. A tsconfig that
 * includes `src` alone typechecks none of its tests: a test that reads a field moved under `config` asserts `undefined`
 * and passes, a harness's refusal handed a fence at a place it no longer reads passes as accepting it, and a test file
 * that declares one type twice goes unseen.
 *
 * Each package's `test` script records what its tests cost when a run's check gives it `WF_ARTIFACTS` (`tools/test-costs/`): it loads
 * the probe into every test file's process, keeps the spec reporter on stdout, where a check's log and its `wf <word>: ` lines are read,
 * and adds the cost reporter on stderr.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

test("the root's test script lets every package finish when one fails, so a failure is reported where it is", () => {
  const root = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const words = root.scripts.test.split(/\s+/);
  assert.deepEqual(words.slice(0, 3), ['turbo', 'run', 'test'], root.scripts.test);
  assert.ok(
    words.includes('--continue') || words.includes('--continue=always'),
    `turbo stops every package at the first failure without --continue: ${root.scripts.test}`,
  );
});

test("every file under each package's test/, and every test beside its code in src/, is in a tsconfig the package's typecheck script runs", () => {
  const repo = path.join(import.meta.dirname, '..', '..', '..');
  const packages = ['packages', 'apps'].flatMap((top) => fs.readdirSync(path.join(repo, top)).map((name) => path.join(repo, top, name)));
  let seen = 0;
  for (const dir of packages) {
    const testDir = path.join(dir, 'test');
    if (!fs.existsSync(testDir)) continue;
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name: string; scripts: Record<string, string> };
    const checked = new Set(typecheckedBy(dir, pkg.scripts.typecheck ?? ''));
    const tests = [
      ...(fs.readdirSync(testDir, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(testDir, f)),
      ...testsBeside(dir),
    ];
    const unchecked = tests.filter((f) => !checked.has(f)).map((f) => path.relative(repo, f));
    assert.deepEqual(unchecked, [], `${pkg.name}'s typecheck (${pkg.scripts.typecheck}) leaves these out: include them in its tsconfig`);
    seen += tests.length;
  }
  assert.ok(seen > 100, `read ${seen} test files, far fewer than the workspace has`);
});

/** The tests beside the code in a package's `src/`, by absolute path. */
const testsBeside = (dir: string): string[] => {
  const src = path.join(dir, 'src');
  if (!fs.existsSync(src)) return [];
  return (fs.readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.test\.tsx?$/.test(f)).map((f) => path.join(src, f));
};

/** The glob a `test` script gives `node --test` for the tests beside the code, quoted so Node expands it and reaches nested folders. */
const BESIDE_GLOB = "'src/**/*.test.ts'";

/** Where a package with tests beside its code has a `test` script that does not run them. */
const unrunBeside = (name: string, script: string, beside: number): string[] =>
  beside && !script.split(/\s+/).includes(BESIDE_GLOB)
    ? [`${name} has ${beside} tests beside its code, and its test script (${script}) runs none: add ${BESIDE_GLOB} to it`]
    : [];

test('REFUSED: a package whose tests beside the code its test script does not run', () => {
  assert.deepEqual(unrunBeside('x', 'node --test test/*.test.ts', 2), [
    "x has 2 tests beside its code, and its test script (node --test test/*.test.ts) runs none: add 'src/**/*.test.ts' to it",
  ]);
  assert.equal(unrunBeside('x', 'node --test test/*.test.ts src/**/*.test.ts', 2).length, 1, 'unquoted, the shell stops at one folder');
  assert.deepEqual(unrunBeside('x', "node --test 'test/*.test.ts' 'src/**/*.test.ts'", 2), []);
  assert.deepEqual(unrunBeside('x', 'node --test test/*.test.ts', 0), [], 'a package with none needs no glob');
});

test("every package's test script runs the tests beside its code", () => {
  const repo = path.join(import.meta.dirname, '..', '..', '..');
  const packages = ['packages', 'apps'].flatMap((top) => fs.readdirSync(path.join(repo, top)).map((name) => path.join(repo, top, name)));
  assert.ok(testsBeside(path.join(import.meta.dirname, '..')).length > 0, "the scan finds the tests beside this package's code");
  const refused = packages.flatMap((dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name: string; scripts: Record<string, string> };
    return unrunBeside(pkg.name, pkg.scripts.test ?? '', testsBeside(dir).length);
  });
  assert.deepEqual(refused, []);
});

/** The flags a package's `test` script records its costs with, each one word, in the order a missing one is named. */
const RECORDING = [
  '--import=../../tools/test-costs/probe.ts',
  '--test-reporter=spec --test-reporter-destination=stdout',
  '--test-reporter=../../tools/test-costs/reporter.ts --test-reporter-destination=stderr',
];

/** What a package's `test` script lacks to record its tests' costs, each with the flags to add; none when it records them. */
const unrecorded = (name: string, script: string): string[] =>
  RECORDING.filter((flags) => !` ${script.trim().replace(/\s+/g, ' ')} `.includes(` ${flags} `)).map(
    (flags) => `${name}'s test script (${script}) does not record what its tests cost: add ${flags} to it`,
  );

test('REFUSED: a test script without the probe, the spec reporter on stdout, or the cost reporter', () => {
  const [probe, spec, costs] = RECORDING;
  const whole = `node ${probe} --test ${spec} ${costs} 'test/*.test.ts'`;
  assert.deepEqual(unrecorded('x', whole), []);
  assert.deepEqual(unrecorded('x', whole.replace(`${probe} `, '')), [
    `x's test script (${whole.replace(`${probe} `, '')}) does not record what its tests cost: add ${probe} to it`,
  ]);
  assert.deepEqual(
    unrecorded('x', whole.replace(`${spec} `, '')).map((line) => line.split(': add ')[1]),
    [`${spec} to it`],
    'the cost reporter alone takes the spec lines off stdout',
  );
  assert.deepEqual(
    unrecorded('x', whole.replace(`${costs} `, '')).map((line) => line.split(': add ')[1]),
    [`${costs} to it`],
  );
  assert.equal(unrecorded('x', whole.replace('destination=stderr', 'destination=stdout')).length, 1, 'the cost reporter writes to stderr');
});

test("every package's test script records what its tests cost", () => {
  const repo = path.join(import.meta.dirname, '..', '..', '..');
  const packages = ['packages', 'apps'].flatMap((top) => fs.readdirSync(path.join(repo, top)).map((name) => path.join(repo, top, name)));
  assert.ok(packages.length >= 4, `read ${packages.length} packages`);
  const refused = packages.flatMap((dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name: string; scripts: Record<string, string> };
    return unrecorded(pkg.name, pkg.scripts.test ?? '');
  });
  assert.deepEqual(refused, []);
});

/** Every file the tsconfigs named by a `typecheck` script (`tsc --noEmit`, `tsc --noEmit -p <dir or file>`, joined by `&&`) check. */
function typecheckedBy(dir: string, script: string): string[] {
  return script.split('&&').flatMap((command) => {
    const words = command.trim().split(/\s+/);
    if (words[0] !== 'tsc') return [];
    const project = words.includes('-p') ? words[words.indexOf('-p') + 1] : '.';
    const file = project.endsWith('.json') ? path.join(dir, project) : path.join(dir, project, 'tsconfig.json');
    const read = ts.readConfigFile(file, (f) => ts.sys.readFile(f));
    assert.equal(read.error, undefined, `${file} does not parse`);
    return ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(file)).fileNames.map((f) => path.resolve(f));
  });
}
