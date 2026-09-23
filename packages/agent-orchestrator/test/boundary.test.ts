/**
 * The package's boundary, as a test rather than a sentence in the README (`docs/architecture.md` says the same rules in prose).
 *
 * **Every file is of one of three kinds, named below.** `PURE` files hold the judgement — `assess` in `run.ts`, the verdict in
 * `check.ts`, the format in `workflow.ts` — and import no runtime, read no disk and spawn nothing, which is what lets them be tested as
 * data. `STORE` files are the I/O beneath the controllers: they import no runtime and never a controller, and load as a tree with no
 * cycle. `CONTROLLER` files may use the runtime: `runner.ts`, and the CLI above it, which parses, calls and prints, and so reaches the
 * package through `runner.ts` and the format through `workflow.ts` alone. A file in `src/` or `bin/` that no kind names fails the suite:
 * a new file is sorted when it is written.
 *
 * **The runtime is reached through one client**, `CLIENT`: of the package's files, it alone imports agent-runtime, a type included. Today
 * that is `runner.ts`; the next change moves the import into a client file of its own and splits `runner.ts`, and `CLIENT` moves with it.
 *
 * Each rule is a pure function over a map of each file's imports, run first on planted sources it must refuse (`REFUSED`), so that none
 * passes by seeing nothing, and then on the package. A rule a session can re-break is a rule this suite refuses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PKG = path.join(import.meta.dirname, '..');

/** Judgement: no runtime, no disk, no process, and no file of the other two kinds. */
const PURE = ['check', 'closeout', 'daemon', 'deps', 'feed', 'inbox', 'plan', 'radius', 'retry', 'run', 'timeline', 'workflow'].map((f) => `src/${f}.ts`);

/** The I/O beneath the controllers: no runtime, never a controller, and a tree (`STORE_BOTTOM`, `STORE_SHARED`). */
const STORE = ['places', 'workflow-store', 'store', 'worktree', 'branches', 'artifacts', 'authoring', 'daemon-store', 'feed-store', 'inbox-store'].map((f) => `src/${f}.ts`);

/** What may use the runtime. */
const CONTROLLER = ['src/runner.ts', 'src/cli.ts', 'bin/wf.ts'];

/** The one file that imports agent-runtime. */
const CLIENT = 'src/runner.ts';

/** The bottom of the store's tree: they import no store file. */
const STORE_BOTTOM = ['src/places.ts', 'src/workflow-store.ts'];

/**
 * The store files another store file may import, each with the store files it may import itself: the bottom, then the run store on it, then
 * git on both. No other store file is imported by another, so the tree has no cycle and each is re-exported by the controller alone.
 */
const STORE_SHARED: Record<string, readonly string[]> = {
  'src/places.ts': [],
  'src/workflow-store.ts': [],
  'src/store.ts': STORE_BOTTOM,
  'src/worktree.ts': ['src/store.ts', 'src/places.ts'],
};

/** The package's files the CLI may import. */
const CLI_REACHES = ['src/runner.ts', 'src/workflow.ts'];

const IMPURE = ['fs', 'node:fs', 'fs/promises', 'node:fs/promises', 'child_process', 'node:child_process'];

type Sources = Record<string, readonly string[]>;

/** Every module a piece of source names: imports and re-exports, type-only included, and `import()`. */
function importsIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.add(m[1]!);
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.add(m[1]!);
  for (const m of text.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) found.add(m[1]!);
  return [...found].sort();
}

/** A relative module as the package path it names (`./run.ts` in `src/cli.ts` is `src/run.ts`); any other as written. */
const resolved = (file: string, mod: string): string => (mod.startsWith('.') ? path.posix.join(path.posix.dirname(file), mod) : mod);

/** Each source file's imports, resolved: `src/` and `bin/`, every `.ts`. */
function sourcesOf(texts: Record<string, string>): Sources {
  return Object.fromEntries(Object.entries(texts).map(([file, text]) => [file, importsIn(text).map((m) => resolved(file, m))]));
}

const packageSources = (): Sources => sourcesOf(Object.fromEntries(['src', 'bin'].flatMap((dir) => fs.readdirSync(path.join(PKG, dir))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => [`${dir}/${f}`, fs.readFileSync(path.join(PKG, dir, f), 'utf8')]))));

const isRuntime = (m: string): boolean => m === 'agent-runtime' || m.startsWith('agent-runtime/');

// ─── the rules, each a list of what breaks it ───────────────────────────────

/** Every file is of exactly one kind, and every file a kind names is there. */
function unsorted(sources: Sources): string[] {
  const kinds = { PURE, STORE, CONTROLLER };
  const out: string[] = [];
  for (const file of Object.keys(sources).sort()) {
    const of = Object.entries(kinds).filter(([, files]) => files.includes(file)).map(([kind]) => kind);
    if (!of.length) out.push(`${file} is of no kind: name it in PURE, STORE or CONTROLLER in test/boundary.test.ts`);
    if (of.length > 1) out.push(`${file} is named in ${of.join(' and ')}: a file is of one kind`);
  }
  for (const [kind, files] of Object.entries(kinds)) for (const file of files) if (!(file in sources)) out.push(`${kind} names ${file}, which is not there`);
  return out;
}

/** A pure file imports no runtime, no disk, no process, and no store or controller file. */
function impurities(sources: Sources): string[] {
  return PURE.flatMap((file) => (sources[file] ?? [])
    .filter((m) => isRuntime(m) || IMPURE.includes(m) || STORE.includes(m) || CONTROLLER.includes(m))
    .map((m) => `${file} is pure and imports ${m}`));
}

/** A store file imports no runtime and no controller, and store files import each other only as the tree has it; the controller imports each. */
function treeBreaks(sources: Sources): string[] {
  const out: string[] = [];
  for (const file of STORE) {
    for (const m of sources[file] ?? []) {
      if (isRuntime(m)) out.push(`${file} is a store file and imports ${m}`);
      if (CONTROLLER.includes(m)) out.push(`${file} is a store file and imports ${m}, a controller: a cycle`);
      if (!STORE.includes(m)) continue;
      const allowed = STORE_SHARED[file] ?? Object.keys(STORE_SHARED);
      if (!allowed.includes(m)) out.push(`${file} imports ${m}, which the tree does not let it: ${allowed.length ? `of the store it imports ${allowed.join(', ')}` : 'it is the bottom, and imports no store file'}`);
    }
    if (!(sources[CLIENT] ?? []).includes(file)) out.push(`${CLIENT} does not import ${file}: a store file is the controller's I/O`);
  }
  return out;
}

/** The CLI reaches the package only through `runner.ts` and `workflow.ts`. */
function cliBreaks(sources: Sources): string[] {
  return (sources['src/cli.ts'] ?? []).filter((m) => m.startsWith('src/') && !CLI_REACHES.includes(m)).map((m) => `src/cli.ts imports ${m}: it reaches the package through ${CLI_REACHES.join(' and ')}`);
}

/** Only the client imports agent-runtime, a type included — and it does. */
function clientBreaks(sources: Sources): string[] {
  const out = Object.entries(sources).filter(([file, imports]) => file !== CLIENT && imports.some(isRuntime)).map(([file]) => `${file} imports agent-runtime, and only ${CLIENT} may`);
  if (!(sources[CLIENT] ?? []).some(isRuntime)) out.push(`${CLIENT} imports no agent-runtime: CLIENT names the wrong file`);
  return out;
}

// ─── the planted sources: the package's, with one thing broken ──────────────

/** The package's sources with `file`'s imports changed by `change`: a copy, so each plant breaks one thing. */
const planted = (file: string, change: (imports: readonly string[]) => readonly string[]): Sources => {
  const sources = { ...packageSources() };
  sources[file] = change(sources[file] ?? []);
  return sources;
};
const adding = (file: string, mod: string): Sources => planted(file, (imports) => [...imports, mod]);

test('the scanner sees every way a file can name a module — or the rules below would pass by seeing nothing', () => {
  const text = [
    "import type { TaskView } from 'agent-runtime';",
    'import {',
    '  a,',
    '  b,',
    "} from './multi-line.ts';",
    "export { verdictWord } from './check.ts';",
    "import 'side-effect';",
    "const fs = await import('node:fs');",
    "// a comment that mentions from 'nowhere' is not an import",
  ].join('\n');
  assert.deepEqual(importsIn(text), ['./check.ts', './multi-line.ts', 'agent-runtime', 'node:fs', 'side-effect']);
  assert.deepEqual(sourcesOf({ 'bin/wf.ts': "import { main } from '../src/cli.ts';" }), { 'bin/wf.ts': ['src/cli.ts'] }, 'a relative module is the package path it names');
});

test('every file in src and bin is of one kind, and every file a kind names is there', () => {
  assert.deepEqual(unsorted(packageSources()), []);
});

test('REFUSED: a file of no kind, a file of two, and a kind naming a file that is gone', () => {
  assert.deepEqual(unsorted({ ...packageSources(), 'src/x.ts': [] }), ['src/x.ts is of no kind: name it in PURE, STORE or CONTROLLER in test/boundary.test.ts']);
  const { 'src/radius.ts': _, ...gone } = packageSources();
  assert.deepEqual(unsorted(gone), ['PURE names src/radius.ts, which is not there']);
  assert.equal(PURE.filter((f) => STORE.includes(f) || CONTROLLER.includes(f)).length + STORE.filter((f) => CONTROLLER.includes(f)).length, 0, 'and no file is in two kinds today');
});

test('pure files import no runtime, read no disk, spawn nothing, and reach for no store or controller file', () => {
  assert.deepEqual(impurities(packageSources()), []);
});

test('REFUSED: a pure file that reads the disk, spawns, imports the runtime, or reaches for a store or a controller file', () => {
  assert.deepEqual(impurities(adding('src/radius.ts', 'node:fs')), ['src/radius.ts is pure and imports node:fs']);
  assert.deepEqual(impurities(adding('src/workflow.ts', 'fs')), ['src/workflow.ts is pure and imports fs']);
  assert.deepEqual(impurities(adding('src/check.ts', 'node:child_process')), ['src/check.ts is pure and imports node:child_process']);
  assert.deepEqual(impurities(adding('src/run.ts', 'agent-runtime/effect')), ['src/run.ts is pure and imports agent-runtime/effect']);
  assert.deepEqual(impurities(adding('src/workflow.ts', 'src/workflow-store.ts')), ['src/workflow.ts is pure and imports src/workflow-store.ts']);
  assert.deepEqual(impurities(adding('src/feed.ts', 'src/runner.ts')), ['src/feed.ts is pure and imports src/runner.ts']);
});

test('store files import no runtime and no controller, load as a tree beneath the controller, and the controller imports each', () => {
  assert.deepEqual(treeBreaks(packageSources()), []);
});

test('REFUSED: a store file that imports the runtime or a controller, a store import off the tree, and one the controller does not import', () => {
  assert.deepEqual(treeBreaks(adding('src/store.ts', 'agent-runtime')), ['src/store.ts is a store file and imports agent-runtime']);
  assert.deepEqual(treeBreaks(adding('src/branches.ts', 'src/runner.ts')), ['src/branches.ts is a store file and imports src/runner.ts, a controller: a cycle']);
  assert.deepEqual(treeBreaks(adding('src/workflow-store.ts', 'src/store.ts')), ['src/workflow-store.ts imports src/store.ts, which the tree does not let it: it is the bottom, and imports no store file']);
  assert.deepEqual(treeBreaks(adding('src/store.ts', 'src/worktree.ts')), ['src/store.ts imports src/worktree.ts, which the tree does not let it: of the store it imports src/places.ts, src/workflow-store.ts']);
  assert.deepEqual(treeBreaks(adding('src/artifacts.ts', 'src/branches.ts')), ['src/artifacts.ts imports src/branches.ts, which the tree does not let it: of the store it imports src/places.ts, src/workflow-store.ts, src/store.ts, src/worktree.ts']);
  assert.deepEqual(treeBreaks(planted(CLIENT, (imports) => imports.filter((m) => m !== 'src/daemon-store.ts'))), ['src/runner.ts does not import src/daemon-store.ts: a store file is the controller\'s I/O']);
});

test('cli.ts reaches the package only through runner.ts and workflow.ts', () => {
  assert.deepEqual(cliBreaks(packageSources()), []);
  assert.deepEqual(cliBreaks(adding('src/cli.ts', 'src/store.ts')), ['src/cli.ts imports src/store.ts: it reaches the package through src/runner.ts and src/workflow.ts'], 'REFUSED: the CLI reaching past runner.ts');
});

test(`the runtime is reached through one client: only ${CLIENT} imports agent-runtime — not even for a type`, () => {
  assert.deepEqual(clientBreaks(packageSources()), []);
});

test('REFUSED: a type imported from the runtime by a store file, a pure file or the CLI, and a client that imports none', () => {
  assert.deepEqual(clientBreaks(adding('src/store.ts', 'agent-runtime')), ['src/store.ts imports agent-runtime, and only src/runner.ts may']);
  assert.deepEqual(clientBreaks(adding('src/timeline.ts', 'agent-runtime/effect')), ['src/timeline.ts imports agent-runtime, and only src/runner.ts may']);
  assert.deepEqual(clientBreaks(adding('src/cli.ts', 'agent-runtime')), ['src/cli.ts imports agent-runtime, and only src/runner.ts may']);
  assert.deepEqual(clientBreaks(planted(CLIENT, (imports) => imports.filter((m) => !isRuntime(m)))), ['src/runner.ts imports no agent-runtime: CLIENT names the wrong file']);
});
