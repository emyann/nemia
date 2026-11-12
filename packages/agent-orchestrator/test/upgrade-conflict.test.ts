/**
 * An upgrade with a conflict, told as one person's story on the stage (`story.ts`) over a scratch store: a factory applied from the
 * tests' team at 0.1.0 with its rules, a run started on it, the person changing the review step's rounds and budget and a line of the
 * rules and a line of the workflow's script, and the template's 0.2.0 changing the same rounds and the same lines. `nemia factory diff`
 * previews it and writes nothing; `nemia factory upgrade` files the version alone; the controller writes only its status while the three
 * conflicts wait; `nemia factory resolve` refuses what is no choice and writes each one, the rules' settling the merge itself and the
 * workflow's two, once both have one, proposing the workflow as they compose it, which the status names until the person approves it; the
 * controller merges once it applied, taking that workflow from the tree, a pass stopped between its writes ending on the next; the run in
 * flight keeps the steps frozen on its record; and the tree is swapped only where no one wrote it since the merge read it. Then a
 * resolution's proposal declined, which the status says to resolve again, and resolved again; and one made from a session's token, the
 * session's agent's, or refused where the session is another factory's.
 *
 * What upgrade and resolve refuse beyond this, a clean upgrade, the rules carried and a status lost are
 * `src/factory/upgrade/upgrade.verb.test.ts`; the three-way merge itself, `src/factory/upgrade/merge.test.ts`. Its store is its own at
 * `ROOT`, given as `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { teamCopy } from './team.ts';
import { templated as programsAt } from './templated.ts';
import { readFactoryAt } from '../src/factory/factory.store.ts';
import {
  appliedDir,
  digestOf,
  entriesIn,
  readStatus,
  replaceBase,
  resolutionsFile,
  statusFile,
  swapTree,
  treeDir,
} from '../src/factory/applied/applied.store.ts';
import { runRecord } from '../src/record/record.store.ts';
import { approveProgram, declineProgram } from '../src/approval/approve.verb.ts';
import { PERSON } from '../src/caller/caller.ts';
import { mintToken } from '../src/token/token.store.ts';
import { main } from '../src/cli/main.ts';
import { engineOf, runWith } from '../src/runtime-client.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-upgrade-conflict-');
const FACTORIES = path.join(ROOT, 'factories');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1' };
const { exportTemplate, reconciled, reconciledAt } = programsAt(ROOT);
const stage = staged({ runWith, main, engineOf, env: ENV });

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
  readFactoryAt(ROOT, name) as ReturnType<typeof readFactoryAt> & { template: NonNullable<ReturnType<typeof readFactoryAt>['template']> };

const REVIEW = 'workflows/dev/review.md';
const RULES = 'RULES.md';
const ROUNDS = `${REVIEW}#rounds`;
const LINE = `${RULES}:1-1`;
const SCRIPT = 'workflows/dev/check.ts';
const SCRIPT_LINE = `${SCRIPT}:3-3`;

/** The workflow's script at 0.1.0, in the person's tree and in the template's 0.2.0, and as the person's choice composes it. */
const SCRIPT_AT = {
  base: 'export const checks = [\n  "lint",\n  "test",\n];\n',
  ours: 'export const checks = [\n  "lint",\n  "test --mine",\n];\n',
  theirs: 'export const checks = [\n  "lint",\n  "test --theirs",\n];\n',
  composed: 'export const checks = [\n  "lint",\n  "test --mine --theirs",\n];\n',
};

/** Where a proposal is read and applied: this test's store. */
const PLACE = { home: ROOT, repo: ROOT };

/** The proposal `name` of the factory `factory`, as the store holds it. */
const proposalIn = (factory: string, name: string) =>
  JSON.parse(fs.readFileSync(path.join(FACTORIES, factory, 'proposals', `${name}.json`), 'utf8'));

/** The proposals of the factory `factory` the store holds, by name. */
const proposalsOf = (factory: string): string[] => {
  const dir = path.join(FACTORIES, factory, 'proposals');
  return fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => f.replace(/\.json$/, '')) : [];
};

/** The proposal recorded for the owner `owner` (`<Kind>/<name>`) of `factory`'s upgrade, in `resolutions.json`. */
const recordedFor = (factory: string, owner: string): string | undefined =>
  JSON.parse(fs.readFileSync(resolutionsFile(ROOT, factory), 'utf8')).proposals?.[owner];

/**
 * A factory `name` applied from the tests' team with the workflow's script at 0.1.0, the person's line of it in its tree, and the
 * template at 0.2.0 changing the same line, the upgrade filed: one conflict, the script's line.
 */
async function scripted(t: { mock: { method: Function } }, name: string): Promise<void> {
  const repo = scratch(`wf-upgrade-conflict-${name}-repo-`);
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  stage.place().world.repository(repo, {});
  stage.place().world.commit(repo, 'base');
  const at = path.join(scratch(`wf-upgrade-conflict-${name}-`), 'team');
  exportTemplate({ dir: at, from: repo });
  fs.writeFileSync(path.join(at, SCRIPT), SCRIPT_AT.base);
  await printedBy(t, 'factory', 'apply', name, '--template', at, '--repo', repo);
  reconciled(factory(name));
  fs.writeFileSync(path.join(treeDir(ROOT, name), SCRIPT), SCRIPT_AT.ours);
  edit(at, 'nemia.yaml', (spec) => {
    spec.version = '0.2.0';
  });
  fs.writeFileSync(path.join(at, SCRIPT), SCRIPT_AT.theirs);
  await printedBy(t, 'factory', 'upgrade', name, '--to', '0.2.0');
  assert.deepEqual(
    reconciled(factory(name)).upgrade?.conflicts.map((c) => c.at),
    [SCRIPT_LINE],
  );
}

/** The person's own text for the script's line, in a file of its own. */
const scriptChoice = (): string => {
  const mine = path.join(scratch('wf-upgrade-conflict-script-'), 'line.ts');
  fs.writeFileSync(mine, '  "test --mine --theirs",\n');
  return mine;
};

test('an upgrade with a conflict: previewed, filed, waited on with the status alone, resolved, then merged', async (t) => {
  const s = story(t);
  const dir = path.join(scratch('wf-upgrade-conflict-template-'), 'team');
  const tree = () => treeDir(ROOT, 'crew');
  let run = '';
  let waitingTree: Record<string, string> = {};
  let waitingBase: Record<string, string> = {};
  let proposal = '';
  let rules = '';
  let mergedScript = '';
  let baseScript = '';

  await s.test('a factory applied at 0.1.0 with its rules, a run started on it, and the person’s changes to its tree', async (t) => {
    const repo = scratch('wf-upgrade-conflict-repo-');
    fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
    stage.place().world.repository(repo, {});
    stage.place().world.commit(repo, 'base');
    exportTemplate({ dir, from: repo });
    fs.writeFileSync(path.join(dir, RULES), 'Never push on a Friday.\n\nWrite the tests first.\n');
    fs.writeFileSync(path.join(dir, SCRIPT), SCRIPT_AT.base);
    edit(dir, 'nemia.yaml', (spec) => {
      spec.parameters = { budget: { type: 'number', description: 'dollars for a review' } };
    });
    edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
      spec.steps[1].budget = { param: 'budget' };
    });
    await printedBy(t, 'factory', 'apply', 'crew', '--template', dir, '--repo', repo, '--set', 'budget=7');
    assert.equal(reconciled(factory('crew')).conditions[0].reason, 'Rendered');
    run = (await printedBy(t, 'start', 'Cache the views', '--factory', 'crew', '--workflows', 'dev'))[0].split(' ')[0];
    assert.equal(runRecord(ROOT, run).workflow?.find((step) => step.name === 'review')?.rounds, 3);
    rewrite(tree(), REVIEW, 'rounds: 3', 'rounds: 4');
    rewrite(tree(), REVIEW, 'budget: 7', 'budget: 9');
    rewrite(tree(), RULES, 'on a Friday', 'on a Friday, nor on a Monday');
    assert.equal(textIn(tree(), SCRIPT), SCRIPT_AT.base, "the template's script, carried into the tree");
    fs.writeFileSync(path.join(tree(), SCRIPT), SCRIPT_AT.ours);
    edit(dir, 'nemia.yaml', (spec) => {
      spec.version = '0.2.0';
    });
    edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
      spec.steps[1].rounds = 5;
    });
    rewrite(dir, RULES, 'Never push on a Friday.', 'Never push on a weekend.');
    rewrite(dir, RULES, 'Write the tests first.', 'Write the tests first, always.');
    fs.writeFileSync(path.join(dir, SCRIPT), SCRIPT_AT.theirs);
  });

  await s.test(
    'nemia factory diff previews what merges cleanly and each conflict, then the upgrade to file before the line that resolves each, and writes nothing',
    async (t) => {
      const before = bytesUnder(FACTORIES);
      const printed = await printedBy(t, 'factory', 'diff', 'crew', '--to', '0.2.0');
      assert.deepEqual(bytesUnder(FACTORIES), before, 'the plan writes nothing');
      assert.equal(printed[0], 'crew: 0.1.0 → 0.2.0');
      assert.ok(printed.includes('conflicts: 3'), printed.join('\n'));
      const upgrade = printed.findIndex((line) => line.startsWith('first, nemia factory upgrade crew --to 0.2.0 files it'));
      assert.ok(upgrade > 0, printed.join('\n'));
      assert.match(printed[upgrade - 1] ?? '', /^plan: sha256:[0-9a-f]{64}$/, 'the digest the upgrade is held to, where one is');
      for (const at of [LINE, SCRIPT_LINE, ROUNDS]) {
        assert.ok(printed.includes(`  ${at}`), printed.join('\n'));
        const resolve = printed.indexOf(`    nemia factory resolve crew '${at}' --ours|--theirs|--file <path>`);
        assert.ok(resolve > upgrade, `the resolve of ${at} comes after the upgrade it is taken for:\n${printed.join('\n')}`);
      }
    },
  );

  await s.test(
    'a resolve typed before its upgrade is filed is refused as a Conflict whose fix is that upgrade, and writes nothing',
    async () => {
      const before = bytesUnder(FACTORIES);
      await assert.rejects(
        stage.main(['factory', 'resolve', 'crew', LINE, '--ours']),
        refusedWith('Conflict', /nemia factory upgrade crew --to 0\.2\.0/),
      );
      assert.deepEqual(bytesUnder(FACTORIES), before, 'nothing is resolved');
    },
  );

  await s.test("nemia factory upgrade files the version wanted in the factory's file, and nothing else", async (t) => {
    const file = path.join(FACTORIES, 'crew.json');
    const filedAs = JSON.parse(fs.readFileSync(file, 'utf8'));
    const folder = bytesUnder(path.join(FACTORIES, 'crew'));
    const printed = await printedBy(t, 'factory', 'upgrade', 'crew', '--to', '0.2.0');
    assert.match(printed[2], /^3 conflicts wait for a choice: nemia factory diff crew --to 0\.2\.0 shows each/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
      ...filedAs,
      template: { ...filedAs.template, version: '0.2.0' },
      generation: 2,
    });
    assert.deepEqual(bytesUnder(path.join(FACTORIES, 'crew')), folder, 'the upgrade writes no tree, base nor status');
  });

  await s.test('while the conflicts wait the controller writes only its status: the tree and the base are left as they are', () => {
    waitingTree = bytesUnder(tree());
    waitingBase = bytesUnder(appliedDir(ROOT, 'crew'));
    const waiting = reconciled(factory('crew'));
    assert.deepEqual(bytesUnder(tree()), waitingTree, 'the tree is left as it is while a conflict waits');
    assert.deepEqual(bytesUnder(appliedDir(ROOT, 'crew')), waitingBase, 'and the base');
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
        { at: SCRIPT_LINE, base: '  "test",\n', ours: '  "test --mine",\n', theirs: '  "test --theirs",\n' },
        { at: ROUNDS, base: 'rounds: 3\n', ours: 'rounds: 4\n', theirs: 'rounds: 5\n' },
      ],
    });
    assert.deepEqual(readStatus(ROOT, 'crew'), waiting);
  });

  await s.test('resolve refuses what is no conflict or not one choice, writing nothing, and writes each choice it is given', async (t) => {
    const resolve = (...rest: string[]) => stage.main(['factory', 'resolve', 'crew', ...rest]);
    await assert.rejects(resolve('nowhere.md', '--ours'), refusedWith('Missing', /nowhere\.md is no conflict/));
    await assert.rejects(resolve(ROUNDS), refusedWith('Invalid', /takes one choice/));
    await assert.rejects(resolve(ROUNDS, '--ours', '--theirs'), refusedWith('Invalid', /takes one choice/));
    await assert.rejects(resolve(ROUNDS, '--file', path.join(dir, 'gone.md')), refusedWith('Invalid', /no file at/));
    assert.ok(!fs.existsSync(resolutionsFile(ROOT, 'crew')), 'a refused resolve writes nothing');
    assert.match((await printedBy(t, 'factory', 'resolve', 'crew', ROUNDS, '--theirs'))[1], /^2 conflicts still wait/);
    assert.deepEqual(proposalsOf('crew'), [], "the workflow's other conflict has no choice yet, so nothing is proposed");
    assert.deepEqual(
      reconciled(factory('crew')).upgrade?.conflicts.map((c) => [c.at, c.proposal]),
      [
        [LINE, undefined],
        [SCRIPT_LINE, undefined],
        [ROUNDS, undefined],
      ],
      "a choice for a workflow's conflict is a draft: it settles nothing by itself",
    );
    assert.deepEqual(bytesUnder(tree()), waitingTree, 'nothing merged');
    const printed = await printedBy(t, 'factory', 'resolve', 'crew', SCRIPT_LINE, '--file', scriptChoice());
    proposal = recordedFor('crew', 'Workflow/dev') ?? '';
    assert.deepEqual(proposalsOf('crew'), [proposal], 'each conflict of the workflow has a choice: it is proposed, once');
    assert.ok(
      printed.includes(`the Workflow dev is proposed as your choices compose it, ${proposal}: nemia proposals approve ${proposal} -n crew`),
      printed.join('\n'),
    );
    const made = proposalIn('crew', proposal);
    assert.equal(made.status.phase, 'waiting');
    assert.deepEqual(made.status.proposedBy, {}, 'the person, from a shell with no session token');
    assert.deepEqual(
      made.status.changes.map((c: { resource: string; name: string; verb: string }) => [c.resource, c.name, c.verb]),
      [['workflows', 'dev', 'update']],
    );
    const object = made.spec.objects[0];
    assert.match(object.metadata.resourceVersion, /\S/, 'proposed at the version the tree is at');
    assert.deepEqual(
      object.spec.files.filter((f: { path: string }) => f.path === 'check.ts'),
      [{ path: 'check.ts', text: SCRIPT_AT.composed }],
    );
    const review = object.spec.steps.find((step: { name: string }) => step.name === 'review');
    assert.deepEqual([review.keys.rounds, review.keys.budget], [5, 9], "the template's rounds and the person's budget");
    assert.deepEqual(bytesUnder(tree()), waitingTree, 'the tree is left as it is: the proposal writes it once applied');
    const recorded = fs.readFileSync(resolutionsFile(ROOT, 'crew'), 'utf8');
    await assert.rejects(resolve(ROUNDS, '--ours'), refusedWith('Conflict', new RegExp(`nemia proposals decline ${proposal} -n crew`)));
    assert.equal(fs.readFileSync(resolutionsFile(ROOT, 'crew'), 'utf8'), recorded, 'a refused resolve writes nothing');
    const mine = path.join(scratch('wf-upgrade-conflict-choice-'), 'line.md');
    fs.writeFileSync(mine, 'Never push on a Friday, nor on a weekend.\n');
    const last = await printedBy(t, 'factory', 'resolve', 'crew', LINE, '--file', mine);
    rules = recordedFor('crew', 'Factory/crew') ?? '';
    assert.ok(rules !== '' && rules !== proposal, 'the rules are proposed as the Factory, a proposal of their own');
    for (const p of [proposal, rules]) assert.ok(last[2]?.includes(`nemia proposals approve ${p} -n crew`), last.join('\n'));
    assert.deepEqual(
      proposalIn('crew', rules).spec.objects.map((o: { kind: string; spec: { rules?: string } }) => [o.kind, o.spec.rules]),
      [['Factory', 'Never push on a Friday, nor on a weekend.\n\nWrite the tests first, always.\n']],
      'the rules as the choice composes them with what merged cleanly',
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(resolutionsFile(ROOT, 'crew'), 'utf8')), {
      to: '0.2.0',
      template: 'team',
      base: digestOf(entriesIn(appliedDir(ROOT, 'crew'))),
      choices: {
        [ROUNDS]: 'theirs',
        [SCRIPT_LINE]: { text: '  "test --mine --theirs",\n' },
        [LINE]: { text: 'Never push on a Friday, nor on a weekend.\n' },
      },
      proposals: { 'Workflow/dev': proposal, 'Factory/crew': rules },
    });
  });

  await s.test('while the proposals wait the controller writes only its status, naming each and the line that approves it', () => {
    const waiting = reconciled(factory('crew'));
    assert.deepEqual(bytesUnder(tree()), waitingTree, 'the tree is left as it is');
    assert.deepEqual(bytesUnder(appliedDir(ROOT, 'crew')), waitingBase, 'and the base');
    assert.deepEqual(
      waiting.upgrade?.conflicts.map((c) => [c.at, c.proposal]),
      [
        [LINE, { name: rules, phase: 'waiting' }],
        [SCRIPT_LINE, { name: proposal, phase: 'waiting' }],
        [ROUNDS, { name: proposal, phase: 'waiting' }],
      ],
      "the rules' conflict waits on the Factory's proposal, the workflow's on its own",
    );
    assert.ok(waiting.conditions[1].message.includes(`nemia proposals approve ${proposal} -n crew`), waiting.conditions[1].message);
  });

  await s.test(
    'the person approves both proposals, and they apply: the tree holds the workflow and the rules as the choices composed them',
    async () => {
      const applied = await stage.runWith(stage.board().e, approveProgram(PERSON, 'crew', proposal, PLACE));
      assert.equal(applied.status.phase, 'applied');
      reconciled(factory('crew'));
      const factoryApplied = await stage.runWith(stage.board().e, approveProgram(PERSON, 'crew', rules, PLACE));
      assert.equal(factoryApplied.status.phase, 'applied', "a pass between them leaves the Factory's proposal fresh");
      assert.equal(textIn(tree(), RULES), 'Never push on a Friday, nor on a weekend.\n\nWrite the tests first, always.\n');
      assert.match(textIn(tree(), REVIEW), /^budget: 9$/m);
      assert.match(textIn(tree(), REVIEW), /^rounds: 5$/m);
      assert.deepEqual(bytesUnder(appliedDir(ROOT, 'crew')), waitingBase, 'the base is left to the controller');
    },
  );

  await s.test(
    'once its proposal applied the controller merges, the workflow taken from the tree: the tree takes every choice, the base the template',
    async () => {
      const oldBase = entriesIn(appliedDir(ROOT, 'crew'));
      const oldStatus = fs.readFileSync(statusFile(ROOT, 'crew'));
      const at = '2026-11-01T09:00:00.000Z';
      const merged = reconciledAt(factory('crew'), at);
      assert.equal(merged.version, '0.2.0');
      assert.equal(merged.conditions[0].reason, 'Upgraded');
      assert.equal(merged.upgrade, undefined, 'no conflict is said once merged');
      assert.match(textIn(tree(), REVIEW), /^budget: 9\nloop: implement\nrounds: 5$/m, "the template's rounds and the person's budget");
      assert.equal(textIn(tree(), RULES), 'Never push on a Friday, nor on a weekend.\n\nWrite the tests first, always.\n');
      assert.equal(textIn(appliedDir(ROOT, 'crew'), RULES), 'Never push on a weekend.\n\nWrite the tests first, always.\n');
      assert.equal(fs.statSync(path.join(appliedDir(ROOT, 'crew'), REVIEW)).mode & 0o222, 0, 'the base is read-only again');
      const mergedTree = bytesUnder(tree());
      mergedScript = textIn(tree(), SCRIPT);
      baseScript = textIn(appliedDir(ROOT, 'crew'), SCRIPT);
      replaceBase(ROOT, 'crew', oldBase);
      fs.writeFileSync(statusFile(ROOT, 'crew'), oldStatus);
      assert.deepEqual(reconciledAt(factory('crew'), at), merged, 'stopped after the tree was swapped, the next pass ends it');
      assert.deepEqual(bytesUnder(tree()), mergedTree, 'composing the same tree');
      fs.writeFileSync(statusFile(ROOT, 'crew'), oldStatus);
      const after = reconciled(factory('crew'));
      assert.deepEqual([after.version, after.conditions[0].status], ['0.2.0', 'True'], 'stopped after the base: the version is the render');
      assert.deepEqual(bytesUnder(tree()), mergedTree);
      await assert.rejects(
        stage.main(['factory', 'resolve', 'crew', LINE, '--ours']),
        refusedWith('Conflict', /no upgrade of crew is under way/),
      );
    },
  );

  await s.test('the run in flight keeps the steps frozen on its record', () => {
    assert.equal(runRecord(ROOT, run).workflow?.find((step) => step.name === 'review')?.rounds, 3, 'its review step as it started');
  });

  await s.test('the tree is swapped only where no one wrote it since the merge read it', () => {
    const read = digestOf(entriesIn(tree()));
    rewrite(tree(), REVIEW, 'budget: 9', 'budget: 8');
    const written = bytesUnder(tree());
    const merge = entriesIn(appliedDir(ROOT, 'crew'));
    assert.equal(swapTree(ROOT, 'crew', merge, read), false, 'a write since the read: refused');
    assert.deepEqual(bytesUnder(tree()), written);
    assert.equal(swapTree(ROOT, 'crew', merge, digestOf(entriesIn(tree()))), true);
    assert.match(textIn(tree(), REVIEW), /^budget: 7$/m);
    const staged = fs
      .readdirSync(path.join(FACTORIES, 'crew'))
      .filter((f) => !['applied', 'proposals', 'resolutions.json', 'status.json', 'tree'].includes(f));
    assert.deepEqual(staged, [], 'no folder is left staged beside it');
    const board = stage.board();
    assert.deepEqual([board.filings, board.stopped], [[], []], 'no command of the story filed on the engine');
  });

  await s.test(
    "the merged tree's script was the text the person's choice composed, written by the applied proposal and kept by the merge",
    () => {
      assert.equal(baseScript, SCRIPT_AT.theirs, "the base is the template's");
      assert.equal(mergedScript, SCRIPT_AT.composed);
    },
  );
});

test("a workflow's resolution declined: the status says to resolve again, and resolving again proposes anew", async (t) => {
  const s = story(t);
  let first = '';

  await s.test('a factory whose upgrade conflicts in a line of its workflow, resolved: proposed', async (t) => {
    await scripted(t, 'refused');
    await printedBy(t, 'factory', 'resolve', 'refused', SCRIPT_LINE, '--file', scriptChoice());
    first = recordedFor('refused', 'Workflow/dev') ?? '';
    assert.deepEqual(proposalsOf('refused'), [first]);
  });

  await s.test('declined, the conflict carries its phase, and the status says to resolve it again', async () => {
    await stage.runWith(stage.board().e, declineProgram(PERSON, 'refused', first));
    const status = reconciled(factory('refused'));
    assert.deepEqual(
      status.upgrade?.conflicts.map((c) => [c.at, c.proposal]),
      [[SCRIPT_LINE, { name: first, phase: 'declined' }]],
    );
    assert.ok(
      status.conditions[1].message.includes(`nemia factory resolve refused '${SCRIPT_LINE}' --ours|--theirs|--file <path> again`),
      status.conditions[1].message,
    );
  });

  await s.test('resolved again, a new proposal is made and recorded in place of the declined one', async (t) => {
    await printedBy(t, 'factory', 'resolve', 'refused', SCRIPT_LINE, '--theirs');
    const second = recordedFor('refused', 'Workflow/dev') ?? '';
    assert.notEqual(second, first);
    assert.deepEqual(proposalsOf('refused').sort(), [first, second].sort());
    assert.equal(proposalIn('refused', second).status.phase, 'waiting');
    assert.deepEqual(
      reconciled(factory('refused')).upgrade?.conflicts.map((c) => c.proposal),
      [{ name: second, phase: 'waiting' }],
    );
  });
  await s.test('a resolutions.json from before other kinds had proposals, keyed by the bare workflow, still names its proposal', () => {
    const file = resolutionsFile(ROOT, 'refused');
    const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
    const second = kept.proposals['Workflow/dev'];
    fs.writeFileSync(file, JSON.stringify({ ...kept, proposals: { dev: second } }));
    assert.deepEqual(
      reconciled(factory('refused')).upgrade?.conflicts.map((c) => c.proposal),
      [{ name: second, phase: 'waiting' }],
    );
  });
});

test("a workflow's resolution made from a session: its agent's in its own factory, refused in another", async (t) => {
  const s = story(t);
  const liveToken = async (factoryName: string, task: string): Promise<string> => {
    const token = mintToken(ROOT, { agent: 'implementer', factory: factoryName, run: null, step: null, attempt: 1, task });
    await Effect.runPromise(stage.board().e.file({ id: task, brief: 'resolve it', cwd: ROOT, restartPolicy: 'Always' }));
    return token;
  };
  const resolveIn = (token: string, factoryName: string, ...rest: string[]) =>
    main(['factory', 'resolve', factoryName, ...rest], stage.board().e, undefined, stage.place().place, {
      ...ENV,
      WF_SESSION_TOKEN: token,
    });

  await s.test('from a session of another factory, refused Forbidden: no proposal, and the choice stays a draft', async (t) => {
    await scripted(t, 'theirs');
    const token = await liveToken('elsewhere', 'elsewhere-session');
    t.mock.method(console, 'log', () => {});
    await assert.rejects(
      resolveIn(token, 'theirs', SCRIPT_LINE, '--theirs'),
      (err: Error & { _tag?: string; reason?: string; exitCode?: number }) =>
        err._tag === 'Forbidden' && err.reason === 'other-factory' && err.exitCode === 2,
    );
    assert.deepEqual(proposalsOf('theirs'), []);
    const record = JSON.parse(fs.readFileSync(resolutionsFile(ROOT, 'theirs'), 'utf8'));
    assert.deepEqual([record.choices, record.proposals], [{ [SCRIPT_LINE]: 'theirs' }, undefined]);
  });

  await s.test("from a live session of the factory, the proposal is its agent's", async (t) => {
    const token = await liveToken('theirs', 'theirs-session');
    t.mock.method(console, 'log', () => {});
    await resolveIn(token, 'theirs', SCRIPT_LINE, '--theirs');
    const made = recordedFor('theirs', 'Workflow/dev') ?? '';
    assert.deepEqual(proposalIn('theirs', made).status.proposedBy, { agent: 'implementer' });
  });
});

test('a workflow whose step writes checkFailurePolicy as a block map: a conflict in another of its files resolved, applied, and the map kept', async (t) => {
  const s = story(t);
  const name = 'policed';
  const IMPLEMENT = 'workflows/dev/implement.md';
  let applied = '';
  let proposed = '';

  await s.test(
    'a factory whose implement writes its policy as a block map, as sdlc does, upgraded with a conflict in its script',
    async (t) => {
      const repo = scratch(`wf-upgrade-conflict-${name}-repo-`);
      fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
      const policy =
        'checkFailurePolicy:\n  rules:\n    - action: FailStep\n      onExitCodes:\n        operator: In\n        values: [78]\n';
      rewrite(repo, IMPLEMENT, 'check: npm test && npm run typecheck && npm run lint\n', `check: npm test\nretries: 2\n${policy}`);
      stage.place().world.repository(repo, {});
      stage.place().world.commit(repo, 'base');
      const at = path.join(scratch(`wf-upgrade-conflict-${name}-`), 'team');
      exportTemplate({ dir: at, from: repo });
      fs.writeFileSync(path.join(at, SCRIPT), SCRIPT_AT.base);
      await printedBy(t, 'factory', 'apply', name, '--template', at, '--repo', repo);
      reconciled(factory(name));
      applied = textIn(treeDir(ROOT, name), IMPLEMENT);
      assert.match(applied, /^checkFailurePolicy:\n {2}rules:\n/m, 'the applied step writes its policy as a block map');
      fs.writeFileSync(path.join(treeDir(ROOT, name), SCRIPT), SCRIPT_AT.ours);
      edit(at, 'nemia.yaml', (spec) => {
        spec.version = '0.2.0';
      });
      fs.writeFileSync(path.join(at, SCRIPT), SCRIPT_AT.theirs);
      await printedBy(t, 'factory', 'upgrade', name, '--to', '0.2.0');
      assert.deepEqual(
        reconciled(factory(name)).upgrade?.conflicts.map((c) => c.at),
        [SCRIPT_LINE],
      );
    },
  );

  await s.test('resolved with a file, the workflow is proposed, its policy carried as the text the loader reads', async (t) => {
    await printedBy(t, 'factory', 'resolve', name, SCRIPT_LINE, '--file', scriptChoice());
    proposed = recordedFor(name, 'Workflow/dev') ?? '';
    assert.deepEqual(proposalsOf(name), [proposed]);
    const implement = proposalIn(name, proposed).spec.objects[0].spec.steps.find((step: { name: string }) => step.name === 'implement');
    assert.equal(typeof implement.keys.checkFailurePolicy, 'string', "StepKeys' text, as readKeys keeps it");
    assert.deepEqual(JSON.parse(implement.keys.checkFailurePolicy), {
      rules: [{ action: 'FailStep', onExitCodes: { operator: 'In', values: ['78'] } }],
    });
  });

  await s.test('approved, the upgrade applies, and the applied implement.md keeps its map as it was written', async () => {
    const approved = await stage.runWith(stage.board().e, approveProgram(PERSON, name, proposed, PLACE));
    assert.equal(approved.status.phase, 'applied');
    const merged = reconciled(factory(name));
    assert.deepEqual([merged.version, merged.conditions[0].reason], ['0.2.0', 'Upgraded']);
    assert.equal(textIn(treeDir(ROOT, name), SCRIPT), SCRIPT_AT.composed);
    assert.equal(textIn(treeDir(ROOT, name), IMPLEMENT), applied, 'the block map stays a block map');
  });
});
