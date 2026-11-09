/**
 * The folder rule's judgement (`docs/architecture.md`, *Folders, in every package*), proven on planted trees: each package's own
 * layout test calls it over its source, so a rule that reads nothing here would pass there too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importsIn } from 'test-kit/imports';
import { cycles, depthBreaks, faceBreaks, namelessBreaks, starExports, testImports, valueGraph } from 'test-kit/layout';

test('REFUSED: a file three folders under the root; a file at <concept>/<part>/ is let through', () => {
  assert.deepEqual(depthBreaks(['src/a/b/c.ts', 'src/a/b.ts', 'src/a.ts'], 'src'), []);
  const refused = depthBreaks(['src/a/b/c/d.ts', 'src/a/b/c.ts'], 'src');
  assert.equal(refused.length, 1);
  assert.match(refused[0] ?? '', /^src\/a\/b\/c\/d\.ts /);
  assert.equal(depthBreaks(['src/components/run/x/y/z.tsx'], 'src/components').length, 1, 'a root deeper than src');
  assert.deepEqual(depthBreaks(['src/components/run/x/y.tsx', 'test/a/b/c/d.ts'], 'src/components'), [], 'a file outside the root');
});

test('let through: forty files in one folder', () => {
  const forty = Array.from({ length: 40 }, (_, i) => `src/retry/f${i}.ts`);
  assert.deepEqual(depthBreaks(forty, 'src'), []);
  assert.deepEqual(namelessBreaks(forty, 'src'), []);
  assert.deepEqual(
    faceBreaks(forty, () => [], { root: 'src', faced: () => true }),
    [],
  );
});

test('REFUSED: a folder or a file named utils, helpers, common, shared or misc; a name that only starts so is let through', () => {
  const refused = namelessBreaks(
    ['src/utils/words.ts', 'src/retry/helpers.ts', 'src/feed/shared.store.ts', 'src/misc.ts', 'src/common/x.tsx'],
    'src',
  );
  assert.deepEqual(
    refused.map((line) => line.split(' ')[0]),
    ['src/common/x.tsx', 'src/feed/shared.store.ts', 'src/misc.ts', 'src/retry/helpers.ts', 'src/utils/words.ts'],
  );
  assert.deepEqual(namelessBreaks(['src/common-words/words.ts', 'src/feed/sharedness.ts', 'src/runs/utility.ts'], 'src'), []);
  assert.deepEqual(namelessBreaks(['lib/utils.ts'], 'src'), [], 'a file outside the root');
});

test('REFUSED: a cycle of value imports; a cycle through a type-only import is erased and let through', () => {
  const planted = new Map([
    ['src/retry/retry.ts', "import { runReady } from '../run.ts';"],
    ['src/run.ts', "export { retryable } from './retry/index.ts';"],
    ['src/retry/index.ts', "export { retryable } from './retry.ts';"],
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
  planted.set('src/retry/retry.ts', "// import { runReady } from '../run.ts';");
  assert.deepEqual(cycles(valueGraph(planted)), [['src/tick/file.verb.ts', 'src/tick/tick.verb.ts']], 'a comment imports nothing');
});

/** A tree of two concepts: the factory, with parts, and the tick outside it. */
const TREE: Record<string, string> = {
  'src/factory/factory.ts': "import { door } from './door/door.ts';\nimport { wire } from './wiring/wire.ts';",
  'src/factory/door/index.ts': "export { door } from './door.ts';\nexport { listed } from './listed.ts';",
  'src/factory/door/door.ts': "import { rule } from '../rules/rules.ts';",
  'src/factory/door/listed.ts': '',
  'src/factory/door/door.verb.ts': "import { listed } from './listed.ts';",
  'src/factory/rules/rules.ts': '',
  'src/factory/wiring/wire.ts': "import { listed } from '../door/listed.ts';",
  'src/tick/tick.ts': "import { door } from '../factory/door/index.ts';\nimport { factory } from '../factory/factory.ts';",
  'src/run.ts': "import { rule } from './factory/rules/rules.ts';",
};

const faced = (file: string): boolean => !/\.(store|verb|model|test)\.ts$/.test(file);
const facesOf = (tree: Record<string, string>) => faceBreaks(Object.keys(tree), (f) => importsIn(tree[f] ?? ''), { root: 'src', faced });

test("let through: a file of a concept importing a sibling part's file by path", () => {
  assert.deepEqual(facesOf(TREE), []);
});

test("REFUSED: a file outside the concept importing a part's pure code past the part's face", () => {
  const breaks = facesOf({
    ...TREE,
    'src/tick/tick.ts': "import { listed } from '../factory/door/listed.ts';",
    'src/tick/tick.verb.ts':
      "import { verb } from '../factory/door/door.verb.ts';\nimport type { Listed } from '../factory/door/listed.ts';",
  });
  assert.deepEqual(
    breaks.map((line) => line.split(':')[0]),
    ['src/tick/tick.ts imports src/factory/door/listed.ts', 'src/tick/tick.verb.ts imports src/factory/door/listed.ts'],
    'a verb by path; a type import as a value one',
  );
  assert.match(breaks[0] ?? '', /src\/factory\/door\/index\.ts/, 'the refusal names the face to import');
  const faceless = facesOf({
    ...TREE,
    'src/factory/rules/kinds.ts': '',
    'src/run.ts': "import { rule } from './factory/rules/rules.ts';",
  });
  assert.equal(faceless.length, 1, 'a part of two pure files and no index.ts has no face');
  assert.match(faceless[0] ?? '', /index\.ts/);
});

test('REFUSED: a source file that imports a test; a barrel that re-exports a whole module', () => {
  assert.deepEqual(testImports('src/check/check.ts', importsIn("import { corpus } from './check.test.ts';")).length, 1);
  assert.deepEqual(testImports('src/run.ts', importsIn("import { told } from '../test/told.ts';")).length, 1);
  assert.deepEqual(testImports('src/run.ts', importsIn("// import { told } from '../test/told.ts';")), [], 'not refused: prose');
  assert.deepEqual(starExports('src/retry/index.ts', "export { retryable } from './retry.ts';\nexport * from './retry-ask.ts';").length, 1);
  assert.deepEqual(starExports('src/retry/index.ts', '// export * from "./retry-ask.ts";'), [], 'not refused: prose');
});
