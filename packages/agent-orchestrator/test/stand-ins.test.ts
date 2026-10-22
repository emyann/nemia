/**
 * A test is given a stand-in for what is outside its process, and the real thing is asked by name: a test file of `agent-runtime`,
 * `agent-orchestrator` or `apps/api` whose name does not end `.boundary.test.ts` is refused git, a process, the real place, the real
 * engine and an engine made by hand (`stand-ins.ts` says how each is read, and how far a helper is followed). The files that did one
 * of these when the rule landed are held by name and by kind (`REAL_REACH`, `stand-ins.baseline.ts`), and the list only shrinks.
 * Each stand-in the packages hold owes its contract, walked on the real thing in a boundary test (`STAND_INS`).
 *
 * The test reads files outside this package, as text: `turbo.json` makes the apps' tests and the runtime inputs of this package's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { REAL_REACH } from './stand-ins.baseline.ts';
import {
  CLAUSES,
  contractBreaks,
  FIX,
  isBoundary,
  KINDS,
  measureOf,
  PACKAGES,
  PLACES,
  reachBreaks,
  reachIn,
  reachOf,
  reachOver,
  sizes,
  STAND_INS,
  takenBreaks,
  testAndHelperFilesOf,
  testFilesOf,
  unlisted,
  type Baseline,
  type Kind,
  type Reach,
} from './stand-ins.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** The orchestrator's `test/`, where a plant is read as a test of that package. */
const T = 'packages/agent-orchestrator/test';

/** The plants each clause must measure, read as `test/plant.test.ts` of the orchestrator: each one site, over one or more lines. */
const PLANTS: Readonly<Record<string, readonly string[]>> = {
  'git-spawn': [
    "execFileSync(\n  'git',\n  ['status'],\n);\n",
    'execSync(`git rev-parse ${ref}`);\n',
    "const cmd = 'git';\nspawnSync(cmd, []);\n",
  ],
  starts: [
    "import {\n  spawnSync,\n} from\n  'node:child_process';\n",
    "const w = await import('node:worker_threads');\n",
    "import 'node:cluster';\n",
    "export { fork } from 'child_process';\n",
  ],
  'real-place': [
    "const { gitPlaceLayer } = await import('../src/runner.ts');\n",
    "const {\n  runWith,\n  gitPlaceLayer: real,\n} = await import(\n  '../src/place/shipped.store.ts'\n);\n",
    "import { shipped } from 'agent-orchestrator';\n",
    "const runner = await import('../src/runner.ts');\nrun(runner.shippedGitPlace);\n",
    "import * as o from 'agent-orchestrator';\no.shipped(program);\n",
    "export { gitPlaceLayer } from '../src/runner.ts';\n",
  ],
  'git-place': ["import { gitPlace } from '../place/git/place.ts';\n", "const { asked } = await import('../place/git/verbs/asked.ts');\n"],
  'real-engine': ["import { engine } from 'agent-orchestrator';\n", "const { engine: real } = await import('../src/runtime-client.ts');\n"],
  'engine-layer': [
    "import { Engine } from 'agent-runtime';\nEngine.layer({ root });\n",
    "import { Engine as RuntimeEngine } from 'agent-runtime';\nRuntimeEngine.layer(\n  options,\n);\n",
  ],
  promised: ["import { promised } from './promised.ts';\npromised({ view });\n", "const { promised } = await import('./promised.ts');\n"],
  'engine-of': [
    "import { Engine } from 'agent-runtime';\nEngine.of({ view });\n",
    "const { EngineService } = await import('../src/runtime-client.ts');\nEngineService.of(\n  fake,\n);\n",
  ],
  'engine-given': [
    "import { Layer } from 'effect';\nimport { Engine } from 'agent-runtime';\nLayer.succeed(Engine)(fake);\n",
    "import { Effect } from 'effect';\nimport { EngineService } from '../src/runtime-client.ts';\nprogram.pipe(Effect.provideService(EngineService, fake));\n",
    "import * as Layer from 'effect/Layer';\nimport { Engine } from '../../../apps/api/src/store.ts';\nLayer.sync(\n  Engine,\n  make,\n);\n",
    "import { Effect } from 'effect';\nimport { EngineService } from '../src/runtime-client.ts';\nEffect.provideService(\n  program,\n  EngineService,\n  fake,\n);\n",
  ],
  'engine-literal': [
    "import type { Engine } from '../src/runtime-client.ts';\nconst e = { view } as unknown as Engine;\n",
    "import type { EngineShape } from 'agent-runtime';\nconst e: EngineShape = {\n  view,\n};\n",
    "import type * as rt from 'agent-runtime';\nconst e = { view } satisfies rt.Engine;\n",
    "import type { Engine } from '../src/runtime-client.ts';\nconst failing = (err: unknown): Engine => ({\n  ...e,\n  tick,\n});\n",
    "import type { Engine } from '../src/runtime-client.ts';\nfunction fake(): Engine {\n  if (plain) return e;\n  return { view };\n}\n",
    "import type { Engine } from 'agent-orchestrator';\nconst fakes = { make(): Engine { return { view }; } };\n",
  ],
};

/** A test given the engine's stand-in through the runtime's testing entry, as a test of the orchestrator or the api writes it. */
const ENGINE_LINE =
  "import { testEngine } from 'agent-runtime/testing';\nimport { eachTest } from './placed.ts';\n" +
  "const { engineOf } = await import('../src/runtime-client.ts');\nconst engine = eachTest(testEngine);\nconst e = () => engineOf(engine().layer);\n";

/** Words that name the real thing and reach nothing: each must measure no site. */
const WORDS = [
  "const said = \"execFileSync('git', ['status']); import('node:child_process')\";\n",
  "/** Runs `git status`, names `gitPlaceLayer`, and calls `Engine.layer` of 'agent-runtime'. */\nexport const x = 1;\n",
  "import { engine, shipped, Engine, promised } from './elsewhere.ts';\nengine();\nshipped(program);\nEngine.layer({});\nEngine.of({});\n",
  'const engine = () => 1;\nclass Engine {}\nconst gitPlaceLayer = 1;\nEngine.of({});\npromised({});\n',
  "import type { Engine } from 'agent-runtime';\nexport const run = (e: Engine) => e;\n",
  "import type { ChildProcess } from 'node:child_process';\nimport { type Worker } from 'node:worker_threads';\n",
  "import type { gitPlaceLayer, engine } from '../src/runner.ts';\nimport type { gitPlace } from '../place/git/place.ts';\n",
  "import { testPlace } from '../place/memory/index.ts';\nimport { eachTest } from './placed.ts';\nconst stand = eachTest(testPlace);\n",
  ENGINE_LINE,
  "import { Layer } from 'effect';\nimport { PlaceService } from '../src/place/place.store.ts';\nLayer.succeed(PlaceService)(place);\n",
  "import { Effect } from 'effect';\nimport { Engine } from 'agent-runtime';\nEffect.succeed(Engine);\n",
  "import type { Engine } from '../src/runtime-client.ts';\nconst e = made() as Engine;\nconst f = { view } as Other;\n",
  "import type { Engine } from '../src/runtime-client.ts';\nexport const promised = (fake: object): Engine => Object.fromEntries(entries) as unknown as Engine;\n",
  "import type { Engine } from '../src/runtime-client.ts';\nfunction made(): Engine {\n  const inner = () => ({ view });\n  return wrap(inner());\n}\n",
  "import type { Engine } from '../src/runtime-client.ts';\nconst later = async (): Promise<Engine> => ({ view });\nconst other = (): Other => ({ view });\n",
  "import { Effect } from 'effect';\nimport { EngineService } from '../src/runtime-client.ts';\nEffect.provideService(EngineService, PlaceService, place);\n",
  "execFileSync('npm', ['run', 'git']);\nexecSync('npx gitlab');\n",
];

/** The site names of `text` as a test of the orchestrator, under `clauses`. */
const clausesIn = (text: string, clauses = CLAUSES): string[] => reachIn(`${T}/plant.test.ts`, text, clauses).map((s) => s.clause);

test('a plant of each clause is one site under it, and over several lines too', () => {
  assert.deepEqual(Object.keys(PLANTS).sort(), CLAUSES.map((c) => c.name).sort(), 'every clause has its plants');
  for (const [clause, plants] of Object.entries(PLANTS))
    for (const plant of plants) assert.deepEqual(clausesIn(plant), [clause], `${plant} is one ${clause} site`);
  assert.deepEqual(
    reachIn(`${T}/plant.test.ts`, PLANTS.starts[0]),
    [{ kind: 'process', clause: 'starts', line: 1 }],
    'an import split over four lines is one site, at its start',
  );
  assert.deepEqual(reachIn(`${T}/plant.test.ts`, PLANTS['git-spawn'][0]), [{ kind: 'git', clause: 'git-spawn', line: 1 }]);
});

test('REFUSED: each clause does work — its plants are measured with it, and measure nothing with it taken out', () => {
  for (const clause of CLAUSES) {
    const others = CLAUSES.filter((c) => c !== clause);
    for (const plant of PLANTS[clause.name]) {
      assert.equal(clausesIn(plant).length, 1, `${plant} is measured with every clause on`);
      assert.deepEqual(clausesIn(plant, others), [], `${plant} measures nothing without ${clause.name}`);
    }
  }
});

test('words that name the real thing and reach nothing measure no site: a string, a comment, another binding, a type, the stand-in', () => {
  for (const words of WORDS) assert.deepEqual(reachIn(`${T}/words.test.ts`, words), [], words);
});

/** A reader over `files`, each a text by its path from the repository root. */
const over =
  (files: Readonly<Record<string, string>>) =>
  (file: string): string | undefined =>
    files[file];

/** The measure of each of `tests` over `files`. */
const measured = (files: Readonly<Record<string, string>>, tests: readonly string[] = Object.keys(files)): Map<string, Reach> => {
  const reach = reachOver(over(files));
  return new Map(tests.map((file) => [file, reach(file)]));
};

/** What `files`, all tests, break against an empty baseline. */
const breaksOf = (files: Readonly<Record<string, string>>): string[] => reachBreaks(measured(files), {}, () => true);

/** One fixture for each kind the rule refuses, as a test of the orchestrator writes it, with the kinds it measures. */
const FIXTURES: readonly { readonly says: string; readonly text: string; readonly kinds: readonly Kind[] }[] = [
  {
    says: 'runs git',
    text: "import { execFileSync } from 'node:child_process';\nexecFileSync(\n  'git',\n  ['status'],\n);\n",
    kinds: ['git', 'process'],
  },
  {
    says: 'starts a Node child',
    text: "import { spawn } from 'node:child_process';\nspawn(process.execPath, ['x.ts']);\n",
    kinds: ['process'],
  },
  { says: "names the real place's layer", text: "const { gitPlaceLayer } = await import('../src/runner.ts');\n", kinds: ['place'] },
  { says: 'names the git place', text: "import { gitPlace } from '../place/git/place.ts';\n", kinds: ['place'] },
  { says: 'names the real engine', text: "import { engine } from '../src/runtime-client.ts';\nengine();\n", kinds: ['engine'] },
  { says: "builds the runtime's engine", text: "import { Engine } from 'agent-runtime';\nEngine.layer({ root });\n", kinds: ['engine'] },
  { says: 'makes an engine with promised', text: "import { promised } from './promised.ts';\npromised({ view });\n", kinds: ['hand'] },
  {
    says: 'makes an engine as a layer',
    text: "import { Layer } from 'effect';\nimport { Engine } from 'agent-runtime';\nLayer.succeed(Engine)(Engine.of({ view }));\n",
    kinds: ['hand'],
  },
  {
    says: 'makes an engine as a literal',
    text: "import type { Engine } from '../src/runtime-client.ts';\nconst e = { view } as unknown as Engine;\n",
    kinds: ['hand'],
  },
];

test('REFUSED: a test file with no boundary name that runs git, starts a child, names the real place or engine, or makes an engine', () => {
  for (const { says, text, kinds } of FIXTURES) {
    const file = `${T}/x.test.ts`;
    assert.deepEqual(reachOf(file, over({ [file]: text })).kinds, kinds, `a file that ${says} measures ${kinds.join(' and ')}`);
    const breaks = breaksOf({ [file]: text });
    assert.equal(breaks.length, kinds.length, `a file that ${says} is refused once a kind`);
    for (const kind of kinds)
      assert.ok(
        breaks.some((b) => b.startsWith(`${file} reaches ${kind} (${file}:`) && b.endsWith(FIX)),
        says,
      );
  }
  assert.deepEqual(breaksOf({ [`${T}/x.test.ts`]: FIXTURES[2].text }), [
    `${T}/x.test.ts reaches place (${T}/x.test.ts:1) and is no boundary test: give the test a stand-in, by the line ` +
      '`const stand = eachTest(testPlace);` for a place and `const engine = eachTest(testEngine);` for an engine (test/placed.ts; ' +
      'testEngine of agent-runtime/testing); where the real thing is its whole subject, or the stand-in does not ' +
      'model what it needs, write it in a file named <what>.boundary.test.ts; never add it to test/stand-ins.baseline.ts, which only shrinks',
  ]);
});

test('the name opens it: the same fixtures under a boundary name break nothing, and under any other name are refused', () => {
  for (const { says, text } of FIXTURES) {
    assert.deepEqual(breaksOf({ [`${T}/x.boundary.test.ts`]: text }), [], `a boundary test that ${says}`);
    for (const name of ['boundary.test.ts', 'x-boundary.test.ts', 'x.boundary.ts.test.ts', 'x.test.ts'])
      assert.notDeepEqual(breaksOf({ [`${T}/${name}`]: text }), [], `${name} is no boundary name, for a file that ${says}`);
  }
  assert.ok(isBoundary(`${T}/git-place.boundary.test.ts`));
  assert.ok(!isBoundary(`${T}/boundary.test.ts`), 'the test of the layer kinds is no boundary test');
  assert.ok(!isBoundary(`${T}/.boundary.test.ts`));
});

test('REFUSED: a boundary test that reaches nothing real, told to drop the name, and one on the baseline, told to delete its entry', () => {
  const file = `${T}/x.boundary.test.ts`;
  assert.deepEqual(breaksOf({ [file]: WORDS[7] }), [
    `${file} is named a boundary test and reaches nothing real: drop .boundary from its name`,
  ]);
  assert.deepEqual(
    reachBreaks(measured({ [file]: FIXTURES[0].text }), { [file]: ['git', 'process'] }, () => true),
    [`${file} is a boundary test, which is refused nothing: delete its entry from the baseline`],
  );
});

test('REFUSED: the baseline only shrinks — a file not listed, a kind its entry lacks, a kind or an entry left loose, a file gone', () => {
  const file = `${T}/a.test.ts`;
  const files = { [file]: FIXTURES[0].text };
  const held = (baseline: Baseline, exists = true): string[] => reachBreaks(measured(files), baseline, () => exists);
  assert.deepEqual(held({ [file]: ['git', 'process'] }), [], 'a table equal to the measure breaks nothing');
  assert.equal(held({}).length, 2, 'a file measured and not listed is refused, once a kind');
  assert.deepEqual(held({ [file]: ['process'] }), [
    `${file} reaches git (${file}:2), which its entry does not list: an entry gains no kind; ${FIX}`,
  ]);
  assert.deepEqual(held({ [file]: ['git', 'process', 'place'] }), [`${file} no longer reaches place: take place off its entry`]);
  assert.deepEqual(held({ [file]: ['git', 'process', 'server' as never] }), [
    `${file}'s entry lists server, which is no kind: one of git, process, place, engine, hand`,
  ]);
  assert.deepEqual(
    reachBreaks(measured({ [file]: WORDS[7] }), { [file]: ['git'] }, () => true),
    [`${file} reaches nothing real any more: delete its entry from the baseline`],
  );
  const gone = `${file} is on the baseline but is not on disk: where it moved, rename its entry; else take it off`;
  assert.deepEqual(
    reachBreaks(new Map(), { [file]: ['git'] }, () => true),
    [gone],
    'an entry for a file no scan read',
  );
  assert.deepEqual(held({ [file]: ['git', 'process'] }, false), [gone], 'an entry for a file that is not on disk');
});

const TWO =
  "import { execFileSync } from 'node:child_process';\nimport { one } from './one.ts';\n" +
  "export const two = () =>\n  execFileSync(\n    'git',\n    ['status'],\n  );\nexport type Two = typeof one;\n";

/** A test that reaches git through two helpers, which import each other. */
const CHAIN = {
  [`${T}/a.test.ts`]: "import { one } from './one.ts';\none();\n",
  [`${T}/one.ts`]: "import { two } from './two.ts';\nexport const one = two;\n",
  [`${T}/two.ts`]: TWO,
};

test('REFUSED: a reach through a helper the file imports, and the helper that one imports, the break naming where', () => {
  const reach = reachOf(`${T}/a.test.ts`, over(CHAIN));
  assert.deepEqual(reach.kinds, ['git', 'process']);
  assert.deepEqual(
    reach.sites.map((s) => `${s.kind} ${s.file}:${s.line}`),
    [`process ${T}/two.ts:1`, `git ${T}/two.ts:4`],
    'a call spread over lines in a helper two imports away, read once though the helpers import each other',
  );
  assert.deepEqual(
    reachBreaks(measured(CHAIN, [`${T}/a.test.ts`]), {}, () => true),
    [
      `${T}/a.test.ts reaches git (${T}/two.ts:4) and is no boundary test: ${FIX}`,
      `${T}/a.test.ts reaches process (${T}/two.ts:1) and is no boundary test: ${FIX}`,
    ],
  );
  assert.deepEqual(reachOf(`${T}/a.test.ts`, over(CHAIN), { follow: false }).kinds, [], 'with following taken out it measures nothing');
  const beside = 'packages/agent-orchestrator/src/a/x.test.ts';
  assert.deepEqual(
    reachOf(beside, over({ ...CHAIN, [beside]: "const { two } = await import('../../test/two.ts');\n" })).kinds,
    ['git', 'process'],
    'a test beside its code reaches the helpers too',
  );
});

test('how far a helper is followed: no type import, no file of a src or of another test, no scratch.ts, and no file that is not there', () => {
  const kindsOf = (text: string, more: Readonly<Record<string, string>> = {}): readonly Kind[] =>
    reachOf(`${T}/a.test.ts`, over({ ...CHAIN, ...more, [`${T}/a.test.ts`]: text })).kinds;
  assert.deepEqual(kindsOf("import { two } from './two.ts';\n"), ['git', 'process'], 'the helper is followed');
  assert.deepEqual(kindsOf("import type { Two } from './two.ts';\nimport { type Two as T } from './two.ts';\n"), []);
  assert.deepEqual(kindsOf("import { x } from '../src/x.ts';\n", { 'packages/agent-orchestrator/src/x.ts': TWO }), []);
  assert.deepEqual(kindsOf("import { x } from './b.test.ts';\n", { [`${T}/b.test.ts`]: TWO }), []);
  assert.deepEqual(kindsOf("import { x } from '../place/git/x.ts';\n", { 'packages/agent-orchestrator/place/git/x.ts': TWO }), ['place']);
  assert.deepEqual(
    kindsOf("import { scratch } from './scratch.ts';\n", { [`${T}/scratch.ts`]: TWO }),
    [],
    'scratch.ts is left out by name',
  );
  assert.deepEqual(kindsOf("import { scratch } from './scratchy.ts';\n", { [`${T}/scratchy.ts`]: TWO }), ['git', 'process']);
  assert.deepEqual(kindsOf("import { scratch } from './lib/scratch.ts';\n", { [`${T}/lib/scratch.ts`]: TWO }), ['git', 'process']);
  assert.deepEqual(kindsOf("import { gone } from './gone.ts';\n"), []);
});

test('the runtime is judged for git and a process alone, where the engine is its own code; the api for all five', () => {
  const text = `${FIXTURES[5].text}${FIXTURES[0].text}import { Layer } from 'effect';\nLayer.succeed(Engine)(fake);\n`;
  const kindsIn = (file: string): readonly Kind[] => reachOf(file, over({ [file]: text })).kinds;
  assert.deepEqual(kindsIn('packages/agent-runtime/test/x.test.ts'), ['git', 'process']);
  assert.deepEqual(kindsIn('apps/api/test/x.test.ts'), ['git', 'process', 'engine', 'hand']);
  assert.deepEqual(kindsIn(`${T}/x.test.ts`), ['git', 'process', 'engine', 'hand']);
  const api = "import { engine, shipped } from 'agent-orchestrator';\nimport { Engine } from '../src/store.ts';\nEngine.of(engine());\n";
  assert.deepEqual(reachOf('apps/api/test/x.test.ts', over({ 'apps/api/test/x.test.ts': api })).kinds, ['place', 'engine', 'hand']);
});

test("REFUSED: a test file with a git call in every package, where its test script loads it; a fixture and the web's are not read", () => {
  const root = scratch('stand-ins-');
  const read = [
    'apps/api/src/a/x.test.ts',
    'apps/api/test/x.test.ts',
    'packages/agent-orchestrator/src/a/b/x.test.ts',
    'packages/agent-orchestrator/test/x.test.ts',
    'packages/agent-runtime/src/a/x.test.ts',
    'packages/agent-runtime/test/x.test.ts',
  ];
  const unread = [
    'apps/api/test/fixtures/x.test.ts',
    'apps/web/test/x.test.ts',
    'packages/agent-orchestrator/test/x.ts',
    'packages/agent-orchestrator/place/git/x.test.ts',
    'packages/agent-runtime/test/deep/x.test.ts',
    'packages/other/test/x.test.ts',
  ];
  for (const file of [...read, ...unread]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), FIXTURES[0].text);
  }
  assert.deepEqual(testFilesOf(root), read);
  const found = measureOf(root);
  assert.deepEqual([...found.keys()], read);
  for (const file of read) assert.deepEqual(found.get(file)?.kinds, ['git', 'process'], file);
  const breaks = reachBreaks(found, {}, (file) => fs.existsSync(path.join(root, file)));
  for (const file of read)
    assert.deepEqual(
      breaks.filter((b) => b.startsWith(`${file} `)),
      [
        `${file} reaches git (${file}:2) and is no boundary test: ${FIX}`,
        `${file} reaches process (${file}:1) and is no boundary test: ${FIX}`,
      ],
    );
  assert.equal(breaks.length, 2 * read.length);
});

const onDisk = (file: string): boolean => fs.existsSync(path.join(ROOT, file));

test("every package's tests are held to the baseline: no new file, no new kind, and no entry left loose", () => {
  const found = measureOf(ROOT);
  assert.ok(found.size > 300, `the scan read ${found.size} files, and a misrooted scan passes for nothing`);
  for (const pkg of PACKAGES)
    for (const dir of ['test', 'src'])
      assert.ok(
        [...found.keys()].some((f) => f.startsWith(`${pkg}/${dir}/`)),
        `the scan reads ${pkg}/${dir}`,
      );
  const kindsOf = (file: string): readonly Kind[] | undefined => found.get(file)?.kinds;
  assert.deepEqual(kindsOf(`${T}/hold.test.ts`), ['git', 'process', 'place', 'hand']);
  assert.deepEqual(kindsOf('packages/agent-runtime/test/detached.test.ts'), ['git', 'process']);
  assert.deepEqual(kindsOf('apps/api/test/layer.test.ts'), ['engine', 'hand']);
  assert.deepEqual(kindsOf(`${T}/test-place.test.ts`), [], 'a test on the stand-in reaches nothing real');
  assert.deepEqual(kindsOf(`${T}/stand-ins.test.ts`), [], 'nor does this guard');
  assert.deepEqual(kindsOf(`${T}/git-place.boundary.test.ts`), ['git', 'process', 'place']);
  assert.ok(!(`${T}/git-place.boundary.test.ts` in REAL_REACH));
  assert.deepEqual(reachBreaks(found, REAL_REACH, onDisk), []);
});

test('REFUSED: a new test file that reaches the real thing, in each package, and a listed file given a new kind', () => {
  const found = measureOf(ROOT);
  for (const pkg of PACKAGES) {
    const file = `${pkg}/test/planted.test.ts`;
    const reach = reachOf(file, over({ [file]: FIXTURES[0].text }));
    assert.deepEqual(reachBreaks(new Map([...found, [file, reach]]), REAL_REACH, onDisk), [
      `${file} reaches git (${file}:2) and is no boundary test: ${FIX}`,
      `${file} reaches process (${file}:1) and is no boundary test: ${FIX}`,
    ]);
  }
  const listed = Object.entries(REAL_REACH).find(([file, kinds]) => file.startsWith(T) && !kinds.includes('engine'));
  assert.ok(listed, 'a listed file of the orchestrator does not name the real engine');
  const [file, kinds] = listed;
  const sites = [{ kind: 'engine', clause: 'real-engine', line: 1, file }] as const;
  const more: Reach = { kinds: [...kinds, 'engine'], sites, named: [...kinds, 'engine'] };
  assert.deepEqual(reachBreaks(new Map([...found, [file, more]]), REAL_REACH, onDisk), [
    `${file} reaches engine (${file}:1), which its entry does not list: an entry gains no kind; ${FIX}`,
  ]);
});

const R = 'packages/agent-runtime';

test("the engine's stand-in, taken through the testing entry, measures nothing in the orchestrator and the api; an engine made by hand beside it is still refused", () => {
  for (const file of [`${T}/x.test.ts`, 'packages/agent-orchestrator/src/a/x.verb.test.ts', 'apps/api/test/x.test.ts']) {
    assert.deepEqual(reachOf(file, over({ [file]: ENGINE_LINE })).sites, [], file);
    assert.deepEqual(breaksOf({ [file]: ENGINE_LINE }), [], file);
    const beside = `${ENGINE_LINE}import { Layer } from 'effect';\nimport { Engine } from 'agent-runtime';\nLayer.succeed(Engine)(Engine.of({ view }));\n`;
    assert.deepEqual(reachOf(file, over({ [file]: beside })).kinds, ['hand'], file);
    assert.deepEqual(breaksOf({ [file]: beside }), [`${file} reaches hand (${file}:8) and is no boundary test: ${FIX}`]);
  }
  assert.match(FIX, /`const engine = eachTest\(testEngine\);`/, 'the fix names the line a test writes for an engine');
});

test("the api's stand-ins, the test place by the orchestrator's testing entry and the engine given through Engine.over, measure nothing; the real place beside them is still refused", () => {
  const file = 'apps/api/test/x.test.ts';
  const text =
    "import { Layer } from 'effect';\nimport { testPlace } from 'agent-orchestrator/testing';\n" +
    "import { testEngine } from 'agent-runtime/testing';\nimport { Engine } from '../src/store.ts';\n" +
    "import { eachTest } from './placed.ts';\nconst stand = eachTest(testPlace);\nconst engine = eachTest(testEngine);\n" +
    'const layer = () => Layer.merge(Engine.over(engine().layer), stand().layer);\n';
  assert.deepEqual(reachOf(file, over({ [file]: text })).sites, []);
  assert.deepEqual(breaksOf({ [file]: text }), []);
  const real = `${text}import { gitPlaceLayer } from 'agent-orchestrator';\nLayer.merge(gitPlaceLayer, layer());\n`;
  assert.deepEqual(reachOf(file, over({ [file]: real })).kinds, ['place']);
});

test('REFUSED: a test of the runtime that takes the stand-in of the engine it builds, by the entry, its file or the face; the contract names it', () => {
  const [, engine] = STAND_INS;
  assert.equal(engine.made, 'testEngine');
  const file = `${R}/test/x.test.ts`;
  const refused = [
    `${file} takes testEngine, the stand-in of what ${R} builds itself: build the real one there, Engine.layer(…); ` +
      `only its contract names testEngine (${engine.own}, ${engine.real})`,
  ];
  for (const from of ['../src/testing.ts', '../src/service/index.ts', '../src/service/test-engine.ts', 'agent-runtime/testing']) {
    assert.deepEqual(takenBreaks(file, `import { testEngine } from '${from}';\ntestEngine();\n`), refused, from);
    assert.deepEqual(
      takenBreaks(`${R}/test/helper.ts`, `const { testEngine: made } = await import('${from}');\n`).length,
      1,
      'a helper too',
    );
  }
  assert.deepEqual(
    takenBreaks(`${R}/src/service/x.test.ts`, "import { testEngine } from './test-engine.ts';\n").length,
    1,
    'beside the code',
  );
  for (const own of [engine.own, engine.real, engine.walks.file])
    assert.deepEqual(takenBreaks(own, "import { testEngine } from '../src/testing.ts';\n"), [], `not refused: ${own}`);
  assert.deepEqual(takenBreaks(file, "import type { TestEngine } from '../src/testing.ts';\n"), [], 'a type');
  assert.deepEqual(takenBreaks(file, "import { testEngine } from './elsewhere.ts';\n"), [], 'another binding');
  assert.deepEqual(takenBreaks(file, "import { Engine } from '../src/index.ts';\nEngine.layer({ root });\n"), [], 'the real engine');
  for (const above of [`${T}/x.test.ts`, 'apps/api/test/x.test.ts'])
    assert.deepEqual(takenBreaks(above, "import { testEngine } from 'agent-runtime/testing';\n"), [], `a layer above takes it: ${above}`);
  assert.deepEqual(
    takenBreaks(file, "import { testEngine } from '../src/testing.ts';\n", [{ ...engine, home: undefined }]),
    [],
    'no home, no rule',
  );
});

test('no test of the runtime takes the stand-in of its own engine but its contract, which does', () => {
  const files = testAndHelperFilesOf(ROOT);
  const [, engine] = STAND_INS;
  for (const file of [engine.own, engine.walks.file, `${R}/test/engine.ts`, `${T}/placed.ts`])
    assert.ok(files.includes(file), `the scan reads ${file}`);
  assert.deepEqual(
    takenBreaks(engine.own, repository(engine.own) ?? '', [{ ...engine, own: 'elsewhere' }]).length,
    1,
    'its own side takes it',
  );
  assert.deepEqual(
    files.flatMap((file) => takenBreaks(file, repository(file) ?? '')),
    [],
  );
});

test('a boundary test of the runtime earns its name by the real engine alone, which is judged in no runtime test; one that names nothing real is still refused', () => {
  const real = "import { Engine } from '../src/index.ts';\nEngine.layer({ root });\n";
  const boundary = `${R}/test/x.boundary.test.ts`;
  const reach = reachOf(boundary, over({ [boundary]: real }));
  assert.deepEqual([reach.kinds, reach.named], [[], ['engine']], 'named, and judged nowhere in the runtime');
  assert.deepEqual(breaksOf({ [boundary]: real }), []);
  assert.deepEqual(breaksOf({ [`${R}/test/x.test.ts`]: real }), [], 'a runtime test names the real engine under any name');
  assert.deepEqual(breaksOf({ [boundary]: "import { testEngine } from '../src/testing.ts';\ntestEngine();\n" }), [
    `${boundary} is named a boundary test and reaches nothing real: drop .boundary from its name`,
  ]);
  const found = measureOf(ROOT);
  assert.deepEqual(found.get(`${R}/test/engine-contract.boundary.test.ts`)?.named, ['engine']);
  assert.deepEqual(found.get(`${R}/test/engine-contract.test.ts`)?.named, []);
});

test('the shared board is gone: no file of the three packages names its file', () => {
  const files = PACKAGES.flatMap((pkg) =>
    fs
      .readdirSync(path.join(ROOT, pkg), { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(ts|md)$/.test(f) && !f.split(path.sep).includes('node_modules'))
      .map((f) => `${pkg}/${f.split(path.sep).join('/')}`),
  );
  assert.ok(files.length > 500 && files.includes(`${T}/stand-ins.ts`), `the scan read ${files.length} files`);
  const board = ['engine', 'board'].join('-');
  assert.deepEqual(
    files.filter((file) => repository(file)?.includes(board)),
    [],
  );
  assert.ok(!onDisk(`${T}/${board}.ts`));
});

test('the sizes of the baseline add up: its entries by package, and its listed kinds by kind', () => {
  const size = sizes(REAL_REACH);
  const sum = (counts: Readonly<Record<string, number>>): number => Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(size.entries, Object.keys(REAL_REACH).length);
  assert.equal(sum(size.byPackage), size.entries);
  assert.equal(size.kinds, Object.values(REAL_REACH).flat().length);
  assert.equal(sum(size.byKind), size.kinds);
  assert.equal(sum(Object.fromEntries(Object.entries(size.byPackageAndKind).map(([pkg, counts]) => [pkg, sum(counts)]))), size.kinds);
  assert.deepEqual(Object.keys(size.byPackage).sort(), [...PACKAGES].sort(), 'each package has entries, and no file is elsewhere');
  assert.deepEqual(
    Object.keys(size.byKind).filter((kind) => !KINDS.includes(kind as Kind)),
    [],
  );
  assert.deepEqual(sizes({ 'apps/api/test/a.test.ts': ['git', 'process'], [`${T}/b.test.ts`]: ['git'] }), {
    entries: 2,
    kinds: 3,
    byPackage: { 'apps/api': 1, 'packages/agent-orchestrator': 1 },
    byKind: { git: 2, process: 1 },
    byPackageAndKind: { 'apps/api': { git: 1, process: 1 }, 'packages/agent-orchestrator': { git: 1 } },
  });
});

/** The repository's text of `file`, or `undefined` where it has none. */
const repository = (file: string): string | undefined => (onDisk(file) ? fs.readFileSync(path.join(ROOT, file), 'utf8') : undefined);

/** The repository, with `files` in place of its own: a text, or `undefined` for a file taken away. */
const repositoryWith =
  (files: Readonly<Record<string, string | undefined>>) =>
  (file: string): string | undefined =>
    file in files ? files[file] : repository(file);

test('every stand-in the packages hold walks its contract whole, on itself and on the real thing in a boundary test', () => {
  assert.ok(STAND_INS.length > 0);
  for (const standIn of STAND_INS) {
    assert.ok(repository(standIn.walks.file)?.includes(`export const ${standIn.walks.told} `), `${standIn.walks.file} tells its walks`);
    assert.deepEqual(contractBreaks(standIn, repository), [], standIn.name);
  }
  const folders = fs.readdirSync(path.join(ROOT, PLACES.folder));
  assert.ok(folders.includes('git') && folders.includes('memory'), `the scan read ${folders.join(', ')}`);
  assert.deepEqual(unlisted(folders), []);
});

test('REFUSED: a place that is neither git nor a stand-in with its contract', () => {
  assert.deepEqual(unlisted(['git', 'memory', 'other']), ['other']);
  assert.deepEqual(unlisted(['git', 'memory'], []), ['memory']);
});

test('REFUSED: a stand-in whose contract is missing on a side, walked on the real thing outside a boundary test, or walked in part', () => {
  const [place] = STAND_INS;
  const loop = 'for (const [name, walk] of walksOn(';
  const whole = ')) test(name, walk);';
  for (const [side, what] of [
    [place.real, 'the real thing'],
    [place.own, 'the stand-in'],
  ] as const) {
    const text = repository(side) ?? '';
    assert.ok(text.includes(loop) && text.includes(whole), `${side} walks with the line the fixtures change`);
    const breaks = (changed: string | undefined): string[] => contractBreaks(place, repositoryWith({ [side]: changed }));
    assert.deepEqual(breaks(undefined), [
      `the test place has no walk of its contract on ${what}: ${side} is missing, and a stand-in without its contract is refused`,
    ]);
    const subset = [
      `${side} walks a subset of ${place.walks.file}: every walk is a test, declared at the file's top by \`for (const [name, walk] of walksOn(…)) test(name, walk);\``,
    ];
    assert.deepEqual(breaks(text.replace(whole, ').slice(1)) test(name, walk);')), subset, 'all but the first');
    assert.deepEqual(breaks(text.replace(whole, ').filter(([name]) => name.startsWith("open"))) test(name, walk);')), subset, 'one verb');
    assert.deepEqual(breaks(text.replace(whole, ')) if (name.length < 40) test(name, walk);')), subset, 'a test under an if');
    assert.deepEqual(breaks(text.replace(whole, ')) test(name, () => {});')), subset, 'a test that walks nothing');
    assert.deepEqual(breaks(text.replace(whole, ')) other(name, walk);')), subset, 'a call that is no test');
    assert.deepEqual(breaks(text.replace(loop, 'for (const [name, walk] of none(')), [
      `${side} asks walksOn of ${place.walks.file} 0 times, not once: for (const [name, walk] of walksOn(…)) test(name, walk);`,
    ]);
  }
  const real = repository(place.real) ?? '';
  const renamed = { ...place, real: `${T}/git-place.test.ts` };
  assert.deepEqual(contractBreaks(renamed, repositoryWith({ [renamed.real]: real })), [
    `${renamed.real} walks the real thing and is no boundary test: name it <what>.boundary.test.ts`,
  ]);
  const unreal = real.replace("import { gitPlace } from '../place/git/place.ts';", "import { gitPlace } from './elsewhere.ts';");
  assert.notEqual(unreal, real);
  assert.deepEqual(contractBreaks(place, repositoryWith({ [place.real]: unreal })), [
    `${place.real} is the test place's real side and names no real place: walk the real thing there`,
  ]);
  const own = repository(place.own) ?? '';
  const other = own.replace("from '../place/memory/index.ts'", "from './elsewhere.ts'");
  assert.notEqual(other, own);
  assert.deepEqual(contractBreaks(place, repositoryWith({ [place.own]: other })), [
    `${place.own} is the test place's own side and does not import testPlace of ${place.folder}: walk the stand-in there`,
  ]);
});

test("REFUSED: the engine's stand-in without its whole contract — a side missing, the real side under no boundary name or naming no real engine, a subset, another maker", () => {
  const [, engine] = STAND_INS;
  assert.equal(engine.name, 'the test engine');
  assert.deepEqual(contractBreaks(engine, repository), []);
  const whole = ')) test(name, walk);';
  const how = 'for (const [name, walk] of walksOn(…)) test(name, walk);';
  for (const [side, what] of [
    [engine.real, 'the real thing'],
    [engine.own, 'the stand-in'],
  ] as const) {
    const text = repository(side) ?? '';
    assert.ok(text.includes(whole), `${side} walks with the line the fixtures change`);
    const breaks = (changed: string | undefined): string[] => contractBreaks(engine, repositoryWith({ [side]: changed }));
    assert.deepEqual(breaks(undefined), [
      `the test engine has no walk of its contract on ${what}: ${side} is missing, and a stand-in without its contract is refused`,
    ]);
    const subset = [`${side} walks a subset of ${engine.walks.file}: every walk is a test, declared at the file's top by \`${how}\``];
    assert.deepEqual(breaks(text.replace(whole, ').slice(1)) test(name, walk);')), subset, 'all but the first');
    assert.deepEqual(breaks(text.replace(whole, ')) if (name.startsWith("view")) test(name, walk);')), subset, 'one verb');
    assert.deepEqual(breaks(text.replace('for (const [name, walk] of walksOn(', 'for (const [name, walk] of none(')), [
      `${side} asks walksOn of ${engine.walks.file} 0 times, not once: ${how}`,
    ]);
  }
  const real = repository(engine.real) ?? '';
  const renamed = { ...engine, real: 'packages/agent-runtime/test/engine-real.test.ts' };
  assert.deepEqual(contractBreaks(renamed, repositoryWith({ [renamed.real]: real })), [
    `${renamed.real} walks the real thing and is no boundary test: name it <what>.boundary.test.ts`,
  ]);
  const unreal = real.replace('Engine.layer(', 'Engine.other(');
  assert.notEqual(unreal, real);
  assert.deepEqual(contractBreaks(engine, repositoryWith({ [engine.real]: unreal })), [
    `${engine.real} is the test engine's real side and names no real engine: walk the real thing there`,
  ]);
  const own = repository(engine.own) ?? '';
  const other = own.replace("from '../src/testing.ts'", "from './elsewhere.ts'");
  assert.notEqual(other, own);
  assert.deepEqual(contractBreaks(engine, repositoryWith({ [engine.own]: other })), [
    `${engine.own} is the test engine's own side and does not import testEngine of ${engine.folder}: walk the stand-in there`,
  ]);
});
