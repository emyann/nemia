/**
 * A factory's upgrade conflicts said on the feed, a person's story on the stage (`story.ts`): a factory applied from the tests' team at
 * 0.1.0 with its rules, the person's line of the rules and the template's 0.2.0 changing the same line, the upgrade filed, and the
 * controller writing `ConflictsPending` True to its status (`reconcileFactory`). The tick's next pass writes one `ConflictsPending` line
 * about the factory, labelled with it, which Nemia's selectors take; later passes, and a daemon restarted with no fold of its own, write
 * none. The person chooses, the controller merges and writes the condition False, and the next pass writes one `ConflictsSettled` line,
 * then none. A factory with no conflict is never said. Neither the verbs nor the controller write a line: the tick reads the condition on
 * each pass, as it reads the levels and the pause.
 *
 * The tick is the store's pass (`tickRun`), on the stage's engine given a pass of its own that does nothing, as `level-feed.test.ts`
 * gives it. The store is its own, at `ROOT`, given as `ENV`.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { teamCopy } from './team.ts';
import { templated as programsAt } from './templated.ts';
import { tickRun, readFeed } from '../src/runner.ts';
import { readFactoryAt } from '../src/factory/factory.store.ts';
import { treeDir } from '../src/factory/applied/applied.store.ts';
import { conflictsNow } from '../src/factory/applied/conflicts.verb.ts';
import { recordFeed, freshFeedMemo } from '../src/feed/feed.store.ts';
import { parseSelectors, selects } from '../src/watch/selector.ts';
import { NEMIA_SELECTORS } from '../src/nemia/nemia.ts';
import { engineOf, runWith } from '../src/runtime-client.ts';
import { main } from '../src/cli/main.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-conflicts-feed-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_RUNS: undefined, WF_MAX_CONCURRENT: undefined };
const { exportTemplate, reconciled } = programsAt(ROOT);
const stage = staged({ runWith, main, engineOf, env: ENV });

/** What the engine's own pass answers here: nothing admitted, nothing started, no view. */
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };
const RULES = 'RULES.md';
const LINE = `${RULES}:1-1`;

/** `nemia <argv>`, its console muted. */
const typed = async (t: TestContext, ...argv: string[]): Promise<void> => {
  const log = t.mock.method(console, 'log', () => {});
  try {
    await stage.main(argv);
  } finally {
    log.mock.restore();
  }
};

/** The factory `name`, read as the controller reads it. */
const factory = (name: string) =>
  readFactoryAt(ROOT, name) as ReturnType<typeof readFactoryAt> & { template: NonNullable<ReturnType<typeof readFactoryAt>['template']> };

/** The text of `RULES.md` in `dir` with `from` replaced by `to`. */
const rewrite = (dir: string, from: string, to: string): void => {
  const file = path.join(dir, RULES);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes(from), `${RULES} holds ${from}`);
  fs.writeFileSync(file, text.replace(from, to));
};

/** The feed's lines of a factory: its name, what it is about, its reason, its labels and its source. */
const factorySaid = () =>
  readFeed(ROOT, 0)
    .lines.filter((l) => l.involved?.kind === 'Factory')
    .map((l) => [l.involved?.name, l.reason, l.labels, l.source]);

test("a factory's upgrade conflicts said on the feed: one line when they turn pending, one when they settle, and none again", async (t) => {
  const s = story(t);
  const b = stage.board();
  Object.assign(b.e, { tick: () => Effect.succeed(QUIET), tallied: undefined });
  const pass = () => stage.runWith(b.e, tickRun());
  const dir = path.join(scratch('wf-conflicts-feed-template-'), 'team');

  await s.test('a factory applied at 0.1.0 with its rules, and one with no conflict: a pass says no factory', async (sub) => {
    const repo = scratch('wf-conflicts-feed-repo-');
    fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
    stage.place().world.repository(repo, {});
    stage.place().world.commit(repo, 'base');
    exportTemplate({ dir, from: repo });
    fs.writeFileSync(path.join(dir, RULES), 'Never push on a Friday.\n\nWrite the tests first.\n');
    for (const name of ['acme', 'quiet']) {
      await typed(sub, 'factory', 'apply', name, '--template', dir, '--repo', repo);
      reconciled(factory(name));
    }
    await pass();
    assert.deepEqual(factorySaid(), []);
  });

  await s.test(
    'the upgrade filed over a line both changed, the controller says ConflictsPending True: a pass says it once',
    async (sub) => {
      rewrite(treeDir(ROOT, 'acme'), 'on a Friday', 'on a Friday, nor on a Monday');
      const doc = parse(fs.readFileSync(path.join(dir, 'nemia.yaml'), 'utf8'));
      doc.spec.version = '0.2.0';
      fs.writeFileSync(path.join(dir, 'nemia.yaml'), stringify(doc, { lineWidth: 0 }));
      rewrite(dir, 'Never push on a Friday.', 'Never push on a weekend.');
      await typed(sub, 'factory', 'upgrade', 'acme', '--to', '0.2.0');
      const status = reconciled(factory('acme'));
      assert.deepEqual(
        status.conditions.filter((c) => c.type === 'ConflictsPending').map((c) => c.status),
        ['True'],
      );
      await pass();
      assert.deepEqual(factorySaid(), [['acme', 'ConflictsPending', { factory: 'acme' }, 'tick']]);
      const [line] = readFeed(ROOT, 0).lines.filter((l) => l.reason === 'ConflictsPending');
      assert.ok(line !== undefined);
      assert.equal(line.type, 'Normal', 'a wait on a person, not a fault');
      assert.equal(selects(parseSelectors([...NEMIA_SELECTORS]), line), true, 'her selectors wake her on it');
      assert.equal(selects(parseSelectors(['kind=Factory,factory=acme']), line), true);
    },
  );

  await s.test('more passes, and a daemon restarted with no fold of its own, say it no second time', async () => {
    await pass();
    await pass();
    const conflicts = await stage.runPlaced(conflictsNow());
    assert.deepEqual(recordFeed(ROOT, new Map(), { memo: freshFeedMemo(), conflicts }).lines, []);
    assert.equal(factorySaid().length, 1);
  });

  await s.test('the person chooses, the controller merges and says it False: a pass says it settled, once', async (sub) => {
    await typed(sub, 'factory', 'resolve', 'acme', LINE, '--theirs');
    const status = reconciled(factory('acme'));
    assert.deepEqual(
      status.conditions.filter((c) => c.type === 'ConflictsPending').map((c) => [c.status, c.reason]),
      [['False', 'Merged']],
    );
    await pass();
    await pass();
    assert.deepEqual(factorySaid().slice(1), [['acme', 'ConflictsSettled', { factory: 'acme' }, 'tick']]);
  });

  await s.test('a factory that never had a conflict is never said', () => {
    assert.deepEqual([...new Set(factorySaid().map((l) => l[0]))], ['acme']);
  });
});
