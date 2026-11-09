/**
 * No workspace ships with the verifier. `@emyann/tsverify` carries `ink`, `react`, `typescript` and `z3-solver` as dependencies of its
 * own, so a package that declares it, or whose `src/` imports it, carries a prover for a call that does nothing at run time. It stays
 * in the root's `devDependencies`, read by the contracts under a package's `contracts/` and by tests, and a law a step wants proved is made
 * provable from the code, or restated so a helper's spec carries it.
 *
 * Refused here: the verifier in the `dependencies`, `optionalDependencies` or `peerDependencies` of any workspace's `package.json`, and
 * an import of it, or of one of its subpaths, from any file under a workspace's `src/`.
 *
 * The test reads files outside this package: after a change elsewhere, `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, workspaces } from 'test-kit/repo';

/** The verifier, by its npm name. */
const VERIFIER = '@emyann/tsverify';

/** The fields of a manifest whose packages are installed with it wherever it is installed. */
const SHIPPED_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;

type Manifest = { readonly [field: string]: unknown };

/** What a refusal says to do instead, the same for a manifest and for a source. */
const FIX =
  `keep ${VERIFIER} in the root's devDependencies alone, and make the law provable from the code, ` +
  `or restate it so a helper's spec carries it`;

/** Each field of `manifest`, read at `file`, that ships the verifier, as a sentence naming the fix. */
const shippedIn = (file: string, manifest: Manifest): string[] =>
  SHIPPED_FIELDS.filter((field) => {
    const deps = manifest[field];
    return typeof deps === 'object' && deps !== null && Object.hasOwn(deps, VERIFIER);
  }).map((field) => `${file} declares ${VERIFIER} in its ${field}: ${FIX}`);

/** An import, export-from, dynamic import or require of the verifier or a subpath of it, across line breaks. */
const IMPORT = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"`]@emyann\/tsverify(?:\/[^'"`]*)?['"`]/;

/** `file`, holding `text`, as a sentence naming the fix when it imports the verifier; nothing when it does not. */
const importedIn = (file: string, text: string): string[] =>
  IMPORT.test(text) ? [`${file} imports ${VERIFIER}, which ships it with its package: ${FIX}`] : [];

/** Every `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` and `.jsx` file under `dir`, by path from the root, `node_modules` left out. */
const sources = (dir: string): string[] => {
  const at = path.join(REPO, dir);
  if (!fs.existsSync(at)) return [];
  return fs
    .readdirSync(at, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name))
    .map((entry) => path.relative(REPO, path.join(entry.parentPath, entry.name)))
    .filter((file) => !file.split(path.sep).includes('node_modules'));
};

test('no workspace declares the verifier as a dependency it ships with', () => {
  const dirs = workspaces();
  assert.ok(dirs.length >= 6, `read ${dirs.length} workspaces, fewer than the repository has`);
  const refused = dirs.flatMap((dir) => {
    const file = path.join(dir, 'package.json');
    return shippedIn(file, JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8')) as Manifest);
  });
  assert.deepEqual(refused, []);
});

test("no file under a workspace's src/ imports the verifier", () => {
  const files = workspaces().flatMap((dir) => sources(path.join(dir, 'src')));
  assert.ok(files.length > 100, `read ${files.length} source files, fewer than the workspaces hold`);
  const refused = files.flatMap((file) => importedIn(file, fs.readFileSync(path.join(REPO, file), 'utf8')));
  assert.deepEqual(refused, []);
});

test('REFUSED: a workspace that declares the verifier as a dependency', () => {
  const manifest = { dependencies: { effect: '^4.0.0', [VERIFIER]: '^0.5.1' } };
  assert.equal(shippedIn('packages/agent-orchestrator/package.json', manifest).length, 1);
});

test("REFUSED: a source under a workspace's src/ that imports the verifier", () => {
  const planted = "import { invariant } from '@emyann/tsverify';\n";
  assert.equal(importedIn('packages/agent-orchestrator/src/speaker.ts', planted).length, 1);
});
