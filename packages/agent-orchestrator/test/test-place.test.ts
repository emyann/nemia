/**
 * The test place by itself (`place/memory`), beside its contract (`place-contract.test.ts`): a test file that names it with `eachTest`
 * (`placed.ts`) has a new one for each test, which that test's subtests share; it starts no process, by what its files import; both ways
 * of asking answer the same, and a verb that throws is unread in one sentence; and it declares every sentence the code prints of a place.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { testPlace, type TestPlace } from '../place/memory/index.ts';
import { PlaceService } from '../src/place/place.store.ts';
import { PLACE_SAYS, unknownHoles } from '../src/place/place.ts';
import { eachTest, runGiven } from './placed.ts';
import { scratch } from './scratch.ts';

const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer);

/** What asking for the place said at the head of the file, where no test runs: its refusal, or null where it answered. */
const OUTSIDE = (() => {
  try {
    stand();
    return null;
  } catch (err) {
    return (err as Error).message;
  }
})();

/** One directory for the whole file, on purpose: the tests below share it, and must not share what a place holds of it. */
const SHARED = scratch('wf-test-place-');

/** The first test's part: a repository made at the shared root, and a branch on it. */
function seeded({ place, world }: TestPlace): void {
  world.repository(SHARED, { 'a.txt': 'one\n' });
  world.branch(SHARED, 'work', { 'b.txt': 'two\n' });
  assert.ok('answer' in place.askNow('open', { root: SHARED, isolate: false }));
}

/** The second test's part: the shared root is no repository of its place, which holds no branch of the first. */
function unseen({ place }: TestPlace): void {
  const opened = place.askNow('open', { root: SHARED, isolate: false });
  assert.ok('refused' in opened, `a place that never made a repository there knows none: ${JSON.stringify(opened)}`);
  assert.ok('refused' in place.askNow('standing', { repo: SHARED, base: 'main', branches: [] }));
}

test('each test has a place of its own: the first makes a repository and a branch at a root the file shares', () => {
  seeded(stand());
});

test('each test has a place of its own: the second asks of the same root, and its place holds nothing of the first', () => {
  assert.deepEqual(fs.readdirSync(SHARED), ['a.txt'], 'the first test ran, and its files are still there');
  unseen(stand());
});

test('REFUSED: a place shared by two tests — the second sees the repository and the branch the first made', () => {
  const root = scratch('wf-test-place-shared-');
  const shared = testPlace();
  shared.world.repository(root, { 'a.txt': 'one\n' });
  const second = (place: TestPlace) => assert.ok('refused' in place.place.askNow('open', { root, isolate: false }));
  assert.throws(() => second(shared), assert.AssertionError);
  second(testPlace());
});

test("a test's subtests share its place, and the program it runs is given that one", async (t) => {
  const root = scratch('wf-test-place-sub-');
  const mine = stand();
  await t.test('a first subtest makes a repository', () => {
    assert.equal(stand(), mine, 'the place of the test it is in');
    stand().world.repository(root, { 'a.txt': 'one\n' });
  });
  await t.test('a second sees it, and so does a program given the layer', async () => {
    assert.equal(stand(), mine);
    const asked = Effect.gen(function* () {
      const place = yield* PlaceService;
      return yield* place.ask('open', { root, isolate: false });
    });
    const opened = await runPlaced(asked);
    assert.ok('answer' in opened && opened.answer.branch === 'main', JSON.stringify(opened));
  });
  assert.equal(stand(), mine, 'and the test still has it after them');
});

test('REFUSED: a place made for each test, asked at the head of the file, outside any test', () => {
  assert.equal(OUTSIDE, 'eachTest: asked before any test, where nothing is made yet: ask inside the test that uses it');
});

/** The modules a source imports, across line breaks. */
const importsOf = (source: string): string[] => [...source.matchAll(/\b(?:from|import)\s*\(?\s*'([^']+)'/g)].map((m) => m[1]);

/** The modules that start a process or a thread. */
const STARTS = ['node:child_process', 'child_process', 'node:worker_threads', 'worker_threads', 'node:cluster', 'cluster'];

/** The imports of `sources`, by file, that start a process or a thread. */
const starting = (sources: Readonly<Record<string, string>>): string[] =>
  Object.entries(sources).flatMap(([file, source]) =>
    importsOf(source)
      .filter((m) => STARTS.includes(m))
      .map((m) => `${file} imports ${m}`),
  );

test('REFUSED: a process in the test place — no file of place/memory imports what starts one, and a fixture that does is named', () => {
  const dir = path.join(import.meta.dirname, '..', 'place', 'memory');
  const files = fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
  assert.ok(files.includes('place.ts') && files.includes('writes.ts'), `the scan read ${files.join(', ')}`);
  const sources = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
  assert.ok(importsOf(sources['disk.ts']).includes('node:fs'), 'and read their imports');
  assert.deepEqual(starting(sources), []);
  const planted = {
    ...sources,
    'planted.ts':
      "import {\n  spawnSync,\n} from\n  'node:child_process';\nconst w = await import('node:worker_threads');\nimport 'node:cluster';\n",
  };
  assert.deepEqual(starting(planted), [
    'planted.ts imports node:child_process',
    'planted.ts imports node:worker_threads',
    'planted.ts imports node:cluster',
  ]);
});

test('both ways of asking answer the same, and a verb that throws is unread in one sentence naming it', async () => {
  const { place, world } = stand();
  const root = scratch('wf-test-place-ask-');
  world.repository(root, { 'a.txt': 'one\n' });
  const now = place.askNow('open', { root, isolate: false });
  assert.deepEqual(await Effect.runPromise(place.ask('open', { root, isolate: false })), now);
  const none = scratch('wf-test-place-none-');
  const request = { repo: none, under: none, run: 'x', base: 'main' };
  const unread = place.askNow('inventory', request);
  assert.ok('unread' in unread, JSON.stringify(unread));
  assert.equal(unread.unread.verb, 'inventory');
  assert.match(unread.unread.said, /^inventory threw before it answered: .* is no repository this test place holds/);
  const later = await Effect.runPromise(place.ask('inventory', request));
  assert.ok('unread' in later && later.unread.said === unread.unread.said, JSON.stringify(later));
});

test('the test place declares every sentence the code prints of a place, with no hole the code does not fill, and denies no tool', () => {
  const { declared } = testPlace().place;
  assert.deepEqual(Object.keys(declared.say).sort(), [...PLACE_SAYS].sort());
  assert.deepEqual(unknownHoles(declared.say), []);
  assert.deepEqual(unknownHoles({ ...declared.say, commit: 'commit {path} as {who}' }), [{ key: 'commit', hole: 'who' }]);
  assert.deepEqual(declared.denyWhileLanding, []);
});
