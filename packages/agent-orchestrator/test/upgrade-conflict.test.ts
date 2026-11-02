/**
 * An upgrade with a conflict, told as one person's story on the stage (`story.ts`) over a scratch store: a factory applied from the
 * tests' team at 0.1.0 with its rules, a run started on it, the person changing the review step's rounds and budget and a line of the
 * rules, and the template's 0.2.0 changing the same rounds and the same line. `nemia factory diff` previews it and writes nothing;
 * `nemia factory upgrade` files the version alone; the controller writes only its status while the two conflicts wait; `nemia factory
 * resolve` refuses what is no choice and writes each one; the controller merges once each has one, a pass stopped between its writes
 * ending on the next; the run in flight keeps the steps frozen on its record; and the tree is swapped only where no one wrote it since
 * the merge read it.
 *
 * What upgrade and resolve refuse beyond this, a clean upgrade, the rules carried and a status lost are
 * `src/upgrade/upgrade.verb.test.ts`; the three-way merge itself, `src/upgrade/merge.test.ts`. `WF_ROOT` is set before `src` is
 * imported, which reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';
import { teamCopy } from './team.ts';

const ROOT = scratch('wf-upgrade-conflict-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const FACTORIES = path.join(ROOT, 'factories');
const { templated: programsAt } = await import('./templated.ts');
const { exportTemplate, reconciled } = programsAt(ROOT);
const { readFactory } = await import('../src/runner.ts');
const { appliedDir, digestOf, entriesIn, readStatus, replaceBase, resolutionsFile, statusFile, swapTree, treeDir } =
  await import('../src/applied/applied.store.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { main } = await import('../src/cli/main.ts');
const { engineOf, runWith } = await import('../src/runtime-client.ts');
const stage = staged({ runWith, main, engineOf });

/** The document `file` of `dir`, its spec changed by `change`. */
function edit(dir: string, file: string, change: (spec: Record<string, any>) => void): void {
  const doc = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  change(doc.spec);
  fs.writeFileSync(path.join(dir, file), stringify(doc, { lineWidth: 0 }));
}

/** Every file under `dir`, by its path in it, with its bytes, so a pass is seen to have written nothing there. */
const bytesUnder = (dir: string): Record<string, string> =>
  Object.fromEntries(
    (fs.readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => fs.statSync(path.join(dir, f)).isFile())
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'base64')]),
  );

/** The text of `file` in `folder`. */
const textIn = (folder: string, file: string): string => fs.readFileSync(path.join(folder, file), 'utf8');

/** `file` in `folder` with `from` replaced by `to`. */
const rewrite = (folder: string, file: string, from: string, to: string): void => {
  const text = textIn(folder, file);
  assert.ok(text.includes(from), `${file} holds ${from}`);
  fs.writeFileSync(path.join(folder, file), text.replace(from, to));
};

/** What `argv` printed, as `nemia` prints it, line by line. */
async function printedBy(t: { mock: { method: Function } }, ...argv: string[]): Promise<string[]> {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...words: unknown[]) => printed.push(words.join(' ')));
  try {
    await stage.main(argv);
  } finally {
    log.mock.restore();
  }
  return printed.flatMap((p) => p.split('\n'));
}

/** Refused by kind and exit 2, its message matching each of `patterns`. */
const refusedWith =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...patterns: RegExp[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) =>
    err._tag === tag && err.exitCode === 2 && patterns.every((pattern) => pattern.test(err.message));

/** The factory `name`, read as the controller reads it. */
const factory = (name: string) =>
  readFactory(name) as ReturnType<typeof readFactory> & { template: NonNullable<ReturnType<typeof readFactory>['template']> };

const REVIEW = 'workflows/dev/review.md';
const RULES = 'RULES.md';
const ROUNDS = `${REVIEW}#rounds`;
const LINE = `${RULES}:1-1`;

test('an upgrade with a conflict: previewed, filed, waited on with the status alone, resolved, then merged', async (t) => {
  const s = story(t);
  const dir = path.join(scratch('wf-upgrade-conflict-template-'), 'team');
  const tree = () => treeDir('crew');
  let run = '';
  let waitingTree: Record<string, string> = {};
  let waitingBase: Record<string, string> = {};

  await s.test('a factory applied at 0.1.0 with its rules, a run started on it, and the person’s changes to its tree', async (t) => {
    const repo = scratch('wf-upgrade-conflict-repo-');
    fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
    stage.place().world.repository(repo, {});
    stage.place().world.commit(repo, 'base');
    exportTemplate({ dir, from: repo });
    fs.writeFileSync(path.join(dir, RULES), 'Never push on a Friday.\n\nWrite the tests first.\n');
    edit(dir, 'nemia.yaml', (spec) => {
      spec.parameters = { budget: { type: 'number', description: 'dollars for a review' } };
    });
    edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
      spec.steps[1].budget = { param: 'budget' };
    });
    await printedBy(t, 'factory', 'apply', 'crew', '--template', dir, '--repo', repo, '--set', 'budget=7');
    assert.equal(reconciled(factory('crew')).conditions[0].reason, 'Rendered');
    run = (await printedBy(t, 'start', 'Cache the views', '--factory', 'crew', '--workflows', 'dev'))[0].split(' ')[0];
    assert.equal(readRun(run).workflow?.find((step) => step.name === 'review')?.rounds, 3);
    rewrite(tree(), REVIEW, 'rounds: 3', 'rounds: 4');
    rewrite(tree(), REVIEW, 'budget: 7', 'budget: 9');
    rewrite(tree(), RULES, 'on a Friday', 'on a Friday, nor on a Monday');
    edit(dir, 'nemia.yaml', (spec) => {
      spec.version = '0.2.0';
    });
    edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
      spec.steps[1].rounds = 5;
    });
    rewrite(dir, RULES, 'Never push on a Friday.', 'Never push on a weekend.');
    rewrite(dir, RULES, 'Write the tests first.', 'Write the tests first, always.');
  });

  await s.test(
    'nemia factory diff previews what merges cleanly and each conflict, with the line that resolves it, and writes nothing',
    async (t) => {
      const before = bytesUnder(FACTORIES);
      const printed = await printedBy(t, 'factory', 'diff', 'crew', '--to', '0.2.0');
      assert.deepEqual(bytesUnder(FACTORIES), before, 'the plan writes nothing');
      assert.equal(printed[0], 'crew: 0.1.0 → 0.2.0');
      assert.ok(printed.includes('conflicts: 2'), printed.join('\n'));
      for (const at of [LINE, ROUNDS]) {
        assert.ok(printed.includes(`  ${at}`), printed.join('\n'));
        assert.ok(printed.includes(`    nemia factory resolve crew '${at}' --ours|--theirs|--file <path>`), printed.join('\n'));
      }
      assert.equal(printed.at(-1), 'nemia factory upgrade crew --to 0.2.0 files it; the daemon merges once each conflict is resolved.');
    },
  );

  await s.test("nemia factory upgrade files the version wanted in the factory's file, and nothing else", async (t) => {
    const file = path.join(FACTORIES, 'crew.json');
    const filedAs = JSON.parse(fs.readFileSync(file, 'utf8'));
    const folder = bytesUnder(path.join(FACTORIES, 'crew'));
    const printed = await printedBy(t, 'factory', 'upgrade', 'crew', '--to', '0.2.0');
    assert.match(printed[2], /^2 conflicts wait for a choice: nemia factory diff crew --to 0\.2\.0 shows each/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { ...filedAs, template: { ...filedAs.template, version: '0.2.0' } });
    assert.deepEqual(bytesUnder(path.join(FACTORIES, 'crew')), folder, 'the upgrade writes no tree, base nor status');
  });

  await s.test('while the conflicts wait the controller writes only its status: the tree and the base are left as they are', () => {
    waitingTree = bytesUnder(tree());
    waitingBase = bytesUnder(appliedDir('crew'));
    const waiting = reconciled(factory('crew'));
    assert.deepEqual(bytesUnder(tree()), waitingTree, 'the tree is left as it is while a conflict waits');
    assert.deepEqual(bytesUnder(appliedDir('crew')), waitingBase, 'and the base');
    assert.equal(waiting.version, '0.1.0');
    assert.deepEqual(
      waiting.conditions.map((c) => [c.type, c.status, c.reason]),
      [
        ['Applied', 'False', 'UpgradePending'],
        ['ConflictsPending', 'True', 'Conflicts'],
      ],
    );
    assert.ok(waiting.conditions[1].message.includes(`nemia factory resolve crew '${LINE}' `), waiting.conditions[1].message);
    assert.deepEqual(waiting.upgrade, {
      from: '0.1.0',
      to: '0.2.0',
      conflicts: [
        {
          at: LINE,
          base: 'Never push on a Friday.\n',
          ours: 'Never push on a Friday, nor on a Monday.\n',
          theirs: 'Never push on a weekend.\n',
        },
        { at: ROUNDS, base: 'rounds: 3\n', ours: 'rounds: 4\n', theirs: 'rounds: 5\n' },
      ],
    });
    assert.deepEqual(readStatus('crew'), waiting);
  });

  await s.test('resolve refuses what is no conflict or not one choice, writing nothing, and writes each choice it is given', async (t) => {
    const resolve = (...rest: string[]) => stage.main(['factory', 'resolve', 'crew', ...rest]);
    await assert.rejects(resolve('nowhere.md', '--ours'), refusedWith('Missing', /nowhere\.md is no conflict/));
    await assert.rejects(resolve(ROUNDS), refusedWith('Invalid', /takes one choice/));
    await assert.rejects(resolve(ROUNDS, '--ours', '--theirs'), refusedWith('Invalid', /takes one choice/));
    await assert.rejects(resolve(ROUNDS, '--file', path.join(dir, 'gone.md')), refusedWith('Invalid', /no file at/));
    assert.ok(!fs.existsSync(resolutionsFile('crew')), 'a refused resolve writes nothing');
    assert.match((await printedBy(t, 'factory', 'resolve', 'crew', ROUNDS, '--theirs'))[1], /^1 conflict still wait/);
    assert.deepEqual(
      reconciled(factory('crew')).upgrade?.conflicts.map((c) => c.at),
      [LINE],
    );
    assert.deepEqual(bytesUnder(tree()), waitingTree, 'one conflict left, nothing merged');
    const mine = path.join(scratch('wf-upgrade-conflict-choice-'), 'line.md');
    fs.writeFileSync(mine, 'Never push on a Friday, nor on a weekend.\n');
    assert.equal(
      (await printedBy(t, 'factory', 'resolve', 'crew', LINE, '--file', mine))[1],
      'every conflict has a choice: the daemon merges on its next pass (nemia up)',
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(resolutionsFile('crew'), 'utf8')), {
      to: '0.2.0',
      choices: { [ROUNDS]: 'theirs', [LINE]: { text: 'Never push on a Friday, nor on a weekend.\n' } },
    });
  });

  await s.test('once each conflict has a choice the controller merges: the tree takes every choice, the base the template', async () => {
    const oldBase = entriesIn(appliedDir('crew'));
    const oldStatus = fs.readFileSync(statusFile('crew'));
    const merged = reconciled(factory('crew'));
    assert.equal(merged.version, '0.2.0');
    assert.equal(merged.conditions[0].reason, 'Upgraded');
    assert.equal(merged.upgrade, undefined, 'no conflict is said once merged');
    assert.match(textIn(tree(), REVIEW), /^budget: 9\nloop: implement\nrounds: 5$/m, "the template's rounds and the person's budget");
    assert.equal(textIn(tree(), RULES), 'Never push on a Friday, nor on a weekend.\n\nWrite the tests first, always.\n');
    assert.equal(textIn(appliedDir('crew'), RULES), 'Never push on a weekend.\n\nWrite the tests first, always.\n');
    assert.equal(fs.statSync(path.join(appliedDir('crew'), REVIEW)).mode & 0o222, 0, 'the base is read-only again');
    const mergedTree = bytesUnder(tree());
    replaceBase('crew', oldBase);
    fs.writeFileSync(statusFile('crew'), oldStatus);
    assert.deepEqual(reconciled(factory('crew')), merged, 'stopped after the tree was swapped, the next pass ends it');
    assert.deepEqual(bytesUnder(tree()), mergedTree, 'composing the same tree');
    fs.writeFileSync(statusFile('crew'), oldStatus);
    const after = reconciled(factory('crew'));
    assert.deepEqual([after.version, after.conditions[0].status], ['0.2.0', 'True'], 'stopped after the base: the version is the render');
    assert.deepEqual(bytesUnder(tree()), mergedTree);
    await assert.rejects(
      stage.main(['factory', 'resolve', 'crew', LINE, '--ours']),
      refusedWith('Conflict', /no upgrade of crew is under way/),
    );
  });

  await s.test('the run in flight keeps the steps frozen on its record', () => {
    assert.equal(readRun(run).workflow?.find((step) => step.name === 'review')?.rounds, 3, 'its review step as it started');
  });

  await s.test('the tree is swapped only where no one wrote it since the merge read it', () => {
    const read = digestOf(entriesIn(tree()));
    rewrite(tree(), REVIEW, 'budget: 9', 'budget: 8');
    const written = bytesUnder(tree());
    const merge = entriesIn(appliedDir('crew'));
    assert.equal(swapTree('crew', merge, read), false, 'a write since the read: refused');
    assert.deepEqual(bytesUnder(tree()), written);
    assert.equal(swapTree('crew', merge, digestOf(entriesIn(tree()))), true);
    assert.match(textIn(tree(), REVIEW), /^budget: 7$/m);
    const staged = fs
      .readdirSync(path.join(FACTORIES, 'crew'))
      .filter((f) => !['applied', 'resolutions.json', 'status.json', 'tree'].includes(f));
    assert.deepEqual(staged, [], 'no folder is left staged beside it');
    const board = stage.board();
    assert.deepEqual([board.filings, board.stopped], [[], []], 'no command of the story filed on the engine');
  });
});
