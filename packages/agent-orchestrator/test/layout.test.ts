/**
 * The package's layout, held by path: the folder rule written once in `docs/architecture.md`, *Folders, in every package*, and judged
 * by `test-kit/layout`, over this package's source. No two files need each other's values, no source file imports a test, a barrel
 * re-exports by name, a folder is a concept at most `src/<concept>/<part>/` deep with no count of its files, named for what it holds,
 * and a file outside a concept reads a part's pure code through the part's face.
 *
 * The face is a part's `index.ts`, or its one pure file when it has no `index.ts`; a file outside the concept imports the part's pure
 * code through the face alone, and a store, a verb or a model by its own path; a file anywhere in the concept imports any file of it
 * by path. The CLI's folder, `src/cli/`, is controllers and has no face. The kinds themselves are held by `boundary.test.ts`.
 *
 * Each rule is made to refuse a planted source first: a rule that reads nothing passes too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { importsIn } from 'test-kit/imports';
import { cycles, depthBreaks, faceBreaks, namelessBreaks, starExports, testImports, valueGraph } from 'test-kit/layout';

const PKG = path.join(import.meta.dirname, '..');

const isTest = (file: string) => file.endsWith('.test.ts') || file.startsWith('test/');

/** The package's source under `src/`, tests beside the code left out, by path from the package. */
const sourceFiles = (): string[] =>
  fs
    .readdirSync(path.join(PKG, 'src'), { recursive: true, encoding: 'utf8' })
    .map((f) => `src/${f.split(path.sep).join('/')}`)
    .filter((f) => f.endsWith('.ts') && !isTest(f));

const read = (file: string) => fs.readFileSync(path.join(PKG, file), 'utf8');

/**
 * A part's pure code, read from outside its concept through the part's face: every file that is not a store, a verb, a model or a test,
 * outside the CLI's folder, which is controllers. A model is imported by its own path, as a store or a verb is.
 */
const isFolderPure = (file: string): boolean => !/\.(store|verb|model|test)\.ts$/.test(file) && !file.startsWith('src/cli/');

/** The face rule as this package reads it: concepts under `src`, a part's pure code faced. */
const FACES = { root: 'src', faced: isFolderPure };

test('REFUSED: a cycle of value imports; a cycle through a type-only import is erased and let through', () => {
  const planted = new Map([
    ['src/retry/retry.ts', "import { runReady } from '../run.ts';"],
    ['src/run.ts', "export { retryable } from './retry/index.ts';"],
    ['src/retry/index.ts', "export { retryable } from './retry.ts';"],
    ['src/timeline/timeline.ts', "import type { RunRecord } from '../run.ts';"],
    ['src/tick/tick.verb.ts', "import { assess, type RunRecord } from '../run.ts';\nimport { file } from './file.verb.ts';"],
    ['src/tick/file.verb.ts', "import type { Pass } from './tick.verb.ts';\nimport { type Filed } from './tick.verb.ts';"],
    ['src/status/status.ts', "import {\n  type RunRecord,\n  type StepStatus,\n} from '../run.ts';"],
  ]);
  assert.deepEqual(cycles(valueGraph(planted)), [['src/retry/index.ts', 'src/retry/retry.ts', 'src/run.ts']]);
  planted.set('src/tick/file.verb.ts', "import { pass } from './tick.verb.ts';");
  assert.deepEqual(cycles(valueGraph(planted)), [
    ['src/retry/index.ts', 'src/retry/retry.ts', 'src/run.ts'],
    ['src/tick/file.verb.ts', 'src/tick/tick.verb.ts'],
  ]);
});

test('no two source files need each other’s values', () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  assert.ok(files.has('src/run.ts') && files.size > 20, 'the scan reads the source');
  assert.deepEqual(cycles(valueGraph(files)), []);
});

test("REFUSED on the source: a value import from the format's leaf back to a folder above it closes a cycle", () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  files.set('src/step/step.ts', `${files.get('src/step/step.ts')}\nimport { countOf } from '../keys/index.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), [
    [
      'src/budget/budget.ts',
      'src/closeout/closeout.ts',
      'src/closeout/envelope.ts',
      'src/closeout/handed-closeout.ts',
      'src/closeout/index.ts',
      'src/harness/harness.ts',
      'src/keys/filed-as.ts',
      'src/keys/index.ts',
      'src/keys/keys.ts',
      'src/keys/merged-output.ts',
      'src/keys/tools.ts',
      'src/question/index.ts',
      'src/question/numbered.ts',
      'src/question/question.ts',
      'src/step/step.ts',
      'src/workspace/workspace.ts',
    ],
  ]);
});

test('REFUSED on the source: a value import from a leaf cut out of run.ts back to run.ts closes a cycle; the type is let through', () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  const wait = files.get('src/wait/wait.ts')!;
  files.set('src/wait/wait.ts', `${wait}\nimport { assess } from '../run.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), [
    [
      'src/brief/brief-sections.ts',
      'src/brief/brief.ts',
      'src/brief/index.ts',
      'src/cancel/cancel.ts',
      'src/cap/cap.ts',
      'src/decide/decide.ts',
      'src/feed/feed.ts',
      'src/feed/index.ts',
      'src/feed/reason.ts',
      'src/forget/forget.ts',
      'src/forget/prune/prune.ts',
      'src/gate/gate.ts',
      'src/list/list.ts',
      'src/merge/merge.ts',
      'src/retry/index.ts',
      'src/retry/retry-refusal.ts',
      'src/retry/retry.ts',
      'src/round/round.ts',
      'src/run.ts',
      'src/say/say.ts',
      'src/start/context.ts',
      'src/start/index.ts',
      'src/tick/assess.ts',
      'src/wait/wait.ts',
    ],
  ]);
  files.set('src/wait/wait.ts', `${wait}\nimport type { Assessment } from '../run.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), []);
});

test('REFUSED on the source: a value import of the tick from the cap it reads between passes closes a cycle', () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  files.set('src/cap/cap.verb.ts', `${files.get('src/cap/cap.verb.ts')}\nimport { tick } from '../tick/tick.verb.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), [
    [
      'src/cap/cap.verb.ts',
      'src/ending/ending.verb.ts',
      'src/inbox/inbox.verb.ts',
      'src/list/list.verb.ts',
      'src/rest/informer.verb.ts',
      'src/summary/judged.verb.ts',
      'src/summary/judgement.verb.ts',
      'src/summary/summary.verb.ts',
      'src/tick/advance.verb.ts',
      'src/tick/tick.verb.ts',
    ],
  ]);
});

test('REFUSED on the source: a value import from a part cut out of run.ts back to the assessment closes a cycle; the type is let through', () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  const round = files.get('src/round/round.ts')!;
  files.set('src/round/round.ts', `${round}\nimport { assess } from '../tick/assess.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), [
    ['src/retry/index.ts', 'src/retry/retry-refusal.ts', 'src/retry/retry.ts', 'src/round/round.ts', 'src/tick/assess.ts'],
  ]);
  files.set('src/round/round.ts', `${round}\nimport type { Assessment } from '../tick/assess.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), []);
});

test("REFUSED on the source: a value import from the flag reader back to the verbs' table closes a cycle; the type is let through", () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  const flags = files.get('src/cli/flags.ts')!;
  files.set('src/cli/flags.ts', `${flags}\nimport { main } from './main.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), [
    ['src/cli/decide/decide.ts', 'src/cli/flags.ts', 'src/cli/main.ts', 'src/cli/runs.ts', 'src/cli/start.ts', 'src/cli/writers.ts'],
  ]);
  files.set('src/cli/flags.ts', `${flags}\nimport type { main } from './main.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), []);
});

test('REFUSED: a source file that imports a test or test support; a barrel that re-exports a whole module', () => {
  assert.deepEqual(testImports('src/check/check.ts', importsIn("import { corpus } from './check.test.ts';")), [
    'src/check/check.ts imports src/check/check.test.ts: nothing but a test imports a test — move what both need into the source',
  ]);
  assert.deepEqual(testImports('src/run.ts', importsIn("import { told } from '../test/told.ts';")), [
    'src/run.ts imports test/told.ts: nothing but a test imports a test — move what both need into the source',
  ]);
  assert.deepEqual(testImports('src/run.ts', importsIn("// import { told } from '../test/told.ts';")), [], 'not refused: prose');
  assert.deepEqual(starExports('src/retry/index.ts', "export { retryable } from './retry.ts';\nexport * from './retry-ask.ts';"), [
    'src/retry/index.ts re-exports all of ./retry-ask.ts: re-export by name',
  ]);
  assert.deepEqual(starExports('src/retry/index.ts', '// export * from "./retry-ask.ts";'), [], 'not refused: prose');
});

test('no source file imports a test, and every barrel re-exports by name', () => {
  assert.deepEqual(
    sourceFiles().flatMap((f) => [...testImports(f, importsIn(read(f))), ...starExports(f, read(f))]),
    [],
  );
});

test('REFUSED: src/factory/door/x/y.ts, a third folder under src; a part of a concept is let through', () => {
  assert.equal(depthBreaks(['src/factory/door/x/y.ts'], 'src').length, 1);
  assert.deepEqual(depthBreaks(['src/factory/door/door.ts', 'src/factory/factory.ts', 'src/run.ts', 'bin/a/b/c/d.ts'], 'src'), []);
});

test('let through: a folder past six files', () => {
  const seven = ['a.ts', 'b.ts', 'c.ts', 'index.ts', 'a.store.ts', 'a.verb.ts', 'b.verb.ts'].map((f) => `src/retry/${f}`);
  assert.deepEqual([...depthBreaks(seven, 'src'), ...namelessBreaks(seven, 'src')], []);
  assert.deepEqual(
    faceBreaks(seven, () => [], FACES),
    [],
  );
});

test('REFUSED: a folder or a file named for no concept', () => {
  assert.equal(namelessBreaks(['src/utils/words.ts', 'src/retry/helpers.ts', 'src/feed/shared.store.ts', 'src/misc.ts'], 'src').length, 4);
  assert.deepEqual(namelessBreaks(['src/common-words/words.ts', 'src/feed/sharedness.ts'], 'src'), [], 'a name that only starts so');
});

test('every file sits at most at src/<concept>/<part>/, and every name says a concept', () => {
  const files = sourceFiles();
  assert.ok(files.includes('src/cli/decide/decide.ts'), 'the scan reads the parts');
  assert.deepEqual([...depthBreaks(files, 'src'), ...namelessBreaks(files, 'src')], []);
});

test("REFUSED: a file outside a concept importing a part's pure code past its face", () => {
  const planted: Record<string, string> = {
    'src/retry/index.ts': "export { retryable } from './retry.ts';\nexport { answerOf } from './retry-ask.ts';",
    'src/retry/retry.ts': "import { answerOf } from './retry-ask.ts';",
    'src/retry/retry-ask.ts': '',
    'src/retry/retry.verb.ts': "import { retryable } from './index.ts';",
    'src/meter/meter.ts': '',
    'src/meter/tally.store.ts': "import { costOf } from './meter.ts';",
    'src/brief/brief.ts': '',
    'src/brief/brief-sections.ts': '',
    'src/cli/main.ts': "import { flags } from './flags.ts';",
    'src/cli/flags.ts': '',
    'src/tick/tick.verb.ts': [
      "import { retryable } from '../retry/index.ts';",
      "import { retry } from '../retry/retry.verb.ts';",
      "import { costOf } from '../meter/meter.ts';",
      "import { tally } from '../meter/tally.store.ts';",
      "import { answerOf } from '../retry/retry-ask.ts';",
      "import { composeBrief } from '../brief/brief.ts';",
    ].join('\n'),
    'src/run.ts': "import type { Retry } from './retry/retry.ts';",
    'src/retry/retry.model.ts': "import { retryable } from './index.ts';",
    'src/meter/meter.verb.ts': "import { Retry } from '../retry/retry.model.ts';",
    'bin/wf.ts': "import { main } from '../src/cli/main.ts';",
  };
  const files = Object.keys(planted);
  assert.deepEqual(
    faceBreaks(files, (f) => importsIn(planted[f] ?? ''), FACES),
    [
      'src/run.ts imports src/retry/retry.ts: import src/retry/index.ts, the face of src/retry/',
      'src/tick/tick.verb.ts imports src/brief/brief.ts: src/brief/ has 2 pure files and no index.ts — write one that re-exports them by name, and import it',
      'src/tick/tick.verb.ts imports src/retry/retry-ask.ts: import src/retry/index.ts, the face of src/retry/',
    ],
  );
});

test('REFUSED on the source: a file outside keys/ importing its readers past keys/index.ts', () => {
  const files = sourceFiles();
  assert.deepEqual(
    faceBreaks(
      files,
      (f) => importsIn(f === 'src/tick/tick.verb.ts' ? `${read(f)}\nimport { toolsOf } from '../keys/tools.ts';` : read(f)),
      FACES,
    ),
    ['src/tick/tick.verb.ts imports src/keys/tools.ts: import src/keys/index.ts, the face of src/keys/'],
  );
});

test('REFUSED on the source: a file outside retry/ or brief/ importing their pure code past the face', () => {
  const files = sourceFiles();
  const planted = `import { retryable } from '../retry/retry.ts';\nimport { composeBrief } from '../brief/brief.ts';`;
  assert.deepEqual(
    faceBreaks(files, (f) => importsIn(f === 'src/cancel/cancel.verb.ts' ? `${read(f)}\n${planted}` : read(f)), FACES),
    [
      'src/cancel/cancel.verb.ts imports src/brief/brief.ts: import src/brief/index.ts, the face of src/brief/',
      'src/cancel/cancel.verb.ts imports src/retry/retry.ts: import src/retry/index.ts, the face of src/retry/',
    ],
  );
});

test("a file outside a concept imports a part's pure code through its face alone", () => {
  const files = sourceFiles();
  assert.deepEqual(
    faceBreaks(files, (f) => importsIn(read(f)), FACES),
    [],
  );
});
