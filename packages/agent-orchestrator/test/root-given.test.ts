/**
 * No new module-level store root, and no new line that reads one. The store's root is a service a program is given where it is
 * composed (`StoreRoot`, `src/config/root.store.ts`), and a store function takes it as a `home: string` with no default: a module that
 * reads the root as it loads, a parameter that falls back to one read that way, and a body that reads one by name each give the live
 * store to a caller that named none — which is how a run of the src tests in one shared process came to empty the person's own
 * `~/.agent-workflows/runs`.
 *
 * The rule is a pure function over a file's text (`globalRoots`), proven first on planted sources it must refuse, then swept over
 * `src/**`. What holds one is in `test/global-roots.baseline.ts`, with the count of its lines that do: the sweep refuses a file the
 * baseline does not name, and refuses a count that has grown or an entry that no longer holds one, so the list only shrinks and the
 * card that opened it is done when it is empty.
 *
 * `src/config/root.store.ts` is the one file allowed to turn a root into a layer, and it is handed its environment: it is in
 * `ALLOWED`, and nowhere in the baseline.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GLOBAL_ROOTS } from './global-roots.baseline.ts';

const PACKAGE = path.join(import.meta.dirname, '..');
const SRC = path.join(PACKAGE, 'src');

/** The one file that reads a root into a layer, from the environment it is handed: the service itself. */
const ALLOWED = ['src/config/root.store.ts'];

/**
 * `text` with every comment blanked and its line breaks kept, so a root named in prose — a header paragraph, a line above a
 * signature — is passed over while the line numbers still read true.
 */
const uncommented = (text: string): string => text.replace(/\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*/g, (found) => found.replace(/[^\n]/g, ' '));

/**
 * The names `text` holds a store root under: one a module-level binding reads from `wfRoot` (`export const HOME = wfRoot();`, `const
 * ROOT = wfRoot(process.env)`), and `HOME` where the file imports it — `record/record.store.ts`'s, the root 40 files of `src`
 * share. Read from the text alone, so the rule stays a pure function over one file.
 */
const rootNames = (clean: string): string[] => {
  const names = new Set<string>();
  for (const m of clean.matchAll(/^(?:export\s+)?const\s+(\w+)\s*(?::[^=]*)?=\s*wfRoot\s*\(/gm)) names.add(m[1]);
  for (const m of clean.matchAll(/^[ \t]*import\b[\s\S]*?from\s*['"][^'"]*['"]/gm)) {
    if (/(?<![\w$.])HOME(?![\w$])/.test(m[0])) names.add('HOME');
  }
  return [...names];
};

/**
 * A statement that binds a name or passes one on, blanked with its line breaks kept: an `import … from`, a bare `import '…'`, and an
 * `export { … } from` or `export * from`. A root named there is the plumbing of the binding, not a read of the store under it, and the
 * fourth form passes over it — a name on its own line inside a multi-line import list included, which reading line by line would not.
 */
const BINDINGS =
  /^[ \t]*(?:import\b[\s\S]*?from\s*['"][^'"]*['"]|import\s*['"][^'"]*['"]|export\s+(?:type\s+)?(?:\{[\s\S]*?\}|\*(?:\s+as\s+\w+)?)\s*from\s*['"][^'"]*['"])\s*;?/gm;

const withoutBindings = (clean: string): string => clean.replace(BINDINGS, (found) => found.replace(/[^\n]/g, ' '));

/**
 * Each root `text` holds as it loads, by its line and the line's own words. Four forms, each laid over as many lines as a formatter
 * likes:
 *
 * - a module-level binding read from `wfRoot`, whatever environment it is handed (`export const HOME = wfRoot();`): every module that
 *   imports the file gets that one root;
 * - a `wfRoot` called with no environment at all, which reads `process.env` wherever it stands;
 * - a parameter whose default is a root read either way (`home: string = HOME`, `root: string = wfRoot()`): a caller that names none
 *   is given the live store silently;
 * - a line inside a body that reads such a root by name (`path.join(HOME, 'worktrees', id)`): the shape most of the debt is in, and
 *   the worst of it, since the function takes no root at all and a caller cannot name one even when it wants to. An `import` or an
 *   `export` line is passed over: that binds the name rather than reading the store under it.
 *
 * So the count per file is the lines that have to change for that file to take its root as a parameter, which is what makes the
 * baseline's falling a measure of the work and not of the bindings alone.
 */
export const globalRoots = (text: string): string[] => {
  const clean = uncommented(text);
  const lines = clean.split('\n');
  const at = (index: number) => clean.slice(0, index).split('\n').length;
  const found = new Map<number, string>();
  const noteAt = (line: number, why: string) => {
    if (!found.has(line)) found.set(line, `${line}: ${why} — ${(lines[line - 1] ?? '').trim()}`);
  };
  const note = (index: number, why: string) => noteAt(at(index), why);
  for (const m of clean.matchAll(/^(?:export\s+)?const\s+(\w+)\s*(?::[^=]*)?=\s*wfRoot\s*\(/gm)) {
    note(m.index, `${m[1]} is a root this module reads as it loads`);
  }
  for (const m of clean.matchAll(/\bwfRoot\s*\(\s*\)/g)) {
    note(m.index, 'wfRoot is called with no environment, so it reads process.env where it stands');
  }
  for (const m of clean.matchAll(/(\w+)\s*(?::\s*string\s*)?=\s*(?:HOME|ROOT)\s*(?=[,)}])/g)) {
    note(m.index, `${m[1]} falls back to a root read as a module loaded`);
  }
  const names = rootNames(clean);
  if (names.length) {
    const reads = new RegExp(String.raw`(?<![\w$.])(?:${names.join('|')})(?![\w$])`);
    for (const [i, line] of withoutBindings(clean).split('\n').entries()) {
      if (reads.test(line)) noteAt(i + 1, `this line reads ${names.join(' or ')}, a root read as this module loaded`);
    }
  }
  return [...found.keys()].sort((a, b) => a - b).map((line) => found.get(line) as string);
};

test('REFUSED: a module-level root, a bare wfRoot and a defaulted parameter are each found, by line, however they are laid out', () => {
  const reader = 'wf' + 'Root';
  assert.deepEqual(globalRoots(`const a = 1;\nexport const HOME = ${reader}();\n`), [
    `2: HOME is a root this module reads as it loads — export const HOME = ${reader}();`,
  ]);
  assert.deepEqual(globalRoots(`const ROOT = ${reader}(process.env);\n`), [
    `1: ROOT is a root this module reads as it loads — const ROOT = ${reader}(process.env);`,
  ]);
  assert.deepEqual(globalRoots(`export const dir = (root: string = ${reader}()): string => root;\n`), [
    `1: wfRoot is called with no environment, so it reads process.env where it stands — export const dir = (root: string = ${reader}()): string => root;`,
  ]);
  assert.deepEqual(globalRoots('export const read = (name: string, home: string = HOME): string => name + home;\n'), [
    '1: home falls back to a root read as a module loaded — export const read = (name: string, home: string = HOME): string => name + home;',
  ]);
  assert.deepEqual(globalRoots('export function read(name: string, { home = HOME }: Readings): string {\n  return name + home;\n}\n'), [
    '1: home falls back to a root read as a module loaded — export function read(name: string, { home = HOME }: Readings): string {',
  ]);
  assert.deepEqual(
    globalRoots(`const ROOT:\n  string =\n  ${reader}(\n    process.env,\n  );\n`),
    [`1: ROOT is a root this module reads as it loads — const ROOT:`],
    'one laid over several lines is found at the line it begins on',
  );
  assert.deepEqual(
    globalRoots(`export function at(\n  name: string,\n  home: string = HOME,\n): string {\n  return name + home;\n}\n`),
    ['3: home falls back to a root read as a module loaded — home: string = HOME,'],
    'a defaulted parameter on its own line',
  );
  assert.deepEqual(
    globalRoots(
      `/**\n * The root \`${reader}()\` names, or \`home: string = HOME\` where a caller gives none.\n * const ROOT = ${reader}();\n */\nexport const dir = (home: string): string => home;\n`,
    ),
    [],
    'a root named in a comment is passed over',
  );
  assert.deepEqual(
    globalRoots(`// const ROOT = ${reader}();\nexport const dir = (home: string): string => home;\n`),
    [],
    'and one commented out',
  );
  assert.deepEqual(
    globalRoots(`export const dir = (root: string = ${reader}(env)): string => root;\n`),
    [],
    'a parameter handed an environment of its own is no global root',
  );
  assert.deepEqual(globalRoots('export const layer = (home: string): string => home;\n'), [], 'a required root is what the rule asks for');
});

test('REFUSED: a body that reads an imported root by name is found, and a file that imports none is left alone', () => {
  const reader = 'wf' + 'Root';
  const importing = "import { HOME, isDirectory } from '../record/record.store.ts';\n";
  assert.deepEqual(
    globalRoots(`${importing}export const checks = (id: string): string => path.join(HOME, 'checks', id);\n`),
    [
      "2: this line reads HOME, a root read as this module loaded — export const checks = (id: string): string => path.join(HOME, 'checks', id);",
    ],
    'the shape most of the debt is in: no root parameter at all, so a caller cannot name one',
  );
  assert.deepEqual(
    globalRoots(`${importing}export const dirs = (): string[] => [\n  path.join(HOME, 'a'),\n  path.join(HOME, 'b'),\n];\n`).length,
    2,
    'one line each, so the count is the lines that have to change',
  );
  assert.deepEqual(
    globalRoots(`const ROOT = ${reader}();\nexport const cordon = (): string => path.join(ROOT, 'cordon');\n`),
    [
      `1: ROOT is a root this module reads as it loads — const ROOT = ${reader}();`,
      "2: this line reads ROOT, a root read as this module loaded — export const cordon = (): string => path.join(ROOT, 'cordon');",
    ],
    "a module's own binding counts, and so does each body that reads it",
  );
  assert.deepEqual(globalRoots(importing), [], 'the import alone binds the name and reads no store under it');
  assert.deepEqual(globalRoots("export { HOME } from './record/record.store.ts';\n"), [], 'and so does a re-export: the door, not a read');
  assert.deepEqual(
    globalRoots("export const at = (home: string): string => path.join(home, 'x');\n"),
    [],
    'a file that imports no root and takes one by parameter holds none, whatever it calls it',
  );
  assert.deepEqual(
    globalRoots(`${importing}/** What \`path.join(HOME, 'checks')\` answers. */\nexport const at = (home: string): string => home;\n`),
    [],
    'a root read in a comment is passed over here too',
  );
  assert.deepEqual(
    globalRoots("import { wfRoot } from '../config/config.store.ts';\nexport const at = (env: Env): string => wfRoot(env);\n"),
    [],
    'a reader handed an environment is no root this module holds',
  );
  assert.deepEqual(
    globalRoots(`${importing}export const where = (): string => process.env.WF_ROOT ?? '/x';\n`),
    [],
    'WF_ROOT is not the identifier ROOT, and a property named HOME is not the binding',
  );
});

/** Every file of `src` that is no test, by its path from the package. */
const sources = (): string[] =>
  fs
    .readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => `src/${f.split(path.sep).join('/')}`);

test('no file of src holds a store root as it loads but those the baseline names, with the count it names', () => {
  const files = sources();
  assert.ok(files.length > 50, 'the sweep reads the sources');
  const refused: string[] = [];
  for (const file of files) {
    if (ALLOWED.includes(file)) continue;
    const held = globalRoots(fs.readFileSync(path.join(PACKAGE, file), 'utf8'));
    const owed = GLOBAL_ROOTS[file];
    if (owed === undefined) {
      if (held.length) {
        refused.push(
          `${file} holds ${held.length} store root(s) read as it loads, and the baseline names none: take the root as a required \`home: string\` and let the caller read \`StoreRoot\` (src/config/root.store.ts) — ${held.join(' | ')}`,
        );
      }
      continue;
    }
    if (held.length === 0) {
      refused.push(`${file} holds none any more: take its line out of test/global-roots.baseline.ts, which only shrinks`);
    } else if (held.length !== owed) {
      refused.push(
        `${file} holds ${held.length} where the baseline names ${owed}: ${held.length > owed ? 'no new module-level root — take the root as a required `home: string`' : 'lower the count in test/global-roots.baseline.ts'} — ${held.join(' | ')}`,
      );
    }
  }
  assert.deepEqual(refused, []);
});

test('every file the baseline names is a source of this package, and the service itself is in none of it', () => {
  const files = sources();
  for (const file of Object.keys(GLOBAL_ROOTS)) {
    assert.ok(files.includes(file), `${file} is no source of this package: take its line out of the baseline`);
    assert.equal(ALLOWED.includes(file), false, `${file} is allowed a root and must not be counted as a debt`);
  }
});
