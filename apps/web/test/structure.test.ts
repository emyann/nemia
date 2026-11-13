/**
 * The board's structure (`docs/architecture.md`, *Who owns what*): it reaches the api over HTTP alone. Its source imports no workspace
 * package but the objects' one entry, `objects`, the shapes of what the api serves, and no path into them; no node built-in, and no
 * relative path that leaves `apps/web` (`importBreaks`); the lint block for `apps/web/src` in
 * `.oxlintrc.json` refuses the same packages as they are typed. Only `lib/useFeed.ts` and `lib/useStepTranscript.ts` open an
 * `EventSource`, the api's two streams (`eventSourceBreaks`), and only `components/markdown/Markdown.tsx` imports a markdown renderer
 * (`rendererBreaks`). Its reads go through `lib/api/objects.ts` (`clientBreaks`, `api-files.test.ts`).
 *
 * No page asks for the whole list of the runs to draw itself: no file the root route or any route reaches names a read of every run
 * (`runsQuery`, `runsSelectedQuery`) outside a comment (`wholeListBreaks`), but the pages of `KEPT_WHOLE`, each named with why.
 *
 * The board names no store path and builds no command of its own: a command or a store folder it shows is text the api answered, and no
 * file of `src` spells one, JSDoc included (`STORE_PATHS`, `COMMAND_TEXT`, both empty). `ratchetBreaks` refuses a file the baseline does
 * not hold, a count above the measure or below it, an entry for a file that is gone or clean, and an entry that names no card.
 *
 * A person's words for a step's state are written once, in `src/lib/words.ts`'s `PERSON`: no other file spells a word of it
 * (`personWordBreaks`), no file says a retired phrasing or `cancelled` to a person (`retiredBreaks`), and no hover says a runtime word
 * (`hoverRuntimeBreaks`). A person's words for an offer are written once, in its `OFFERS`: no other file spells a sentence of it
 * (`offerWordBreaks`).
 *
 * No file of the board compares the runtime's `needs-human`: a question a session asks is read off its codes (`needsHumanBreaks`).
 *
 * A kind of `objects` is read through `lib/api/objects.ts`, never a schema of the board's: no file under `src/lib/api` is generated
 * (`*.gen.ts`), and no file of `src` declares a Schema named as a kind (`kindSchemaBreaks`).
 *
 * The default factory is objects' `DEFAULT_NAMESPACE`, never a name of the board's: no file declares or names a constant of its own for
 * it, says `'default'` for a factory or a namespace, or converts null to that name or back but `src/lib/api/namespace.ts`, its two
 * converters, which `src/lib/factories.ts` re-exports (`defaultFactoryBreaks`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { specifiersIn, withoutComments } from 'test-kit/imports';
import ts from 'typescript';
import { KINDS } from 'objects';
import { OFFERS, PAUSED, PERSON } from '../src/lib/words.ts';

const WEB = path.join(import.meta.dirname, '..');

/**
 * The files that open a stream from the api, and only they: the feed, a step's conversation, her chat, a fix's output, and an upgrade's.
 */
const STREAMS = [
  'src/lib/useFeed.ts',
  'src/lib/useStepTranscript.ts',
  'src/lib/useNemiaChat.ts',
  'src/lib/useFixFollow.ts',
  'src/lib/useUpgradeFollow.ts',
];

/** The one file that renders markdown: every surface that shows a text written in markdown draws it through its `Markdown`. */
const RENDERER = 'src/components/markdown/Markdown.tsx';

/** A markdown renderer or a plugin of one: react-markdown, a remark or rehype plugin, Streamdown, marked. */
const MARKDOWN_MODULE = /^(?:react-markdown|streamdown|marked|remark(?:-[\w-]+)?|rehype(?:-[\w-]+)?)(?:\/|$)/;

/** A store's path or the variable that moves it: `~/.agent-workflows`, `~/.agent-engine`, `WF_ROOT`, `AE_ROOT`. */
const STORE_PATH = /\.agent-workflows|\.agent-engine|\bWF_ROOT\b|\bAE_ROOT\b/g;

/** A command of the orchestrator's CLI, under its name today or the one it takes: `wf retry`, `nemia start`. */
const COMMAND = /\b(?:wf|nemia) [a-z]+/g;

/** The route that mounts the frame on every page: what it reaches is drawn whatever the page. */
const ROOT = 'src/routes/__root.tsx';

/** The routes' folder: each file of it is a page the router mounts, under the root. */
const ROUTES = 'src/routes/';

/** The reads of every run the api lists, a page at a time to the last: the whole list, or a label's whole list of it. */
const WHOLE = /\b(?:runsQuery|runsSelectedQuery)\b/;

/**
 * The pages that may still read a list of the runs whole, each with why. The labels page counts a label's runs by how each ended
 * (landed, failed, stopped), which the light answer's counts by state cannot give, and its list is narrowed by the label in its address,
 * never every run.
 */
const KEPT_WHOLE: Readonly<Record<string, string>> = {
  'src/routes/labels.$key.$value.tsx': "counts a label's runs by how each ended, narrowed by the label in its address",
};

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

/** Every module a piece of source names outside its comment lines: imports and re-exports, type-only included, `import()`, `require()`. */
const importsIn = (text: string): string[] => specifiersIn(withoutComments(text), { calls: ['import', 'require'] });

/** Whether a relative module named in `file` leaves `apps/web`. */
const leavesWeb = (file: string, mod: string): boolean =>
  mod.startsWith('.') && path.posix.normalize(path.posix.join(path.posix.dirname(file), mod)).startsWith('../');

/** Whether a relative module named in `file` of `src` is under the board's `test/`: a fixture, a helper, the page of the look's stories. */
const reachesTests = (file: string, mod: string): boolean =>
  mod.startsWith('.') && path.posix.normalize(path.posix.join(path.posix.dirname(file), mod)).startsWith('test/');

/** The objects' package, the one workspace package the board imports, by its entry alone: spelled once, so no plant names a path of it. */
const OBJECTS = 'objects';

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
      else if (mod.startsWith(`${OBJECTS}/`))
        out.push(`${file} imports ${mod}, a path into ${OBJECTS}: import what it names from its entry, '${OBJECTS}'`);
      else if (mod.startsWith('node:') || builtinModules.includes(mod))
        out.push(`${file} imports ${mod}, a node built-in: the board runs in a browser, and asks the api for what node knows`);
      else if (leavesWeb(file, mod)) out.push(`${file} imports ${mod}, a path out of apps/web: the board reaches the api over HTTP alone`);
      else if (reachesTests(file, mod))
        out.push(`${file} imports ${mod}, a file of the tests: move what the board needs under src, the built board holds no test`);
    }
  return out;
}

/**
 * Each file outside `STREAMS` that names an `EventSource` in its code: the api's streams — the workflow feed's, a step's transcript and
 * Nemia's chat — are opened in those files alone.
 */
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
    "/** import('node:os') in a JSDoc is none either */",
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
  for (const mod of ['react', 'agent-orchestrator-ui', './lib/api.ts', '@/lib/api.ts', './test/fixtures.ts', OBJECTS, `${OBJECTS}-ui`])
    assert.deepEqual(planted(mod), [], `${mod} is let through`);
});

test('REFUSED: a path into the objects; their entry is let through', () => {
  const planted = (mod: string): string[] => importBreaks(new Map([['src/x.ts', `import { y } from '${mod}';\n`]]));
  assert.equal(planted(`${OBJECTS}/src/run.ts`).length, 1, 'a file of its src');
  assert.equal(planted(`${OBJECTS}/package.json`).length, 1, 'its manifest');
  assert.deepEqual(planted(OBJECTS), [], 'its entry');
});

/** The names a Schema of a kind of `objects` goes by: the kind, its list, each with `Schema` after it or without. */
const KIND_NAMES: ReadonlySet<string> = new Set(KINDS.flatMap((kind) => [kind, `${kind}List`].flatMap((n) => [n, `${n}Schema`])));

/**
 * Each file under `src/lib/api` named `*.gen.ts`, and each declaration of `src` of a Schema named as a kind of `objects`
 * (`KIND_NAMES`): a `const` whose value is built from `Schema` or `decodes`. The board reads a kind through `lib/api/objects.ts`.
 */
function kindSchemaBreaks(texts: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const [file, text] of texts) {
    if (/^src\/lib\/api\/.*\.gen\.ts$/.test(file))
      out.push(`${file} is generated: a kind of objects is read through lib/api/objects.ts, so delete it and read the kind there`);
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        KIND_NAMES.has(node.name.text) &&
        node.initializer !== undefined &&
        /^(?:Schema\.|decodes\b)/.test(node.initializer.getText(source))
      )
        out.push(
          `${file} declares a Schema ${node.name.text}, a kind of objects: import its Schema from 'objects' and read it through lib/api/objects.ts`,
        );
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
}

test('no file of the board mirrors a kind of objects: none generated under lib/api, no Schema named as a kind', () => {
  assert.ok(KIND_NAMES.has('RunSchema') && KIND_NAMES.has('Card'), [...KIND_NAMES].join(', '));
  assert.deepEqual(kindSchemaBreaks(sourceTexts()), []);
});

test('REFUSED: a generated file under lib/api, and a Schema of src named as a kind of objects', () => {
  const planted = (file: string, text: string): string[] => kindSchemaBreaks(new Map([...sourceTexts(), [file, text]]));
  assert.equal(planted('src/lib/api/run.gen.ts', 'export const x = 1;\n').length, 1, 'a generated file under lib/api');
  assert.equal(
    planted('src/lib/x.ts', "import { Schema } from 'effect';\nexport const RunSchema = Schema.Struct({ kind: Schema.String });\n").length,
    1,
    'a RunSchema',
  );
  assert.equal(
    planted('src/lib/api/y.ts', 'const Run = Schema.Struct({});\nconst CardList = decodes<X>()(Schema.Struct({}));\n').length,
    2,
  );
  assert.deepEqual(
    planted('src/lib/z.ts', "import { Run } from 'objects';\nconst RunView = Schema.Struct({});\nconst Card = 1;\n"),
    [],
    'a kind imported, a name beside one, a value that is no Schema',
  );
  assert.deepEqual(planted('src/routeTree.gen.ts', 'export const x = 1;\n'), [], "the router's generated tree, out of lib/api");
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
 * The files the root route, or each file of `from`, reaches through its imports, themselves among them, in order. Not entered: the
 * mirror of the api, which defines the reads and is read by name where it is imported.
 */
function frameReach(texts: ReadonlyMap<string, string>, from: readonly string[] = [ROOT]): string[] {
  const seen = new Set<string>();
  const next = from.filter((file) => texts.has(file));
  while (next.length) {
    const file = next.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const mod of importsIn(texts.get(file)!)) {
      const found = fileOf(texts, file, mod);
      if (found !== undefined && !MIRROR.test(found)) next.push(found);
    }
  }
  return [...seen].sort();
}

/** The Runs page's route. */
const RUNS = 'src/routes/runs.index.tsx';

/** Every page of `texts`: the root route and each route file. */
const pagesOf = (texts: ReadonlyMap<string, string>): string[] => [...texts.keys()].filter((file) => file.startsWith(ROUTES)).sort();

/**
 * Each file a page reaches that names a read of every run outside a comment, but a page of `kept`; and each page of `kept` that names
 * none any more, or is gone, so the list only shrinks.
 */
const wholeListBreaks = (texts: ReadonlyMap<string, string>, kept: Readonly<Record<string, string>> = KEPT_WHOLE): string[] => [
  ...frameReach(texts, pagesOf(texts))
    .filter((file) => !(file in kept) && WHOLE.test(withoutComments(texts.get(file)!)))
    .map((file) => `${file} reads every run: a page reads the light answer (openRunsQuery) and a page of the finished, never the whole list`),
  ...Object.keys(kept)
    .filter((file) => !texts.has(file) || !WHOLE.test(withoutComments(texts.get(file)!)))
    .map((file) => `${file} reads the whole list no more, or is gone: take it off KEPT_WHOLE`),
];

/** The files a break names, first word of each. */
const brokenFiles = (breaks: readonly string[]): string[] => breaks.map((line) => line.split(' ')[0]);

test('no page, nor anything a page reaches, reads the whole list of the runs, but the pages kept by name', () => {
  const texts = sourceTexts();
  assert.deepEqual(wholeListBreaks(texts), []);
  const reach = frameReach(texts, pagesOf(texts));
  for (const file of [
    'src/components/frame/FrameHeader.tsx',
    'src/lib/footer.ts',
    'src/routes/index.tsx',
    'src/components/frame/OverviewStrip.tsx',
    'src/components/factory/FactoryCanvas.tsx',
    'src/components/run/StartRun.tsx',
    'src/components/agent/ContextPicker.tsx',
    'src/components/run/HoldRun.tsx',
    'src/components/agent/TryAgent.tsx',
    'src/components/run/FinishedTable.tsx',
  ])
    assert.ok(reach.includes(file), `the scan reaches ${file} from a page`);
  assert.ok(pagesOf(texts).includes(ROOT), 'the root is a page');
  assert.match(withoutComments(texts.get(RUNS)!), /\bopenRunsQuery\b[\s\S]*\bfinishedRunsQuery\b/, 'the Runs page asks its two reads');
});

test('REFUSED: a read of every run on a page, or in a part a page draws; a JSDoc let through; a page kept that reads it no more', () => {
  const texts = sourceTexts();
  const planted = (file: string, from: string) =>
    new Map([...texts, [file, `${texts.get(file)!}\nimport { runsQuery } from '${from}';\nvoid runsQuery;\n`]]);
  assert.deepEqual(brokenFiles(wholeListBreaks(planted('src/routes/index.tsx', '@/lib/api/runs'))), ['src/routes/index.tsx']);
  assert.deepEqual(brokenFiles(wholeListBreaks(planted('src/routes/factories.$factory.tsx', '@/lib/api/runs'))), [
    'src/routes/factories.$factory.tsx',
  ]);
  const hold = 'src/components/run/HoldRun.tsx';
  assert.deepEqual(brokenFiles(wholeListBreaks(planted(hold, '../../lib/api/runs.ts'))), [hold]);
  const header = 'src/components/frame/FrameHeader.tsx';
  const through = new Map([
    ...texts,
    [header, `import { x } from './x';\n${texts.get(header)!}\nvoid x;\n`],
    ['src/components/frame/x.tsx', "import { runsSelectedQuery } from '../../lib/api/runs.ts';\nexport const x = runsSelectedQuery('');\n"],
  ]);
  assert.deepEqual(brokenFiles(wholeListBreaks(through)), ['src/components/frame/x.tsx']);
  const strip = 'src/components/frame/OverviewStrip.tsx';
  const said = new Map([...texts, [strip, `${texts.get(strip)!}\n/** Not \`runsQuery\`: the light answer. */\nexport const y = 1;\n`]]);
  assert.deepEqual(wholeListBreaks(said), []);
  const stale = { ...KEPT_WHOLE, 'src/routes/stats.tsx': 'reads every run no more' };
  assert.deepEqual(brokenFiles(wholeListBreaks(texts, stale)), ['src/routes/stats.tsx']);
});

/** Why the waiting card's source is refused, if it is: its figure must be the present wait, never the run's waits summed. */
const waitedBreaks = (text: string): string[] => {
  const code = withoutComments(text);
  return [
    ...(/data-waited[\s\S]*?\{\s*waited\s*\}/.test(code) && /\bwaited\s*=\s*presentWait\(/.test(code)
      ? []
      : ['the [data-waited] figure is not presentWait: it says how long the run has waited this time']),
    ...(/\bpersonMs\b/.test(code) ? ['it names personMs: the sum of every wait is the Clock tile’s row, never the card’s figure'] : []),
  ];
};

test('REFUSED: a waiting card whose figure reads the sum of the run’s waits on a person', () => {
  const card = sourceTexts().get('src/components/run/WaitingCard.tsx')!;
  assert.deepEqual(waitedBreaks(card), []);
  const summed = card.replace(/\{\s*waited\s*\}/, "{durationWords(run.clock.personMs, 'minute')}");
  assert.notEqual(summed, card, 'the figure is planted over');
  assert.equal(waitedBreaks(summed).length, 2);
  assert.equal(waitedBreaks(card.replace(/presentWait\(run, asOf\)/, 'null')).length, 1);
});

test(`only ${STREAMS.join(' and ')} open an EventSource`, () => {
  assert.deepEqual(eventSourceBreaks(sourceTexts()), []);
});

test('REFUSED: an EventSource opened in another file; one named in a JSDoc is let through', () => {
  const planted = (text: string): string[] => eventSourceBreaks(new Map([...sourceTexts(), ['src/lib/x.ts', text]]));
  assert.deepEqual(planted("const s = new EventSource('/api/feed/stream');\n"), [
    `src/lib/x.ts opens an EventSource: the api's streams are opened in ${STREAMS.join(' and ')} alone`,
  ]);
  assert.deepEqual(planted('/** Follows an EventSource, or anything that dispatches its events. */\nexport const x = 1;\n'), []);
});

/** The runtime's word for a task whose harness stopped its session to ask, quoted as a value in code. */
const NEEDS_HUMAN = /(['"`])needs-human\1/;

/**
 * Each file whose code quotes the runtime's `needs-human`: the runtime keeps that word, and the board reads the orchestrator's codes
 * above it — a question its session asks is `AwaitingAnswer` with `via` `session`, the board's `asks-in-session` (`stepState`,
 * `src/lib/status.ts`). A comment that names the engine's word is let through.
 */
const needsHumanBreaks = (texts: ReadonlyMap<string, string>): string[] =>
  [...texts]
    .filter(([, text]) => NEEDS_HUMAN.test(withoutComments(text)))
    .map(
      ([file]) =>
        `${file} compares the runtime's needs-human: read the step's codes, reason AwaitingAnswer via session, as stepState in src/lib/status.ts does`,
    );

test("no file of the board compares the runtime's needs-human: a question its session asks is read off the codes", () => {
  assert.deepEqual(needsHumanBreaks(sourceTexts()), []);
});

test('REFUSED: a needs-human comparison planted in the board; one named in a comment is let through', () => {
  const planted = (text: string): string[] => needsHumanBreaks(new Map([...sourceTexts(), ['src/lib/x.ts', text]]));
  for (const quote of ["'", '"', '`']) {
    const breaks = planted(`export const asks = (word: string): boolean => word === ${quote}needs-human${quote};\n`);
    assert.equal(breaks.length, 1, quote);
    assert.match(breaks[0] ?? '', /^src\/lib\/x\.ts compares the runtime's needs-human:/, quote);
  }
  assert.deepEqual(planted("/** The engine's `needs-human`, read off the codes. */\nexport const x = 1;\n"), []);
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
    'src/x.tsx imports streamdown: the board renders markdown in src/components/markdown/Markdown.tsx alone, so draw the text with its Markdown',
  ]);
  assert.deepEqual(planted("import ReactMarkdown from 'react-markdown';\n"), [
    'src/x.tsx imports react-markdown: the board renders markdown in src/components/markdown/Markdown.tsx alone, so draw the text with its Markdown',
  ]);
  for (const mod of ['marked', 'remark-gfm', 'rehype-raw', 'rehype-sanitize/lib'])
    assert.match(planted(`import x from '${mod}';\n`).join('\n'), new RegExp(`^src/x\\.tsx imports ${mod}:`), mod);
  for (const mod of ['./Markdown', '@/components/markdown/Markdown', 'remarks'])
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

/** The one file that writes a person's words for a step's state. */
const WORDS = 'src/lib/words.ts';

/** The kit's components, another repository's files: their words are not the board's. */
const KIT = /^src\/components\/ui\//;

/**
 * A piece of text a file of `src` says: a string, a part of a template, or JSX text; whether it is whole (no part of a template),
 * whether it is in a `title`, and whether it is JSX text.
 */
type Said = { text: string; whole: boolean; title: boolean; jsx: boolean };

/** Every piece of text `text` says, read through TypeScript's tree: no comment, no module a file imports. */
function saidIn(file: string, text: string): Said[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const out: Said[] = [];
  const visit = (node: ts.Node, title: boolean): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push({ text: node.text, whole: true, title, jsx: false });
    else if (ts.isTemplateLiteralToken(node)) out.push({ text: node.text, whole: false, title, jsx: false });
    else if (ts.isJsxText(node)) out.push({ text: node.text, whole: true, title, jsx: true });
    const inTitle = title || (ts.isJsxAttribute(node) && node.name.getText(source) === 'title');
    ts.forEachChild(node, (child) => visit(child, inTitle));
  };
  visit(source, false);
  return out;
}

/** The files of `src` whose words are the board's: every one but the kit's. */
const boardTexts = (texts: ReadonlyMap<string, string>): Array<[string, string]> => [...texts].filter(([file]) => !KIT.test(file));

/**
 * Each whole text outside `WORDS` that is a person's word for a state, of more than one word (`waits on you`, `called off`), as the
 * rail writes it: a state's words are written in `PERSON` alone, and read from there. A label that opens with a capital (`At work`, a
 * gauge's name) and a part of a sentence pass.
 */
const personWordBreaks = (texts: ReadonlyMap<string, string>, rails: readonly string[]): string[] => {
  const multi = new Set(rails.filter((rail) => rail.includes(' ')));
  return boardTexts(texts)
    .filter(([file]) => file !== WORDS)
    .flatMap(([file, text]) =>
      saidIn(file, text)
        .filter((said) => said.whole && multi.has(said.text.trim()))
        .map((said) => `${file} spells '${said.text.trim()}', a state's word for a person: read it from PERSON in ${WORDS}`),
    );
};

/** The phrasings a person no longer reads, word-bounded: `waits for your approval` is not `waits for you`, nor `not signed off` the tag. */
const RETIRED = /\b(?:waits for you\b|check refused\b|not signed\b(?! off))/i;

/**
 * Each text of `src` that says a retired phrasing, or `cancelled` to a person (in JSX text, or in a sentence): the board says
 * `called off`. A bare `'cancelled'` is the code's word, and passes.
 */
const retiredBreaks = (texts: ReadonlyMap<string, string>): string[] =>
  boardTexts(texts).flatMap(([file, text]) =>
    saidIn(file, text)
      .filter((said) => RETIRED.test(said.text) || (/\bcancelled\b/i.test(said.text) && (said.jsx || /\S\s+\S/.test(said.text.trim()))))
      .map(
        (said) => `${file} says '${said.text.trim()}': write the person's word of ${WORDS} (waits on you, failed its check, called off)`,
      ),
  );

/** The runtime's words, which a person hovering over the board never reads. */
const RUNTIME = /\b(?:journal|engine|WF_MAX_RUNS)\b/i;

/** Each hover text — a JSX `title`, or any value of `WORDS`, which the chips' hovers read — that says a runtime word. */
const hoverRuntimeBreaks = (texts: ReadonlyMap<string, string>): string[] =>
  boardTexts(texts).flatMap(([file, text]) =>
    saidIn(file, text)
      .filter((said) => (said.title || file === WORDS) && RUNTIME.test(said.text))
      .map((said) => `${file} says '${said.text.trim()}' on hover: say it in a person's words, with no runtime word`),
  );

/** The rail words, from the one table and the pause's word beside it. */
const RAILS = [...Object.values(PERSON), PAUSED].map((words) => words.rail);

test(`a state's words for a person are written in ${WORDS} alone, as a total Record<StepState, PersonWords>`, () => {
  const texts = sourceTexts();
  assert.match(texts.get(WORDS)!, /export const PERSON: Record<StepState, PersonWords> =/);
  assert.ok(RAILS.filter((rail) => rail.includes(' ')).length >= 5, 'the scan has multi-word rails to look for');
  assert.deepEqual(personWordBreaks(texts, RAILS), []);
  assert.deepEqual(retiredBreaks(texts), []);
  assert.deepEqual(hoverRuntimeBreaks(texts), []);
});

/** Stands for what an offer's words are given (a step's name, the calls denied), so a sentence is read around it. */
const GIVEN = '\u0000';

/**
 * The sentences of `OFFERS`, each of four words or more: every string in it, and every function's fixed parts around what it is given.
 * A short word (`Try again`, `Continue`) is a button's, which other parts of the board say too.
 */
const offerSentences = (words: unknown): string[] => {
  const pieces =
    typeof words === 'string'
      ? [words]
      : typeof words === 'function'
        ? String((words as (given: string) => unknown)(GIVEN)).split(GIVEN)
        : words && typeof words === 'object'
          ? Object.values(words).flatMap(offerSentences)
          : [];
  return [...new Set(pieces.map((piece) => piece.trim()).filter((piece) => piece.split(/\s+/).length >= 4))];
};

/** Each text outside `WORDS` that says a sentence of `OFFERS`: an offer's words are written there alone, and read from there. */
const offerWordBreaks = (texts: ReadonlyMap<string, string>, sentences: readonly string[]): string[] =>
  boardTexts(texts)
    .filter(([file]) => file !== WORDS)
    .flatMap(([file, text]) =>
      saidIn(file, text).flatMap((said) =>
        sentences
          .filter((sentence) => said.text.includes(sentence))
          .map((sentence) => `${file} spells '${sentence}', an offer's words for a person: read it from OFFERS in ${WORDS}`),
      ),
    );

const SENTENCES = offerSentences(OFFERS);

test(`an offer's words for a person are written in ${WORDS} alone`, () => {
  assert.ok(SENTENCES.length >= 10, `the scan has the offers' sentences to look for: ${SENTENCES.length}`);
  assert.deepEqual(offerWordBreaks(sourceTexts(), SENTENCES), []);
});

test("REFUSED: an offer's sentence spelled outside the table", () => {
  const planted = new Map([
    ['src/components/X.tsx', "case 'answer':\n  return 'signed off blocked, and said nothing of what it needs';\n"],
  ]);
  assert.equal(offerWordBreaks(planted, SENTENCES).length, 1);
});

test('REFUSED: a state word spelled outside the table, a retired phrasing, and a runtime word on hover', () => {
  const planted = (file: string, text: string): Map<string, string> => new Map([[file, text]]);
  const spelled = personWordBreaks(
    planted('src/components/X.tsx', "export const x = <span>{'waits on you'}</span>;\nconst g = 'At work';\nconst t = `${g} at work`;\n"),
    RAILS,
  );
  assert.equal(spelled.length, 1, 'the rail word refused; a capitalised label and a part of a sentence pass');
  assert.match(spelled[0], /^src\/components\/X\.tsx spells 'waits on you'/);
  const passing = retiredBreaks(
    planted(
      'src/components/X.tsx',
      "export const x = <p title={`${s} waits for your approval`}>It is not signed off.</p>;\nconst s = 'cancelled';\n",
    ),
  );
  assert.equal(passing.length, 0, 'a word-bounded approval, a fact of signing off and a bare code word pass');
  const each: Array<[file: string, jsx: string]> = [
    ['src/components/A.tsx', 'It waits for you.'],
    ['src/components/B.tsx', 'The check refused it.'],
    ['src/components/C.tsx', 'It is not signed.'],
    ['src/components/D.tsx', 'The run was cancelled.'],
  ];
  const retired = retiredBreaks(new Map(each.map(([file, jsx]) => [file, `export const x = <p>${jsx}</p>;\n`])));
  assert.deepEqual(
    retired.map((line) => line.split(' ')[0]),
    each.map(([file]) => file),
    'each retired phrasing, and cancelled said to a person, is refused on its own',
  );
  const hover = hoverRuntimeBreaks(
    planted(
      'src/components/X.tsx',
      "// the engine's journal\nconst said = 'the engine filed it';\nexport const x = <p title={`the engine filed ${said}`} />;\n",
    ),
  );
  assert.equal(hover.length, 1, 'a title is refused; a comment and a literal off hover pass');
  assert.match(hover[0], /^src\/components\/X\.tsx says 'the engine filed' on hover/);
});

/**
 * The one file that converts the default factory between the api's form and its name, `DEFAULT_NAMESPACE` of objects: a leaf of `lib/api`,
 * so the api's files reach it (`api-files.test.ts`), which `src/lib/factories.ts` re-exports to the rest of the board.
 */
const CONVERTERS = 'src/lib/api/namespace.ts';

/** A quoted `default` in code: a factory's name spelled by the board, where it names one. */
const DEFAULT_WORD = /(['"`])default\1/;

/** A board-own constant of the default factory: objects' `DEFAULT_NAMESPACE` respelled, or declared again. */
const DEFAULT_CONST = /\b(?:const|let|var|function)\s+(DEFAULT|DEFAULT_NAME|DEFAULT_FACTORY|DEFAULT_NAMESPACE)\b/;

/** A conversion between the api's form of a factory (null for the default) and its name, written by hand. */
const CONVERSIONS = [/(?:\?\?|\|\|)\s*DEFAULT_NAMESPACE\b/, /DEFAULT_NAMESPACE\s*\?\s*null\b/, /\?\s*DEFAULT_NAMESPACE\s*:/];

/** A board-own name of the default factory, used: the constant `DEFAULT_CONST` declares under a name of its own. */
const DEFAULT_RESPELLED = /\b(DEFAULT_NAME|DEFAULT_FACTORY)\b/;

/** A type's pick of a field named `default`, `Pick<Factory, 'default'>`: a key, never a factory's name. */
const PICKED = /\b(?:Pick|Omit)<[^>]*>/g;

/**
 * Each line of the board that spells the default factory itself or converts it by hand: a constant of its own for it, anywhere; and,
 * outside `CONVERTERS`, a quoted `default` on a line naming a factory or a namespace, or a conversion of null to its name or back.
 * Objects' `DEFAULT_NAMESPACE` is its one name, and `CONVERTERS`' `namespaceOf` and `factoryIn` its two converters.
 */
function defaultFactoryBreaks(texts: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const [file, text] of texts) {
    if (KIT.test(file)) continue;
    withoutComments(text)
      .split('\n')
      .forEach((line, i) => {
        const at = `${file}:${i + 1}`;
        const constant = DEFAULT_CONST.exec(line) ?? DEFAULT_RESPELLED.exec(line);
        if (constant) out.push(`${at} names ${constant[1]}: import DEFAULT_NAMESPACE from 'objects', the default factory's one name`);
        if (file === CONVERTERS) return;
        if (!constant && DEFAULT_WORD.test(line.replace(PICKED, '')) && /factory|namespace/i.test(line))
          out.push(`${at} spells the default factory 'default': compare with DEFAULT_NAMESPACE from 'objects'`);
        if (CONVERSIONS.some((pattern) => pattern.test(line)))
          out.push(`${at} converts the default factory by hand: call namespaceOf or factoryIn of src/lib/factories.ts`);
      });
  }
  return out;
}

/** How many of `CONVERSIONS` the text holds, each counted once per line. */
const conversionsIn = (text: string): number =>
  withoutComments(text)
    .split('\n')
    .filter((line) => CONVERSIONS.some((pattern) => pattern.test(line))).length;

test(`the board spells the default factory as objects' DEFAULT_NAMESPACE, and converts it in ${CONVERTERS} alone`, () => {
  const texts = sourceTexts();
  assert.deepEqual(defaultFactoryBreaks(texts), []);
  assert.equal(conversionsIn(texts.get(CONVERTERS)!), 2, `${CONVERTERS} holds one converter each way, namespaceOf and factoryIn`);
});

test('REFUSED: a board-own default-factory literal or constant, and a second converter; a variant and a comment are let through', () => {
  const planted = (text: string): string[] => defaultFactoryBreaks(new Map([...sourceTexts(), ['src/lib/x.ts', text]]));
  const fixture = [
    "const DEFAULT = 'default';",
    "export const here = (place: { factory: string }) => place.factory === 'default';",
    'export const nameOf = (factory: string | null) => factory ?? DEFAULT_NAMESPACE;',
    'export const fieldOf = (name: string) => (name === DEFAULT_NAMESPACE ? null : name);',
    'export const shown = (row: { factory: string | null }) => row.factory || DEFAULT_NAMESPACE;',
  ].join('\n');
  assert.deepEqual(
    planted(fixture).map((line) => line.split(' ')[0]),
    ['src/lib/x.ts:1', 'src/lib/x.ts:2', 'src/lib/x.ts:3', 'src/lib/x.ts:4', 'src/lib/x.ts:5'],
  );
  assert.deepEqual(
    planted(
      "/** The factory 'default', named in a comment. */\nexport const v = { variant: 'default' };\nexport const n = { namespace: DEFAULT_NAMESPACE };\n",
    ),
    [],
  );
  assert.deepEqual(defaultFactoryBreaks(new Map([['src/components/ui/x.tsx', "const DEFAULT = 'default'; // factory\n"]])), []);
  assert.deepEqual(planted("export type P = Pick<Factory, 'name' | 'default'>;\n"), [], "a pick of a factory's field default");
  assert.equal(planted("import { DEFAULT_NAME } from './factories.ts';\n").length, 1, 'a respelled name, imported');
  assert.equal(
    defaultFactoryBreaks(new Map([[CONVERTERS, "export const DEFAULT_NAME = 'default';\n"]])).length,
    1,
    `a constant of its own in ${CONVERTERS} too`,
  );
});
