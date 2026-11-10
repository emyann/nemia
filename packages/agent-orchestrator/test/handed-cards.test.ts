/**
 * `nemia start --card`, as a person meets it: the inbox cards named are copied into the run's `inputs/cards/`, their names frozen on the
 * record, and every step is filed with the inputs folder read-only and told the cards under what was asked for; a card removed from the
 * inbox afterwards still reads in the run. A name that cannot be handed — no card, a name given twice, no card's name, an `--input` that
 * would take the cards' folder — is refused before anything is written, by its kind. `nemia start <folder>` refuses `--card`. One story
 * on the stage (`story.ts`).
 *
 * The store is the file's own, at `ROOT`, given as `ENV`.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { advanceRun, runWith } from '../src/runner.ts';
import { cardsDir, runRecord } from '../src/record/record.store.ts';
import { inboxAt } from '../src/cards/cards.store.ts';
import { engineOf } from '../src/runtime-client.ts';
import { main } from '../src/cli/main.ts';
import { readsAt, writesAt, type Filed } from './mounted.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-handed-cards-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = {
  ...process.env,
  WF_ROOT: ROOT,
  WF_VERIFY_REST: '1',
  WF_DEFAULT_FACTORY_STARTS: '1',
  WF_MAX_CONCURRENT: undefined,
  WF_MAX_RUNS: undefined,
  NEMIA_DAEMON_START: 'off',
};
const stage = staged({ runWith, main, engineOf, env: ENV });

/** A repository of the stage's place with one file, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'a.txt': 'one\n' });
  return repo;
};

/** implement, then review after it. */
const twoSteps = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};

/** Files the card `name` in the store's inbox with `text`. */
const fileCard = (name: string, text: string): void => {
  fs.mkdirSync(inboxAt(ROOT), { recursive: true });
  fs.writeFileSync(path.join(inboxAt(ROOT), `${name}.md`), text);
};

/** What `nemia <argv>` printed. */
const printedBy = async (t: TestContext, argv: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => void printed.push(args.join(' ')));
  try {
    await stage.main(argv);
  } finally {
    log.mock.restore();
  }
  return printed.join('\n');
};

const pass = (id: string) => stage.runWith(stage.board().e, advanceRun(runRecord(ROOT, id)));

/** The store's runs, by their directory: what a refused start must leave as it was. */
const runsNow = (): string[] => fs.readdirSync(path.join(ROOT, 'runs')).sort();

/** The refusal's kind and exit code, never its sentence. */
const refusedAs = (tag: string) => (err: Error & { _tag?: string; exitCode?: number }) => {
  assert.equal(err._tag, tag);
  assert.equal(err.exitCode, 2);
  return true;
};

const LQ = '---\nlabels: { area: run-core }\n---\nOne surface for the lists.\n';
const QE = 'Say which rows a run reads.\n\nA second paragraph, as written.\n';

test('nemia start --card hands the run inbox cards: copied at start, mounted read-only on every step, named on every brief', async (t) => {
  const s = story(t);
  fileCard('lists-lbpq', LQ);
  fileCard('rows-qeyh', QE);
  const repo = aRepo();
  let id = '';

  await s.test("the cards are copied into the run's inputs/cards byte for byte, their names frozen on the record", async (sub) => {
    const printed = await printedBy(sub, [
      'start',
      'untangle the lists',
      '--workflows',
      twoSteps(),
      '--repo',
      repo,
      '--no-worktree',
      '--card',
      'lists-lbpq',
      '--card=rows-qeyh',
    ]);
    id = printed.split(' ')[0] ?? '';
    const run = runRecord(ROOT, id);
    assert.deepEqual(run.cards, ['lists-lbpq', 'rows-qeyh'], 'by name, in the order given');
    assert.equal(run.inputs, undefined, 'no --input was given');
    assert.equal(fs.readFileSync(path.join(cardsDir(ROOT, run), 'lists-lbpq.md'), 'utf8'), LQ);
    assert.equal(fs.readFileSync(path.join(cardsDir(ROOT, run), 'rows-qeyh.md'), 'utf8'), QE);
    assert.ok(printed.includes(cardsDir(ROOT, run)), 'the start says where it copied them');
  });

  const handed = (name: string) => {
    const spec = stage.board().specs.find((x) => x.id === `${id}-${name}`);
    assert.ok(spec, `${name} is filed`);
    const config = spec.config as Filed;
    const dir = cardsDir(ROOT, runRecord(ROOT, id));
    for (const card of ['lists-lbpq', 'rows-qeyh']) {
      assert.ok(readsAt(config, path.join(dir, `${card}.md`)), `${name} reads ${card}`);
      assert.ok(!writesAt(config, path.join(dir, `${card}.md`)), `${name} writes no card`);
      assert.ok(spec.brief.includes(`\`${card}\``), `${name}'s brief names ${card}`);
    }
  };

  await s.test('the first step is filed with the inputs folder read-only, and its brief names both cards', async () => {
    assert.deepEqual((await pass(id)).filed, ['implement']);
    handed('implement');
  });

  await s.test('a card removed from the inbox still reads in the run, and the next step is handed it too', async () => {
    fs.rmSync(path.join(inboxAt(ROOT), 'lists-lbpq.md'));
    assert.equal(fs.readFileSync(path.join(cardsDir(ROOT, runRecord(ROOT, id)), 'lists-lbpq.md'), 'utf8'), LQ);
    stage.board().settle(`${id}-implement`, 'succeeded', { outcome: 'done', summary: 'built', artifacts: [], needs: null });
    assert.deepEqual((await pass(id)).filed, ['review']);
    handed('review');
  });

  await s.test('a card that is not in the inbox is refused Missing, before anything is written', async () => {
    const before = runsNow();
    await assert.rejects(
      stage.main(['start', 'again', '--workflows', twoSteps(), '--repo', repo, '--no-worktree', '--card', 'lists-lbpq']),
      refusedAs('Missing'),
    );
    assert.deepEqual(runsNow(), before, 'no run is written');
  });

  await s.test("a card named twice, no card's name, and an --input named cards beside a card are each refused Invalid", async () => {
    const before = runsNow();
    const given = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'cards');
    fs.writeFileSync(given, 'a file named cards\n');
    for (const flags of [
      ['--card', 'rows-qeyh', '--card', 'rows-qeyh'],
      ['--card', 'rows/qeyh'],
      ['--card', 'rows-qeyh', '--input', given],
    ]) {
      await assert.rejects(
        stage.main(['start', 'again', '--workflows', twoSteps(), '--repo', repo, '--no-worktree', ...flags]),
        refusedAs('Invalid'),
        flags.join(' '),
      );
    }
    assert.deepEqual(runsNow(), before, 'no run is written');
  });

  await s.test('nemia start <folder> refuses --card, as it refuses --input', async () => {
    const plan = fs.mkdtempSync(path.join(ROOT, 'plan-'));
    fs.writeFileSync(path.join(plan, 'one.md'), `---\nworkflow: ${twoSteps()}\n---\nbuild it\n`);
    const before = runsNow();
    await assert.rejects(stage.main(['start', plan, '--repo', repo, '--card', 'rows-qeyh']), (err: Error & { exitCode?: number }) => {
      assert.equal(err.exitCode, 2);
      return true;
    });
    assert.deepEqual(runsNow(), before, 'no run is written');
  });
});
