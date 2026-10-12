/**
 * The board's structure (`docs/architecture.md`, *Who owns what*): it reaches the api over HTTP alone. Its source imports no workspace
 * package and no node built-in, and no relative path that leaves `apps/web` (`importBreaks`); the lint block for `apps/web/src` in
 * `.oxlintrc.json` refuses the same packages as they are typed. Only `lib/useFeed.ts` and `lib/useStepTranscript.ts` open an
 * `EventSource`, the api's two streams (`eventSourceBreaks`), and only `components/Markdown.tsx` imports a markdown renderer
 * (`rendererBreaks`). Its reads go through `lib/api/read.ts` (`unschemedReads`, `read.test.ts`).
 *
 * The frame, what the root route mounts on every page, never asks for the whole list of the runs: no file the root reaches names
 * `runsQuery` (`wholeListBreaks`), but the pickers a person opens (`OPENED`), a list that only shrinks.
 *
 * The board names no store path and builds no command of its own: a command or a store folder it shows is text the api answered, and no
 * file of `src` spells one, JSDoc included (`STORE_PATHS`, `COMMAND_TEXT`, both empty). `ratchetBreaks` refuses a file the baseline does
 * not hold, a count above the measure or below it, an entry for a file that is gone or clean, and an entry that names no card.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

const WEB = path.join(import.meta.dirname, '..');

/** The two files that open a stream from the api, and only they. */
const STREAMS = ['src/lib/useFeed.ts', 'src/lib/useStepTranscript.ts'];

/** The one file that renders markdown: every surface that shows a text written in markdown draws it through its `Markdown`. */
const RENDERER = 'src/components/Markdown.tsx';

/** A markdown renderer or a plugin of one: react-markdown, a remark or rehype plugin, Streamdown, marked. */
const MARKDOWN_MODULE = /^(?:react-markdown|streamdown|marked|remark(?:-[\w-]+)?|rehype(?:-[\w-]+)?)(?:\/|$)/;

/** A store's path or the variable that moves it: `~/.agent-workflows`, `~/.agent-engine`, `WF_ROOT`, `AE_ROOT`. */
const STORE_PATH = /\.agent-workflows|\.agent-engine|\bWF_ROOT\b|\bAE_ROOT\b/g;

/** A command of the orchestrator's CLI, under its name today or the one it takes: `wf retry`, `nemia start`. */
const COMMAND = /\b(?:wf|nemia) [a-z]+/g;

/** The route that mounts the frame on every page: what it reaches is drawn whatever the page. */
const ROOT = 'src/routes/__root.tsx';

/**
 * The pickers a person opens that the frame reaches, each of which reads the whole list of the runs while it is open, and only then: the
 * start form, with its runs to wait on, and behind it the runs to read as context. The guard does not look past them.
 */
const OPENED = ['src/components/StartRun.tsx'];

/** The board's mirror of the api, which defines the read of the whole list: the guard reads who names it, not the mirror. */
const MIRROR = /^src\/lib\/api(?:\.ts$|\/)/;

type Baseline = Record<string, { count: number; card: string }>;

/** Each file that spells a store path, with its count of them and the card that moves them to the api: none. */
const STORE_PATHS: Baseline = {};

/** Each file that spells a command, JSDoc included, with its count of them and the card that moves them to the api: none. */
const COMMAND_TEXT: Baseline = {};

/** Every `.ts` and `.tsx` under `src`, by its path from `apps/web`, with its text. */
const sourceTexts = (): Map<string, string> =>
  new Map(
    fs
      .readdirSync(path.join(WEB, 'src'), { recursive: true, encoding: 'utf8' })
      .map((f) => `src/${f.split(path.sep).join('/')}`)
      .filter((f) => /\.tsx?$/.test(f))
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(WEB, f), 'utf8')]),
  );

/** Source text with each comment line blanked: a line that opens with `//`, `/*` or `*`. */
const withoutComments = (text: string): string =>
  text
    .split('\n')
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line))
    .join('\n');

/** Every module a piece of source names: imports and re-exports, type-only included, `import()` and `require()`. */
function importsIn(text: string): string[] {
  const code = withoutComments(text);
  const found = new Set<string>();
  for (const m of code.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of code.matchAll(/\b(?:import|require)\s*\(\s*['"`]([^'"`]+)['"`]/g)) found.add(m[1]);
  return [...found].sort();
}

/** Whether a relative module named in `file` leaves `apps/web`. */
const leavesWeb = (file: string, mod: string): boolean =>
  mod.startsWith('.') && path.posix.normalize(path.posix.join(path.posix.dirname(file), mod)).startsWith('../');

/** Whether a relative module named in `file` of `src` is under the board's `test/`: a fixture, a helper, the page of the look's stories. */
const reachesTests = (file: string, mod: string): boolean =>
  mod.startsWith('.') && path.posix.normalize(path.posix.join(path.posix.dirname(file), mod)).startsWith('test/');

/**
 * Each import of the board's source that reaches past the api — a workspace package, a node built-in, a path out of `apps/web` — or
 * into the board's own tests, which the built board never holds.
 */
function importBreaks(texts: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const [file, text] of texts)
    for (const mod of importsIn(text)) {
      if (/^agent-(runtime|orchestrator)(\/|$)/.test(mod))
        out.push(`${file} imports ${mod}, a workspace package: the board reaches the api over HTTP alone`);
      else if (mod.startsWith('node:') || builtinModules.includes(mod))
        out.push(`${file} imports ${mod}, a node built-in: the board runs in a browser, and asks the api for what node knows`);
      else if (leavesWeb(file, mod)) out.push(`${file} imports ${mod}, a path out of apps/web: the board reaches the api over HTTP alone`);
      else if (reachesTests(file, mod))
        out.push(`${file} imports ${mod}, a file of the tests: move what the board needs under src, the built board holds no test`);
    }
  return out;
}

/** Each file outside `STREAMS` that names an `EventSource` in its code: the api's streams are opened in those two files alone. */
const eventSourceBreaks = (texts: ReadonlyMap<string, string>): string[] =>
  [...texts]
    .filter(([file, text]) => !STREAMS.includes(file) && /\bEventSource\b/.test(withoutComments(text)))
    .map(([file]) => `${file} opens an EventSource: the api's streams are opened in ${STREAMS.join(' and ')} alone`);

/** Each import of a markdown renderer or its plugins outside `RENDERER`: the board renders markdown in that one file. */
const rendererBreaks = (texts: ReadonlyMap<string, string>): string[] =>
  [...texts]
    .filter(([file]) => file !== RENDERER)
    .flatMap(([file, text]) =>
      importsIn(text)
        .filter((mod) => MARKDOWN_MODULE.test(mod))
        .map((mod) => `${file} imports ${mod}: the board renders markdown in ${RENDERER} alone, so draw the text with its Markdown`),
    );

/** Each file's count of `pattern`, for the files that hold it at least once. */
const measured = (texts: ReadonlyMap<string, string>, pattern: RegExp): Record<string, number> =>
  Object.fromEntries([...texts].map(([file, text]) => [file, text.match(pattern)?.length ?? 0]).filter(([, count]) => count !== 0));

/**
 * What a measure and its baseline disagree on, each a sentence naming the fix: a file the baseline does not hold, a count above or below
 * the measure, an entry for a file gone or clean, and an entry with no card.
 */
function ratchetBreaks(what: string, counts: Record<string, number>, baseline: Baseline, exists: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const [file, count] of Object.entries(counts))
    if (!(file in baseline))
      out.push(`${file} holds ${count} ${what}: the board shows what the api answers, so have the api answer it, never add it here`);
  for (const [file, { count: allowed, card }] of Object.entries(baseline)) {
    const count = counts[file] ?? 0;
    if (!card.trim()) out.push(`${file}'s entry for ${what} names no card: name the card that moves it to the api`);
    if (!exists(file))
      out.push(`${file} holds ${what} in the baseline but is not on disk: where it moved, rename its entry; else take it off`);
    else if (count === 0) out.push(`${file} holds no ${what} left: take its entry off the baseline`);
    else if (count > allowed)
      out.push(`${file} holds ${count} ${what}, more than the ${allowed} the baseline allows: have the api answer it instead`);
    else if (count < allowed) out.push(`${file} holds ${count} ${what}, fewer than the baseline's ${allowed}: lower its count to ${count}`);
  }
  return out;
}

const onDisk = (file: string): boolean => fs.existsSync(path.join(WEB, file));

test('the scan reads the board, and sees each way a file names a module', () => {
  const texts = sourceTexts();
  assert.ok(texts.size > 100 && STREAMS.every((f) => texts.has(f)), `read ${texts.size} files`);
  const text = [
    "import type { RunSummary } from './api/runs.ts';",
    'import {',
    '  a,',
    "} from '@/lib/multi-line.ts';",
    "export { b } from 'agent-orchestrator/run';",
    "import 'node:fs';",
    "const m = await import('../../../api/src/app.ts');",
    "// from 'nowhere' in a comment is no import",
    " * import('node:os') in a JSDoc is none either",
  ].join('\n');
  assert.deepEqual(importsIn(text), [
    '../../../api/src/app.ts',
    './api/runs.ts',
    '@/lib/multi-line.ts',
    'agent-orchestrator/run',
    'node:fs',
  ]);
});

test('the board imports no workspace package, no node built-in and no path out of apps/web', () => {
  assert.deepEqual(importBreaks(sourceTexts()), []);
});

test('REFUSED: a workspace package, a node built-in, and a path out of apps/web', () => {
  const planted = (mod: string): string[] => importBreaks(new Map([...sourceTexts(), ['src/x.ts', `import { y } from '${mod}';\n`]]));
  assert.deepEqual(planted('agent-orchestrator/run'), [
    'src/x.ts imports agent-orchestrator/run, a workspace package: the board reaches the api over HTTP alone',
  ]);
  assert.deepEqual(planted('agent-runtime'), [
    'src/x.ts imports agent-runtime, a workspace package: the board reaches the api over HTTP alone',
  ]);
  assert.deepEqual(planted('node:fs'), [
    'src/x.ts imports node:fs, a node built-in: the board runs in a browser, and asks the api for what node knows',
  ]);
  assert.deepEqual(planted('path'), [
    'src/x.ts imports path, a node built-in: the board runs in a browser, and asks the api for what node knows',
  ]);
  assert.deepEqual(planted('../../../api/src/app.ts'), [
    'src/x.ts imports ../../../api/src/app.ts, a path out of apps/web: the board reaches the api over HTTP alone',
  ]);
  assert.deepEqual(planted('../../api/src/app.ts'), [
    'src/x.ts imports ../../api/src/app.ts, a path out of apps/web: the board reaches the api over HTTP alone',
  ]);
  for (const mod of ['react', 'agent-orchestrator-ui', './lib/api.ts', '@/lib/api.ts', './test/fixtures.ts'])
    assert.deepEqual(planted(mod), [], `${mod} is let through`);
});

test("REFUSED: a file of the source that imports a test file, the page of the look's stories among them", () => {
  const planted = (mod: string): string[] => importBreaks(new Map([...sourceTexts(), ['src/x.ts', `import { y } from '${mod}';\n`]]));
  assert.deepEqual(planted('../test/fixtures.ts'), [
    'src/x.ts imports ../test/fixtures.ts, a file of the tests: move what the board needs under src, the built board holds no test',
  ]);
  assert.deepEqual(planted('../test/e2e/parts/main.tsx'), [
    'src/x.ts imports ../test/e2e/parts/main.tsx, a file of the tests: move what the board needs under src, the built board holds no test',
  ]);
});

test('REFUSED: the board is built from its one page, never from an entry of its own beside it', () => {
  const entries = (config: string): string[] => [...config.matchAll(/\b(?:input|entry)\s*:/g)].map((m) => m[0]);
  assert.deepEqual(entries("build: { rollupOptions: { input: { parts: 'test/e2e/parts/index.html' } } }"), ['input:']);
  const config = fs.readFileSync(path.join(WEB, 'vite.config.ts'), 'utf8');
  assert.match(config, /export default defineConfig\(/, 'the config is read');
  assert.deepEqual(entries(config), []);
  assert.match(
    fs.readFileSync(path.join(WEB, 'index.html'), 'utf8'),
    /src="\/src\/main\.tsx"/,
    'its page loads the board, and nothing else',
  );
});

/** The file of `texts` a module named in `file` is, for one under `src` named by `@/` or a relative path; none for a package. */
function fileOf(texts: ReadonlyMap<string, string>, file: string, mod: string): string | undefined {
  const at = mod.startsWith('@/')
    ? `src/${mod.slice(2)}`
    : mod.startsWith('.')
      ? path.posix.normalize(path.posix.join(path.posix.dirname(file), mod))
      : undefined;
  if (at === undefined) return undefined;
  return [at, `${at}.ts`, `${at}.tsx`, `${at}/index.ts`, `${at}/index.tsx`].find((candidate) => texts.has(candidate));
}

/**
 * The files the root route, or the file `from`, reaches through its imports, itself among them, in order: the frame. Not entered: the
 * mirror of the api, and the pickers of `OPENED`, each named when reached.
 */
function frameReach(texts: ReadonlyMap<string, string>, from = ROOT): { frame: string[]; opened: string[] } {
  const seen = new Set<string>();
  const opened = new Set<string>();
  const next = texts.has(from) ? [from] : [];
  while (next.length) {
    const file = next.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const mod of importsIn(texts.get(file)!)) {
      const found = fileOf(texts, file, mod);
      if (found === undefined || MIRROR.test(found)) continue;
      if (OPENED.includes(found)) opened.add(found);
      else next.push(found);
    }
  }
  return { frame: [...seen].sort(), opened: [...opened].sort() };
}

/** Each file of the frame that names the read of the whole list of the runs, outside a comment. */
const wholeListBreaks = (texts: ReadonlyMap<string, string>): string[] =>
  frameReach(texts)
    .frame.filter((file) => /\brunsQuery\b/.test(withoutComments(texts.get(file)!)))
    .map(
      (file) =>
        `${file} names runsQuery: the frame is drawn on every page and reads the light answer (openRunsQuery), never the whole list`,
    );

test('nothing the frame reaches reads the whole list of the runs, but the pickers a person opens', () => {
  const texts = sourceTexts();
  const { frame, opened } = frameReach(texts);
  assert.deepEqual(wholeListBreaks(texts), []);
  for (const file of ['src/components/FrameHeader.tsx', 'src/components/FrameFooter.tsx', 'src/components/FrameSidebar.tsx'])
    assert.ok(frame.includes(file), `the scan reaches ${file} from ${ROOT}`);
  assert.ok(frame.includes('src/lib/bell.ts'), "and what the frame's components read in turn");
  assert.deepEqual(opened, OPENED, 'every picker let through is still reached from the root: take one that is not off the list');
  for (const file of OPENED)
    assert.match(withoutComments(texts.get(file)!), /\brunsQuery\b/, `${file} reads the whole list no more: take it off the list`);
});

test('REFUSED: a read of the whole list in a file of the frame, or in one a file of the frame imports; a JSDoc and a page are let through', () => {
  const texts = sourceTexts();
  const footer = 'src/components/FrameFooter.tsx';
  const header = 'src/components/FrameHeader.tsx';
  const why = 'names runsQuery: the frame is drawn on every page and reads the light answer (openRunsQuery), never the whole list';
  const direct = new Map([...texts, [footer, `${texts.get(footer)!}\nimport { runsQuery } from '@/lib/api';\nvoid runsQuery;\n`]]);
  assert.deepEqual(wholeListBreaks(direct), [`${footer} ${why}`]);
  const through = new Map([
    ...texts,
    [header, `import { x } from './x';\n${texts.get(header)!}\nvoid x;\n`],
    ['src/components/x.tsx', "import { runsQuery } from '../lib/api';\nexport const x = runsQuery;\n"],
  ]);
  assert.deepEqual(wholeListBreaks(through), [`src/components/x.tsx ${why}`]);
  const said = new Map([...texts, [footer, `${texts.get(footer)!}\n/** Not \`runsQuery\`: the light answer. */\nexport const y = 1;\n`]]);
  assert.deepEqual(wholeListBreaks(said), []);
  assert.match(texts.get('src/routes/index.tsx')!, /\brunsQuery\b/, 'a page the root does not reach keeps the whole list');
  assert.ok(!frameReach(texts).frame.includes('src/routes/index.tsx'));
});

/** The Runs page's route. */
const RUNS = 'src/routes/runs.index.tsx';

/** Each file the Runs page reaches through its imports, itself among them, that names the read of the whole list outside a comment. */
const runsPageBreaks = (texts: ReadonlyMap<string, string>): string[] =>
  frameReach(texts, RUNS)
    .frame.filter((file) => /\brunsQuery\b/.test(withoutComments(texts.get(file)!)))
    .map((file) => `${file} names runsQuery: the Runs page reads the light answer and a page of the finished runs, never the whole list`);

test('REFUSED: a read of the whole list on the Runs page, or in a part it draws', () => {
  const texts = sourceTexts();
  const reach = frameReach(texts, RUNS).frame;
  for (const file of ['src/components/WaitingCard.tsx', 'src/components/FlightTable.tsx', 'src/components/FinishedTable.tsx'])
    assert.ok(reach.includes(file), `the scan reaches ${file} from ${RUNS}`);
  assert.match(withoutComments(texts.get(RUNS)!), /\bopenRunsQuery\b[\s\S]*\bfinishedRunsQuery\b/, 'the page asks its two reads');
  assert.deepEqual(runsPageBreaks(texts), []);
  const why = 'names runsQuery: the Runs page reads the light answer and a page of the finished runs, never the whole list';
  const direct = new Map([...texts, [RUNS, `${texts.get(RUNS)!}\nimport { runsQuery } from '../lib/api';\nvoid runsQuery;\n`]]);
  assert.deepEqual(runsPageBreaks(direct), [`${RUNS} ${why}`]);
  const card = 'src/components/WaitingCard.tsx';
  const through = new Map([...texts, [card, `${texts.get(card)!}\nimport { runsQuery } from '@/lib/api';\nvoid runsQuery;\n`]]);
  assert.deepEqual(runsPageBreaks(through), [`${card} ${why}`]);
});

test(`only ${STREAMS.join(' and ')} open an EventSource`, () => {
  assert.deepEqual(eventSourceBreaks(sourceTexts()), []);
});

test('REFUSED: an EventSource opened in another file; one named in a JSDoc is let through', () => {
  const planted = (text: string): string[] => eventSourceBreaks(new Map([...sourceTexts(), ['src/lib/x.ts', text]]));
  assert.deepEqual(planted("const s = new EventSource('/api/feed/stream');\n"), [
    "src/lib/x.ts opens an EventSource: the api's streams are opened in src/lib/useFeed.ts and src/lib/useStepTranscript.ts alone",
  ]);
  assert.deepEqual(planted('/** Follows an EventSource, or anything that dispatches its events. */\nexport const x = 1;\n'), []);
});

test(`only ${RENDERER} imports a markdown renderer, and it does`, () => {
  const texts = sourceTexts();
  assert.deepEqual(rendererBreaks(texts), []);
  assert.ok(
    importsIn(texts.get(RENDERER)!).some((mod) => MARKDOWN_MODULE.test(mod)),
    `${RENDERER} renders with react-markdown`,
  );
});

test('REFUSED: a second markdown renderer, or a plugin of one, imported outside the one renderer', () => {
  const planted = (text: string): string[] => rendererBreaks(new Map([...sourceTexts(), ['src/x.tsx', text]]));
  assert.deepEqual(planted("import { Streamdown } from 'streamdown';\n"), [
    'src/x.tsx imports streamdown: the board renders markdown in src/components/Markdown.tsx alone, so draw the text with its Markdown',
  ]);
  assert.deepEqual(planted("import ReactMarkdown from 'react-markdown';\n"), [
    'src/x.tsx imports react-markdown: the board renders markdown in src/components/Markdown.tsx alone, so draw the text with its Markdown',
  ]);
  for (const mod of ['marked', 'remark-gfm', 'rehype-raw', 'rehype-sanitize/lib'])
    assert.match(planted(`import x from '${mod}';\n`).join('\n'), new RegExp(`^src/x\\.tsx imports ${mod}:`), mod);
  for (const mod of ['./Markdown', '@/components/Markdown', 'remarks'])
    assert.deepEqual(planted(`import x from '${mod}';\n`), [], `${mod} is let through`);
});

test('the board spells no store path and no command: the api answers each', () => {
  const texts = sourceTexts();
  assert.deepEqual(ratchetBreaks('store paths', measured(texts, STORE_PATH), STORE_PATHS, onDisk), []);
  assert.deepEqual(ratchetBreaks('commands', measured(texts, COMMAND), COMMAND_TEXT, onDisk), []);
});

test('the patterns find what they name, and not their neighbours', () => {
  const texts = new Map([
    ['a.ts', "const root = '~/.agent-workflows/runs'; // AE_ROOT\nconst e = process.env.WF_ROOT;\nconst no = 'WF_ROOTS .agent-engined';"],
    [
      'b.ts',
      '/** Run `wf retry <run> <step>`, or `nemia start` once renamed. */\nconst s = `wf decide ${id}`;\nconst no = "wfx retry, wf 2";',
    ],
  ]);
  assert.deepEqual(measured(texts, STORE_PATH), { 'a.ts': 4 });
  assert.deepEqual(measured(texts, COMMAND), { 'b.ts': 3 });
});

test('REFUSED: a new file that spells a store path or a command, a count above or below the baseline, an entry gone, clean or with no card', () => {
  const baseline: Baseline = { 'src/a.ts': { count: 2, card: 'slice 4' } };
  const exists = (file: string): boolean => file !== 'src/gone.ts';
  const breaks = (counts: Record<string, number>, entries: Baseline = baseline): string[] =>
    ratchetBreaks('commands', counts, entries, exists);
  assert.deepEqual(breaks({ 'src/a.ts': 2 }), [], 'the measure the baseline holds is let through');
  assert.deepEqual(breaks({ 'src/a.ts': 2, 'src/b.ts': 1 }), [
    'src/b.ts holds 1 commands: the board shows what the api answers, so have the api answer it, never add it here',
  ]);
  assert.deepEqual(breaks({ 'src/a.ts': 3 }), [
    'src/a.ts holds 3 commands, more than the 2 the baseline allows: have the api answer it instead',
  ]);
  assert.deepEqual(breaks({ 'src/a.ts': 1 }), ["src/a.ts holds 1 commands, fewer than the baseline's 2: lower its count to 1"]);
  assert.deepEqual(breaks({}), ['src/a.ts holds no commands left: take its entry off the baseline']);
  assert.deepEqual(breaks({}, { 'src/gone.ts': { count: 1, card: 'slice 4' } }), [
    'src/gone.ts holds commands in the baseline but is not on disk: where it moved, rename its entry; else take it off',
  ]);
  assert.deepEqual(breaks({ 'src/a.ts': 2 }, { 'src/a.ts': { count: 2, card: ' ' } }), [
    "src/a.ts's entry for commands names no card: name the card that moves it to the api",
  ]);
  const planted = new Map([...sourceTexts(), ['src/x.ts', "const say = 'run wf retry, under ~/.agent-workflows';\n"]]);
  assert.deepEqual(ratchetBreaks('store paths', measured(planted, STORE_PATH), STORE_PATHS, onDisk), [
    'src/x.ts holds 1 store paths: the board shows what the api answers, so have the api answer it, never add it here',
  ]);
  assert.deepEqual(ratchetBreaks('commands', measured(planted, COMMAND), COMMAND_TEXT, onDisk), [
    'src/x.ts holds 1 commands: the board shows what the api answers, so have the api answer it, never add it here',
  ]);
});
