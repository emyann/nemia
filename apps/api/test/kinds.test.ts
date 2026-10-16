/**
 * The api's two kinds of file (`docs/architecture.md`, *The rules*). An entry file (`ENTRY`: the process, the
 * mount and the services) may read the environment and serve HTTP; every other file under `src` is a reader, which reaches the machine
 * only through the orchestrator: it imports no module of the disk, a process, the network or the machine, bare or as `node:`, nor the
 * node server (`IMPURE`), and reads neither `process.env` nor the global `fetch` outside its comment lines (`globalsIn`).
 *
 * Each reader that reaches the machine today is a known exception, listed with what it reaches (`MOVES`), and the list only shrinks.
 * Each entry names the card that moves its reaches (`CARDS`), else the move in words and where it goes. `kindBreaks` refuses a reader
 * that reaches what its entry does not list, an entry listing what its file no longer reaches, an entry for an entry file or a file gone,
 * and an entry that names no card it can be held to. A change that moves a reach out of a file takes it off its entry in the same commit.
 *
 * The scanners of the globals are the orchestrator's (`globalsIn` in its `test/boundary.test.ts`), copied: the two packages share no test
 * code, and that test holds the copy here to its own text.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const API = path.join(import.meta.dirname, '..');

/** The files that may touch the machine: the process, the app's mount, and the services it is given. */
const ENTRY = ['src/main.ts', 'src/app.ts', 'src/layer.ts'];

/** The modules a reader never imports, bare or as `node:`: the disk, a process, the network, the machine, and the node server. */
const IMPURE = [
  ...['fs', 'fs/promises', 'child_process', 'http', 'https', 'net', 'os'].flatMap((m) => [m, `node:${m}`]),
  '@hono/node-server',
];

/** `process.env` however a file reaches it: read off `process`, by `['env']`, or destructured from it (`const { env } = process`). */
const PROCESS_ENV = /\bprocess\s*(?:\.\s*env\b|\[\s*['"`]env['"`]\s*\])|\{[^}]*\benv\b[^}]*\}\s*=\s*(?:globalThis\s*\.\s*)?process\b/;

/**
 * The global `fetch` however a file reaches it: called, passed, aliased, destructured or typed off; never a method of another object
 * (`client.fetch`), a longer name (`prefetch`, `sec-fetch-site`), a quoted word or an object's key (`{ fetch: x }`).
 */
const FETCH = /(?:^|[^.\w$'"`-])fetch(?![\w$-])(?!\s*:)|\bglobalThis\s*\.\s*fetch\b/m;

/** The cards filed to move a reach out of an api reader, by the id an entry names: none filed today. */
const CARDS: Readonly<Record<string, string>> = {};

type Move = { move: string; to: string };
type Entry = { reaches: readonly string[]; card: string } | ({ reaches: readonly string[] } & Move);

const FOLDER_STORE: Move = {
  move: "reading and writing a workflow's folder",
  to: "packages/agent-orchestrator's folder store, read and written through its entry",
};
const RUN_STORE: Move = {
  move: 'reading what a run left on disk',
  to: "packages/agent-orchestrator's runStore, read through its entry",
};

/** Each reader that reaches the machine today, with what it reaches and what moves it. */
const MOVES: Readonly<Record<string, Entry>> = {
  'src/capabilities/capabilities.ts': {
    reaches: ['global:process.env', 'node:fs'],
    move: "reading a harness's settings and servers off the machine",
    to: 'packages/agent-runtime, answered per harness through the orchestrator',
  },
  'src/detail/detail.ts': { reaches: ['node:fs'], ...RUN_STORE },
  'src/factory/quota.ts': {
    reaches: ['global:process.env'],
    move: "the quota asker's default environment, read off the process",
    to: 'the environment `served` gives each handler (src/layer.ts), passed to the asker by its route',
  },
  'src/inbox/inbox.ts': {
    reaches: ['node:fs'],
    move: "reading the inbox's files",
    to: "packages/agent-orchestrator's runStore inbox, read through its entry",
  },
  'src/steps/artifacts.ts': { reaches: ['node:fs'], ...RUN_STORE },
  'src/workflows/builder.ts': { reaches: ['node:fs'], ...FOLDER_STORE },
  'src/workflows/workflows.ts': { reaches: ['node:fs'], ...FOLDER_STORE },
};

/** Source text with each comment line blanked: a line that opens with `//`, `/*` or `*`. */
const withoutComments = (text: string): string =>
  text
    .split('\n')
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line))
    .join('\n');

/** Every module a piece of source names outside its comment lines: imports and re-exports, type-only included, and `import()`. */
function importsIn(text: string): string[] {
  const code = withoutComments(text);
  const found = new Set<string>();
  for (const m of code.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of code.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) found.add(m[1]);
  return [...found];
}

/** The impure globals a piece of source reads outside its comment lines. */
function globalsIn(text: string): string[] {
  const code = withoutComments(text);
  const found: string[] = [];
  if (PROCESS_ENV.test(code)) found.push('global:process.env');
  if (FETCH.test(code)) found.push('global:fetch');
  return found;
}

/** What a piece of source reaches of the machine, sorted: the `IMPURE` modules it imports, a subpath as its package, and the globals. */
const reachesIn = (text: string): string[] =>
  [
    ...new Set([
      ...importsIn(text)
        .map((m) => (m.startsWith('@hono/node-server/') ? '@hono/node-server' : m))
        .filter((m) => IMPURE.includes(m)),
      ...globalsIn(text),
    ]),
  ].sort();

/** Every `.ts` under `src` but the tests beside the code, by its path from the package, with its text. */
const sourceTexts = (): Map<string, string> =>
  new Map(
    fs
      .readdirSync(path.join(API, 'src'), { recursive: true, encoding: 'utf8' })
      .map((f) => `src/${f.split(path.sep).join('/')}`)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(API, f), 'utf8')]),
  );

/** Each file's reaches, for the files that reach anything. */
const measured = (texts: ReadonlyMap<string, string>): Record<string, string[]> =>
  Object.fromEntries([...texts].map(([file, text]) => [file, reachesIn(text)]).filter(([, reaches]) => reaches.length > 0));

/** What an entry fails to name: a card `cards` knows, else a move with where it goes. */
function namingBreak(file: string, entry: Entry, cards: Readonly<Record<string, string>>): string | undefined {
  if ('card' in entry)
    return entry.card in cards
      ? undefined
      : `${file}'s entry in MOVES names ${entry.card}, a card CARDS does not know: name a filed card, or the move and where it goes`;
  if (!entry.move.trim() || !entry.to.trim())
    return `${file}'s entry in MOVES names no card and no move with where it goes: name the card that moves it, else the move and its \`to\``;
  return undefined;
}

/** What tells an entry's file on disk, and the cards an entry may name (`CARDS`). */
type Where = { exists: (file: string) => boolean; cards: Readonly<Record<string, string>> };

/** What one entry of `MOVES` and its file's reaches disagree on. */
function entryBreaks(file: string, entry: Entry, reaches: readonly string[], at: Where): string[] {
  const { exists, cards } = at;
  if (ENTRY.includes(file)) return [`${file} is an entry file, free to reach the machine: take its entry off MOVES`];
  if (!exists(file)) return [`${file} has an entry in MOVES but is not on disk: where it moved, rename its entry; else take it off`];
  const naming = namingBreak(file, entry, cards);
  return [
    ...(naming ? [naming] : []),
    ...entry.reaches
      .filter((r) => !reaches.includes(r))
      .map((r) => `${file} no longer reaches ${r}: take it off its entry in MOVES, and the entry once it lists nothing`),
  ];
}

/**
 * What the readers' reaches and `MOVES` disagree on, each a sentence naming the fix: a reach no entry lists, a reach an entry lists that
 * the file no longer has, an entry for an entry file or a file gone, and an entry that names no card it can be held to.
 */
function kindBreaks(
  reached: Record<string, string[]>,
  moves: Readonly<Record<string, Entry>>,
  exists: (file: string) => boolean,
  cards: Readonly<Record<string, string>> = CARDS,
) {
  const out: string[] = [];
  for (const [file, reaches] of Object.entries(reached)) {
    if (ENTRY.includes(file)) continue;
    const listed = moves[file]?.reaches ?? [];
    for (const r of reaches.filter((x) => !listed.includes(x)))
      out.push(`${file} is a reader and reaches ${r}: only ${ENTRY.join(', ')} touch the machine; reach it through the orchestrator`);
  }
  for (const [file, entry] of Object.entries(moves)) out.push(...entryBreaks(file, entry, reached[file] ?? [], { exists, cards }));
  return out;
}

const onDisk = (file: string): boolean => fs.existsSync(path.join(API, file));

test('the scan sees each module a reader imports and each global it reads, outside its comment lines', () => {
  const text = [
    "import fs from 'node:fs';",
    "import { serve } from '@hono/node-server';",
    "import { serveStatic } from '@hono/node-server/serve-static';",
    "import type { Stats } from 'fs';",
    "import { Hono } from 'hono';",
    'const home = process.env.HOME;',
    'export const go = (p: Promise<URL>) => p.then(fetch);',
    "c.req.header('sec-fetch-site');",
    "// import os from 'node:os'",
    ' * reads `process.env` in a JSDoc',
  ].join('\n');
  assert.deepEqual(reachesIn(text), ['@hono/node-server', 'fs', 'global:fetch', 'global:process.env', 'node:fs']);
  assert.deepEqual(reachesIn("const { env } = process;\nconst h = c.req.header('sec-fetch-site');"), ['global:process.env']);
  const texts = sourceTexts();
  assert.ok(
    [...ENTRY, ...Object.keys(MOVES)].every((f) => texts.has(f)),
    `the scan read ${[...texts.keys()].join(', ')}`,
  );
});

test('only main.ts, app.ts and layer.ts touch the machine; every reader that does today is in MOVES, with its card or move', () => {
  assert.deepEqual(kindBreaks(measured(sourceTexts()), MOVES, onDisk), []);
});

test('REFUSED: a reader that imports the disk or the node server, reads the environment or fetch', () => {
  const planted = (text: string): string[] => kindBreaks(measured(new Map([...sourceTexts(), ['src/x/x.ts', text]])), MOVES, onDisk);
  const refused = (reach: string): string =>
    `src/x/x.ts is a reader and reaches ${reach}: only src/main.ts, src/app.ts, src/layer.ts touch the machine; reach it through the orchestrator`;
  assert.deepEqual(planted("import fs from 'node:fs';\n"), [refused('node:fs')]);
  assert.deepEqual(planted("import { serve } from '@hono/node-server';\n"), [refused('@hono/node-server')]);
  assert.deepEqual(planted('export const root = () => process.env.X;\n'), [refused('global:process.env')]);
  assert.deepEqual(planted('export const go = (p: Promise<URL>) => p.then(fetch);\n'), [refused('global:fetch')]);
  assert.deepEqual(
    planted('/** Reads no `process.env` and calls no `fetch(url)`. */\nexport const x = 1;\n'),
    [],
    'a JSDoc that names them',
  );
  const entry = kindBreaks(
    measured(new Map([...sourceTexts(), ['src/main.ts', "import { serve } from '@hono/node-server';\nconst p = process.env.PORT;\n"]])),
    MOVES,
    onDisk,
  );
  assert.deepEqual(entry, [], 'an entry file is free to reach the machine');
});

test('REFUSED: a baselined reader reaching more, an entry listing a reach gone, an entry for an entry file or a file gone, and one unnamed', () => {
  const exists = (file: string): boolean => file !== 'src/gone.ts';
  const held: Entry = { reaches: ['node:fs'], card: 'c-1' };
  const cards = { 'c-1': 'A card filed to move the reach' };
  const breaks = (reached: Record<string, string[]>, moves: Record<string, Entry>): string[] => kindBreaks(reached, moves, exists, cards);
  assert.deepEqual(breaks({ 'src/a.ts': ['node:fs'] }, { 'src/a.ts': held }), [], 'the reaches the entry lists are let through');
  assert.deepEqual(breaks({ 'src/a.ts': ['node:fs', 'node:os'] }, { 'src/a.ts': held }), [
    'src/a.ts is a reader and reaches node:os: only src/main.ts, src/app.ts, src/layer.ts touch the machine; reach it through the orchestrator',
  ]);
  assert.deepEqual(breaks({}, { 'src/a.ts': held }), [
    'src/a.ts no longer reaches node:fs: take it off its entry in MOVES, and the entry once it lists nothing',
  ]);
  assert.deepEqual(breaks({ 'src/main.ts': ['node:fs'] }, { 'src/main.ts': held }), [
    'src/main.ts is an entry file, free to reach the machine: take its entry off MOVES',
  ]);
  assert.deepEqual(breaks({}, { 'src/gone.ts': held }), [
    'src/gone.ts has an entry in MOVES but is not on disk: where it moved, rename its entry; else take it off',
  ]);
  assert.deepEqual(breaks({ 'src/a.ts': ['node:fs'] }, { 'src/a.ts': { reaches: ['node:fs'], move: 'a move', to: ' ' } }), [
    "src/a.ts's entry in MOVES names no card and no move with where it goes: name the card that moves it, else the move and its `to`",
  ]);
  assert.deepEqual(breaks({ 'src/a.ts': ['node:fs'] }, { 'src/a.ts': { reaches: ['node:fs'], card: 'zzzz' } }), [
    "src/a.ts's entry in MOVES names zzzz, a card CARDS does not know: name a filed card, or the move and where it goes",
  ]);
});

/**
 * The files of `texts` that name the tick's own write of where the branches stand (`passStanding`) outside their comment lines: none,
 * since only the tick writes `standing.json`, and the api's tests call it alone, to stand for a pass.
 */
const tickWritersIn = (texts: ReadonlyMap<string, string>): string[] =>
  [...texts].filter(([, text]) => /\bpassStanding\b/.test(withoutComments(text))).map(([file]) => file);

test('only the tick writes standing.json: no file under src calls `passStanding`', () => {
  assert.deepEqual(tickWritersIn(sourceTexts()), []);
});

test('REFUSED: a file under src that calls `passStanding`, imported or named off the package', () => {
  const planted = (text: string): string[] => tickWritersIn(new Map([...sourceTexts(), ['src/x/x.ts', text]]));
  assert.deepEqual(planted("import { passStanding } from 'agent-orchestrator';\n"), ['src/x/x.ts']);
  assert.deepEqual(planted('export const pass = (o: typeof import("agent-orchestrator")) => o.passStanding([]);\n'), ['src/x/x.ts']);
  assert.deepEqual(planted('/** Never calls `passStanding`: the tick does. */\nexport const x = 1;\n'), [], 'a JSDoc that names it');
});

/** The one file that provides the process's telemetry: the app's layer, which the handlers and the tick's program alike run over. */
const TELEMETRY = 'src/app.ts';

/**
 * The files of `texts` that name the process's telemetry (`telemetryLayer`) outside their comment lines, the app's own layer aside: none,
 * since the app's layer provides it once (`liveOf` in src/app.ts) and a second provider in the process exports every metric twice —
 * Effect's metric registry is a reference whose default map every context that does not override it shares.
 */
const telemetryProvidersIn = (texts: ReadonlyMap<string, string>): string[] =>
  [...texts].filter(([file, text]) => file !== TELEMETRY && /\btelemetryLayer\b/.test(withoutComments(text))).map(([file]) => file);

test('the api provides its telemetry once, in app.ts: no other file under src names `telemetryLayer`', () => {
  const texts = sourceTexts();
  assert.deepEqual(telemetryProvidersIn(texts), []);
  assert.ok(/\btelemetryLayer\b/.test(withoutComments(texts.get(TELEMETRY) ?? '')), `${TELEMETRY} provides it`);
});

test('REFUSED: a second file under src that names `telemetryLayer`, main.ts among them, imported or off the package', () => {
  const planted = (file: string, text: string): string[] => telemetryProvidersIn(new Map([...sourceTexts(), [file, text]]));
  assert.deepEqual(planted('src/main.ts', "import { telemetryLayer } from 'agent-orchestrator';\n"), ['src/main.ts']);
  assert.deepEqual(planted('src/x/x.ts', 'export const t = (o: typeof import("agent-orchestrator")) => o.telemetryLayer({});\n'), [
    'src/x/x.ts',
  ]);
  assert.deepEqual(
    planted('src/x/x.ts', '/** Never provides `telemetryLayer`: app.ts does. */\nexport const x = 1;\n'),
    [],
    'a JSDoc that names it',
  );
});
