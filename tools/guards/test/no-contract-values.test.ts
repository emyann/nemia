/**
 * No shipped source imports a value from a contract. A module under a package's `contracts/` imports `@emyann/tsverify` at its top, so a
 * value read from one (a list, a constant, a helper) loads the verifier when the code runs, and an install that carries production
 * dependencies alone — the release archive — fails at its first command. A contract's types are erased by `import type` and `export type`
 * alone, and pass; braces of `type` names only (`import { type X }`) are not: under `verbatimModuleSyntax`, and in Node's type
 * stripping, that statement stays as `import {} from …`, which still loads the module, so it is refused as a value. A value the code and
 * the contract share lives in `src` and the contract imports it from there.
 * `tools/guards/test/no-shipped-verifier.test.ts` holds the other half: the verifier in no workspace's dependencies or `src`.
 *
 * Refused here: an import or re-export that is not erased, a dynamic `import()` or a `require` of a module under `contracts/` (or named
 * `*.contract.ts`), in any file under a workspace's `src/` that is not a test.
 *
 * The test reads files outside this package: after a change elsewhere, `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { specifiersIn, withoutComments } from 'test-kit/imports';
import { REPO, workspaces } from 'test-kit/repo';

/** Whether `spec` names a contract's module: one under a `contracts/` folder, or a file named `*.contract.ts`. */
const isContract = (spec: string): boolean => /(^|\/)contracts\//.test(spec) || /\.contract(\.[cm]?[jt]sx?)?$/.test(spec);

/**
 * Each `import … from` and `export … from` of `text`, outside its comments, and whether it is erased as it runs: only where the statement
 * itself says `type` (`import type`, `export type`), never by the braces' members alone.
 */
const statementsOf = (text: string): { spec: string; erased: boolean }[] =>
  [...withoutComments(text).matchAll(/^\s*(?:import|export)\s+(type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)].map((m) => ({
    spec: m[2] ?? '',
    erased: Boolean(m[1]),
  }));

/** What a refusal says to do instead. */
const FIX =
  'import its types alone (`import type`), and move a value the code and the contract share into src, the contract importing it from there';

/** `file`, holding `text`, as a sentence per contract it reads a value of, naming the fix; nothing where it reads only types. */
const contractValuesIn = (file: string, text: string): string[] => {
  const values = statementsOf(text)
    .filter((one) => !one.erased && isContract(one.spec))
    .map((one) => one.spec);
  const called = specifiersIn(withoutComments(text), { calls: ['import', 'require'], closed: true }).filter(
    (spec) => isContract(spec) && !statementsOf(text).some((one) => one.spec === spec),
  );
  return [...new Set([...values, ...called])].map(
    (spec) => `${file} reads a value of ${spec}, which loads the verifier when it runs: ${FIX}`,
  );
};

/** Every source file under `dir` that ships, by path from the root: no test, no `node_modules`. */
const shipped = (dir: string): string[] => {
  const at = path.join(REPO, dir);
  if (!fs.existsSync(at)) return [];
  return fs
    .readdirSync(at, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.test\.[cm]?[jt]sx?$/.test(entry.name))
    .map((entry) => path.relative(REPO, path.join(entry.parentPath, entry.name)))
    .filter((file) => !file.split(path.sep).includes('node_modules'));
};

test("no file under a workspace's src/ reads a value of a contract", () => {
  const files = workspaces().flatMap((dir) => shipped(path.join(dir, 'src')));
  assert.ok(files.length > 100, `read ${files.length} source files, fewer than the workspaces hold`);
  const refused = files.flatMap((file) => contractValuesIn(file, fs.readFileSync(path.join(REPO, file), 'utf8')));
  assert.deepEqual(refused, []);
});

test('REFUSED: a source that imports a value of a contract, re-exports one, loads one at run time, or keeps a contract loaded by braces of types alone', () => {
  for (const planted of [
    "import { READ_VERBS } from '../contracts/route.contract.ts';\n",
    "import { type RouteOf, READ_VERBS } from '../contracts/route.contract.ts';\n",
    "import { type RouteOf } from '../contracts/route.contract.ts';\n",
    "export { READ_VERBS } from '../contracts/route.contract.ts';\n",
    "const route = await import('../contracts/route.contract.ts');\n",
  ])
    assert.equal(contractValuesIn('apps/cli/src/route.ts', planted).length, 1, planted);
});

test("a contract's types pass, and a comment that quotes an import is none", () => {
  for (const passing of [
    "import type { RouteOf } from '../contracts/route.contract.ts';\n",
    "import type {\n  A,\n  B,\n} from '../../contracts/budget.contract.ts';\n",
    "export type { Route } from '../contracts/route.contract.ts';\n",
    "// import { READ_VERBS } from '../contracts/route.contract.ts';\n",
    "import { READ_VERBS } from './route.ts';\n",
  ])
    assert.deepEqual(contractValuesIn('apps/cli/src/main.ts', passing), [], passing);
});
