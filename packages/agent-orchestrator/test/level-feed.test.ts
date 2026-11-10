/**
 * A factory's level said on the feed, a person's story on the stage (`story.ts`): `nemia level` sets a factory's default, raises it for a
 * stretch and ends a raise, and the tick's next pass writes one `LevelChanged` line of the store, labelled with the factory and saying its
 * level in force — a raise with its end — while a pass that reads the same level writes none, a raise whose end has passed is said fallen
 * back with no write of anyone's, a factory left at `manual` is never said, and a daemon restarted, with no fold of its own, says nothing
 * again. The verb writes no line: the tick reads the levels in force on each pass, as it reads the store's pause.
 *
 * The tick is the store's pass (`tickRun`), on the stage's engine given a pass of its own that does nothing, as `pause.test.ts` gives it.
 * A raise's end is the wall's, so the story steers `Date` with node's mock timers, and passes the hour by moving them. The test's
 * store is its own, at `ROOT`, given as `ENV`.

 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { tickRun, runWith, readFeed } from '../src/runner.ts';
import { addFactoryAt } from '../src/factory/factory.store.ts';
import { recordFeed, freshFeedMemo } from '../src/feed/feed.store.ts';
import { levelsNow } from '../src/level/levels.verb.ts';
import { readPause } from '../src/pause/pause.store.ts';
import { parseSelectors, selects } from '../src/watch/selector.ts';
import { NEMIA_SELECTORS } from '../src/nemia/nemia.ts';
import { engineOf } from '../src/runtime-client.ts';
import { main } from '../src/cli/main.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-level-feed-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_RUNS: undefined, WF_MAX_CONCURRENT: undefined };
const stage = staged({ runWith, main, engineOf, env: ENV });

/** What the engine's own pass answers here: nothing admitted, nothing started, no view. */
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };
/** The moment the story opens at. */
const NOW = '2026-11-05T13:00:00.000Z';
/** An hour, the stretch the story raises for. */
const HOUR = 3_600_000;

/** What `nemia <argv>` printed, its console muted. */
const typed = async (t: TestContext, ...argv: string[]): Promise<void> => {
  const log = t.mock.method(console, 'log', () => {});
  try {
    await stage.main(argv);
  } finally {
    log.mock.restore();
  }
};

/** The feed's level lines: the factory each is labelled with, its reason, its source and its note. */
const levelSaid = () =>
  readFeed(ROOT, 0)
    .lines.filter((l) => l.reason === 'LevelChanged')
    .map((l) => [l.labels?.factory, l.involved, l.source, l.note]);

const STORE = { kind: 'Store', name: 'store' };

test("a factory's level said on the feed: each change of the level in force is one line of the store, labelled with its factory, and nothing else is", async (t) => {
  const s = story(t);
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(NOW) });
  const b = stage.board();
  Object.assign(b.e, { tick: () => Effect.succeed(QUIET), tallied: undefined });
  const pass = () => stage.runWith(b.e, tickRun());
  for (const name of ['acme', 'quiet']) addFactoryAt(ROOT, { name, repos: [fs.mkdtempSync(path.join(ROOT, `${name}-`))] });

  await s.test('every factory at manual: a pass says no level', async () => {
    await pass();
    assert.deepEqual(levelSaid(), []);
  });
  await s.test('nemia level auto --factory acme, then a pass, is one LevelChanged line labelled acme, a person’s deed', async (sub) => {
    await typed(sub, 'level', 'auto', '--factory', 'acme');
    await pass();
    assert.deepEqual(levelSaid(), [['acme', STORE, 'person', 'acme is at auto']]);
    const [line] = readFeed(ROOT, 0).lines.filter((l) => l.reason === 'LevelChanged');
    assert.ok(line !== undefined && line.message?.includes('acme is at auto'), line?.message);
    assert.equal(selects(parseSelectors([...NEMIA_SELECTORS]), line), true, 'her selectors wake her on it');
  });
  await s.test('a second pass, the level the same, writes no level line', async () => {
    await pass();
    await pass();
    assert.equal(levelSaid().length, 1);
  });
  await s.test(
    'a default set lower, then a raise for an hour: each is a line, the raise with its end and what it falls back to',
    async (sub) => {
      await typed(sub, 'level', 'semi-auto', '--factory', 'acme');
      await pass();
      await typed(sub, 'level', 'auto', '--factory', 'acme', '--for', '1h');
      await pass();
      const until = new Date(Date.parse(NOW) + HOUR).toISOString();
      assert.deepEqual(levelSaid().slice(1), [
        ['acme', STORE, 'person', 'acme is at semi-auto'],
        ['acme', STORE, 'person', `acme is at auto until ${until}, then semi-auto`],
      ]);
    },
  );
  await s.test('the hour passes, nobody writing: the next pass says acme fell back to semi-auto, and the one after nothing', async () => {
    t.mock.timers.tick(HOUR - 1);
    await pass();
    assert.equal(levelSaid().length, 3, 'a millisecond short of its end, the raise stands');
    t.mock.timers.tick(1);
    await pass();
    await pass();
    assert.deepEqual(levelSaid().slice(3), [['acme', STORE, 'person', 'acme is at semi-auto']]);
  });
  await s.test('a raise ended by --end is a line of its own', async (sub) => {
    await typed(sub, 'level', 'auto', '--factory', 'acme', '--for', '2h');
    const raisedAt = Date.now();
    await pass();
    await typed(sub, 'level', '--factory', 'acme', '--end');
    await pass();
    assert.deepEqual(
      levelSaid()
        .slice(4)
        .map((l) => l[3]),
      [`acme is at auto until ${new Date(raisedAt + 2 * HOUR).toISOString()}, then semi-auto`, 'acme is at semi-auto'],
    );
  });
  await s.test('a daemon restarted, with no fold of its own, writes no level line again', async () => {
    const levels = await stage.runPlaced(levelsNow());
    assert.deepEqual(recordFeed(ROOT, new Map(), { memo: freshFeedMemo(), pause: readPause(ROOT), levels }).lines, []);
  });
  await s.test('a factory left at manual, and the default factory, are never said', async () => {
    assert.deepEqual([...new Set(levelSaid().map((l) => l[0]))], ['acme']);
  });
});
