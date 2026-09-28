/**
 * The root's `npm test` runs every package to its end, and `npm run typecheck` checks every package's tests.
 *
 * Turbo's default, `--continue=never`, interrupts every task still running when one fails, and `node --test`
 * reports each file it was in the middle of as failed — `✖ test/detached.test.ts`, *Promise resolution is still
 * pending but the event loop has already resolved*, with no failing test inside it. The package that failed is named
 * only on the summary's `Failed:` line, so without `--continue` a person reads the longest file of another package as
 * the failure.
 *
 * Each file under a package's `test/` is among the files of a tsconfig its `typecheck` script runs. A tsconfig that
 * includes `src` alone typechecks none of its tests: a test that reads a field moved under `config` asserts `undefined`
 * and passes, a harness's refusal handed a fence at a place it no longer reads passes as accepting it, and a test file
 * that declares one type twice goes unseen.
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

test("every file under each package's test/ is in a tsconfig the package's typecheck script runs", () => {
  const repo = path.join(import.meta.dirname, '..', '..', '..');
  const packages = ['packages', 'apps'].flatMap((top) => fs.readdirSync(path.join(repo, top)).map((name) => path.join(repo, top, name)));
  let seen = 0;
  for (const dir of packages) {
    const testDir = path.join(dir, 'test');
    if (!fs.existsSync(testDir)) continue;
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name: string; scripts: Record<string, string> };
    const checked = new Set(typecheckedBy(dir, pkg.scripts.typecheck ?? ''));
    const tests = (fs.readdirSync(testDir, { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => path.join(testDir, f));
    const unchecked = tests.filter((f) => !checked.has(f)).map((f) => path.relative(repo, f));
    assert.deepEqual(unchecked, [], `${pkg.name}'s typecheck (${pkg.scripts.typecheck}) leaves these out: include them in its tsconfig`);
    seen += tests.length;
  }
  assert.ok(seen > 100, `read ${seen} test files, far fewer than the workspace has`);
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
