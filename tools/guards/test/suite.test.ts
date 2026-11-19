/**
 * The root's `npm test` runs every package to its end, and `npm run typecheck` checks every package's tests.
 *
 * Turbo's default, `--continue=never`, interrupts every task still running when one fails, and the runner
 * reports each file it was in the middle of as failed, with no failing test inside it. The package that failed is named
 * only on the summary's `Failed:` line, so without `--continue` a person reads the longest file of another package as
 * the failure.
 *
 * Each file under a package's `test/`, and each `*.test.ts` beside the code in its `src/`, is among the files of a
 * tsconfig its `typecheck` script runs, and a package's Vitest config runs the tests beside its code. A tsconfig that
 * includes `src` alone typechecks none of its tests: a test that reads a field moved under `config` asserts `undefined`
 * and passes, a harness's refusal handed a fence at a place it no longer reads passes as accepting it, and a test file
 * that declares one type twice goes unseen.
 *
 * Each package's Vitest config bounds how many test files run at once, the same `maxWorkers: <n>` in each:
 * unbounded, a suite runs about as many processes as the machine has cores in every package, and several suites at once swap.
 *
 * A package here is each workspace the root `package.json` names (`workspaces` of `test-kit/repo`): `tools/guards`, the home of the
 * repository's own guards, is held as every package is.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { REPO, suiteOf, workspaces } from 'test-kit/repo';
import { scratch } from 'test-kit/scratch';

test("the workspaces are the root package.json's: a dir/* glob as its folders with a package.json, a folder as it is", () => {
  assert.ok(workspaces().includes('tools/guards'), 'the sweeps below read the home of the guards');
  assert.ok(workspaces().includes('packages/agent-orchestrator'));
  const root = scratch('wf-workspaces-');
  for (const dir of ['packages/b', 'packages/a', 'packages/notes', 'tools/guards']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  for (const dir of ['packages/b', 'packages/a']) fs.writeFileSync(path.join(root, dir, 'package.json'), '{}');
  const plant = (globs: string[]) => fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: globs }));
  plant(['tools/guards', 'packages/*', 'apps/*']);
  assert.deepEqual(workspaces(root), ['tools/guards', 'packages/a', 'packages/b']);
  plant(['packages/**']);
  assert.throws(() => workspaces(root), /dir\/\*/, 'REFUSED: a glob it does not read, which a sweep would read as nothing');
});

test("the root's test script lets every package finish when one fails, so a failure is reported where it is", () => {
  const root = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')) as {
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
  const packages = workspaces().map((dir) => path.join(REPO, dir));
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
    const unchecked = tests.filter((f) => !checked.has(f)).map((f) => path.relative(REPO, f));
    assert.deepEqual(unchecked, [], `${pkg.name}'s typecheck (${pkg.scripts.typecheck}) leaves these out: include them in its tsconfig`);
    seen += tests.length;
  }
  assert.ok(seen > 100, `read ${seen} test files, far fewer than the workspace has`);
});

/** The tests beside the code in a package's `src/`, by absolute path. */
const testsBeside = (dir: string) => {
  const src = path.join(dir, 'src');
  if (!fs.existsSync(src)) return [];
  return (fs.readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.test\.tsx?$/.test(f)).map((f) => path.join(src, f));
};

/** The glob a Vitest config's `include` names for the tests beside the code, reaching nested folders. */
const BESIDE_GLOB = 'src/**/*.test.ts';

/** Where a package with tests beside its code has a Vitest config whose `include` does not run them. */
const unrunBeside = (name: string, include: string[], beside: number) =>
  beside && !include.includes(BESIDE_GLOB)
    ? [
        `${name} has ${beside} tests beside its code, and its Vitest config's include (${include.join(', ')}) runs none: add '${BESIDE_GLOB}' to it`,
      ]
    : [];

test('REFUSED: a package whose tests beside the code its Vitest config does not run', () => {
  assert.equal(unrunBeside('x', ['test/*.test.ts'], 2).length, 1);
  assert.equal(unrunBeside('x', ['test/*.test.ts', 'src/*.test.ts'], 2).length, 1, 'one folder deep, it misses the nested ones');
  assert.deepEqual(unrunBeside('x', ['test/*.test.ts', 'src/**/*.test.ts'], 2), []);
  assert.deepEqual(unrunBeside('x', ['test/*.test.ts'], 0), [], 'a package with none needs no glob');
});

test("every package's Vitest config runs the tests beside its code", () => {
  const packages = workspaces().map((dir) => path.join(REPO, dir));
  assert.ok(
    testsBeside(path.join(REPO, 'packages', 'agent-orchestrator')).length > 0,
    "the scan finds the tests beside the orchestrator's code",
  );
  const refused = packages.flatMap((dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name: string };
    return unrunBeside(pkg.name, suiteOf(dir)?.include ?? [], testsBeside(dir).length);
  });
  assert.deepEqual(refused, []);
});

/**
 * Where packages' suites run their files unbounded: each package with a `test` script whose Vitest config gives no `maxWorkers` of one
 * or more, and every package when their bounds differ. A package with no `test` script has nothing to bound.
 */
const unbounded = (suites: { name: string; script: string; maxWorkers: number | null }[]) => {
  const run = suites.filter((s) => s.script);
  const missing = run
    .filter((s) => s.maxWorkers === null || s.maxWorkers < 1)
    .map(
      (s) =>
        `${s.name}'s Vitest config runs as many test files at once as the machine has cores: ` +
        'give it maxWorkers: <n>, the n every other package uses',
    );
  const given = run.filter((s) => s.maxWorkers !== null && s.maxWorkers >= 1);
  const differ =
    new Set(given.map((s) => s.maxWorkers)).size > 1
      ? [
          `the packages' Vitest configs bound their files differently (${given.map((s) => `${s.name} ${s.maxWorkers}`).join(', ')}): give each the same n`,
        ]
      : [];
  return [...missing, ...differ];
};

test('REFUSED: a package whose Vitest config runs its files unbounded, or bounded apart from the others', () => {
  assert.equal(unbounded([{ name: 'x', script: 'vitest run', maxWorkers: null }]).length, 1, 'no bound');
  assert.equal(unbounded([{ name: 'x', script: 'vitest run', maxWorkers: 0 }]).length, 1, 'a bound below one');
  assert.equal(
    unbounded([
      { name: 'x', script: 'vitest run', maxWorkers: 2 },
      { name: 'y', script: 'vitest run', maxWorkers: 3 },
    ]).length,
    1,
    'two bounds',
  );
  assert.deepEqual(
    unbounded([
      { name: 'x', script: 'vitest run', maxWorkers: 3 },
      { name: 'y', script: 'vitest run --shard=1/2', maxWorkers: 3 },
      { name: 'z', script: '', maxWorkers: null },
    ]),
    [],
  );
});

test("every package's Vitest config bounds how many test files run at once, the same bound in each", () => {
  const suites = workspaces().map((dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, dir, 'package.json'), 'utf8')) as {
      name: string;
      scripts: Record<string, string>;
    };
    return { name: pkg.name, script: pkg.scripts.test ?? '', maxWorkers: suiteOf(path.join(REPO, dir))?.maxWorkers ?? null };
  });
  assert.ok(
    suites.some((s) => s.name === 'guards'),
    "the sweep reads tools/guards, the repository's own guards, as a package",
  );
  assert.ok(suites.filter((s) => s.script).length >= 4, `read ${suites.length} packages' test scripts, fewer than the workspace has`);
  assert.deepEqual(unbounded(suites), []);
});

/** Every file the tsconfigs named by a `typecheck` script (`tsrs --noEmit`, `tsrs --noEmit -p <dir or file>`, joined by `&&`) check. */
function typecheckedBy(dir: string, script: string) {
  return script.split('&&').flatMap((command) => {
    const words = command.trim().split(/\s+/);
    if (words[0] !== 'tsrs') return [];
    const project = words.includes('-p') ? words[words.indexOf('-p') + 1] : '.';
    const file = project.endsWith('.json') ? path.join(dir, project) : path.join(dir, project, 'tsconfig.json');
    const read = ts.readConfigFile(file, (f) => ts.sys.readFile(f));
    assert.equal(read.error, undefined, `${file} does not parse`);
    return ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(file)).fileNames.map((f) => path.resolve(f));
  });
}
