/**
 * The package's boundary, as a test rather than a sentence in the README (`docs/architecture.md` says the same rules in prose).
 *
 * **Every file is of one of four kinds, named below.** `PURE` files hold the judgement — `assess` in `run.ts`, the verdict in
 * `check.ts`, the format in `workflow.ts` — and import no runtime, read no disk and spawn nothing, which is what lets them be tested as
 * data. `STORE` files are the I/O beneath the controllers: they import no runtime, never a controller and never the client, and load as
 * a tree with no cycle; only the client and the controllers beneath the CLI import them. `CONTROLLER` files use the runtime through the
 * client: `runner.ts`, the package's root, the six it re-exports, split by concern, and the CLI above them, which parses, calls and
 * prints, and so reaches the package through `runner.ts` and the format through `workflow.ts` alone — as `bin/wf.ts` reaches it through
 * the CLI. The client and the controllers import one another with no cycle. A file in `src/` or `bin/` that no kind names fails the
 * suite: a new file is sorted when it is written.
 *
 * **The runtime is reached through one client**, `CLIENT`, `runtime-client.ts`: of the package's files, it alone imports agent-runtime,
 * a type included; every controller beneath the CLI imports it, and it imports no controller.
 *
 * Each rule is a pure function over a map of each file's imports, run first on planted sources it must refuse (`REFUSED`), so that none
 * passes by seeing nothing, and then on the package. A rule a session can re-break is a rule this suite refuses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PKG = path.join(import.meta.dirname, '..');

/** Judgement: no runtime, no disk, no process, and no file of the other three kinds. */
const PURE = ['admission', 'check', 'closeout', 'daemon', 'deps', 'feed', 'inbox', 'meter', 'plan', 'radius', 'retry', 'run', 'timeline', 'workflow'].map((f) => `src/${f}.ts`);

/** The I/O beneath the controllers: no runtime, never a controller or the client, and a tree (`STORE_BOTTOM`, `STORE_SHARED`). */
const STORE = ['places', 'workflow-store', 'store', 'worktree', 'branches', 'artifacts', 'authoring', 'daemon-store', 'feed-store', 'inbox-store', 'tally'].map((f) => `src/${f}.ts`);

/** What uses the runtime, through the client: the root, the controllers it re-exports, and the CLI above them. */
const CONTROLLER = [...['runner', 'views', 'start', 'tick', 'verbs', 'forget', 'decide', 'cli'].map((f) => `src/${f}.ts`), 'bin/wf.ts'];

/** The CLI's two files, which reach the package through the root (`CLI_REACHES`, `BIN_REACHES`), never the client or the store. */
const CLI = ['src/cli.ts', 'bin/wf.ts'];

/** The controllers beneath the CLI: each imports the client, and they and the client alone import the store. */
const BENEATH_CLI = CONTROLLER.filter((f) => !CLI.includes(f));

/** The one file that imports agent-runtime. */
const CLIENT = 'src/runtime-client.ts';

/** The bottom of the store's tree: they import no store file. */
const STORE_BOTTOM = ['src/places.ts', 'src/workflow-store.ts', 'src/tally.ts'];

/**
 * The store files another store file may import, each with the store files it may import itself: the bottom, then the run store on it, then
 * git on both. No other store file is imported by another, so the tree has no cycle; outside the store, the client and the controllers
 * beneath the CLI alone import them.
 */
const STORE_SHARED: Record<string, readonly string[]> = {
  'src/places.ts': [],
  'src/workflow-store.ts': [],
  'src/tally.ts': [],
  'src/store.ts': STORE_BOTTOM,
  'src/worktree.ts': ['src/store.ts', 'src/places.ts', 'src/tally.ts'],
};

/** The package's files the CLI may import. */
const CLI_REACHES = ['src/runner.ts', 'src/workflow.ts'];

/** The package's files `bin/wf.ts` may import. */
const BIN_REACHES = ['src/cli.ts'];

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
  const kinds = { PURE, STORE, CONTROLLER, CLIENT: [CLIENT] };
  const out: string[] = [];
  for (const file of Object.keys(sources).sort()) {
    const of = Object.entries(kinds).filter(([, files]) => files.includes(file)).map(([kind]) => kind);
    if (!of.length) out.push(`${file} is of no kind: name it in PURE, STORE, CONTROLLER or CLIENT in test/boundary.test.ts`);
    if (of.length > 1) out.push(`${file} is named in ${of.join(' and ')}: a file is of one kind`);
  }
  for (const [kind, files] of Object.entries(kinds)) for (const file of files) if (!(file in sources)) out.push(`${kind} names ${file}, which is not there`);
  return out;
}

/** A pure file imports no runtime, no disk, no process, and no store, controller or client file. */
function impurities(sources: Sources): string[] {
  return PURE.flatMap((file) => (sources[file] ?? [])
    .filter((m) => isRuntime(m) || IMPURE.includes(m) || STORE.includes(m) || CONTROLLER.includes(m) || m === CLIENT)
    .map((m) => `${file} is pure and imports ${m}`));
}

/**
 * A store file imports no runtime, no controller and not the client, and store files import each other only as the tree has it; outside
 * the store, only the client and the controllers beneath the CLI import a store file — never `bin/wf.ts` or `src/cli.ts`, which reach
 * the package through the root — and some one of them imports each.
 */
function treeBreaks(sources: Sources): string[] {
  const out: string[] = [];
  for (const file of STORE) {
    for (const m of sources[file] ?? []) {
      if (isRuntime(m)) out.push(`${file} is a store file and imports ${m}`);
      if (CONTROLLER.includes(m) || m === CLIENT) out.push(`${file} is a store file and imports ${m}, ${m === CLIENT ? 'the client' : 'a controller'}: a cycle`);
      if (!STORE.includes(m)) continue;
      const allowed = STORE_SHARED[file] ?? Object.keys(STORE_SHARED);
      if (!allowed.includes(m)) out.push(`${file} imports ${m}, which the tree does not let it: ${allowed.length ? `of the store it imports ${allowed.join(', ')}` : 'it is the bottom, and imports no store file'}`);
    }
    if (![CLIENT, ...BENEATH_CLI].some((user) => (sources[user] ?? []).includes(file))) out.push(`${file} is imported by no controller and not by the client: a store file is the controllers' I/O`);
  }
  for (const [file, imports] of Object.entries(sources)) {
    if (STORE.includes(file) || file === CLIENT || BENEATH_CLI.includes(file)) continue;
    for (const m of imports) if (STORE.includes(m)) out.push(`${file} imports ${m}, a store file: only the client and the controllers beneath the CLI import the store`);
  }
  return out;
}

/** The CLI reaches the package only through `runner.ts` and `workflow.ts`, and `bin/wf.ts` only through the CLI. */
function cliBreaks(sources: Sources): string[] {
  const reaching = (file: string, reaches: readonly string[]) => (sources[file] ?? [])
    .filter((m) => (m.startsWith('src/') || m.startsWith('bin/')) && !reaches.includes(m))
    .map((m) => `${file} imports ${m}: it reaches the package through ${reaches.join(' and ')}`);
  return [...reaching('src/cli.ts', CLI_REACHES), ...reaching('bin/wf.ts', BIN_REACHES)];
}

/** Only the client imports agent-runtime, a type included — and it does; every controller beneath the CLI imports the client, and the client no controller. */
function clientBreaks(sources: Sources): string[] {
  const out = Object.entries(sources).filter(([file, imports]) => file !== CLIENT && imports.some(isRuntime)).map(([file]) => `${file} imports agent-runtime, and only ${CLIENT} may`);
  if (!(sources[CLIENT] ?? []).some(isRuntime)) out.push(`${CLIENT} imports no agent-runtime: CLIENT names the wrong file`);
  for (const file of BENEATH_CLI) if (!(sources[file] ?? []).includes(CLIENT)) out.push(`${file} is a controller and does not import ${CLIENT}: the controllers reach the runtime through the client`);
  for (const m of sources[CLIENT] ?? []) if (CONTROLLER.includes(m)) out.push(`${CLIENT} imports ${m}, a controller: the client is beneath every controller`);
  return out;
}

/**
 * No cycle among the client and the controllers: an ES module read in a cycle can be read before it has run, and a name it exports is then
 * not yet there. Each cycle is named once, from its least file.
 */
function cycles(sources: Sources): string[] {
  const nodes = [CLIENT, ...CONTROLLER].sort();
  const edges = (file: string) => (sources[file] ?? []).filter((m) => nodes.includes(m)).sort();
  const found = new Set<string>();
  for (const from of nodes) {
    // The shortest way back to `from`, breadth first.
    const back = new Map<string, string>();
    const queue = [from];
    while (queue.length) {
      const at = queue.shift()!;
      for (const next of edges(at)) {
        if (next === from) {
          const loop = [from];
          for (let step = at; step !== from; step = back.get(step)!) loop.splice(1, 0, step);
          const least = loop.indexOf([...loop].sort()[0]!);
          const turned = [...loop.slice(least), ...loop.slice(0, least)];
          found.add(`a cycle: ${[...turned, turned[0]].join(' → ')}`);
          queue.length = 0;
          break;
        }
        if (!back.has(next)) { back.set(next, at); queue.push(next); }
      }
    }
  }
  return [...found].sort();
}

// ─── the planted sources: the package's, with one thing broken ──────────────

/** The package's sources with `file`'s imports changed by `change`: a copy, so each plant breaks one thing. */
const planted = (file: string, change: (imports: readonly string[]) => readonly string[]): Sources => {
  const sources = { ...packageSources() };
  sources[file] = change(sources[file] ?? []);
  return sources;
};
const adding = (file: string, mod: string): Sources => planted(file, (imports) => [...imports, mod]);
/** The package's sources with `mod` imported by no file. */
const unimported = (mod: string): Sources => Object.fromEntries(Object.entries(packageSources()).map(([file, imports]) => [file, imports.filter((m) => m !== mod)]));

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
  assert.deepEqual(unsorted({ ...packageSources(), 'src/x.ts': [] }), ['src/x.ts is of no kind: name it in PURE, STORE, CONTROLLER or CLIENT in test/boundary.test.ts']);
  const { 'src/radius.ts': _, ...gone } = packageSources();
  assert.deepEqual(unsorted(gone), ['PURE names src/radius.ts, which is not there']);
  const { [CLIENT]: __, ...clientGone } = packageSources();
  assert.deepEqual(unsorted(clientGone), ['CLIENT names src/runtime-client.ts, which is not there']);
  const named = [...PURE, ...STORE, ...CONTROLLER, CLIENT];
  assert.equal(named.length, new Set(named).size, 'and no file is in two kinds today');
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
  assert.deepEqual(impurities(adding('src/run.ts', 'src/tick.ts')), ['src/run.ts is pure and imports src/tick.ts']);
  assert.deepEqual(impurities(adding('src/timeline.ts', CLIENT)), ['src/timeline.ts is pure and imports src/runtime-client.ts']);
});

test('store files import no runtime, no controller and not the client, load as a tree beneath the controllers, and only the client and the controllers beneath the CLI import them', () => {
  assert.deepEqual(treeBreaks(packageSources()), []);
});

test('REFUSED: a store file that imports the runtime, a controller or the client, a store import off the tree, one no controller imports, and one the CLI imports', () => {
  assert.deepEqual(treeBreaks(adding('src/store.ts', 'agent-runtime')), ['src/store.ts is a store file and imports agent-runtime']);
  assert.deepEqual(treeBreaks(adding('src/branches.ts', 'src/runner.ts')), ['src/branches.ts is a store file and imports src/runner.ts, a controller: a cycle']);
  assert.deepEqual(treeBreaks(adding('src/workflow-store.ts', 'src/store.ts')), ['src/workflow-store.ts imports src/store.ts, which the tree does not let it: it is the bottom, and imports no store file']);
  assert.deepEqual(treeBreaks(adding('src/store.ts', 'src/worktree.ts')), ['src/store.ts imports src/worktree.ts, which the tree does not let it: of the store it imports src/places.ts, src/workflow-store.ts, src/tally.ts']);
  assert.deepEqual(treeBreaks(adding('src/artifacts.ts', 'src/branches.ts')), ['src/artifacts.ts imports src/branches.ts, which the tree does not let it: of the store it imports src/places.ts, src/workflow-store.ts, src/tally.ts, src/store.ts, src/worktree.ts']);
  assert.deepEqual(treeBreaks(adding('src/inbox-store.ts', 'src/decide.ts')), ['src/inbox-store.ts is a store file and imports src/decide.ts, a controller: a cycle']);
  assert.deepEqual(treeBreaks(adding('src/store.ts', CLIENT)), ['src/store.ts is a store file and imports src/runtime-client.ts, the client: a cycle']);
  assert.deepEqual(treeBreaks(unimported('src/daemon-store.ts')), ['src/daemon-store.ts is imported by no controller and not by the client: a store file is the controllers\' I/O']);
  assert.deepEqual(treeBreaks(adding('bin/wf.ts', 'src/branches.ts')), ['bin/wf.ts imports src/branches.ts, a store file: only the client and the controllers beneath the CLI import the store']);
  assert.deepEqual(treeBreaks(adding('src/cli.ts', 'src/store.ts')), ['src/cli.ts imports src/store.ts, a store file: only the client and the controllers beneath the CLI import the store']);
});

test('cli.ts reaches the package only through runner.ts and workflow.ts, and bin/wf.ts only through cli.ts', () => {
  assert.deepEqual(cliBreaks(packageSources()), []);
  assert.deepEqual(cliBreaks(adding('src/cli.ts', 'src/store.ts')), ['src/cli.ts imports src/store.ts: it reaches the package through src/runner.ts and src/workflow.ts'], 'REFUSED: the CLI reaching past runner.ts');
  assert.deepEqual(cliBreaks(adding('src/cli.ts', 'src/tick.ts')), ['src/cli.ts imports src/tick.ts: it reaches the package through src/runner.ts and src/workflow.ts'], 'REFUSED: the CLI reaching a controller beneath the root');
  assert.deepEqual(cliBreaks(adding('bin/wf.ts', 'src/runner.ts')), ['bin/wf.ts imports src/runner.ts: it reaches the package through src/cli.ts'], 'REFUSED: bin/wf.ts reaching past the CLI');
});

test(`the runtime is reached through one client: only ${CLIENT} imports agent-runtime — not even for a type — and every controller beneath the CLI imports it`, () => {
  assert.deepEqual(clientBreaks(packageSources()), []);
});

test('REFUSED: a type imported from the runtime by a controller, a store file, a pure file or the CLI, a client that imports none, a controller that goes round it, and a client above a controller', () => {
  assert.deepEqual(clientBreaks(adding('src/tick.ts', 'agent-runtime')), ['src/tick.ts imports agent-runtime, and only src/runtime-client.ts may']);
  assert.deepEqual(clientBreaks(adding('src/runner.ts', 'agent-runtime')), ['src/runner.ts imports agent-runtime, and only src/runtime-client.ts may']);
  assert.deepEqual(clientBreaks(adding('src/store.ts', 'agent-runtime')), ['src/store.ts imports agent-runtime, and only src/runtime-client.ts may']);
  assert.deepEqual(clientBreaks(adding('src/timeline.ts', 'agent-runtime/effect')), ['src/timeline.ts imports agent-runtime, and only src/runtime-client.ts may']);
  assert.deepEqual(clientBreaks(adding('src/cli.ts', 'agent-runtime')), ['src/cli.ts imports agent-runtime, and only src/runtime-client.ts may']);
  assert.deepEqual(clientBreaks(adding('bin/wf.ts', 'agent-runtime')), ['bin/wf.ts imports agent-runtime, and only src/runtime-client.ts may']);
  assert.deepEqual(clientBreaks(planted(CLIENT, (imports) => imports.filter((m) => !isRuntime(m)))), ['src/runtime-client.ts imports no agent-runtime: CLIENT names the wrong file']);
  assert.deepEqual(clientBreaks(planted('src/views.ts', (imports) => imports.filter((m) => m !== CLIENT))), ['src/views.ts is a controller and does not import src/runtime-client.ts: the controllers reach the runtime through the client']);
  assert.deepEqual(clientBreaks(adding(CLIENT, 'src/tick.ts')), ['src/runtime-client.ts imports src/tick.ts, a controller: the client is beneath every controller']);
});

test('the client and the controllers import one another with no cycle', () => {
  assert.deepEqual(cycles(packageSources()), []);
});

test('REFUSED: a cycle between two controllers, a longer one, and one through the client', () => {
  assert.deepEqual(cycles(adding('src/views.ts', 'src/tick.ts')), ['a cycle: src/tick.ts → src/views.ts → src/tick.ts']);
  assert.deepEqual(cycles(adding('src/start.ts', 'src/decide.ts')), ['a cycle: src/decide.ts → src/tick.ts → src/start.ts → src/decide.ts']);
  assert.deepEqual(cycles(adding(CLIENT, 'src/views.ts')), ['a cycle: src/runtime-client.ts → src/views.ts → src/runtime-client.ts']);
});
