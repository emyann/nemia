/**
 * The packages whose source is under `noUncheckedIndexedAccess`, held there. TypeScript types `arr[i]` and `record[key]` as always
 * present unless the flag is on, and `x!` puts the hole back: so each package in `CHECKED` has the flag in its main tsconfig, keeps every
 * non-test file of its `src/` and `bin/` in that config (a file moved to the tests' config, which leaves the flag off, escapes it), and
 * has a block of `.oxlintrc.json` refusing a non-null assertion over that source. A package joins `CHECKED` in the card that turns the
 * flag on for it.
 *
 * The test reads files outside this package. `turbo.json` makes `.oxlintrc.json` and the runtime's files inputs of this package's tests;
 * after a change anywhere else, `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** The packages under the flag, by their folder from the repository's root. */
const CHECKED = ['packages/agent-runtime'];

const RULE = 'typescript/no-non-null-assertion';

type Block = { files: string[]; excludeFiles?: string[]; rules: Record<string, unknown> };
type Lint = { overrides: Block[] };

/** What a package gives the guard: its main tsconfig's parsed options and files, and the non-test files of its source. */
type Package = { dir: string; options: ts.CompilerOptions; fileNames: string[]; source: string[] };

/** Why each package is not held under the flag and the rule, one line a reason; none when every one is. */
function refusals(packages: Package[], lint: Lint): string[] {
  return packages.flatMap((pkg) => {
    const out: string[] = [];
    if (pkg.options.noUncheckedIndexedAccess !== true)
      out.push(
        `${pkg.dir}/tsconfig.json does not set noUncheckedIndexedAccess: add "noUncheckedIndexedAccess": true to its compilerOptions`,
      );
    const checked = new Set(pkg.fileNames);
    for (const file of pkg.source.filter((f) => !checked.has(f)))
      out.push(`${file} is left out of ${pkg.dir}/tsconfig.json, so the flag does not read it: take it out of that config's exclude`);
    const last = lint.overrides.filter((block) => RULE in block.rules && block.files.includes(`${pkg.dir}/src/**`)).at(-1);
    const level = Array.isArray(last?.rules[RULE]) ? (last.rules[RULE] as unknown[])[0] : last?.rules[RULE];
    if (last === undefined || level !== 'error' || !last.files.includes(`${pkg.dir}/bin/**`))
      out.push(
        `.oxlintrc.json does not refuse a non-null assertion in ${pkg.dir}: add a block setting "${RULE}": "error" on its src/** and bin/**`,
      );
    return out;
  });
}

/** `.oxlintrc.json`, read as oxlint reads it: JSON with comments. */
function readLint(): Lint {
  const parsed = ts.parseConfigFileTextToJson('.oxlintrc.json', fs.readFileSync(path.join(ROOT, '.oxlintrc.json'), 'utf8'));
  if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
  return parsed.config as Lint;
}

/** A checked package as it is on disk, its paths from the repository's root. */
function readPackage(dir: string): Package {
  const abs = path.join(ROOT, dir);
  const file = path.join(abs, 'tsconfig.json');
  const read = ts.readConfigFile(file, (f) => ts.sys.readFile(f));
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, abs);
  const fromRoot = (f: string): string => path.relative(ROOT, path.resolve(abs, f)).split(path.sep).join('/');
  const source = ['src', 'bin']
    .filter((folder) => fs.existsSync(path.join(abs, folder)))
    .flatMap((folder) =>
      (fs.readdirSync(path.join(abs, folder), { recursive: true }) as string[])
        .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
        .map((f) => fromRoot(path.join(folder, f))),
    );
  return { dir, options: parsed.options, fileNames: parsed.fileNames.map(fromRoot), source };
}

const held = (): Package => readPackage('packages/agent-runtime');

test('every checked package is under the flag and refuses a non-null assertion in its source', () => {
  const packages = CHECKED.map(readPackage);
  assert.ok(
    packages.every((pkg) => pkg.source.length > 10),
    'read far fewer source files than a checked package has',
  );
  assert.deepEqual(refusals(packages, readLint()), []);
});

test('REFUSED: a checked package whose config does not set the flag', () => {
  const pkg = { ...held(), options: { ...held().options, noUncheckedIndexedAccess: false } };
  const found = refusals([pkg], readLint());
  assert.equal(found.length, 1);
  assert.match(found[0] ?? '', /^packages\/agent-runtime\/tsconfig\.json does not set/);
});

test('REFUSED: a source file the flagged config leaves out', () => {
  const pkg = held();
  const found = refusals(
    [{ ...pkg, fileNames: pkg.fileNames.filter((f) => f !== 'packages/agent-runtime/src/core/domain.ts') }],
    readLint(),
  );
  assert.equal(found.length, 1);
  assert.match(found[0] ?? '', /^packages\/agent-runtime\/src\/core\/domain\.ts is left out/);
});

test('REFUSED: no lint block refusing a non-null assertion over a checked package', () => {
  const lint = readLint();
  const found = refusals([held()], { overrides: lint.overrides.filter((block) => !(RULE in block.rules)) });
  assert.equal(found.length, 1);
  assert.match(found[0] ?? '', /^\.oxlintrc\.json does not refuse/);
});
