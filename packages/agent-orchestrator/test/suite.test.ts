/**
 * The root's `npm test` runs every package to its end.
 *
 * Turbo's default, `--continue=never`, interrupts every task still running when one fails, and `node --test`
 * reports each file it was in the middle of as failed — `✖ test/detached.test.ts`, *Promise resolution is still
 * pending but the event loop has already resolved*, with no failing test inside it. The package that failed is named
 * only on the summary's `Failed:` line, so a person reads the longest file of another package as the failure: three
 * checks did, blaming `detached.test.ts` for a flaky assertion in `meter-store.test.ts` and a real one in the api.
 *
 * And `npm run typecheck` checks every package's tests (the second test).
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
  const words = root.scripts.test!.split(/\s+/);
  assert.deepEqual(words.slice(0, 3), ['turbo', 'run', 'test'], root.scripts.test);
  assert.ok(
    words.includes('--continue') || words.includes('--continue=always'),
    `turbo stops every package at the first failure without --continue: ${root.scripts.test}`,
  );
});

/**
 * `npm run typecheck` checks every package's tests.
 *
 * The orchestrator's, the api's and the web's tsconfigs once included `src` alone, so nothing typechecked their tests:
 * a test that read a field moved under `config` asserted `undefined` and passed, a harness's refusal handed a fence at
 * a place it no longer reads passed as accepting it, and `apps/web/test/components.test.ts` declared one type twice.
 * Each file under a package's `test/` is among the files of a tsconfig its `typecheck` script runs.
 */
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
    const project = words.includes('-p') ? words[words.indexOf('-p') + 1]! : '.';
    const file = project.endsWith('.json') ? path.join(dir, project) : path.join(dir, project, 'tsconfig.json');
    const read = ts.readConfigFile(file, (f) => ts.sys.readFile(f));
    assert.equal(read.error, undefined, `${file} does not parse`);
    return ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(file)).fileNames.map((f) => path.resolve(f));
  });
}
